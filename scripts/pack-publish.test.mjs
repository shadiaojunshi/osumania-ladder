import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

// 合包发布决策的回归测试（R10）。
//
// 这些用例对应 R10 的验收场景：
//   · 模拟第 N 张谱面损坏     → 该包 failed → **整次不发布**（线上仍指向旧的一整套）
//   · 模拟第 N 包上传失败     → 同上
//   · manifest 提交失败       → 因为不发布，manifest 文件根本没被改写
//   · 只有占位图的失败包不发布
//   · 人工镜像链接不丢
//   · 没有提前删除旧文件（孤儿清理默认只报告）
//
// pack-publish.js 是纯函数模块（不做任何 IO），所以这里不需要假 R2。

const require = createRequire(import.meta.url)
const {
  STATUS_OK,
  STATUS_FAILED,
  STATUS_SKIPPED,
  evaluatePack,
  summarizeRun,
  mergeLinks,
  needsMirrorSync,
  buildManifestPacks,
  findOrphanKeys,
  findOrphanObjects,
  objectKeyFor,
  legacyObjectKeyFor,
  referencedObjectKeys,
  resolveRealType,
  parsePackCli,
  describeCliError,
  labelOf,
  evaluateManifestLiveness,
  evaluateSlotLoss,
  previousManifestSlotTotal,
  hasComparableBaseline,
  classifyEmptyType,
  slotLossHintLines,
} = require('./pack-publish.js')

// 与 generate-pack.js 的 main 一一对应的发布决策：有失败就整次取消，不写 manifest。
function simulatePublish(typeResults, oldManifest) {
  const summary = summarizeRun(typeResults)
  if (!summary.publishable) {
    return { wrote: false, manifest: oldManifest, summary }
  }
  return { wrote: true, manifest: buildManifestPacks({ typeResults, oldManifest }), summary }
}

const pack = (key, extra = {}) => ({
  realType: 'SS',
  part: 1,
  name: '4K Tournament Pack 1',
  mapCount: 100,
  totalMaps: 100,
  sizeMB: 200,
  key,
  status: STATUS_OK,
  reason: 'ok',
  links: { r2: `https://r2.example/${key}` },
  ...extra,
})

const typeResult = (realType, packs, extra = {}) => ({
  realType,
  status: STATUS_OK,
  plannedSlots: packs.reduce((sum, p) => sum + (p.mapCount || 0), 0) || 0,
  packs,
  ...extra,
})

// ---------- 单包判定 ----------

test('R10 包完整 → ok', () => {
  const v = evaluatePack({ plannedEntries: 120, processedEntries: 120, plannedSlots: 100, processedSlots: 100 })
  assert.equal(v.status, STATUS_OK)
})

test('R10 少了一张（谱面读不出来）→ failed/missing-entries，且指出缺几张', () => {
  const v = evaluatePack({ plannedEntries: 120, processedEntries: 119, plannedSlots: 100, processedSlots: 99 })
  assert.equal(v.status, STATUS_FAILED)
  assert.equal(v.reason, 'missing-entries')
  assert.match(v.detail, /缺 1/)
})

test('R10 计划里一张都没进来 → failed/empty-pack（对应"只剩占位图"的包）', () => {
  const v = evaluatePack({ plannedEntries: 100, processedEntries: 0, plannedSlots: 90, processedSlots: 0 })
  assert.equal(v.status, STATUS_FAILED)
  assert.equal(v.reason, 'empty-pack')
})

test('R10 R2 上传失败 → failed/r2-upload（哪怕内容完整）', () => {
  const v = evaluatePack({ plannedEntries: 120, processedEntries: 120, plannedSlots: 100, processedSlots: 100, uploadOk: false })
  assert.equal(v.status, STATUS_FAILED)
  assert.equal(v.reason, 'r2-upload')
})

test('R10 槽位数与计划不符（NSV 被算错）→ failed/slot-count-mismatch', () => {
  const v = evaluatePack({ plannedEntries: 100, processedEntries: 100, plannedSlots: 90, processedSlots: 89 })
  assert.equal(v.status, STATUS_FAILED)
  assert.equal(v.reason, 'slot-count-mismatch')
})

// ---------- 整次运行的结论 ----------

test('R10 全部成功 → 可发布', () => {
  const s = summarizeRun([typeResult('SS', [pack('SS_1.osz')]), typeResult('JS', [pack('JS_1.osz', { realType: 'JS' })])])
  assert.equal(s.publishable, true)
  assert.deepEqual(s.updatedTypes.sort(), ['JS', 'SS'])
  assert.equal(s.failures.length, 0)
})

test('R10 任一包失败 → 整次不可发布，失败项带类型与包名', () => {
  const s = summarizeRun([
    typeResult('SS', [pack('SS_1.osz')]),
    typeResult('CJ', [pack('CJ_1.osz', { realType: 'CJ', status: STATUS_FAILED, reason: 'missing-entries', detail: '计划 80 张，实际 79 张（缺 1）' })]),
  ])
  assert.equal(s.publishable, false)
  assert.equal(s.failures.length, 1)
  assert.match(s.failures[0].label, /CJ/)
  assert.match(s.failures[0].label, /有谱面没能读进来/)
  assert.match(s.failures[0].detail, /缺 1/)
})

test('R10 有槽位却一个包都没产出 → failed/no-packs（不能当成"类型没图了"）', () => {
  const s = summarizeRun([typeResult('HB1', [], { plannedSlots: 88 })])
  assert.equal(s.publishable, false)
  assert.equal(s.failures[0].reason, 'no-packs')
})

test('R10 数据里根本没有该类型（skipped）→ 不算失败，但会被标出来', () => {
  const s = summarizeRun([
    typeResult('SS', [pack('SS_1.osz')]),
    { realType: 'DP', status: STATUS_SKIPPED, reason: 'no-slots', plannedSlots: 0, packs: [] },
  ])
  assert.equal(s.publishable, true)
  assert.deepEqual(s.skippedTypes, ['DP'])
  assert.deepEqual(s.updatedTypes, ['SS'])
})

// ---------- manifest 组装 ----------

test('R10 links 是合并而非替换：本次只有 r2，旧的人工镜像链接必须保留', () => {
  const oldManifest = {
    packs: [
      {
        realType: 'SS',
        part: 1,
        mapCount: 98,
        links: { r2: 'https://r2.example/SS_1.osz', googleDrive: 'https://drive.google.com/uc?id=OLD&export=download' },
        gdriveFileId: 'OLD',
      },
    ],
  }
  const { wrote, manifest } = simulatePublish([typeResult('SS', [pack('SS_1.osz')])], oldManifest)
  assert.equal(wrote, true)
  const entry = manifest.packs.find((p) => p.realType === 'SS')
  assert.equal(entry.links.r2, 'https://r2.example/SS_1.osz', 'r2 用本次的')
  assert.match(entry.links.googleDrive, /id=OLD/, 'googleDrive 链接不能被抹掉')
  assert.equal(entry.gdriveFileId, 'OLD', 'fileId 要继承，否则 Drive 侧会新建副本')
  assert.equal(entry.mapCount, 100, '统计更新为新值')

  assert.deepEqual(mergeLinks({ a: '1' }, { b: '2' }), { a: '1', b: '2' })
})

test('R10 内容更新但镜像未同步 → 记进 pendingMirrors；没镜像的包不记', () => {
  const oldManifest = {
    packs: [
      { realType: 'SS', part: 1, links: { googleDrive: 'https://drive.google.com/uc?id=OLD' }, gdriveFileId: 'OLD' },
      { realType: 'JS', part: 1, links: { r2: 'https://r2.example/JS_1.osz' } },
    ],
  }
  const { manifest } = simulatePublish(
    [typeResult('SS', [pack('SS_1.osz')]), typeResult('JS', [pack('JS_1.osz', { realType: 'JS' })])],
    oldManifest,
  )
  assert.deepEqual(manifest.pendingMirrors, ['SS_1.osz'])
  assert.equal(needsMirrorSync({ links: { r2: 'x' } }, { r2: 'y' }), false, '没有镜像 → 无需标记')
})

