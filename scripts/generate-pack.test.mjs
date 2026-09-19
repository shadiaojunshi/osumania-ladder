import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

// 合包时对 .osu 的改写规则。
//
// 2026-09-13 用户要求「取消所有的合包 OD 下限,原谱是多少就是多少」,随后追加「HP 也跟随原谱」。
// 所以 [Difficulty] 段现在**整体不被碰**:旧的 OD_FLOOR 表(按 realType 抬 OD 到 7.2~9)
// 与固定写 7 的 HP_TARGET 都已删除。
//
// 为什么用 createRequire 而不是 import:generate-pack.js 是 CJS,且顶部会校验 R2 凭据、
// 底部要 require.main 守卫才不执行 main。这里先塞 dummy 凭据再 require,只调纯函数,
// 不联网、不读写任何文件。

process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_ACCESS_KEY = 'test-key'
process.env.R2_SECRET_KEY = 'test-secret'

const require = createRequire(import.meta.url)
const { rewriteOsu, packCountFor, packSizeFor, compareTournamentsForSources, writeIdentityReport, countIdentityIssues, resolveDownloadConcurrency, DEFAULT_DOWNLOAD_CONCURRENCY, MAX_DOWNLOAD_CONCURRENCY } = require('./generate-pack.js')

const sampleOsu = (od, hp = 5) => [
  'osu file format v14',
  '',
  '[General]',
  'AudioFilename: old.mp3',
  '',
  '[Metadata]',
  'Title:Old Title',
  'TitleUnicode:Old Title',
  'Artist:Old Artist',
  'ArtistUnicode:Old Artist',
  'Creator:Old Mapper',
  'Version:Old Version',
  'BeatmapID:12345',
  'BeatmapSetID:67890',
  'Source:Old Source',
  'Tags:old tags',
  '',
  '[Difficulty]',
  `HPDrainRate:${hp}`,
  'CircleSize:4',
  `OverallDifficulty:${od}`,
  'ApproachRate:9',
  '',
  '[TimingPoints]',
  '0,500,4,1,0,100,1,0',
  '',
  '[Events]',
  '//Background and Video events',
  '0,0,"oldbg.jpg",0,0',
  '',
  '[HitObjects]',
  '256,192,0,128,0,500:0:0:0:0:',
  '',
].join('\n')

const rewrite = (od, hp) => rewriteOsu(sampleOsu(od, hp), {
  newTitle: 'New Title',
  newArtist: 'Various Artists',
  newCreator: 'various mappers',
  newVersion: 'New Version',
  newAudioFilename: 'audio.mp3',
  newBgFilename: 'bg.jpg',
})

const odOf = (text) => Number(/(?:^|\n)OverallDifficulty:\s*([0-9.]+)/.exec(text)[1])
const hpOf = (text) => Number(/(?:^|\n)HPDrainRate:\s*([0-9.]+)/.exec(text)[1])

test('OD 不再被抬升:低于旧下限的原谱 OD 原样保留', () => {
  // 这些值过去会被 OD_FLOOR 抬到 7.2~9(例如 SS 抬到 8、CJ 抬到 9)
  for (const od of ['1', '4.5', '7', '7.9', '8.9', '10']) {
    assert.equal(odOf(rewrite(od)), Number(od), `OD ${od} 必须原样保留`)
  }
})

test('OD 也不会被压低:高于旧下限的原谱 OD 不动', () => {
  assert.equal(odOf(rewrite('9.5')), 9.5)
  assert.equal(odOf(rewrite('10')), 10)
})

test('HP 也跟随原谱:不再被统一改写成 7', () => {
  for (const hp of ['1', '5', '7', '8', '9.5', '10']) {
    assert.equal(hpOf(rewrite('8', hp)), Number(hp), `HP ${hp} 必须原样保留`)
  }
})

