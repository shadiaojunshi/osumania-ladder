import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManiaChartError,
  ROW_HEIGHT,
  beatToY,
  buildManiaChart,
  getKeyOverlay,
  parseManiaBeatmap,
  svToX,
} from '../src/lib/maniaChart.ts'

// 默认时间轴用 120 BPM(一拍 500ms),拍位计算是精确整数,断言不会踩浮点。
const BEAT = 500

function osuFile({
  cs = 4,
  od = 8,
  hp = 7,
  preview = 30_000,
  mode = 3,
  timing = '0,500,4,2,0,100,1,0',
  hitObjects = [],
} = {}) {
  return [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    `Mode: ${mode}`,
    `PreviewTime: ${preview}`,
    '',
    '[Metadata]',
    'Title:Test Title',
    'Artist:Test Artist',
    'Version:4K Test',
    'BeatmapID:12345',
    'BeatmapSetID:6789',
    '',
    '[Difficulty]',
    `CircleSize:${cs}`,
    `OverallDifficulty:${od}`,
    `HPDrainRate:${hp}`,
    '',
    '[TimingPoints]',
    ...String(timing).split('\n'),
    '',
    '[HitObjects]',
    ...hitObjects,
    '',
  ].join('\n')
}

function tap(time, column, keys = 4) {
  return `${Math.floor((column * 512) / keys) + 1},192,${time},1,0,0:0:0:0:`
}

function hold(startTime, endTime, column, keys = 4) {
  return `${Math.floor((column * 512) / keys) + 1},192,${startTime},128,0,${endTime}:0:0:0:0:`
}

test('解析:键数、轨道、长条结束时间、元数据', () => {
  const map = parseManiaBeatmap(
    osuFile({ hitObjects: [tap(1000, 0), tap(1500, 1), hold(2000, 3000, 2)] }),
  )
  assert.equal(map.keys, 4)
  assert.equal(map.notes.length, 3)
  assert.deepEqual(map.notes.map((n) => n.column), [0, 1, 2])
  assert.equal(map.notes[0].isLong, false)
  assert.equal(map.notes[0].endTime, null)
  assert.equal(map.notes[2].isLong, true)
  assert.equal(map.notes[2].endTime, 3000)
  assert.equal(map.title, 'Test Title')
  assert.equal(map.artist, 'Test Artist')
  assert.equal(map.version, '4K Test')
  assert.equal(map.beatmapId, 12345)
  assert.equal(map.beatmapsetId, 6789)
  assert.equal(map.previewTime, 30_000)
  assert.equal(map.od, 8)
  assert.equal(map.hp, 7)
})

test('解析:非 mania 或没有物件一律抛 ManiaChartError,不静默出烂图', () => {
  assert.throws(() => parseManiaBeatmap(osuFile({ mode: 0, hitObjects: [tap(1000, 0)] })), ManiaChartError)
  assert.throws(() => parseManiaBeatmap(osuFile({ hitObjects: [] })), ManiaChartError)
  assert.throws(() => parseManiaBeatmap(osuFile({ cs: 0, hitObjects: [tap(1000, 0)] })), ManiaChartError)
})

test('解析:绿线继承前一条红线的 beatLength,并保留自己的 SV 倍率', () => {
  const timing = ['0,500,4,2,0,100,1,0', '5000,-50,4,2,0,100,0,0', '9000,250,4,2,0,100,1,0'].join('\n')
  const map = parseManiaBeatmap(osuFile({ timing, hitObjects: [tap(0, 0)] }))
  const [red1, green, red2] = map.timings
  assert.equal(red1.type, 'red')
  assert.equal(red1.beatLength, 500)
  assert.equal(red1.bpm, 120)
  assert.equal(red1.sv, null)
  assert.equal(green.type, 'green')
  assert.equal(green.sv, 2)
  assert.equal(green.beatLength, 500)
  assert.equal(red2.type, 'red')
  assert.equal(red2.bpm, 240)
})

test('解析:7K 的 x 坐标按 CircleSize 落轨', () => {
  const map = parseManiaBeatmap(osuFile({ cs: 7, hitObjects: [tap(1000, 0, 7), tap(1000, 6, 7)] }))
  assert.equal(map.keys, 7)
  assert.deepEqual(map.notes.map((n) => n.column), [0, 6])
})