test('R10 分包数缩小时，消失的 part 不残留；skipped 类型的旧条目原样保留', () => {
  const oldManifest = {
    packs: [
      { realType: 'TC', part: 1, mapCount: 90, sizeMB: 100, links: { r2: 'r2/TC_1.osz', googleDrive: 'g/TC_1' }, gdriveFileId: 'G1' },
      { realType: 'TC', part: 2, mapCount: 90, sizeMB: 100, links: { r2: 'r2/TC_2.osz' } },
      { realType: 'TC', part: 3, mapCount: 90, sizeMB: 100, links: { r2: 'r2/TC_3.osz' } },
      { realType: 'DP', part: 1, mapCount: 40, sizeMB: 50, links: { r2: 'r2/DP_1.osz', googleDrive: 'g/DP_1' }, gdriveFileId: 'GD' },
    ],
  }
  const { manifest } = simulatePublish(
    [
      typeResult('TC', [pack('TC_1.osz', { realType: 'TC' }), pack('TC_2.osz', { realType: 'TC', part: 2 })]),
      // 本地数据里没有 DP 了（可能只是没 pull）→ 保留旧条目
      { realType: 'DP', status: STATUS_SKIPPED, reason: 'no-slots', plannedSlots: 0, packs: [] },
    ],
    oldManifest,
  )
  const tc = manifest.packs.filter((p) => p.realType === 'TC')
  assert.deepEqual(tc.map((p) => p.part), [1, 2], 'part 3 应消失')
  assert.match(tc[0].links.googleDrive, /TC_1/, 'TC_1 的镜像链接保留')
  const dp = manifest.packs.filter((p) => p.realType === 'DP')
  assert.equal(dp.length, 1, 'DP 的旧条目必须原样保留')
  assert.equal(dp[0].gdriveFileId, 'GD')
})

// ---------- 验收：三种故障下线上仍是完整旧版本 ----------

test('R10 验收：第 N 张谱面损坏 → 不写 manifest（线上仍指向旧的一整套）', () => {
  const oldManifest = {
    packs: [
      { realType: 'SS', part: 1, mapCount: 100, links: { r2: 'r2/SS_1.osz' } },
      { realType: 'SS', part: 2, mapCount: 100, links: { r2: 'r2/SS_2.osz' } },
      { realType: 'JS', part: 1, mapCount: 80, links: { r2: 'r2/JS_1.osz' } },
    ],
  }
  const broken = pack('SS_2.osz', { part: 2, status: STATUS_FAILED, reason: 'missing-entries', detail: '计划 100 张，实际 99 张（缺 1）' })
  const { wrote, manifest } = simulatePublish([typeResult('SS', [pack('SS_1.osz'), broken])], oldManifest)
  assert.equal(wrote, false, '有损坏谱面就不能发布')
  assert.equal(manifest, oldManifest, 'manifest 必须原样不动（含 JS 那一项）')
})

test('R10 验收：第 N 包上传失败 → 同样整次取消，不出现"新统计配旧对象"', () => {
  const oldManifest = { packs: [{ realType: 'CJ', part: 1, mapCount: 60, links: { r2: 'r2/CJ_1.osz' } }] }
  const failedUpload = pack('CJ_1.osz', { realType: 'CJ', status: STATUS_FAILED, reason: 'r2-upload', detail: '403 SignatureDoesNotMatch' })
  const { wrote, manifest } = simulatePublish([typeResult('CJ', [failedUpload])], oldManifest)
  assert.equal(wrote, false)
  assert.equal(manifest.packs[0].mapCount, 60, '旧统计保留')
})

test('R10 验收：只有占位图的包不发布（list 一个都没产出）', () => {
  const { wrote } = simulatePublish([typeResult('HB2', [], { plannedSlots: 64 })], { packs: [] })
  assert.equal(wrote, false)
})

// ---------- 孤儿 ----------

test('R10 孤儿只算不删：桶里有、清单里没有的才算孤儿；skipped 类型保留的条目不算', () => {
  const bucketKeys = ['SS_1.osz', 'SS_2.osz', 'SS_3.osz', 'DP_1.osz', 'readme.txt']
  const packs = [
    { realType: 'SS', part: 1 },
    { realType: 'SS', part: 2 },
    { realType: 'DP', part: 1 },
  ]
  assert.deepEqual(findOrphanKeys({ bucketKeys, packs }), ['SS_3.osz'])
  assert.deepEqual(findOrphanKeys({ bucketKeys: ['SS_1.osz'], packs }), [])
})

// ---------- 真实清单 ----------
// 这条跑在 data/packs-manifest.json 上：全量成功时，合并后的清单必须**一个链接都不丢**。
// 旧实现是 `links: result.links || previous.links`（整体替换），而本次生成只产出 r2，
// 于是每个包的 googleDrive 链接都会被抹掉 —— 在这条断言下 55 个条目全挂。
test('R10 真实 manifest：全量成功时镜像链接与 Drive fileId 一个都不丢', () => {
  const manifest = JSON.parse(readFileSync(new URL('../data/packs-manifest.json', import.meta.url), 'utf8'))
  const byType = new Map()
  for (const p of manifest.packs) {
    if (!byType.has(p.realType)) byType.set(p.realType, [])
    byType.get(p.realType).push({ ...p, key: `${p.realType}_${p.part || 1}.osz`, status: STATUS_OK, reason: 'ok' })
  }
  const typeResults = [...byType].map(([realType, packs]) => ({ realType, status: STATUS_OK, plannedSlots: packs.length, packs }))

  assert.equal(summarizeRun(typeResults).publishable, true)

  const { packs, pendingMirrors } = buildManifestPacks({ typeResults, oldManifest: manifest })
  assert.equal(packs.length, manifest.packs.length, '条目数不变')
  for (const before of manifest.packs) {
    const after = packs.find((p) => p.realType === before.realType && (p.part || 1) === (before.part || 1))
    assert.ok(after, `${before.realType}_${before.part} 丢了`)
    assert.deepEqual(after.links, before.links, `${before.realType}_${before.part} 的链接被改动`)
    assert.equal(after.gdriveFileId, before.gdriveFileId, `${before.realType}_${before.part} 的 fileId 丢了`)
    assert.equal(after.mapCount, before.mapCount)
  }
  // 本次重新上传了每个包的 r2 → 有镜像的包都要进 pendingMirrors
  const withMirror = manifest.packs.filter((p) => p.links && p.links.googleDrive).length
  assert.equal(pendingMirrors.length, withMirror)
})

