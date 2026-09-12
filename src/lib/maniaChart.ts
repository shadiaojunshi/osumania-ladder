// 谱面可视化 —— 「下落式谱面预览」的几何与数据层。
//
// 算法与几何参数移植自雨沐机器人绘图模块 yumu-bot/yumu-image(master) 的
// src/panel/panel_V.js + src/component/component_V.js + src/util/osuFile.js,
// 也就是 `!v` 指令输出的那张图。此处只做数据与布局,不碰 DOM、
// 不依赖 @data 别名(便于用 node --test 直接锁定几何)。

// ---------- 雨沐的原始常量,改了就不是 !v 了 ----------
export const LANE_WIDTH = 10
export const CHUNK_GAP = 30
export const MAX_WIDTH = 1920
export const BARS_PER_CHUNK = 4
export const BEATS_PER_CHUNK = BARS_PER_CHUNK * 4
export const ROWS_PER_PAGE = 5
export const ROW_HEIGHT = 710
export const ROW_GAP = 20
export const HEADER_HEIGHT = 290
export const FOOTER_HEIGHT = 40
export const NOTE_HEIGHT = 5
const MINUTE_MS = 60_000
// 浮点容差:判断"这个音符/线属于哪个切片",单位是拍。
const EPSILON = 0.005

// ---------- .osu 解析 ----------

export interface ManiaNote {
  /** 起始时间,ms */
  time: number
  /** 长条结束时间,ms;非长条为 null */
  endTime: number | null
  /** 0-based 轨道 */
  column: number
  isLong: boolean
}

export interface ManiaTimingPoint {
  time: number
  /** 一拍的毫秒数。绿线继承其前一条红线的值。 */
  beatLength: number
  /** 绿线的速度倍率;红线为 null */
  sv: number | null
  meter: number
  type: 'red' | 'green'
  bpm: number | null
}

export interface ManiaBeatmap {
  keys: number
  notes: ManiaNote[]
  timings: ManiaTimingPoint[]
  previewTime: number
  specialStyle: boolean
  od: number
  hp: number
  title: string
  artist: string
  version: string
  beatmapId: number | null
  beatmapsetId: number | null
}

