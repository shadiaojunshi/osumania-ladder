import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// 合包身份判定的回归测试（R11）。
//
// 验收要求逐条对应：
//   · 同元数据不同音符 / 不同 TimingPoints、倍速 → 不合并
//   · 完全相同图（只有 Metadata/背景/音频名不同）→ 可合并
//   · 元数据全空 → 不导致全合并
//   · 同 BID 不同内容 → 报冲突（不合并）
//   · 首选损坏且有有效等价备选 → 仍可出包
//   · 来源与计数口径一致
//
// mapIdentity.js 是纯函数模块（不做 IO），这里全部脱网。

const require = createRequire(import.meta.url)
const {
  canonicalContent,
  contentSignature,
  metadataCandidateKey,
  clusterEntries,
  slotTotalOf,
  pathsNeedingContentCheck,
  pickExistingPath,
  tryPathsInOrder,
  findSameContentDifferentIdentity,
} = require('./mapIdentity.js')

const osu = ({ artist = 'A', title = 'T', creator = 'C', version = 'V', mode = 3, od = 8, points = '0,500,4,1,0,100,1,0', notes = '256,192,0,128,0,500:0:0:0:0:', bg = 'bg.jpg', audio = 'audio.mp3' } = {}) => [
  'osu file format v14',
  '',
  '[General]',
  `AudioFilename: ${audio}`,
  'PreviewTime: 1234',
  `Mode: ${mode}`,
  '',
  '[Metadata]',
  `Title:${title}`,
  `Artist:${artist}`,
  `Creator:${creator}`,
  `Version:${version}`,
  'BeatmapID:0',
  'BeatmapSetID:-1',
  '',
  '[Difficulty]',
  `OverallDifficulty:${od}`,
  'HPDrainRate:5',
  '',
  '[TimingPoints]',
  points,
  '',
  '[Events]',
  '//Background and Video events',
  `0,0,"${bg}",0,0`,
  '',
  '[HitObjects]',
  notes,
  '',
].join('\n')

const src = (abbr, round, slot) => ({ tournamentAbbr: abbr, roundAbbr: round, slot })
const entry = (over = {}) => ({
  r2Key: 'maps/a/r1/RC1.osz',
  beatmapId: null,
  isNsv: false,
  exists: true,
  metadataKey: null,
  contentKey: null,
  source: src('A', 'r1', 'RC1'),
  ...over,
})

// ---------- 内容摘要 ----------

test('R11 内容摘要只看玩法内容：Metadata / 背景 / 音频名不同不影响身份', () => {
  const a = osu({ artist: 'X', title: 'Y', creator: 'P', version: 'Q', bg: 'a.jpg', audio: '1.mp3' })
  const b = osu({ artist: 'other', title: 'song', creator: 'zzz', version: 'insane', bg: 'b.png', audio: '2.ogg' })
  assert.equal(contentSignature(a), contentSignature(b), '同名不同元数据应视为同一张图')
})

test('R11 音符不同 → 摘要不同（这正是过去被错误合并的情形）', () => {
  const a = osu()
  const b = osu({ notes: '256,192,0,128,0,500:0:0:0:0:\n448,192,250,128,0,750:0:0:0:0:' })
  assert.notEqual(contentSignature(a), contentSignature(b))
})

test('R11 时间轴 / 倍速不同 → 摘要不同', () => {
  const base = osu()
  assert.notEqual(contentSignature(base), contentSignature(osu({ points: '0,400,4,1,0,100,1,0' })))
  assert.notEqual(contentSignature(base), contentSignature(osu({ od: 9 })))
  assert.notEqual(contentSignature(base), contentSignature(osu({ mode: 0 })))
})

test('R11 只有注释/空行/行尾空格差异 → 仍是同一张（规范化生效）', () => {
  const a = osu()
  const b = a.replace('[HitObjects]', '[HitObjects]\n//comment').replace(/^/gm, '') + '\n\n   \n'
  assert.equal(contentSignature(a), contentSignature(b))
})

test('R11 没有玩法内容（空谱）→ 摘要为 null，不能当"都相同"', () => {
  const empty = ['osu file format v14', '', '[Metadata]', 'Title:t', 'Artist:a'].join('\n')
  assert.equal(contentSignature(empty), null)
  assert.equal(canonicalContent(empty), '')
})