// ---------- 门控顺序（防止有人顺手把它拆掉）----------
// 这几条断言的是 generate-pack.js 里**动作的先后**，而不是某个函数的行为：
// 只要"判定失败 → 提前退出"跑到"写 manifest"前面、删对象必须显式开关，
// 上面那些纯函数用例才有意义。
test('R10 结构：写 manifest 之前先过 publishable 门控，孤儿删除默认关闭', () => {
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  const at = (needle) => {
    const i = src.indexOf(needle)
    assert.ok(i >= 0, `generate-pack.js 里找不到 ${needle}`)
    return i
  }

  // 锚点取全量路径特有的字串：`if (!summary.publishable)` 在单类型分支里也有一处，
  // 用它做锚点会拿到更早的位置。
  const summarize = at('const summary = summarizeRun(typeResults)')
  const gate = at('已取消发布')
  const build = at('buildManifestPacks({ typeResults, oldManifest })')
  const writeManifest = at('fs.writeFileSync(manifestPath')
  // 锚点要带 `await`：函数定义 `listPackBucketObjects() {` 也含这个子串
  const listPack = at('await listPackBucketObjects()')
  // 用报告正文里的那行（注释里也提到了这个脚本名，会拿到更早的位置）
  const pointsToGc = at('# 先看（默认只报告）')

  assert.ok(summarize < gate, '先汇总再判定')
  assert.ok(gate < build, '有失败就不能组装新清单')
  assert.ok(gate < writeManifest, '有失败就不能写 manifest')
  assert.ok(writeManifest < listPack, '孤儿只报告、且晚于写 manifest')
  assert.ok(!src.includes('DeleteObjectCommand'), '生成流程不该再删任何对象')
  assert.ok(listPack < pointsToGc, '报告里要指向独立的 GC 命令')
  assert.ok(!src.includes('allResults'), '旧的无状态汇总路径不该残留')
  // CLI 解析自 R12 起在 pack-publish.js（parsePackCli），generate-pack.js 里不该再手写参数循环
  assert.ok(src.includes('parsePackCli(process.argv.slice(2)'), '必须走共享的 CLI 解析')
  assert.ok(!src.includes("arg.startsWith('--type=')"), '旧的裸参数解析已移除')
})

// ---------- CLI 参数解析（R12 第 2 条）----------
// 这些用例对应验收：包含空格/分号/命令替换语法的输入**作为普通字符串被拒绝、不能执行**；
// ss → SS；RCmainHB 保持规范（不能 toUpperCase）。
const KNOWN = ['SS', 'JS', 'CJ', 'RE', 'RCmainHB', 'LNmainHB', 'MXHB', 'TB', 'PDRC', 'PDLN']
const EXCLUDED = ['PDRC', 'PDLN']
const cli = (args) => parsePackCli(args, { knownTypes: KNOWN, excludedTypes: EXCLUDED })

test('R12 CLI：无参数 = 全量发布', () => {
  const r = cli([])
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'full')
  assert.equal(r.targetType, null)
})

test('R12 CLI：--type 默认是离线预览，--publish 才是发布', () => {
  assert.equal(cli(['--type=SS']).mode, 'single-preview')
  assert.equal(cli(['--type=SS', '--publish']).mode, 'single-publish')
  assert.equal(cli(['--type=SS', '--offline']).mode, 'single-preview')
})

test('R12 CLI：大小写不敏感匹配，返回的是规范键', () => {
  assert.equal(cli(['--type=ss']).targetType, 'SS')
  assert.equal(cli(['--type=Ss']).targetType, 'SS')
  // 混合大小写的类型必须原样返回，不能被 toUpperCase 弄坏
  assert.equal(cli(['--type=rcmainhb']).targetType, 'RCmainHB')
  assert.equal(cli(['--type=RCmainHB']).targetType, 'RCmainHB')
  assert.equal(cli(['--type=lnmainhb']).targetType, 'LNmainHB')
  assert.equal(resolveRealType(' mxhb ', KNOWN).type, 'MXHB')
})

test('R12 CLI：含空格/分号/命令替换的输入只是普通字符串 —— 拒绝，不执行', () => {
  for (const evil of ['SS; rm -rf /', 'SS && curl evil', '$(whoami)', '`id`', 'SS --publish', 'SS\nJS']) {
    const r = cli([`--type=${evil}`])
    assert.equal(r.ok, false, `${evil} 必须被拒`)
    assert.equal(r.errors[0].error, 'unknown-type')
    assert.equal(r.targetType, null, '被拒的输入不能变成目标类型')
    assert.match(describeCliError(r.errors[0]), /未知的 realType/)
  }
})

test('R12 CLI：未知选项也报错（过去是静默忽略，打错类型名会变成全量发布）', () => {
  const r = cli(['--type-ss'])
  assert.equal(r.ok, false)
  assert.equal(r.errors[0].error, 'unknown-option')
  assert.match(describeCliError(r.errors[0]), /未知选项/)
})

test('R12 CLI：--publish 不带 --type 是错误（全量本来就是发布）', () => {
  const r = cli(['--publish'])
  assert.equal(r.ok, false)
  assert.equal(r.errors[0].error, 'requires-type')
})

test('R12 CLI：--publish 与 --offline 互斥', () => {
  const r = cli(['--type=SS', '--publish', '--offline'])
  assert.equal(r.ok, false)
  assert.equal(r.errors[0].error, 'conflicting-flags')
})

test('R12 CLI：Pending 族类型是「合法但不产包」——警告而不是错误', () => {
  const r = cli(['--type=pdrc'])
  assert.equal(r.ok, true)
  assert.equal(r.targetType, 'PDRC')
  assert.equal(r.warnings.some((w) => w.code === 'excluded-type'), true)
})

test('R12 CLI：--clean-orphans 一律被拒，并指向独立命令（生成流程再也不真删对象）', () => {
  for (const args of [['--clean-orphans'], ['--type=SS', '--clean-orphans']]) {
    const r = cli(args)
    assert.equal(r.ok, false, `${args.join(' ')} 必须被拒`)
    assert.equal(r.errors[0].error, 'clean-orphans-moved')
    assert.match(describeCliError(r.errors[0]), /gc-pack-objects\.mjs/)
  }
})

test('R12 CLI：--help', () => {
  assert.equal(cli(['--help']).mode, 'help')
})

// ---------- 单类型发布不能清空其他类型 ----------

test('R12 单类型发布：preserveOtherTypes 保留未涉及的类型（含人工链接）', () => {
  const oldManifest = {
    packs: [
      { realType: 'SS', part: 1, mapCount: 100, links: { r2: 'r2/SS_1.osz', googleDrive: 'g/SS_1' }, gdriveFileId: 'G1' },
      { realType: 'JS', part: 1, mapCount: 80, links: { r2: 'r2/JS_1.osz', googleDrive: 'g/JS_1' }, gdriveFileId: 'G2' },
      { realType: 'TB', part: 1, mapCount: 64, links: { r2: 'r2/TB_1.osz', googleDrive: 'g/TB_1' }, gdriveFileId: 'G3' },
    ],
  }
  const ss = typeResult('SS', [{ ...pack('SS_1.osz'), mapCount: 101 }])
  const single = buildManifestPacks({ typeResults: [ss], oldManifest, preserveOtherTypes: true })
  assert.deepEqual(single.packs.map((p) => p.realType).sort(), ['JS', 'SS', 'TB'])
  const js = single.packs.find((p) => p.realType === 'JS')
  assert.match(js.links.googleDrive, /g\/JS_1/, '未涉及类型的镜像链接要原样保留')
  assert.equal(js.gdriveFileId, 'G2')
  assert.equal(single.packs.find((p) => p.realType === 'SS').mapCount, 101, '涉及的类型要更新')

  // 全量语义不变：未涉及的类型会被丢弃（分包数缩小 / 类型废弃）
  const full = buildManifestPacks({ typeResults: [ss], oldManifest })
  assert.deepEqual(full.packs.map((p) => p.realType), ['SS'])
})

test('R12 单类型发布：该类型的镜像链接会被标成待同步', () => {
  const oldManifest = {
    packs: [{ realType: 'SS', part: 1, links: { r2: 'r2/SS_1.osz', googleDrive: 'g/SS_1' }, gdriveFileId: 'G1' }],
  }
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [typeResult('SS', [pack('SS_1.osz')])], oldManifest, preserveOtherTypes: true,
  })
  assert.deepEqual(pendingMirrors, ['SS_1.osz'])
})

// ---------- 内容寻址的对象键（R10 第 3 条 / R12 第 6 条）----------
// 过去的键是 `realType_part.osz` 的覆盖式写入：传到一半失败、或传完了而清单没提交，
// "同一个键"的内容已经变了 → 线上半新半旧。现在键里带内容哈希，切清单之前旧对象原地不动。

