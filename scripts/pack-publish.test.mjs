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
