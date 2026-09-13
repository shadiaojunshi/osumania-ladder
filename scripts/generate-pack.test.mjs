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
const { rewriteOsu } = require('./generate-pack.js')

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