test('R13b 对象键带内容哈希；同内容复用同一个键', () => {
  assert.equal(objectKeyFor('SS', 1, 'a1b2c3d4'), 'SS_1.a1b2c3d4.osz')
  assert.equal(objectKeyFor('RCmainHB', 2, 'deadbeef'), 'RCmainHB_2.deadbeef.osz')
  // 内容没变 → 哈希相同 → 复用（不产生垃圾对象）
  assert.equal(objectKeyFor('SS', 1, 'a1b2c3d4'), objectKeyFor('SS', 1, 'a1b2c3d4'))
  // 内容变了 → 新键（旧对象仍是旧内容）
  assert.notEqual(objectKeyFor('SS', 1, 'a1b2c3d4'), objectKeyFor('SS', 1, 'ffffffff'))
  assert.equal(legacyObjectKeyFor('SS', 1), 'SS_1.osz')
})

test('R13b 孤儿判定按清单引用的键：新键被引用，同一 part 的旧键算孤儿', () => {
  const packs = [
    { realType: 'SS', part: 1, objectKey: 'SS_1.a1b2c3d4.osz' },
    { realType: 'JS', part: 1 }, // 历史条目，没有 objectKey
  ]
  const bucketKeys = ['SS_1.a1b2c3d4.osz', 'SS_1.osz', 'JS_1.osz', 'CJ_9.osz', 'readme.txt']
  assert.deepEqual(findOrphanKeys({ bucketKeys, packs }), ['CJ_9.osz', 'SS_1.osz'])
})

test('R13b 历史清单（没有 objectKey）的旧键不算孤儿 —— 否则升级后第一次清理会全删', () => {
  const packs = [{ realType: 'SS', part: 1 }, { realType: 'TB', part: 2 }]
  const refs = referencedObjectKeys(packs)
  assert.deepEqual([...refs].sort(), ['SS_1.osz', 'TB_2.osz'])
  assert.deepEqual(findOrphanKeys({ bucketKeys: ['SS_1.osz', 'TB_2.osz'], packs }), [])
})

test('R13b 未提交的清单仍指向旧键：新键不算"被引用"，旧键也不会被动', () => {
  // 上新键 + 清单没提交 = 旧清单原样 → 它引用的旧键必须还在（不能删）
  const oldManifestPacks = [{ realType: 'SS', part: 1, objectKey: 'SS_1.oldhash1.osz' }]
  assert.equal(findOrphanKeys({ bucketKeys: ['SS_1.oldhash1.osz'], packs: oldManifestPacks }).length, 0)
  // 新键此时是"孤儿"（没人引用），但默认只报告不删
  assert.deepEqual(
    findOrphanKeys({ bucketKeys: ['SS_1.oldhash1.osz', 'SS_1.newhash2.osz'], packs: oldManifestPacks }),
    ['SS_1.newhash2.osz'],
  )
})

test('R13b buildManifestPacks 传递 objectKey：本次产出用新键，旧条目保留旧键', () => {
  const oldManifest = {
    packs: [
      { realType: 'SS', part: 1, objectKey: 'SS_1.oldhash1.osz', links: { r2: 'r2/SS_1.oldhash1.osz' } },
      { realType: 'JS', part: 1, objectKey: 'JS_1.keepme00.osz', links: { r2: 'r2/JS_1.keepme00.osz' } },
    ],
  }
  const ss = typeResult('SS', [{ ...pack('SS_1.a1b2c3d4.osz'), objectKey: 'SS_1.a1b2c3d4.osz' }])
  const { packs } = buildManifestPacks({ typeResults: [ss], oldManifest, preserveOtherTypes: true })
  assert.equal(packs.find((p) => p.realType === 'SS').objectKey, 'SS_1.a1b2c3d4.osz', '本次产出的新键')
  assert.equal(packs.find((p) => p.realType === 'JS').objectKey, 'JS_1.keepme00.osz', '未涉及类型保留旧键')
})

test('R13b 本次没产出新键时沿用旧 objectKey（离线预览不会把键抹掉）', () => {
  const oldManifest = {
    packs: [{ realType: 'SS', part: 1, objectKey: 'SS_1.oldhash1.osz', links: { r2: 'r2/SS_1.oldhash1.osz' } }],
  }
  const ss = typeResult('SS', [{ ...pack('SS_1.osz'), objectKey: null, links: {} }])
  const { packs } = buildManifestPacks({ typeResults: [ss], oldManifest })
  assert.equal(packs[0].objectKey, 'SS_1.oldhash1.osz')
})

// ---------- 另一条线审查后的加固（2026-09-18）----------
// 这几条对应它审出的 P1/P2：空类型与裸 --offline 会静默变成全量发布；
// pendingMirrors 每轮重建会丢标记；孤儿清理缺保留期。

test('加固：--offline 单用被拒（过去 mode 仍是 full —— 以为在预览、实际全量发布）', () => {
  const r = cli(['--offline'])
  assert.equal(r.ok, false)
  assert.equal(r.mode, 'full', 'mode 本身仍是 full，所以才必须靠报错拦住')
  assert.equal(r.errors[0].error, 'offline-requires-type')
  assert.match(describeCliError(r.errors[0]), /全量离线模式尚未实现/)
})

test('加固：--type= 空值/空白被拒（过去静默走全量发布）', () => {
  for (const bad of ['--type=', '--type=  ', '--type=\t']) {
    const r = cli([bad])
    assert.equal(r.ok, false, `${JSON.stringify(bad)} 必须被拒`)
    assert.equal(r.errors[0].error, 'empty-type')
    assert.equal(r.targetType, null, '不能变成"没指定类型"')
  }
})

test('加固：重复指定不同类型报错；重复同一个类型无害', () => {
  const conflict = cli(['--type=SS', '--type=JS'])
  assert.equal(conflict.ok, false)
  assert.equal(conflict.errors[0].error, 'duplicate-type')
  assert.equal(conflict.errors[0].previous, 'SS')

  const same = cli(['--type=SS', '--type=ss'])
  assert.equal(same.ok, true)
  assert.equal(same.targetType, 'SS')
})

test('加固：pendingMirrors 只增不减 —— 旧的未同步标记要留着', () => {
  const oldManifest = {
    packs: [
      { realType: 'SS', part: 1, objectKey: 'SS_1.new00000.osz', links: { r2: 'r2/SS_1.new00000.osz' } },
      { realType: 'JS', part: 1, objectKey: 'JS_1.old00000.osz', links: { r2: 'r2/JS_1.old00000.osz' } },
    ],
    // 上一轮 Drive 没同步完的遗留标记
    pendingMirrors: ['JS_1.osz'],
  }
  // 本次只重新生成了 SS（SS 没镜像 → 不新增标记）；JS 本轮没涉及
  const ss = typeResult('SS', [{ ...pack('SS_1.new00000.osz'), objectKey: 'SS_1.new00000.osz' }])
  const { pendingMirrors } = buildManifestPacks({ typeResults: [ss], oldManifest, preserveOtherTypes: true })
  assert.deepEqual(pendingMirrors, ['JS_1.osz'], 'JS 的遗留标记必须还在（它的镜像仍指向旧内容）')
})

test('加固：pendingMirrors 里指向已下线包的标记会被丢掉', () => {
  const oldManifest = {
    packs: [{ realType: 'SS', part: 1, links: { r2: 'r2/SS_1.osz' } }],
    pendingMirrors: ['GONE_1.osz', 'SS_1.osz'],
  }
  const ss = typeResult('SS', [pack('SS_1.osz')])
  const { pendingMirrors } = buildManifestPacks({ typeResults: [ss], oldManifest })
  assert.deepEqual(pendingMirrors, ['SS_1.osz'], 'GONE_1 已不在清单里，标记应丢弃')
})