export class ManiaChartError extends Error {}

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 从 .osu 文本解析 mania 谱面。只看 mania 需要的段落与字段。 */
export function parseManiaBeatmap(text: string): ManiaBeatmap {
  let section = ''
  let mode = 0
  let previewTime = 0
  let specialStyle = false
  let od = 0
  let hp = 0
  let cs = 4
  const title = { value: '' }
  const artist = { value: '' }
  const version = { value: '' }
  let beatmapId: number | null = null
  let beatmapsetId: number | null = null

  const rawTimings: { time: number; beatLength: number; sv: number | null; meter: number; type: 'red' | 'green' }[] = []
  const rawNotes: { x: number; time: number; endTime: number | null; isLong: boolean }[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1)
      continue
    }
    if (line.startsWith('//')) continue

    if (section === 'General') {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      if (key === 'Mode') mode = toNumber(value, 0)
      else if (key === 'PreviewTime') previewTime = toNumber(value, 0)
      else if (key === 'SpecialStyle') specialStyle = toNumber(value, 0) === 1
      continue
    }

    if (section === 'Metadata') {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      if (key === 'Title' && !title.value) title.value = value
      else if (key === 'Artist' && !artist.value) artist.value = value
      else if (key === 'Version' && !version.value) version.value = value
      else if (key === 'BeatmapID') beatmapId = Number.parseInt(value, 10) || null
      else if (key === 'BeatmapSetID') beatmapsetId = Number.parseInt(value, 10) || null
      continue
    }

    if (section === 'Difficulty') {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const key = line.slice(0, colon).trim()
      const value = toNumber(line.slice(colon + 1).trim(), 0)
      if (key === 'CircleSize') cs = value
      else if (key === 'OverallDifficulty') od = value
      else if (key === 'HPDrainRate') hp = value
      continue
    }

    if (section === 'TimingPoints') {
      const parts = line.split(',')
      if (parts.length < 2) continue
      const time = toNumber(parts[0])
      const beatLength = toNumber(parts[1])
      const red = toNumber(parts[6], 1) === 1
      // 有人会把红线写成 1E-30 这种极小值,夹一下避免后面除零。
      const safeLength = red ? Math.max(beatLength, 1e-10) : null
      // 绿线的 beatLength 是负的 SV 编码,注意 0 - x 以正确处理 -0。
      const sv = red ? null : 100 / (0 - beatLength)
      rawTimings.push({
        time,
        beatLength: red ? (safeLength as number) : Number.NaN,
        sv: red ? null : (Number.isFinite(sv) ? sv : 1),
        meter: Math.max(1, toNumber(parts[2], 4)),
        type: red ? 'red' : 'green',
      })
      continue
    }

    if (section === 'HitObjects') {
      const parts = line.split(',')
      if (parts.length < 4) continue
      const x = toNumber(parts[0])
      const time = toNumber(parts[2])
      const typeMask = toNumber(parts[3])
      const isLong = (typeMask & 128) !== 0
      let endTime: number | null = null
      if (isLong) {
        // 长条的 objectParams 是 "endTime:hitSample",只取 endTime。
        const params = parts[5] ?? ''
        const colon = params.indexOf(':')
        const end = Number.parseInt(colon >= 0 ? params.slice(0, colon) : params, 10)
        endTime = Number.isFinite(end) ? end : null
        if (endTime !== null && endTime <= time) endTime = null
      }
      rawNotes.push({ x, time, endTime, isLong: isLong && endTime !== null })
      continue
    }
  }

  if (mode !== 3) throw new ManiaChartError(`not a mania beatmap (Mode=${mode})`)
  const keys = Math.round(cs)
  if (!Number.isInteger(keys) || keys < 1 || keys > 18) throw new ManiaChartError(`unsupported key count (CS=${cs})`)

  // 绿线继承前一条红线的 beatLength(红线缺失时退回 120BPM)。
  rawTimings.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time
    if (a.type !== b.type) return a.type === 'red' ? -1 : 1
    return 0
  })
  let currentBeatLength = 60_000 / 120
  const timings: ManiaTimingPoint[] = rawTimings.map((tp) => {
    if (tp.type === 'red') currentBeatLength = tp.beatLength
    const beatLength = tp.type === 'red' ? tp.beatLength : currentBeatLength
    return {
      time: tp.time,
      beatLength,
      sv: tp.sv,
      meter: tp.meter,
      type: tp.type,
      bpm: tp.type === 'red' ? round(60_000 / beatLength, 3) : null,
    }
  })

  const notes: ManiaNote[] = rawNotes.map((n) => ({
    time: n.time,
    endTime: n.endTime,
    column: clamp(Math.floor((n.x * keys) / 512), 0, keys - 1),
    isLong: n.isLong,
  }))
  notes.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time
    // 同时刻:普通音符在前,长条按结束时间,再按轨道序。
    if ((a.endTime === null) !== (b.endTime === null)) return a.endTime === null ? -1 : 1
    if (a.endTime !== null && b.endTime !== null && a.endTime !== b.endTime) return a.endTime - b.endTime
    return a.column - b.column
  })

  if (notes.length === 0) throw new ManiaChartError('beatmap has no hit objects')

  return {
    keys,
    notes,
    timings,
    previewTime,
    specialStyle,
    od,
    hp,
    title: title.value,
    artist: artist.value,
    version: version.value,
    beatmapId,
    beatmapsetId,
  }
}

// ---------- 布局 ----------

/** 竖条内的一条横线(小节线 / 拍子线 / BPM 线 / SV 线 / 分钟线 / 预览线)。 */
export interface ChartLine {
  time: number
  beat: number
  type: 'red' | 'green' | 'virtual' | 'bar' | 'beat' | 'minute' | 'minuteLatest' | 'preview'
  bpm?: number
  sv?: number | null
  measureIndex?: number
  /**
   * 该 timing 点自己的 beatLength(绿线继承前一条红线)。
   * 只有真实的 timing 点才有值 —— 小节线/拍子线/虚拟红线都不带,
   * 靠它区分"参与速度计算的行"与"纯装饰的行"(与雨沐同口径)。
   */
  ownBeatLength?: number
  /** 相对"基准速度"归一化后的速度,红线=1 */
  standardSv?: number | null
  nextStandardSv?: number | null
  nextBeat?: number
  prevStandardSv?: number | null
  prevBeat?: number
  nearNext?: boolean
}