test('R11 元数据候选键：四项全空 → null（不参与候选）', () => {
  assert.equal(metadataCandidateKey({ artist: '', title: '', creator: '', version: '' }), null)
  assert.equal(metadataCandidateKey({}), null)
  // 只要有一项非空就是候选（是否真等价仍由内容摘要决定）
  assert.equal(metadataCandidateKey({ title: ' T ', artist: '' }), '|t||')
})

// ---------- 聚簇 ----------

test('R11 验收：同元数据不同内容 → 分成两个条目 + 报冲突', () => {
  const a = contentSignature(osu())
  const b = contentSignature(osu({ notes: '448,192,0,128,0,500:0:0:0:0:' }))
  const { clusters, conflicts } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', metadataKey: 'a|t|c|v', contentKey: a, source: src('A', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', metadataKey: 'a|t|c|v', contentKey: b, source: src('B', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 2, '内容不同绝不能合并')
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].reason, 'same-metadata-different-content')
  assert.equal(conflicts[0].members.length, 2)
})

test('R11 验收：同 BID 不同内容 → 报 same-bid-different-content', () => {
  const a = contentSignature(osu())
  const b = contentSignature(osu({ notes: '448,192,0,128,0,500:0:0:0:0:' }))
  const { clusters, conflicts } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: a, source: src('A', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', beatmapId: 111, contentKey: b, source: src('B', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 2)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].reason, 'same-bid-different-content')
})

test('R11 验收：同 BID 同内容 → 合并成一个条目，来源都保留', () => {
  const a = contentSignature(osu())
  const { clusters, conflicts } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: a, source: src('A', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', beatmapId: 111, contentKey: a, source: src('B', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 1)
  assert.equal(conflicts.length, 0)
  assert.equal(clusters[0].sources.length, 2)
  assert.deepEqual(clusters[0].alternatePaths, ['maps/a/r1/RC1.osz', 'maps/b/r1/RC1.osz'])
})

test('R11 验收：元数据全空不会全合并（各自独立）', () => {
  const a = contentSignature(osu())
  const { clusters } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', metadataKey: null, contentKey: a, source: src('A', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', metadataKey: null, contentKey: a, source: src('B', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 2, '没有候选键就不该被并到一起')
})

test('R11 读不出内容（摘要为 null）→ 各自独立，不会因为"都读不到"而合并', () => {
  const { clusters } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', metadataKey: 'a|t|c|v', contentKey: null, source: src('A', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', metadataKey: 'a|t|c|v', contentKey: null, source: src('B', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 2)
})

test('R11 主图与 NSV 变体不会被并成一条', () => {
  const a = contentSignature(osu())
  const { clusters } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: a }),
    entry({ r2Key: 'maps/a/r1/RC1.nsv.osz', beatmapId: 111, isNsv: true, contentKey: a, source: src('A', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 2, 'NSV 是独立文件，不能与主图合并')
})

// ---------- 缺失文件与来源挂靠 ----------

test('R11 验收：缺文件的引用只在身份唯一可确认时挂靠，否则进 unresolved', () => {
  const a = contentSignature(osu())
  const { clusters, unresolved } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: a, source: src('A', 'r1', 'RC1') }),
    // 同一个 BID、文件不在 → 唯一匹配，标签能挂上
    entry({ r2Key: 'maps/c/r1/RC1.osz', beatmapId: 111, exists: false, source: src('C', 'r1', 'RC1') }),
    // 没有 BID、文件也不在 → 无法确认，不能乱挂
    entry({ r2Key: 'maps/d/r1/RC1.osz', beatmapId: null, exists: false, source: src('D', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].sources.length, 2, '缺文件的同 BID 引用应挂上')
  assert.deepEqual(clusters[0].missingPaths, ['maps/c/r1/RC1.osz'])
  assert.equal(unresolved.length, 1)
  assert.equal(unresolved[0].reason, 'no-bid')
})

test('R11 同 BID 有多份内容不同的副本时，缺文件的引用不挂靠（避免挂错）', () => {
  const a = contentSignature(osu())
  const b = contentSignature(osu({ notes: '448,192,0,128,0,500:0:0:0:0:' }))
  const { clusters, unresolved } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: a }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', beatmapId: 111, contentKey: b }),
    entry({ r2Key: 'maps/c/r1/RC1.osz', beatmapId: 111, exists: false, source: src('C', 'r1', 'RC1') }),
  ])
  assert.equal(clusters.length, 2)
  assert.equal(unresolved.length, 1)
  assert.equal(unresolved[0].reason, 'ambiguous-bid')
})

// ---------- 计数口径 / 选路 / 备选 ----------