test('加固：孤儿挑选带保留期，太新的一律不动；时间未知的更不动', () => {
  const now = Date.parse('2026-09-18T12:00:00Z')
  const packs = [{ realType: 'SS', part: 1, objectKey: 'SS_1.keep0000.osz' }]
  const objects = [
    { key: 'SS_1.keep0000.osz', lastModified: '2026-09-01T00:00:00Z' },   // 被引用 → 不是孤儿
    { key: 'SS_1.old00000.osz', lastModified: '2026-09-01T00:00:00Z' },   // 旧孤儿 → 可删
    { key: 'SS_1.fresh000.osz', lastModified: '2026-09-18T11:00:00Z' },   // 刚上传 → 保留
    { key: 'SS_1.unknown0.osz' },                                        // 无时间 → 保留（保守）
  ]
  const { orphans, kept } = findOrphanObjects({ objects, packs, minAgeHours: 24, now })
  assert.deepEqual(orphans, ['SS_1.old00000.osz'])
  assert.deepEqual(kept.sort(), ['SS_1.fresh000.osz', 'SS_1.unknown0.osz'])

  // 保留期设为 0 时，刚上传的也进入可删范围（但仍不含"时间未知"的）
  const loose = findOrphanObjects({ objects, packs, minAgeHours: 0, now })
  assert.deepEqual(loose.orphans, ['SS_1.fresh000.osz', 'SS_1.old00000.osz'])
  assert.deepEqual(loose.kept, ['SS_1.unknown0.osz'])
})

// ---------- 只读身份体检（--identity-report，2026-09-18）----------

test('体检：--identity-report 单独用 = 全部类型，且**绝不能落到 full 模式**', () => {
  const r = cli(['--identity-report'])
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'identity-report')
  assert.equal(r.targetType, null)
  // 这条是最要命的：mode 一旦是 'full'，main 就会真的全量发布（生成 + 传 R2 + 改清单）。
  assert.notEqual(r.mode, 'full', '体检模式绝不能是全量发布')
  assert.equal(r.publish, false)
})

test('体检：与 --type 合用只体检该类型', () => {
  const r = cli(['--identity-report', '--type=SS'])
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'identity-report')
  assert.equal(r.targetType, 'SS')
})

test('体检：待分类类型（Pending 族）只给提示，不算错误', () => {
  const r = cli(['--identity-report', `--type=${[...EXCLUDED][0]}`])
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'identity-report')
  assert.equal(r.warnings[0].code, 'excluded-type')
})

test('体检：与 --publish / --offline 互斥（它本来就不发布）', () => {
  for (const extra of [['--publish'], ['--offline']]) {
    const r = cli(['--identity-report', ...extra])
    assert.equal(r.ok, false, `${extra[0]} 必须被拒`)
    assert.equal(r.errors[0].error, 'identity-report-conflict')
    assert.match(describeCliError(r.errors[0]), /只读体检/)
  }
})

test('体检：--type= 空值被拒，但文案说的是"省略即体检全部类型"（不是"全量发布"）', () => {
  const r = cli(['--identity-report', '--type='])
  assert.equal(r.ok, false)
  assert.equal(r.errors.length, 1, '一次错误只报一次')
  assert.equal(r.errors[0].error, 'identity-report-empty-type')
  const text = describeCliError(r.errors[0])
  assert.match(text, /体检全部类型/)
  assert.ok(!text.includes('全量发布'), '本模式下省略 --type 不会发布，不能拿全量发布的文案吓人')
})

test('体检：未知类型只报一次 unknown-type（不附带多余的 --type= 空值错误）', () => {
  const r = cli(['--identity-report', '--type=NOPE'])
  assert.equal(r.ok, false)
  assert.equal(r.errors.length, 1)
  assert.equal(r.errors[0].error, 'unknown-type')
})

test('体检：打错选项照样被拒（不会静默变成"体检全部类型"）', () => {
  const r = cli(['--identity-report', '--bogus'])
  assert.equal(r.ok, false)
  assert.equal(r.errors[0].error, 'unknown-option')
})

test('守门：identity-report.yml 必须保持只读（不得出现发布开关或改数据的提交）', () => {
  // 这个 workflow 用的是**仓库里的真实 R2 密钥**，所以它的只读性只能靠断言守：
  // 以后有人往 run 里补一句 `--publish`，就会变成"点一下把线上包重打一遍"。
  const src = readFileSync(new URL('../.github/workflows/identity-report.yml', import.meta.url), 'utf-8')
  assert.ok(src.includes('--identity-report'), '必须跑体检模式')
  assert.ok(!src.includes('--publish'), '体检 workflow 绝不能带 --publish')
  assert.ok(!/git add -A|git add \./.test(src), '不能用 git add -A（会把无关文件一起提交）')
  assert.ok(src.includes('git add reports/pack-identity-report.md'), '只提交报告文件')
  assert.ok(/permissions:\s*\n?\s*contents: write/.test(src), '要能 push 报告')
  assert.ok(!/real_type[\s\S]{0,200}R2_PACKS/.test(src) || !src.includes('R2_PACKS_BUCKET'), '体检不需要 packs 桶密钥')
})


// ---------- 合包静态审查（2026-09-21）五处修复 ----------
//
// 背景：另一条线对合包链做了静态审查，提了 5 条。逐条对着代码核实后 4 条成立、1 条部分成立，
// 全部已修。这里的用例钉住修复本身，尤其是那些**单测看不见**的失败模式 ——
// 例如「const 重赋值抛异常被 catch 吞掉」，它不会让任何现有断言变红。

// ⑤ 有谱面没有音频 → 该包不发布（过去只 warn 就照发）
test('⑤ evaluatePack：有谱面没音频 = 内容缺口，该包不发布', () => {
  const ok = evaluatePack({ plannedEntries: 10, processedEntries: 10, plannedSlots: 10, processedSlots: 10 })
  assert.equal(ok.status, STATUS_OK)

  const bad = evaluatePack({
    plannedEntries: 10, processedEntries: 10, plannedSlots: 10, processedSlots: 10, audioMissing: 1,
  })
  assert.equal(bad.status, STATUS_FAILED)
  assert.equal(bad.reason, 'audio-missing')
  assert.match(bad.detail, /1 张没有音频/)

  assert.equal(labelOf('audio-missing'), '有谱面没有音频（原包没有、借主图也失败）—— 这种图在游戏里没声音')
})

test('⑤ 优先级：张数对不上时先报「少图」，别被音频盖掉', () => {
  // 一个包同时"少一张"和"有一张没音频"时，先报更根本的那个原因。
  const r = evaluatePack({
    plannedEntries: 10, processedEntries: 9, plannedSlots: 10, processedSlots: 9, audioMissing: 1,
  })
  assert.equal(r.reason, 'missing-entries')
})

// ② 「本来未上传」与「上一版有、现在丢了」必须分开
test('② evaluateSlotLoss：只有比上一版少才拦，持平/变多/无基准都不拦', () => {
  assert.deepEqual(evaluateSlotLoss({ previousSlots: 100, currentSlots: 100 }), { lost: 0, blocked: false })
  assert.deepEqual(evaluateSlotLoss({ previousSlots: 100, currentSlots: 101 }), { lost: 0, blocked: false })
  assert.deepEqual(evaluateSlotLoss({ previousSlots: 100, currentSlots: 99 }), { lost: 1, blocked: true })
  // previousSlots=0 = 没有基准（首次发布 / 历史条目不记张数）→ 绝不拦
  assert.deepEqual(evaluateSlotLoss({ previousSlots: 0, currentSlots: 5 }), { lost: 0, blocked: false })
  assert.deepEqual(evaluateSlotLoss({}), { lost: 0, blocked: false })
  // 缺参数的畸形输入不能变成 NaN 判定
  assert.deepEqual(evaluateSlotLoss({ previousSlots: null, currentSlots: 'x' }), { lost: 0, blocked: false })
})

