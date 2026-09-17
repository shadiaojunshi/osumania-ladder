import assert from 'node:assert/strict'
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
const { rewriteOsu, packCountFor, packSizeFor } = require('./generate-pack.js')

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