test('[Difficulty] 段整体不被改写(OD 与 HP 都跟随原谱)', () => {
  const section = (text) => /\[Difficulty\]([\s\S]*?)\n\[/.exec(text)[1]
  const before = sampleOsu('7.5', 8.3)
  const after = rewrite('7.5', 8.3)
  assert.equal(section(after), section(before), '[Difficulty] 段应逐字节不变')
})

test('其余改写照旧:标题/艺术家/作者/版本/ID/来源/标签/音频/背景', () => {
  const out = rewrite('8')
  assert.match(out, /\nTitle:New Title\n/)
  assert.match(out, /\nArtist:Various Artists\n/)
  assert.match(out, /\nCreator:various mappers\n/)
  assert.match(out, /\nVersion:New Version\n/)
  assert.match(out, /\nBeatmapID:0\n/)
  assert.match(out, /\nBeatmapSetID:-1\n/)
  assert.match(out, /\nSource:\n/)
  assert.match(out, /\nTags:\n/)
  assert.match(out, /\nAudioFilename: audio\.mp3\n/)
  assert.match(out, /^0,0,"bg\.jpg"/m)
})

test('谱面音符与时间轴不被触碰(只改目标行)', () => {
  const before = sampleOsu('8')
  const after = rewrite('8')
  assert.match(after, /\[TimingPoints\]\n0,500,4,1,0,100,1,0/)
  assert.match(after, /256,192,0,128,0,500:0:0:0:0:/)
  assert.equal(
    after.split('\n').length,
    before.split('\n').length,
    '改写不应增删行数',
  )
})

// 2026-09-17：rewriteOsu 原来用**字符串**做 replacement，值里若含 $'、$&、$$、$1 会被
// 当成特殊模式展开 —— $' 会把匹配点之后的整份文件内容注入到那一行（实测把谱面撑坏）。
// 已改成函数式 replacement，这里锁住。
test('值里的 $ 序列不会破坏谱面(不再注入/吞掉内容)', () => {
  const before = sampleOsu('8')
  const after = rewriteOsu(sampleOsu('8'), {
    newTitle: 'New Title',
    newArtist: 'Various Artists',
    newCreator: 'various mappers',
    newVersion: "(MCNC 4K 2026) Ke$ha - A$&B [m$1p] (v$`)",
    newAudioFilename: 'audio.mp3',
    newBgFilename: 'bg.jpg',
  })
  assert.equal(after.split('\n').length, before.split('\n').length, '行数不能变（$\' 会把整份文件塞回该行）')
  const versionLine = after.split('\n').find((line) => line.startsWith('Version:'))
  assert.equal(versionLine, "Version:(MCNC 4K 2026) Ke$ha - A$&B [m$1p] (v$`)", '值要原样写入')
  assert.equal((after.match(/\[HitObjects\]/g) || []).length, 1, '[HitObjects] 只能出现一次')
})

// 2026-09-17 站长定的分包规则：≤120 → 1 包；>120 → 2 包；从 3 包起，>90×(n-1) 分 n 包。
test('分包份数遵循站长规则(120/180/270/360 为界)', () => {
  // 2026-09-17 修订:3 包阈值由 180 抬到 200(刚过阈值不再出现 61/60/60 这种谷)
  const cases = [[1, 1], [93, 1], [120, 1], [121, 2], [180, 2], [200, 2], [201, 3], [270, 3], [271, 4], [360, 4], [361, 5], [451, 6]]
  for (const [total, parts] of cases) {
    assert.equal(packCountFor(total), parts, `${total} 张应分 ${parts} 包`)
    const sizes = Array.from({ length: parts }, (_, i) => packSizeFor(total, i, parts))
    assert.equal(sizes.reduce((a, b) => a + b, 0), total, `${total}: 各包之和须等于总数`)
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${total}: 各包最多只差 1 张`)
  }
})

test('实测规模下的分包(不再出现十几张的小尾包)', () => {
  const actual = [[93, '93'], [105, '105'], [121, '61/60'], [151, '76/75'], [191, '96/95'], [202, '68/67/67'], [222, '74/74/74']]
  for (const [total, expected] of actual) {
    const parts = packCountFor(total)
    const sizes = Array.from({ length: parts }, (_, i) => packSizeFor(total, i, parts))
    assert.equal(sizes.join('/'), expected, `${total} 张`)
    assert.ok(Math.min(...sizes) >= 60, `${total}: 最小包不应小于 60 张`)
    assert.ok(Math.max(...sizes) <= 120, `${total}: 最大包不应超过 120 张`)
  }
})

// ---------- 身份报告：渲染「同内容、不同身份来源」（只报告，不改包）----------

const srcOf = (abbr, round, slot) => ({ tournamentAbbr: abbr, roundAbbr: round, slot })
const tmpReport = () =>
  path.join(os.tmpdir(), `mania-identity-report-${process.pid}-${Math.random().toString(36).slice(2)}.md`)

test('身份报告：渲染「内容摘要相同但身份来源不同」小节，且明说没有改动打包结果', () => {
  const out = tmpReport()
  try {
    writeIdentityReport([{
      realType: 'SS',
      identity: {
        conflicts: [],
        unresolved: [],
        sameContent: [{
          contentKey: 'deadbeefdeadbeef',
          isNsv: false,
          groups: [
            { candidateKey: 'bid:500', members: [{ r2Key: 'maps/a/r1/RC1.osz', sources: [srcOf('T1', 'r1', 'RC1')] }] },
            { candidateKey: 'meta:x|t|c|v', members: [{ r2Key: 'maps/b/r2/RC2.osz', sources: [srcOf('T2', 'r2', 'RC2')] }] },
          ],
        }],
      },
    }], out)
    const text = fs.readFileSync(out, 'utf-8')
    assert.match(text, /## SS/)
    assert.match(text, /内容摘要相同、但身份来源不同/)
    assert.ok(text.includes('`deadbeefdeadbeef`'), '摘要要列出来')
    assert.ok(text.includes('bid:500') && text.includes('meta:x|t|c|v'), '两条候选键都要列出来')
    assert.ok(text.includes('maps/b/r2/RC2.osz'), '路径要列出来')
    assert.ok(text.includes('T2r2 RC2'), '来源标签要列出来')
    assert.ok(text.includes('只报告'), '要说清没有改动打包结果')
  } finally {
    fs.rmSync(out, { force: true })
  }
})

test('身份报告：没有任何需要核对的项时写明「本次没有」', () => {
  const out = tmpReport()
  try {
    writeIdentityReport([{ realType: 'JS', identity: { conflicts: [], unresolved: [], sameContent: [] } }], out)
    const text = fs.readFileSync(out, 'utf-8')
    assert.ok(text.includes('（本次没有任何需要人工核对的项）'))
    assert.ok(!text.includes('## JS'), '没有问题的类型不该占一节')
  } finally {
    fs.rmSync(out, { force: true })
  }
})

test('身份报告：旧调用方没给 sameContent 也不会崩，更不会伪造一节', () => {
  const out = tmpReport()
  try {
    writeIdentityReport([{ realType: 'LN', identity: { conflicts: [], unresolved: [] } }], out)
    const text = fs.readFileSync(out, 'utf-8')
    assert.ok(text.includes('（本次没有任何需要人工核对的项）'))
  } finally {
    fs.rmSync(out, { force: true })
  }
})

test('身份报告：体检汇总表逐类型列出四项计数，跳过类型不留假数字', () => {
  const out = tmpReport()
  try {
    writeIdentityReport([
      {
        realType: 'SS', status: 'ok', plannedSlots: 120,
        identity: {
          conflicts: [], unresolved: [], readableEntries: 118, readFailed: 2,
          sameContent: [{
            contentKey: 'aaa', isNsv: false,
            groups: [
              { candidateKey: 'bid:1', members: [{ r2Key: 'maps/a.osz', sources: [srcOf('T1', 'r1', 'RC1')] }] },
              { candidateKey: 'meta:z', members: [{ r2Key: 'maps/b.osz', sources: [srcOf('T2', 'r2', 'RC2')] }] },
            ],
          }],
        },
      },
      { realType: 'JS', status: 'skipped', plannedSlots: 0, identity: null },
      {
        realType: 'CJ', status: 'ok', plannedSlots: 40,
        identity: {
          conflicts: [{
            candidateKey: 'bid:9', reason: 'same-bid-different-content',
            members: [{ contentKey: 'ccc', paths: ['maps/c.osz'], sources: [srcOf('T3', 'r3', 'RC3')] }],
          }],
          unresolved: [], sameContent: [], readableEntries: 40, readFailed: 0,
        },
      },
    ], out, { note: '本次由只读体检生成', summaryTable: true })
    const text = fs.readFileSync(out, 'utf-8')
    assert.match(text, /## 本次体检汇总/)
    assert.match(text, /本次由只读体检生成/)
    assert.match(text, /\| SS \| 120 \| 118 \| 2 \| 0 \| 0 \| 1 \|/)
    assert.match(text, /\| CJ \| 40 \| 40 \| 0 \| 1 \| 0 \| 0 \|/)
    assert.match(text, /\| JS \| 0 \| - \| - \| - \| - \| - \|/, '跳过的类型不能编造计数')
    assert.ok(text.includes('不等于'), '要提醒"读取失败"不等于"没有重复"')
  } finally {
    fs.rmSync(out, { force: true })
  }
})

test('身份报告：某类型有读取失败时，该类型的段落里要写出来（"看不清"≠"没有重复"）', () => {
  const out = tmpReport()
  try {
    writeIdentityReport([{
      realType: 'SS',
      status: 'ok',
      plannedSlots: 10,
      identity: {
        readFailed: 3,
        unresolved: [],
        sameContent: [],
        conflicts: [{
          candidateKey: 'bid:500',
          reason: 'same-bid-different-content',
          members: [{ contentKey: 'aaa', paths: ['maps/a.osz'], sources: [srcOf('T1', 'r1', 'RC1')] }],
        }],
      },
    }], out)
    const text = fs.readFileSync(out, 'utf-8')
    assert.match(text, /## SS/)
    assert.match(text, /有 3 个引用读取失败、未参与本次判定/)
    assert.ok(!text.includes('本次体检汇总'), '非体检模式下不该插汇总表')
  } finally {
    fs.rmSync(out, { force: true })
  }
})

test('守门：报告条数统计必须把 sameContent 算进去（否则"只有同内容重复"那次会一声不吭）', () => {
  assert.equal(countIdentityIssues(null), 0)
  assert.equal(countIdentityIssues({ conflicts: [], unresolved: [], sameContent: [] }), 0)
  assert.equal(countIdentityIssues({ conflicts: [1, 2], unresolved: [], sameContent: [] }), 2)
  assert.equal(countIdentityIssues({ conflicts: [], unresolved: [1], sameContent: [] }), 1)
  assert.equal(countIdentityIssues({ conflicts: [], unresolved: [], sameContent: [1, 2, 3] }), 3)
  assert.equal(countIdentityIssues({ conflicts: [1], unresolved: [1], sameContent: [1] }), 3)
  // 旧调用方没有 sameContent 字段也要能算
  assert.equal(countIdentityIssues({ conflicts: [1], unresolved: [] }), 1)
})

// ---------- 下载并发旋钮（合包提速的那一刀）----------

test('并发旋钮：默认 8、非法值回退、上限 32、下限 1', () => {
  assert.equal(resolveDownloadConcurrency(undefined), DEFAULT_DOWNLOAD_CONCURRENCY)
  assert.equal(DEFAULT_DOWNLOAD_CONCURRENCY, 8, '默认值改动要同步文档（PACK_DOWNLOAD_CONCURRENCY）')

  // 非法 / 无意义的值一律回退默认，绝不返回 0 或 NaN（那会让任务空转）
  for (const bad of ['', '  ', '0', '-1', 'abc', 'NaN', null]) {
    assert.equal(resolveDownloadConcurrency(bad), DEFAULT_DOWNLOAD_CONCURRENCY, `${JSON.stringify(bad)} 应回退默认`)
  }

  assert.equal(resolveDownloadConcurrency('1'), 1)
  assert.equal(resolveDownloadConcurrency('12'), 12)
  assert.equal(resolveDownloadConcurrency('12.9'), 12, '小数向下取整')
  assert.equal(resolveDownloadConcurrency('9999'), MAX_DOWNLOAD_CONCURRENCY, '上限封顶')
})

test('守门：并发数只从一个地方取，脚本里不得再有写死的并发', () => {
  // 写死的并发是"以前调不动合包速度"的根因，别再散落回去。
  const src = fs.readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf-8')
  const hardcoded = [...src.matchAll(/mapWithConcurrency\(\s*[A-Za-z_$][\w$]*\s*,\s*(\d+)/g)].map((m) => m[1])
  assert.deepEqual(hardcoded, [], `mapWithConcurrency 的并发数必须走 DOWNLOAD_CONCURRENCY，发现写死：${hardcoded.join(', ')}`)
})

test('守门：--identity-report 分支必须写在打包/发布分支之前（顺序反了会真的全量发布）', () => {
  // main() 里 mode 的分支是顺序判断的：'identity-report' 落在 'single-*' / 全量分支之后的话，
  // 只读体检就会掉进发布路径 —— 那是真的要传 R2、改清单的。这条顺序只能靠源码断言守住。
  const src = fs.readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf-8')
  const iIdentity = src.indexOf("if (cli.mode === 'identity-report')")
  const iSingle = src.indexOf("if (cli.mode === 'single-preview' || cli.mode === 'single-publish')")
  assert.ok(iIdentity > 0, '只读体检分支必须存在')
  assert.ok(iSingle > 0, '单类型分支必须存在')
  assert.ok(iIdentity < iSingle, '只读体检必须先于发布分支判断')
  assert.ok(src.includes('writeIdentityReport(results, IDENTITY_REPORT_PATH, {'), '体检模式要写报告')
  // 部分类型失败时不能写报告：那个文件会被提交，用残报告覆盖上次结果之后没法分辨。
  // 断言「条件 + 跳过写报告」这段整体，只断言提示文案是守不住的（把条件改成 false 就绕过去了）。
  assert.match(
    src,
    /if \(failed\.length > 0\) \{[\s\S]{0,400}?本次不写报告文件/,
    '体检有失败时必须跳过写报告（条件本身也要在）',
  )
})

test('守门：预取阶段必须真的把内容摘要送进报告（这条线断了报告会永远是空，且不报错）', () => {
  // 这段接线只能在有 R2 凭据时执行，脱网测不到行为，所以断言源码里的三个关键点，
  // 防止有人"顺手清理"掉它 —— 报告空着和"确实没有重复"在外观上完全一样。
  const src = fs.readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf-8')
  assert.ok(src.includes('contentKey: sig,'), 'prefetchOne 必须把已算好的内容摘要带出来')
  assert.ok(src.includes('identitySeen.push('), '预取时要收集报告用的条目')
  assert.ok(
    src.includes('sameContent: findSameContentDifferentIdentity(identitySeen)'),
    '要用收集到的条目真的算出报告内容',
  )
})

// ---------------------------------------------------------------------------
// 包内来源标签的顺序（2026-09-19 站长定稿）
// ---------------------------------------------------------------------------
// `formatSources` 只按**首次出现**分组、自己不再排序，所以包面标签的顺序完全由
// `compareTournamentsForSources` 决定。这条顺序改了会改合并谱面的 Version 字符串
// （玩家成绩的身份），必须被测试锁住，不能靠注释守。

test('包内来源顺序：priority 降序排在年份之前（不是先按年份）', () => {
  const high = { id: 'a', abbreviation: 'AAA', year: 2020, priority: 5 }
  const low = { id: 'b', abbreviation: 'BBB', year: 2026, priority: 1 }
  assert.ok(compareTournamentsForSources(high, low) < 0, 'priority 高的排前面，哪怕年份更旧')
})

test('包内来源顺序：同 priority 内年份升序（旧的在前）', () => {
  const old = { id: 'a', abbreviation: 'AAA', year: 2019, priority: 3 }
  const mid = { id: 'b', abbreviation: 'BBB', year: 2023, priority: 3 }
  const fresh = { id: 'c', abbreviation: 'CCC', year: 2026, priority: 3 }
  const sorted = [fresh, old, mid].sort(compareTournamentsForSources)
  assert.deepEqual(sorted.map((t) => t.year), [2019, 2023, 2026])
})

test('包内来源顺序：缺 priority 当 0 排最后；第三级是缩写、最后才是 id', () => {
  const noPriority = { id: 'zzz', abbreviation: 'ZZZ', year: 2026 }
  const withPriority = { id: 'aaa', abbreviation: 'AAA', year: 2019, priority: 1 }
  assert.ok(compareTournamentsForSources(withPriority, noPriority) < 0, '无 priority 视作 0')

  // 同年同 priority → 按缩写升序，而不是按 id（重名缩写时再退到 id）。
  const beta = { id: 'z-file', abbreviation: 'BETA', year: 2024, priority: 2 }
  const alpha = { id: 'a-file', abbreviation: 'ALPHA', year: 2024, priority: 2 }
  assert.deepEqual([beta, alpha].sort(compareTournamentsForSources).map((t) => t.abbreviation), ['ALPHA', 'BETA'])

  // 缩写也完全相同（重名比赛）→ 用 id 兜底，保证全序稳定、不依赖输入顺序。
  const dupA = { id: 'aaa', abbreviation: 'SAME', year: 2024, priority: 2 }
  const dupB = { id: 'bbb', abbreviation: 'SAME', year: 2024, priority: 2 }
  assert.ok(compareTournamentsForSources(dupA, dupB) < 0)
  assert.equal(compareTournamentsForSources(dupA, dupB) === 0, false, '重名比赛也必须能分出先后')
})