test('② evaluateSlotLoss：--allow-content-gaps 只解除拦截，仍然报出少了几张', () => {
  const r = evaluateSlotLoss({ previousSlots: 100, currentSlots: 97, allowContentGaps: true })
  assert.equal(r.blocked, false)
  assert.equal(r.lost, 3, '放行也必须知道少了几张（要写进日志）')
  assert.equal(labelOf('slots-lost').startsWith('本次比上一版少图'), true)
})

test('② previousManifestSlotTotal：只数带 objectKey 的条目（旧时代清单不能当基准）', () => {
  const manifest = {
    packs: [
      { realType: 'RC', part: 1, mapCount: 60, objectKey: 'RC_1.aaaaaaaa.osz' },
      { realType: 'RC', part: 2, mapCount: 40, objectKey: 'RC_2.bbbbbbbb.osz' },
      { realType: 'LN', part: 1, mapCount: 7, objectKey: 'LN_1.cccccccc.osz' },
      { realType: 'HB', part: 1, objectKey: 'HB_1.dddddddd.osz' }, // 缺 mapCount
      { realType: 'CJ', part: 1, mapCount: 222 },  // 覆盖式键时代：没有 objectKey
      null,                                         // 脏数据不能把整个计算带崩
    ],
  }
  assert.equal(previousManifestSlotTotal(manifest, 'RC'), 100)
  assert.equal(previousManifestSlotTotal(manifest, 'LN'), 7)
  assert.equal(previousManifestSlotTotal(manifest, 'HB'), 0)
  assert.equal(previousManifestSlotTotal(manifest, 'TB'), 0, '没有该类型 = 没有基准')
  // 关键：实测里就是这条 —— 仓库清单停在 8-13、CJ 记着 222 张，而数据里 CJ 只剩 179 张，
  // 拿它当基准会把一次正常发布拦下。
  assert.equal(previousManifestSlotTotal(manifest, 'CJ'), 0, '旧时代的条目一律不算基准')
  assert.equal(previousManifestSlotTotal(null, 'RC'), 0)
  assert.equal(previousManifestSlotTotal({}, 'RC'), 0)
})

test('② hasComparableBaseline：这份清单到底能不能当基准', () => {
  assert.equal(hasComparableBaseline({ packs: [{ realType: 'RC', mapCount: 1, objectKey: 'x' }] }), true)
  assert.equal(hasComparableBaseline({ packs: [{ realType: 'RC', mapCount: 1 }] }), false, '没有 objectKey = 旧时代')
  assert.equal(hasComparableBaseline({ packs: [] }), false)
  assert.equal(hasComparableBaseline(null), false)
})

test('② 守门：真实清单的"可比性"判定必须与它自己的内容一致', () => {
  // ⚠️ 这条**刻意不写死某个值**。最初它断言"现有清单不可比"，并注明"哪天跑过真发布就会失败" ——
  // 那在 2026-09-21 真发生了（TE 发了一版，清单里出现了第一个 objectKey）。
  // 但"对着随仓库演进的真实数据断言一个快照值"本身就是错的写法：它拦不住任何 bug，
  // 只会在每次正常发布后变红。改成钉住两条**真正的不变量**：
  const manifest = JSON.parse(readFileSync(new URL('../data/packs-manifest.json', import.meta.url), 'utf8'))
  const packs = (manifest.packs || []).filter(Boolean)

  // ① 判据不能与数据脱节：有 objectKey 就必须判为可比。否则一个已经发布过的清单会被
  //    当成"没基准"，收缩判定静默失效 —— 那正是它要防的 fail-open。
  const anyKey = packs.some((p) => p.objectKey)
  assert.equal(hasComparableBaseline(manifest), anyKey, '可比性判据必须与"有没有 objectKey"一致')

  // ② 旧时代条目一律不得计入基准。这是实测踩过的坑：清单停在 8-13 时 CJ 记着 222 张，
  //    而数据里只剩 179 张（FCJ 重新分类带走的）—— 那种条目混进基准会误拦正常发布。
  const typesWithNoKey = new Set(
    packs.filter((p) => !p.objectKey).map((p) => p.realType).filter(Boolean),
  )
  for (const realType of typesWithNoKey) {
    const keyed = packs.filter((p) => p.realType === realType && p.objectKey)
    if (keyed.length > 0) continue // 该类型既有旧条目又有新条目 → 由 ① 覆盖，不在这里断言
    assert.equal(
      previousManifestSlotTotal(manifest, realType), 0,
      `${realType} 只有不带 objectKey 的条目 → 基准必须是 0（不能拿旧时代条目去比）`,
    )
  }
})

test('② 守门：判定被跳过时必须在日志里说出来（别说不出声地不判）', () => {
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  // 两个读清单的地方都要提示：站长看不到这句，会以为没拦=检查过了。
  assert.ok(src.includes('warnIfBaselineNotComparable(oldManifest)'), '全量模式要提示')
  assert.ok(src.includes('warnIfBaselineNotComparable(singleOldManifest)'), '单类型模式也要提示')
  assert.ok(src.includes('本次不做「比上一版少图」判定'), '提示要把话说清楚')
})

// ③ 清理脚本的基准必须是线上一份：三态判据
test('③ evaluateManifestLiveness：只有"明确为 false"才算危险证据', () => {
  const clean = evaluateManifestLiveness({ tracked: true, matchesHead: true, pushedToUpstream: true })
  assert.equal(clean.ok, true)
  assert.equal(clean.warning, '', '三个事实都确认过 → 不该有多余警告')

  const untracked = evaluateManifestLiveness({ tracked: false, matchesHead: null, pushedToUpstream: null })
  assert.equal(untracked.ok, false)
  assert.match(untracked.detail, /没有被 git 跟踪/)

  const dirty = evaluateManifestLiveness({ tracked: true, matchesHead: false, pushedToUpstream: true })
  assert.equal(dirty.ok, false)
  assert.match(dirty.detail, /未提交的改动/)

  const unpushed = evaluateManifestLiveness({ tracked: true, matchesHead: true, pushedToUpstream: false })
  assert.equal(unpushed.ok, false)
  assert.match(unpushed.detail, /还没推到 upstream/)
})

test('③ evaluateManifestLiveness：判断不了只警告不拦（否则 CI / 非 git 环境永远跑不动）', () => {
  const unknown = evaluateManifestLiveness({ tracked: null, matchesHead: null, pushedToUpstream: null })
  assert.equal(unknown.ok, true)
  assert.match(unknown.warning, /无法确认/)

  // tracked 确认过、但没配 upstream（游离 HEAD）→ 放行 + 警告
  const noUpstream = evaluateManifestLiveness({ tracked: true, matchesHead: true, pushedToUpstream: null })
  assert.equal(noUpstream.ok, true)
  assert.match(noUpstream.warning, /是否已推送/)
})

test('③ evaluateManifestLiveness：--allow-uncommitted 强行放行时有 forced 标记，且缺口照报', () => {
  const forced = evaluateManifestLiveness({
    tracked: true, matchesHead: false, pushedToUpstream: false, allowUncommitted: true,
  })
  assert.equal(forced.ok, true, '强行放行要能过')
  assert.equal(forced.forced, true, '必须留下痕迹，调用方据此打警告')
  assert.match(forced.detail, /未提交的改动/, '放行也必须说清楚冒了什么风险')
  assert.match(forced.detail, /还没推到 upstream/)
})

test('③ 守门：默认值必须是 fail-closed（忘了传事实 = 拒绝，不是放行）', () => {
  const r = evaluateManifestLiveness()
  assert.equal(r.ok, false, '空调用不能默认放行 —— 不然调用方漏传事实就悄悄开闸')
})