export interface ChartChunk {
  index: number
  /** 页面内的起始小节号 */
  startBar: number
  notes: {
    column: number
    isLong: boolean
    /** 裁切到本切片后的起止拍 */
    renderStart: number
    renderEnd: number
    beat: number
    endBeat: number
  }[]
  lines: ChartLine[]
  /** 进入本切片时的基准速度 */
  initialSv: number
}

export interface ChartPage {
  page: number
  totalPages: number
  /** 本页实际用到的行数 */
  rows: number
  chunksPerRow: number
  chunkWidth: number
  chunkX: number
  chunks: ChartChunk[]
  height: number
}

export interface ManiaChartModel {
  beatmap: ManiaBeatmap
  /** 基准 BPM:时长加权后最长的红线 BPM,再折进 120–300 */
  normalizedBpm: number
  /** 一拍的毫秒数(基于基准 BPM) */
  beatLength: number
  chunkWidth: number
  chunksPerRow: number
  chunksPerPage: number
  chunkX: number
  beatsPerPage: number
  totalPages: number
  totalBeats: number
  /** 全谱 SV 波动是否够大(变异系数 > 0.25),够大才画 SV 曲线 */
  svMode: boolean
  minSv: number
  maxSv: number
  firstNoteTime: number
  lastNoteTime: number
  buildPage: (page: number) => ChartPage
}

export function getKeyOverlay(totalKeys: number, specialStyle: boolean): ('1' | '2' | 's')[] {
  // 场景 A:SpecialStyle(偶数键)—— s 打头,其余 1/2 交替。
  if (specialStyle && totalKeys % 2 === 0) {
    const result: ('1' | '2' | 's')[] = ['s']
    for (let i = 0; i < totalKeys - 1; i += 1) result.push(i % 2 === 0 ? '1' : '2')
    return result
  }
  // 场景 B:标准对称排列(4K 为 1,2,2,1;7K 为 1,2,1,s,1,2,1)。
  const half = Math.floor(totalKeys / 2)
  const side: ('1' | '2')[] = []
  for (let i = 0; i < half; i += 1) side.push(i % 2 === 0 ? '1' : '2')
  const mirrored = [...side].reverse()
  return totalKeys % 2 === 0 ? [...side, ...mirrored] : [...side, 's', ...mirrored]
}