test('键位配色与 osu 默认皮肤一致(白/蓝交替,奇数键中心为 s)', () => {
  assert.deepEqual(getKeyOverlay(4, false), ['1', '2', '2', '1'])
  assert.deepEqual(getKeyOverlay(5, false), ['1', '2', 's', '2', '1'])
  assert.deepEqual(getKeyOverlay(6, false), ['1', '2', '1', '1', '2', '1'])
  assert.deepEqual(getKeyOverlay(7, false), ['1', '2', '1', 's', '1', '2', '1'])
  // SpecialStyle 下偶数键由 s 打头,其余 1/2 交替
  assert.deepEqual(getKeyOverlay(4, true), ['s', '1', '2', '1'])
})

test('几何:1920 宽下的切片宽度、每行条数、居中偏移与雨沐一致', () => {
  const notes = []
  for (let i = 0; i < 20; i += 1) notes.push(tap(1000 + i * BEAT, i % 4))
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ hitObjects: notes })))

  assert.equal(model.normalizedBpm, 120)
  assert.equal(model.beatLength, BEAT)
  // 4K:轨道宽 10、条间距 30 → 70;floor((1920-30)/70) = 27 条/行
  assert.equal(model.chunkWidth, 70)
  assert.equal(model.chunksPerRow, 27)
  assert.equal(model.chunksPerPage, 135)
  // (1920 - (27*70 - 30)) / 2 = 30
  assert.equal(model.chunkX, 30)

  const page = model.buildPage(1)
  assert.equal(page.totalPages, 1)
  assert.equal(page.rows, 1)
  // 290 页眉 + 40 间隔 + 1 行 710 + 0 行距 + 40 页脚
  assert.equal(page.height, 1080)
})

test('几何:基准 BPM 取时长最长的红线,并折进 120–300', () => {
  const timing = ['0,333.333333333333,4,2,0,100,1,0', '30000,600,4,2,0,100,1,0'].join('\n')
  const model = buildManiaChart(
    parseManiaBeatmap(osuFile({ timing, hitObjects: [tap(1000, 0), tap(40_000, 1)] })),
  )
  // 0→30000 是 180BPM(30000ms),30000→40000 是 100BPM(10000ms) → 180 胜出
  assert.equal(model.normalizedBpm, 180)
  assert.ok(Math.abs(model.beatLength - 60_000 / 180) < 1e-9)
})

test('几何:7K 与 4K 每行条数不同(条宽随键数变化)', () => {
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ cs: 7, hitObjects: [tap(1000, 0, 7)] })))
  assert.equal(model.chunkWidth, 30 + 7 * 10)
  assert.equal(model.chunksPerRow, Math.floor(1890 / 100))
  assert.equal(model.chunksPerRow, 18)
})

test('坐标:切片内第 0 拍在底部、第 16 拍在顶部,偏移切片同样成立', () => {
  assert.equal(beatToY(0, 0), ROW_HEIGHT)
  assert.equal(beatToY(16, 0), 0)
  assert.equal(beatToY(8, 0), ROW_HEIGHT / 2)
  assert.equal(beatToY(20, 16), ROW_HEIGHT - (4 / 16) * ROW_HEIGHT)
})

test('SV 横向坐标:1.0 落在正中,极值贴边', () => {
  assert.equal(svToX(1, 20, 4, 0.5), 20)
  assert.equal(svToX(4, 20, 4, 0.5), 40)
  assert.equal(svToX(0.5, 20, 4, 0.5), 0)
})

test('分页:最后一帧落在第 2 页时 totalPages 为 2', () => {
  // beatsPerPage = 135 * 16 = 2160
  const model = buildManiaChart(
    parseManiaBeatmap(osuFile({ hitObjects: [tap(1000, 0), tap(1000 + 2200 * BEAT, 0)] })),
  )
  assert.equal(model.totalPages, 2)
  assert.equal(model.buildPage(1).page, 1)
  assert.equal(model.buildPage(2).page, 2)
})