// ① 发布模式必须有公开下载地址（否则"不上传却换统计"）
test('① CLI：--allow-content-gaps 是合法开关（默认关）', () => {
  const plain = cli([])
  assert.equal(plain.ok, true)
  assert.equal(plain.allowContentGaps, false, '默认必须是关闭')

  const on = cli(['--allow-content-gaps'])
  assert.equal(on.ok, true, '不能因为未知选项被拒')
  assert.equal(on.allowContentGaps, true)

  const withType = cli(['--type=SS', '--publish', '--allow-content-gaps'])
  assert.equal(withType.ok, true)
  assert.equal(withType.mode, 'single-publish')
  assert.equal(withType.allowContentGaps, true)

  assert.match(describeCliError({ arg: 'x', error: 'unknown-option' }), /未知选项/)
})

// ---------- 结构断言：这些失败模式不会被纯函数单测看见 ----------
test('⑤ 结构：无音频必须真的参与判定（不能只 warn）', () => {
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  assert.ok(src.includes('audioMissing: audioMissingKeys.length'), '要把无音频数交给 evaluatePack')
  assert.ok(src.includes("contentVerdict.reason === 'audio-missing'"), '失败日志要列出是哪几张')
})

test('④ 结构：bgEntry 必须是 let —— const 重赋值会被 catch 吞掉', () => {
  // 这不是风格问题：`bgEntry = bgFrom` 抛 "Assignment to constant variable" 时，
  // 异常正好被"借主图资源失败"那个 catch 接住 → 包照发、只是少了曲绘，
  // 而所有单测都是绿的（借主图的路径要真 R2 才走得到）。
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  assert.ok(src.includes('let bgEntry = findZipEntry(zip, meta.backgroundFile)'), 'bgEntry 必须是 let')
  assert.ok(!src.includes('const bgEntry ='), '不能退回 const')
  assert.ok(src.includes('bgEntry = bgFrom'), 'NSV 借主图曲绘那段仍然要存在')
})

test('① 结构：入口硬闸门 + 上传处兜底，两道都要在', () => {
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  assert.ok(src.includes('assertPublishEnv(cli.mode)'), '入口要拦（发布模式必须有公开地址）')
  assert.ok(src.includes('if (publish && !R2_PACKS_PUBLIC_URL)'), '上传处要有兜底置 failed')
  assert.ok(src.includes("packEntry.detail = 'R2_PACKS_PUBLIC_URL 未配置"), '兜底要说清原因')
})

test('② 结构：少图判定必须在切包/上传之前，且两个模式都传上一版清单', () => {
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  const at = (needle) => {
    const i = src.indexOf(needle)
    assert.ok(i >= 0, `generate-pack.js 里找不到 ${needle}`)
    return i
  }
  const lossCheck = at('if (slotLossBlocked) {')
  // 锚点要带 s3.send：文件里另有一处 PutObjectCommand（另一个辅助函数，位置更早）
  const upload = at('s3.send(new PutObjectCommand({')
  assert.ok(lossCheck < upload, '判定必须早于任何上传 —— 否则已经推上去的包撤不回来')

  // 判定必须真的被喂了上一版张数与当前张数 —— 写成 previousSlots: 0 就永远不触发，
  // 而 evaluateSlotLoss 的单测照样全绿（它们直接调纯函数）。
  assert.ok(src.includes('previousManifestSlotTotal(previousManifest, targetType)'), '基准要来自上一版清单')
  // 用正则而不是 includes：被改写成 `previousSlots: 0,` 时函数名还在，只有看实参才抓得住。
  assert.match(src, /previousSlots,\s*\n\s*currentSlots: uniqueSlotTotal,/, '基准与当前张数都要真的喂进去')
  assert.ok(!src.includes('previousSlots: 0'), '基准不能被写死成 0（那等于永不触发）')

  const fullCall = at('previousManifest: oldManifest,')
  const singleCall = at('previousManifest: singleOldManifest,')
  const singleRead = at("singleOldManifest = JSON.parse")
  assert.ok(singleRead < singleCall, '单类型模式也要在生成前读清单')
  assert.ok(fullCall > 0 && singleCall > 0)

  // 旧清单的读取必须早于 generatePack 调用：生成之后再读就晚了一轮
  const genCall = at('await generatePack(type, {')
  const readBefore = at('oldManifest = JSON.parse')
  assert.ok(readBefore < genCall, '全量模式必须先生成前读清单')
})