export function buildManiaChart(beatmap: ManiaBeatmap): ManiaChartModel {
  const { keys, notes, timings } = beatmap
  const firstNoteTime = notes[0].time
  const firstTime = firstNoteTime
  const lastNote = notes[notes.length - 1]
  const lastTime = lastNote.endTime ?? lastNote.time
  const lastTimelineTime = timings.length > 0 ? timings[timings.length - 1].time : 0

  const reds = timings.filter((tp) => tp.type === 'red')
  const normalizedBpm = normalizeBpm(getLongestBpm(reds, lastTime))
  const beatLength = MINUTE_MS / normalizedBpm

  const chunkWidth = CHUNK_GAP + keys * LANE_WIDTH
  const chunksPerRow = Math.max(1, Math.floor((MAX_WIDTH - CHUNK_GAP) / chunkWidth))
  const chunksPerPage = chunksPerRow * ROWS_PER_PAGE
  const chunkX = (MAX_WIDTH - (chunksPerRow * chunkWidth - CHUNK_GAP)) / 2

  const totalBeats = (lastTime - firstTime) / beatLength
  const beatsPerPage = BEATS_PER_CHUNK * chunksPerPage
  const totalPages = Math.max(1, Math.ceil(totalBeats / beatsPerPage))

  const toBeat = (time: number) => (time - firstTime) / beatLength

  // ---- 1. 小节线 / 拍子线 ----
  const fullLine: ChartLine[] = []
  for (let i = 0; i < reds.length; i += 1) {
    const current = reds[i]
    const next = reds[i + 1]
    const nextTime = i < reds.length - 1 ? next.time : lastTime
    const step = current.beatLength
    if (!step || step < 1) continue
    for (let time = current.time; time < nextTime; time += step) {
      if (Math.abs(time - current.time) < 1) continue
      // 第一个物件附近会有 BPM 指示线,跳过避免和音符重叠。
      if (Math.abs(time - firstNoteTime) <= 500) continue
      const beatIndex = Math.round((time - current.time) / step)
      const isBar = beatIndex % current.meter === 0
      const t = Math.round(time)
      fullLine.push({
        time: t,
        beat: toBeat(t),
        type: isBar ? 'bar' : 'beat',
        measureIndex: isBar ? beatIndex / current.meter + 1 : undefined,
        nearNext: Boolean(next) && nextTime - time < step * 0.1,
        bpm: current.bpm ?? undefined,
      })
    }
  }

  // ---- 2. 分钟线 ----
  const latest = Math.max(lastTimelineTime, lastTime)
  for (let t = 0; t <= latest; t += MINUTE_MS) {
    if (t === 0) continue
    fullLine.push({ time: t, beat: toBeat(t), type: 'minute' })
  }
  if (latest % MINUTE_MS >= 5000) {
    const lastSecond = Math.floor(latest / 1000) * 1000
    fullLine.push({ time: lastSecond, beat: toBeat(latest), type: 'minuteLatest' })
  }

  // ---- 3. 预览点 + 真实 timing 点 ----
  if (beatmap.previewTime > 0) {
    fullLine.push({ time: beatmap.previewTime, beat: toBeat(beatmap.previewTime), type: 'preview' })
  }
  for (const tp of timings) {
    fullLine.push({
      time: tp.time,
      beat: toBeat(tp.time),
      type: tp.type,
      bpm: tp.bpm ?? undefined,
      sv: tp.sv,
      ownBeatLength: tp.beatLength,
      measureIndex: undefined,
    })
  }

  fullLine.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time
    const aTimed = a.type === 'red' || a.type === 'green' || a.type === 'virtual'
    const bTimed = b.type === 'red' || b.type === 'green' || b.type === 'virtual'
    if (aTimed !== bTimed) return aTimed ? -1 : 1
    return 0
  })

  // ---- 4. 基准速度:按总时长最长的那个 (自身 beatLength × sv) 归一化 ----
  const durationMap = new Map<number, number>()
  for (let i = 0; i < fullLine.length; i += 1) {
    const current = fullLine[i]
    if (current.ownBeatLength == null) continue
    const sv = current.sv ?? 1
    const nextTime = i < fullLine.length - 1 ? fullLine[i + 1].time : lastTime
    const duration = nextTime - current.time
    if (duration <= 0) continue
    const speedVal = Math.round((current.ownBeatLength * sv) / 10) * 10
    if (speedVal >= 10) durationMap.set(speedVal, (durationMap.get(speedVal) ?? 0) + duration)
  }
  let significantSpeed = 1
  let maxDuration = -1
  for (const [speed, duration] of durationMap) {
    if (duration > maxDuration) {
      maxDuration = duration
      significantSpeed = speed
    }
  }

  let minSv = Infinity
  let maxSv = -Infinity
  for (const line of fullLine) {
    if (line.ownBeatLength == null) continue
    const standard = (line.ownBeatLength * (line.sv ?? 1)) / significantSpeed
    line.standardSv = standard
    if (standard > maxSv) maxSv = standard
    if (standard < minSv) minSv = standard
  }
  if (!Number.isFinite(minSv)) minSv = 1
  if (!Number.isFinite(maxSv)) maxSv = 1

  // ---- 5. 正反两遍补齐"进入/离开本线时的速度",供 SV 折线用 ----
  let afterSv: number | null = null
  let afterBeat = totalBeats
  for (let i = fullLine.length - 1; i >= 0; i -= 1) {
    const current = fullLine[i]
    if (current.standardSv == null) continue
    current.nextStandardSv = afterSv ?? current.standardSv
    current.nextBeat = afterBeat
    afterSv = current.standardSv
    afterBeat = current.beat
  }
  const firstTimed = fullLine.find((l) => l.standardSv != null)
  let beforeSv = firstTimed?.standardSv ?? 1
  let beforeBeat = firstTimed?.beat ?? 0
  for (const line of fullLine) {
    line.prevStandardSv = beforeSv
    line.prevBeat = beforeBeat
    if (line.standardSv != null) beforeSv = line.standardSv
    if (line.beat != null) beforeBeat = line.beat
  }

  const timedLines = fullLine.filter((l) => l.standardSv != null)
  const svMode = isSvMode(timedLines.map((l) => l.standardSv as number))

  // 每拍所需的小节序号:第一红线的 meter 可能为 4,按它切小节号。
  const initialSvAt = (beat: number): number => {
    let last: ChartLine | null = null
    for (let j = fullLine.length - 1; j >= 0; j -= 1) {
      if (fullLine[j].beat <= beat + 0.001) {
        last = fullLine[j]
        break
      }
    }
    return last?.standardSv ?? firstTimed?.standardSv ?? 1
  }

  const buildPage = (rawPage: number): ChartPage => {
    const page = clamp(Math.trunc(rawPage) || 1, 1, totalPages)
    const startBar = (page - 1) * chunksPerPage * BARS_PER_CHUNK
    const pageStartBeat = startBar * 4
    const pageEndBeat = pageStartBeat + beatsPerPage

    const chunks: ChartChunk[] = Array.from({ length: chunksPerPage }, (_, i) => ({
      index: i,
      startBar: startBar + i * BARS_PER_CHUNK,
      notes: [],
      lines: [],
      initialSv: 1,
    }))

    // 音符按切片裁切:一个长条可以同时出现在多个切片里。
    for (const note of notes) {
      const beat = toBeat(note.time)
      const endBeat = note.isLong && note.endTime !== null ? toBeat(note.endTime) : beat
      if (endBeat < pageStartBeat || beat >= pageEndBeat) continue

      const startChunk = Math.max(0, Math.floor((beat - pageStartBeat + EPSILON) / BEATS_PER_CHUNK))
      let endChunk: number
      if (note.isLong) {
        endChunk = Math.min(
          chunksPerPage - 1,
          Math.floor((endBeat - pageStartBeat - EPSILON) / BEATS_PER_CHUNK),
        )
      } else {
        endChunk = startChunk
      }
      endChunk = Math.max(startChunk, endChunk)

      for (let c = startChunk; c <= endChunk; c += 1) {
        const chunkStartBeat = pageStartBeat + c * BEATS_PER_CHUNK
        const chunkEndBeat = chunkStartBeat + BEATS_PER_CHUNK
        chunks[c].notes.push({
          column: note.column,
          isLong: note.isLong,
          beat,
          endBeat,
          renderStart: Math.max(beat, chunkStartBeat),
          renderEnd: Math.min(endBeat, chunkEndBeat),
        })
      }
    }

    // 线条按切片归位。
    for (const line of fullLine) {
      if (line.beat < pageStartBeat || line.beat >= pageEndBeat) continue
      const c = Math.floor((line.beat - pageStartBeat + EPSILON) / BEATS_PER_CHUNK)
      if (chunks[c]) chunks[c].lines.push(line)
    }

    for (let i = 0; i < chunksPerPage; i += 1) {
      chunks[i].initialSv = initialSvAt(startBar * 4 + i * BEATS_PER_CHUNK)
    }

    // 开局没有红线挨着第一个物件时,BPM 会没人标:谱面最初的红线通常在第一个
    // 物件之前,会被上面"本页之前"的过滤丢掉。这里补一条虚拟红线。
    // 偏差说明:雨沐把虚拟线放在红线的真实拍位(负拍),会画到竖条外面;
    // 这里改为放在第一个物件的拍上,正好落在竖条底边,信息不变但不越界。
    const firstChunk = chunks[0]
    const firstRed = reds[0]
    if (page === 1 && firstRed && firstChunk.notes.length > 0) {
      const hasRedNearFirstNote = reds.some((tp) => Math.abs(tp.time - firstNoteTime) <= beatLength)
      if (!hasRedNearFirstNote) {
        const virtual: ChartLine = { time: firstNoteTime, beat: 0, type: 'virtual', bpm: firstRed.bpm ?? undefined }
        firstChunk.lines.unshift(virtual)
        firstChunk.lines = firstChunk.lines.filter(
          (l) => l === virtual || !((l.type === 'beat' || l.type === 'bar') && Math.abs(l.beat) < 0.5),
        )
      }
    }

    let maxUsedChunk = -1
    for (let i = 0; i < chunksPerPage; i += 1) {
      if (chunks[i].notes.length > 0 || chunks[i].lines.length > 0) maxUsedChunk = i
    }
    const rows = maxUsedChunk === -1 ? 1 : Math.floor(maxUsedChunk / chunksPerRow) + 1
    const height = HEADER_HEIGHT + FOOTER_HEIGHT + rows * ROW_HEIGHT + (rows - 1) * ROW_GAP + FOOTER_HEIGHT

    return { page, totalPages, rows, chunksPerRow, chunkWidth, chunkX, chunks, height }
  }

  return {
    beatmap,
    normalizedBpm,
    beatLength,
    chunkWidth,
    chunksPerRow,
    chunksPerPage,
    chunkX,
    beatsPerPage,
    totalPages,
    totalBeats,
    svMode,
    minSv,
    maxSv,
    firstNoteTime,
    lastNoteTime: lastTime,
    buildPage,
  }
}