test('R11 验收：计数只数主图簇，与包内 mapCount 同口径', () => {
  const a = contentSignature(osu())
  const { clusters } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: a }),
    entry({ r2Key: 'maps/a/r1/RC1.nsv.osz', beatmapId: 111, isNsv: true, contentKey: a }),
    entry({ r2Key: 'maps/b/r1/RC2.osz', beatmapId: 222, contentKey: a }),
  ])
  assert.equal(clusters.length, 3)
  assert.equal(slotTotalOf(clusters), 2, 'NSV 不重复计主图数')
})

test('R11 选路：挑第一个在 R2 里存在的路径；一个都不在返回 null', () => {
  const keys = new Set(['maps/b/r1/RC1.osz'])
  assert.equal(pickExistingPath(['maps/a/r1/RC1.osz', 'maps/b/r1/RC1.osz'], keys), 'maps/b/r1/RC1.osz')
  assert.equal(pickExistingPath(['maps/x.osz'], keys), null)
  assert.equal(pickExistingPath([], keys), null)
})

test('R11 需要读内容的路径：只挑"同 BID 多路径"，且大小不同的直接判为不同', () => {
  const entries = [
    entry({ beatmapId: 1, r2Key: 'maps/a.osz' }),
    entry({ beatmapId: 1, r2Key: 'maps/b.osz' }),
    entry({ beatmapId: 1, r2Key: 'maps/c.osz' }),
    entry({ beatmapId: 2, r2Key: 'maps/d.osz' }),
    // 文件不在的引用不参与（它没有内容可读）
    entry({ beatmapId: 3, r2Key: 'maps/e.osz', exists: false }),
  ]
  const sizes = new Map([['maps/a.osz', 100], ['maps/b.osz', 100], ['maps/c.osz', 200], ['maps/d.osz', 50]])
  const need = pathsNeedingContentCheck(entries, sizes)
  assert.deepEqual([...need].sort(), ['maps/a.osz', 'maps/b.osz'], 'a/b 同大小要读；c 大小不同 → 必然不是同一份内容')

  // 大小未知时保守处理：当作需要读
  const unknown = pathsNeedingContentCheck(
    [entry({ beatmapId: 1, r2Key: 'maps/a.osz' }), entry({ beatmapId: 1, r2Key: 'maps/b.osz' })],
    new Map(),
  )
  assert.deepEqual([...unknown].sort(), ['maps/a.osz', 'maps/b.osz'])
})

test('R11 大小不同的同 BID 副本：各自独立 + 报冲突（不必下载也能发现）', () => {
  const { clusters, conflicts } = clusterEntries([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 111, contentKey: null }),
    entry({ r2Key: 'maps/b/r1/RC1.osz', beatmapId: 111, contentKey: null }),
  ])
  assert.equal(clusters.length, 2)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].reason, 'same-bid-different-content')
})

test('R11 验收：首选损坏、备选内容等价 → 仍然出包，并记录用了哪条路径', async () => {
  const tried = []
  const attempt = async (path) => {
    tried.push(path)
    if (path === 'maps/a/r1/RC1.osz') return { ok: false, reason: 'read-failed', error: 'zip 损坏' }
    return { ok: true, payload: { osu: Buffer.from('x') } }
  }
  const out = await tryPathsInOrder(['maps/a/r1/RC1.osz', 'maps/b/r1/RC1.osz'], attempt)
  assert.equal(out.ok, true)
  assert.equal(out.usedPath, 'maps/b/r1/RC1.osz')
  assert.equal(out.attempts, 2)
  assert.deepEqual(tried, ['maps/a/r1/RC1.osz', 'maps/b/r1/RC1.osz'])
})

test('R11 全部候选都不可用时返回失败（由发布门控拦住，不会静默少一张）', async () => {
  const out = await tryPathsInOrder(['a.osz', 'b.osz'], async (p) => ({ ok: false, key: p, reason: 'read-failed' }))
  assert.equal(out.ok, false)
  assert.equal(out.attempts, 2)
  assert.equal(out.last.key, 'b.osz')
})

test('R11 备选内容与身份不符时不能被采用', async () => {
  const want = contentSignature(osu())
  const other = contentSignature(osu({ notes: '448,192,0,128,0,500:0:0:0:0:' }))
  const attempt = async (path) => {
    const sig = path === 'maps/a.osz' ? null : other // 首选空、备选是"别的图"
    return sig === want ? { ok: true } : { ok: false, reason: 'content-mismatch' }
  }
  const out = await tryPathsInOrder(['maps/a.osz', 'maps/b.osz'], attempt)
  assert.equal(out.ok, false, '内容不符的备选必须被拒绝')
})