test('③ 结构：GC 脚本必须核实清单"已上线"，而不是只打一句提示', () => {
  const src = readFileSync(new URL('./gc-pack-objects.mjs', import.meta.url), 'utf8')
  const at = (needle) => {
    const i = src.indexOf(needle)
    assert.ok(i >= 0, `gc-pack-objects.mjs 里找不到 ${needle}`)
    return i
  }
  assert.ok(src.includes('evaluateManifestLiveness('), '判据要走纯函数')
  assert.ok(src.includes("probeManifestInGit(manifestPath)"), '事实要从 git 取')
  assert.ok(src.includes('--allow-uncommitted'), '要留显式放行口')
  // 拿到判据却不用，等于没核实：核实不过必须直接拒绝执行。
  assert.match(src, /if \(!liveness\.ok\) \{[\s\S]{0,500}?process\.exit\(1\)/, '核实不过必须拒绝执行')
  // 核实必须早于"列桶"与"删对象"
  assert.ok(at('probeManifestInGit(manifestPath)') < at('listPacksBucket()'), '核实要早于列桶')
  assert.ok(at('probeManifestInGit(manifestPath)') < at('new DeleteObjectCommand('), '核实要早于删除')
  // 而且必须早于凭据检查：这是本地错误，不该先要 R2 凭据
  assert.ok(at('probeManifestInGit(manifestPath)') < at('缺失 R2 凭据'), '核实要早于凭据检查')
})

// ---------------------------------------------------------------------------
// 临时归类（packAs）：把某个真实键型**整体**挪进别的包（2026-09-21）
// ---------------------------------------------------------------------------
//
// 这是"一个真实键型被彻底暂时转移到别的键型"的核心场景。最危险的不是图挪错了，
// 而是**同一个包留在线上**：那些图此刻已经在接收方的包里，旧包却还在，下载页两个包
// 都列它，玩家下两次。所以"该保留旧包"与"该把旧包下线"必须分得开。

test('空类型：图真的没了 → SKIPPED 保留旧包（数据滞后也走这条）', () => {
  const { status, reason } = classifyEmptyType({ movedOutSlots: 0 })
  assert.equal(status, STATUS_SKIPPED)
  assert.equal(reason, 'no-slots')
})

test('空类型：全被临时归类挪走了 → OK + 空 packs，旧包必须下线', () => {
  const { status, reason } = classifyEmptyType({ movedOutSlots: 3 })
  // **不能**是 SKIPPED —— buildManifestPacks 对 SKIPPED 的处理是"原样保留旧条目"，
  // 而那正是 bug：旧条目留着，同一批图就同时出现在两个包里。
  assert.notEqual(status, STATUS_SKIPPED, '复用 SKIPPED 会让旧包留在清单里 ⇒ 重复收录')
  assert.equal(status, STATUS_OK)
  assert.equal(reason, 'moved-out')
})

test('空类型 + 全被挪走：端到端跑 buildManifestPacks，旧包确实从清单里消失', () => {
  const oldManifest = {
    packs: [
      { realType: 'IN', part: 1, objectKey: 'IN_1.aaa.osz', mapCount: 3, totalMaps: 3, links: { r2: 'https://r2/IN_1.aaa.osz' } },
      { realType: 'SS', part: 1, objectKey: 'SS_1.bbb.osz', mapCount: 100, totalMaps: 100, links: { r2: 'https://r2/SS_1.bbb.osz' } },
    ],
  }
  const typeResults = [
    // IN 的 3 张全被 packAs='SS' 挪走 → generate-pack.js 会返回 OK + 空 packs
    { realType: 'IN', status: STATUS_OK, reason: 'moved-out', plannedSlots: 0, packs: [] },
    { realType: 'SS', status: STATUS_OK, packs: [pack('SS#1', { realType: 'SS', mapCount: 103, totalMaps: 103, objectKey: 'SS_1.ccc.osz' })] },
  ]
  const { packs } = buildManifestPacks({ typeResults, oldManifest, today: '2026-09-21' })
  assert.equal(packs.filter((p) => p.realType === 'IN').length, 0, 'IN 的旧包还在清单里 ⇒ 那 3 张图会同时出现在 IN 与 SS 包里')
  assert.equal(packs.filter((p) => p.realType === 'SS').length, 1)
})

test('空类型：SKIPPED 那条路仍在 —— 真没图的类型保留旧条目（别把两种混成一种）', () => {
  const oldManifest = {
    packs: [{ realType: 'IN', part: 1, objectKey: 'IN_1.aaa.osz', mapCount: 3, totalMaps: 3 }],
  }
  const typeResults = [
    { realType: 'IN', status: STATUS_SKIPPED, reason: 'no-slots', plannedSlots: 0, packs: [] },
    { realType: 'SS', status: STATUS_OK, packs: [pack('SS#1', { objectKey: 'SS_1.bbb.osz' })] },
  ]
  const { packs } = buildManifestPacks({ typeResults, oldManifest, today: '2026-09-21' })
  assert.equal(packs.filter((p) => p.realType === 'IN').length, 1, '本地数据滞后时误删线上包（R10 第 1、2 条）')
})

test('收缩护栏：本键型的图被挪走时，必须说明"这不是文件丢失"', () => {
  const lines = slotLossHintLines({ movedOutSlots: 3, missingMainSlotCount: 0, lost: 3 })
  const text = lines.join('\n')
  assert.match(text, /临时归类/, '不说的话站长会以为是 R2 掉文件')
  assert.match(text, /allow-content-gaps/, '要给出下一步动作，不能只说"拒绝发布"')
  assert.match(text, /不是文件丢失/)
})

test('收缩护栏：撤销临时归类（借进来的图回家了）也要有解释', () => {
  // 这条是最难归因的：撤销后那些图的 realType 是别的键型、packAs 也已清空，
  // 与本类型再无关联 —— movedOutSlots 是 0，只能靠"确实没有槽位缺文件"推出来。
  const lines = slotLossHintLines({ movedOutSlots: 0, missingMainSlotCount: 0, lost: 3 })
  const text = lines.join('\n')
  assert.match(text, /撤销/, '没有真丢文件时，最常见的解释就是撤销了临时归类')
  assert.match(text, /allow-content-gaps/)
})

test('收缩护栏：真丢了文件时不许把"撤销"当主因（会盖过真正的原因）', () => {
  const lines = slotLossHintLines({ movedOutSlots: 0, missingMainSlotCount: 4, lost: 4 })
  const text = lines.join('\n')
  assert.doesNotMatch(text, /撤销/, '缺文件的槽位列得出来时，就别再猜撤销了')
  assert.equal(lines.length, 0, '没有临时归类参与时不该多嘴')
})

test('收缩护栏：全被挪走（挪走的恰好等于少的）就不重复说撤销', () => {
  const lines = slotLossHintLines({ movedOutSlots: 3, missingMainSlotCount: 0, lost: 3 })
  assert.doesNotMatch(lines.join('\n'), /撤销/, 'movedOutSlots === lost 时"撤销"是错的解释（那些图全在本键型名下被挪出去，不是回家的）')
})

test('generate-pack.js 走的是这两个纯函数，不再有内联副本', () => {
  const src = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf-8')
  assert.ok(src.includes('classifyEmptyType({ movedOutSlots })'), '空分类要走纯函数')
  assert.ok(src.includes('slotLossHintLines({'), '护栏提示要走纯函数')
  // 内联副本一旦回潮，测试就管不着了（这两处逻辑的 bug 都是"少一句话"型）。
  assert.doesNotMatch(src, /reason: 'moved-out',\s*\n\s*plannedSlots/, '别把判定写回 generate-pack.js 里')
})

// ---------------------------------------------------------------------------
// 包下线之后：Drive 侧那个文件还有归属吗？（2026-09-21 审查提过一次假警报）
// ---------------------------------------------------------------------------
//
// 审查结论说"下线吃掉 pendingMirrors 标记 ⇒ Drive 文件永久失管"。跑真实函数后确认**不成立**：
// 归属走的是另一条路（`computeOrphans` 拿上一版清单）。这里把判据钉住，免得下次又照着
// "pendingMirrors 里没有它"重新报一遍。

test('包下线后 pendingMirrors 确实不再提它 —— 但那是对的（孤儿报告才是它的归属）', () => {
  const oldManifest = {
    packs: [
      { realType: 'IN', part: 1, objectKey: 'IN_1.a1.osz', mapCount: 3, totalMaps: 3, gdriveFileId: 'DRIVE_IN', gdriveObjectKey: 'IN_1.a1.osz' },
      { realType: 'SS', part: 1, objectKey: 'SS_1.b1.osz', mapCount: 100, totalMaps: 100 },
    ],
    pendingMirrors: ['IN_1.osz'],
  }
  const typeResults = [
    { realType: 'IN', status: STATUS_OK, reason: 'moved-out', plannedSlots: 0, packs: [] },
    { realType: 'SS', status: STATUS_OK, packs: [pack('SS#1', { objectKey: 'SS_1.c1.osz' })] },
  ]
  const { packs, pendingMirrors } = buildManifestPacks({ typeResults, oldManifest, today: '2026-09-21' })

  // ① 条目没了 —— 这正是修复 1 的目的
  assert.equal(packs.filter((p) => p.realType === 'IN').length, 0)
  // ② 标记也没了。单看这一条像"失管"，但它只是"这个包还在线上且镜像旧"的标记，
  //    包都不在线了，留着它反而会让下载页对一个不存在的包报警。
  assert.deepEqual(pendingMirrors, [])
  // ③ 真正的归属：上线前那版清单里还有 IN 的条目，于是 computeOrphans 会把它列出来。
  //    （这一步在 upload-to-gdrive.js，这里只锁"上一版清单确实还留着那条"这个前提。）
  const inPrev = (structuredClone(oldManifest).packs).find((p) => p.realType === 'IN')
  assert.equal(inPrev.gdriveFileId, 'DRIVE_IN', '上一版清单还留着它 ⇒ 孤儿报告拿得到这个 id')
})

test('撤销后重新上线：不继承已经不在清单里的 gdriveFileId', () => {
  // previous 是 byKey.get(realType#part)，取自 oldPacks —— 下线的包不在里面，
  // 所以"继承到一个已删的 Drive id"这条路走不通。
  const afterRetire = {
    packs: [{ realType: 'SS', part: 1, objectKey: 'SS_1.c1.osz', mapCount: 103, totalMaps: 103, gdriveFileId: 'DRIVE_SS', gdriveObjectKey: 'SS_1.c1.osz' }],
  }
  const typeResults = [
    // 撤销：图回到 IN，内容没变 ⇒ objectKey 回到原来那一串（内容寻址，确实会回到同一个键）
    { realType: 'IN', status: STATUS_OK, packs: [pack('IN#1', { realType: 'IN', objectKey: 'IN_1.a1.osz', mapCount: 3, totalMaps: 3 })] },
    { realType: 'SS', status: STATUS_OK, packs: [pack('SS#1', { objectKey: 'SS_1.c1.osz' })] },
  ]
  const { packs } = buildManifestPacks({ typeResults, oldManifest: afterRetire, today: '2026-09-22' })
  const back = packs.find((p) => p.realType === 'IN')
  assert.equal(back.objectKey, 'IN_1.a1.osz')
  assert.equal(back.gdriveFileId, undefined, '不该继承 —— 下线的条目已经不在上一版清单里了')
  // 于是 upload-to-gdrive 会走"按文件名找同名文件"分支（同名即同内容），而不是拿旧 id 去 update。
})