/** 切片内 y 坐标:第 0 拍在底部,越晚越靠上(下落式)。 */
export function beatToY(beat: number, chunkStartBeat: number, height = ROW_HEIGHT): number {
  const relative = beat - chunkStartBeat
  return height - (relative / BEATS_PER_CHUNK) * height
}

/** SV 值 → 切片内的 x 坐标(1.0 在正中,两侧按极值展开)。 */
export function svToX(sv: number, center: number, maxSv: number, minSv: number): number {
  if (sv >= 1) {
    const range = Math.max(maxSv, 1) - 1
    return center + (range === 0 ? 0 : ((Math.min(sv, 5) - 1) / range) * center)
  }
  const range = 1 - Math.min(minSv, 1)
  return center - (range === 0 ? 0 : ((1 - Math.max(sv, 0)) / range) * center)
}

// ---------- 小工具(与雨沐同口径) ----------

/** 常规的参数顺序:clamp(value, min, max)。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 时长加权后最长的红线 BPM。 */
function getLongestBpm(reds: ManiaTimingPoint[], lastTime: number): number {
  const map = new Map<number, number>()
  for (let i = 0; i < reds.length; i += 1) {
    const current = reds[i]
    const nextTime = i < reds.length - 1 ? reds[i + 1].time : lastTime
    const duration = nextTime - current.time
    if (duration <= 0) continue
    const bpm = current.bpm
    if (!bpm || bpm < 0.1 || bpm > 10_000) continue
    const key = round(bpm, 2)
    map.set(key, (map.get(key) ?? 0) + duration)
  }
  let longest = 120
  let maxDuration = 0
  for (const [bpm, duration] of map) {
    if (duration > maxDuration) {
      maxDuration = duration
      longest = bpm
    }
  }
  return longest
}

/** 把 BPM 折进 [120, 300],避免极高/极低 BPM 让网格密到看不清。 */
function normalizeBpm(rawBpm: number, min = 120, max = 300): number {
  if (!Number.isFinite(rawBpm)) return max
  if (rawBpm <= 0) return min
  let result = rawBpm
  if (result > max) {
    result /= 2 ** Math.ceil(Math.log2(result / max))
  } else if (result < min) {
    result *= 2 ** Math.ceil(Math.log2(min / result))
  }
  return clamp(result, min, max)
}

/** 变异系数 > 0.25 视为"这张谱在玩 SV"。 */
function isSvMode(values: number[]): boolean {
  if (values.length === 0) return false
  const mean = Math.max(values.reduce((a, b) => a + b, 0) / values.length, 1e-4)
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean > 0.25
}