// ---------- 跨身份来源的同内容（只报告，不参与合并）----------

test('R11 报告：同内容但一个有 BID、一个没有 → 列为一组（当前既不合并不报冲突）', () => {
  const sig = contentSignature(osu())
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 500, contentKey: sig, source: src('A', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r2/RC2.osz', beatmapId: null, metadataKey: 'x|t|c|v', contentKey: sig, source: src('B', 'r2', 'RC2') }),
  ])
  assert.equal(groups.length, 1, '应报出 1 组')
  assert.equal(groups[0].contentKey, sig)
  assert.equal(groups[0].isNsv, false)
  assert.deepEqual(
    groups[0].groups.map((g) => g.candidateKey).sort(),
    ['bid:500', 'meta:x|t|c|v'],
    '两条不同的候选键都要列出来',
  )
})

test('R11 报告：同内容但两个不同 BID → 也报（同一张图被重复上传）', () => {
  const sig = contentSignature(osu())
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 500, contentKey: sig }),
    entry({ r2Key: 'maps/b/r2/RC2.osz', beatmapId: 700, contentKey: sig }),
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].groups.map((g) => g.candidateKey).sort(), ['bid:500', 'bid:700'])
})

test('R11 报告：只有同一个候选键 → 不算跨道（那是正常合并路径，不进这份报告）', () => {
  const sig = contentSignature(osu())
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a.osz', beatmapId: 500, contentKey: sig }),
    entry({ r2Key: 'maps/b.osz', beatmapId: 500, contentKey: sig }),
  ])
  assert.deepEqual(groups, [], '同 BID 同内容本来就该合并，不应作为"重复"报出来')
})

test('R11 报告：读不到内容（摘要为空）不参与，不能因为"都读不到"就判成重复', () => {
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a.osz', beatmapId: 500, contentKey: null }),
    entry({ r2Key: 'maps/b.osz', beatmapId: null, metadataKey: 'x|t|c|v', contentKey: null }),
  ])
  assert.deepEqual(groups, [])
})

test('R11 报告：主图与 NSV 内容相同也不混成一组', () => {
  const sig = contentSignature(osu())
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 500, contentKey: sig, isNsv: false }),
    entry({ r2Key: 'maps/b/r2/RC2.nsv.osz', beatmapId: 700, contentKey: sig, isNsv: true }),
  ])
  assert.deepEqual(groups, [], 'NSV 与主图本来就是两种东西')

  const both = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a/r1/RC1.nsv.osz', beatmapId: 500, contentKey: sig, isNsv: true }),
    entry({ r2Key: 'maps/b/r2/RC2.nsv.osz', beatmapId: 700, contentKey: sig, isNsv: true }),
  ])
  assert.equal(both.length, 1, '两个 NSV 之间照样要报')
  assert.equal(both[0].isNsv, true)
})

test('R11 报告：带出来源标签（比赛/轮次/槽位），便于人工核对', () => {
  const sig = contentSignature(osu())
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/a/r1/RC1.osz', beatmapId: 500, contentKey: sig, source: src('T1', 'r1', 'RC1') }),
    entry({ r2Key: 'maps/b/r2/RC2.osz', beatmapId: null, metadataKey: 'x', contentKey: sig, source: src('T2', 'r2', 'RC2') }),
  ])
  const all = groups[0].groups.flatMap((g) => g.members.flatMap((m) => m.sources))
  assert.deepEqual(
    all.map((s) => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).sort(),
    ['T1r1 RC1', 'T2r2 RC2'],
  )
})

test('R11 报告：主图排在 NSV 前面（稳定顺序，方便人工比对历次报告）', () => {
  const sig = contentSignature(osu())
  const groups = findSameContentDifferentIdentity([
    entry({ r2Key: 'maps/n1.osz', beatmapId: 1, contentKey: sig, isNsv: true }),
    entry({ r2Key: 'maps/n2.osz', beatmapId: 2, contentKey: sig, isNsv: true }),
    entry({ r2Key: 'maps/m1.osz', beatmapId: 3, contentKey: sig, isNsv: false }),
    entry({ r2Key: 'maps/m2.osz', beatmapId: 4, contentKey: sig, isNsv: false }),
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((g) => g.isNsv), [false, true])
})