test('长条跨切片:两边都出现,并按切片边界裁切', () => {
  const notes = [tap(1000, 0), hold(1000 + 10 * BEAT, 1000 + 20 * BEAT, 1)]
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ hitObjects: notes })))
  const page = model.buildPage(1)

  assert.equal(page.chunks[0].notes.length, 2)
  assert.equal(page.chunks[1].notes.length, 1)
  const left = page.chunks[0].notes.find((n) => n.isLong)
  const right = page.chunks[1].notes[0]
  assert.ok(Math.abs(left.renderStart - 10) < 1e-9)
  assert.ok(Math.abs(left.renderEnd - 16) < 1e-9)
  assert.ok(Math.abs(right.renderStart - 16) < 1e-9)
  assert.ok(Math.abs(right.renderEnd - 20) < 1e-9)
  // 两边的"完整拍位"必须一致,否则切片边缘会重复画长条头。
  assert.equal(left.beat, right.beat)
  assert.equal(left.endBeat, right.endBeat)
})

test('切片边界:正好落在第 16 拍的音符只进后一个切片,不重复', () => {
  const notes = [tap(1000, 0), tap(1000 + 16 * BEAT, 2)]
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ hitObjects: notes })))
  const page = model.buildPage(1)
  const inFirst = page.chunks[0].notes.filter((n) => n.column === 2)
  assert.equal(inFirst.length, 0)
  assert.equal(page.chunks[1].notes.length, 1)
})

test('虚拟红线:首红线在第一个物件之前时补在竖条底边(不越界)', () => {
  const model = buildManiaChart(
    parseManiaBeatmap(osuFile({ hitObjects: [tap(1000, 0), tap(1000 + BEAT, 1)] })),
  )
  const page = model.buildPage(1)
  const virtual = page.chunks[0].lines.find((l) => l.type === 'virtual')
  assert.ok(virtual, '应该补一条虚拟红线把开局 BPM 标出来')
  assert.equal(virtual.beat, 0)
  assert.equal(beatToY(virtual.beat, 0), ROW_HEIGHT)
  // 真实红线在第一个物件之前(负拍),不会占进本页切片。
  assert.ok(!page.chunks[0].lines.some((l) => l.type === 'red' && l.beat < 0))
})

test('SV 曲线模式:SV 剧烈起伏时开启,并给出 min/max', () => {
  const timing = ['0,500,4,2,0,100,1,0', '20000,-25,4,2,0,100,0,0'].join('\n')
  const notes = [tap(1000, 0), tap(21_000, 1), tap(41_000, 2)]
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ timing, hitObjects: notes })))
  assert.equal(model.svMode, true)
  assert.equal(model.minSv, 1)
  assert.equal(model.maxSv, 4)
})

test('SV 基准速度:用每个 timing 点自己的 beatLength,变速谱也会触发曲线', () => {
  const timing = ['0,500,4,2,0,100,1,0', '20000,250,4,2,0,100,1,0'].join('\n')
  const notes = [tap(1000, 0), tap(21_000, 1), tap(41_000, 2)]
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ timing, hitObjects: notes })))
  // 120BPM 段 standardSv = 500/500 = 1;240BPM 段 = 250/500 = 0.5
  assert.equal(model.minSv, 0.5)
  assert.equal(model.maxSv, 1)
  assert.equal(model.svMode, true)
})

test('SV 曲线模式:速度恒定时不开', () => {
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ hitObjects: [tap(1000, 0), tap(2000, 1)] })))
  assert.equal(model.svMode, false)
  assert.equal(model.minSv, 1)
  assert.equal(model.maxSv, 1)
})

test('网格:小节线带小节号、拍子线不带;预览点单独成线', () => {
  const model = buildManiaChart(
    parseManiaBeatmap(osuFile({ preview: 1500, hitObjects: [tap(1000, 0), tap(1000 + 8 * BEAT, 1)] })),
  )
  const lines = model.buildPage(1).chunks[0].lines
  const bars = lines.filter((l) => l.type === 'bar')
  const beats = lines.filter((l) => l.type === 'beat')
  assert.ok(bars.length > 0)
  assert.ok(beats.length > 0)
  assert.ok(bars.every((l) => typeof l.measureIndex === 'number'))
  assert.ok(beats.every((l) => l.measureIndex === undefined))
  assert.ok(lines.some((l) => l.type === 'preview'))
})

test('分页越界会被夹回合法页,不会返回空切片', () => {
  const model = buildManiaChart(parseManiaBeatmap(osuFile({ hitObjects: [tap(1000, 0), tap(2000, 1)] })))
  assert.equal(model.buildPage(99).page, 1)
  assert.equal(model.buildPage(0).page, 1)
  assert.equal(model.buildPage(-5).page, 1)
})
