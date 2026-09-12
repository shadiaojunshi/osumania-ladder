'use client'

// 谱面可视化面板 —— 单页 SVG。
//
// 视觉规格来自 yumu-bot/yumu-image(master) 的 panel_V.js / component_V.js:
//   1920 宽整图、290px 页眉、每 16 拍一根竖条、5 行/页、行高 710、行距 20。
// 区别只有一处:雨沐用 osu 默认皮肤的 note1/note2/noteS 贴图,这里没有素材,
// 改用同色系的圆角矩形绘制(白 / 蓝 / 白),长条本体压低透明度。

import { memo, type ReactElement } from 'react'
import { useT } from '@/lib/i18n'
import {
  HEADER_HEIGHT,
  LANE_WIDTH,
  NOTE_HEIGHT,
  ROW_GAP,
  ROW_HEIGHT,
  beatToY,
  getKeyOverlay,
  svToX,
  type ChartChunk,
  type ChartPage,
  type ManiaChartModel,
} from '@/lib/maniaChart'
import type { ChartSource } from '@/lib/osuTextClient'

const PANEL_BG = '#2A2226'
const BODY_BG = '#382E32'
const ROW_ALT_BG = '#46393F'
const LANE_EDGE = '#555555'
const BAR_LINE = '#CCCCCC'
const BEAT_LINE = '#666666'
const BPM_LINE = '#D32F2F'
const BPM_TEXT = '#F990AB'
const SV_LINE = '#CAF881'
const MINUTE_LINE = '#00F2FE'
const PV_LINE = '#F6F05C'
const NOTE_FILL: Record<'1' | '2' | 's', string> = { '1': '#FFFFFF', '2': '#5C9EFF', 's': '#FFFFFF' }
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const SANS = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function formatBpm(bpm: number): string {
  const rounded = Math.round(bpm)
  return Math.abs(bpm - rounded) < 1e-4 ? String(rounded) : bpm.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatSv(sv: number): string {
  const text = sv.toFixed(2)
  return text.startsWith('0.') ? text.slice(1) : text
}

// 把同类横线合并成一条 path,135 根竖条时才不会堆出上万个 <line>。
function hLinePath(ys: number[], width: number): string {
  return ys.map((y) => `M0 ${y.toFixed(2)}H${width}`).join(' ')
}

function Chunk({ chunk, model, laneColors }: { chunk: ChartChunk; model: ManiaChartModel; laneColors: ('1' | '2' | 's')[] }) {
  const keys = model.beatmap.keys
  const width = keys * LANE_WIDTH
  const chunkStartBeat = chunk.startBar * 4

  const barYs: number[] = []
  const beatYs: number[] = []
  const minuteYs: number[] = []
  const greenYs: number[] = []
  const redYs: number[] = []
  const pvYs: number[] = []

  const labels: { x: number; y: number; anchor: 'start' | 'end'; fill: string; size: number; text: string; opacity?: number }[] = []
  const svPoints: [number, number][] = []
  const centerX = width / 2

  let greenCount = 0
  let previousBpm: number | null = null
  let previousSv: number | null = null

  for (const line of chunk.lines) {
    const y = beatToY(line.beat, chunkStartBeat)
    if (y < -2 || y > ROW_HEIGHT + 2) continue

    switch (line.type) {
      case 'red':
      case 'virtual': {
        if (line.bpm != null && line.bpm < 1000) {
          const sameAsPrevious = previousBpm != null && Math.abs(line.bpm - previousBpm) < 1e-4
          labels.push({
            x: -4,
            y: y + 4,
            anchor: 'end',
            fill: BPM_TEXT,
            size: 13,
            text: sameAsPrevious ? '=' : formatBpm(line.bpm),
          })
          previousBpm = line.bpm
        } else if (line.bpm != null) {
          labels.push({ x: -4, y: y + 4, anchor: 'end', fill: BPM_TEXT, size: 13, text: '+' })
        }
        redYs.push(y)
        break
      }
      case 'bar': {
        if (!line.nearNext && line.measureIndex != null) {
          labels.push({ x: -4, y: y + 4, anchor: 'end', fill: '#FFFFFF', opacity: 0.6, size: 12, text: String(line.measureIndex) })
        }
        barYs.push(y)
        break
      }
      case 'beat': {
        beatYs.push(y)
        break
      }
      case 'minute':
      case 'minuteLatest': {
        const total = Math.floor(line.time / 1000)
        const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
        labels.push({ x: width + 4, y: y + 4, anchor: 'start', fill: MINUTE_LINE, size: 12, text })
        minuteYs.push(y)
        break
      }
      case 'preview': {
        labels.push({ x: width + 4, y: y + 4, anchor: 'start', fill: PV_LINE, size: 13, text: 'PV' })
        pvYs.push(y)
        break
      }
      case 'green': {
        if (model.svMode) {
          const currentSv = line.standardSv ?? 1
          const x = svToX(currentSv, centerX, model.maxSv, model.minSv)
          const bottom = clampY(beatToY(line.beat, chunkStartBeat))
          const top = clampY(beatToY(line.nextBeat ?? line.beat, chunkStartBeat))
          if (greenCount === 0 && line.beat > chunkStartBeat && line.prevStandardSv != null) {
            const x0 = svToX(line.prevStandardSv, centerX, model.maxSv, model.minSv)
            svPoints.push([x0, ROW_HEIGHT], [x0, bottom])
          }
          if (Math.abs(bottom - top) > 0.01) svPoints.push([x, bottom], [x, top])
        } else {
          const value = line.sv ?? 1
          const sameAsPrevious = previousSv != null && Math.abs(value - previousSv) < 1e-4
          labels.push({
            x: width + 4,
            y: y + 4,
            anchor: 'start',
            fill: SV_LINE,
            size: 13,
            text: sameAsPrevious ? '=' : formatSv(value),
          })
          previousSv = value
          greenYs.push(y)
        }
        greenCount += 1
        break
      }
    }
  }

  const laneRects: ReactElement[] = []
  for (const note of chunk.notes) {
    const x = note.column * LANE_WIDTH
    const color = NOTE_FILL[laneColors[note.column] ?? '1']
    if (note.isLong) {
      const startY = beatToY(note.renderStart, chunkStartBeat)
      const endY = beatToY(note.renderEnd, chunkStartBeat)
      const top = Math.min(startY, endY)
      const height = Math.max(Math.abs(startY - endY), 1)
      laneRects.push(
        <rect key={`l${x}-${top}`} x={x} y={top} width={LANE_WIDTH} height={height} rx={1.5} fill={color} opacity={0.55} />,
      )
      // 只在"这一根竖条里真的能看到长条起点"时画头部,避免切片边缘重复出键。
      if (Math.abs(note.renderStart - note.beat) < 1e-4) {
        laneRects.push(
          <rect key={`h${x}-${startY}`} x={x} y={startY - NOTE_HEIGHT / 2} width={LANE_WIDTH} height={NOTE_HEIGHT} rx={1.5} fill={color} />,
        )
      }
    } else {
      const y = beatToY(note.renderStart, chunkStartBeat)
      laneRects.push(
        <rect key={`n${x}-${y}`} x={x} y={y - NOTE_HEIGHT / 2} width={LANE_WIDTH} height={NOTE_HEIGHT} rx={1.5} fill={color} />,
      )
    }
  }

  return (
    <g>
      <line x1={0} y1={0} x2={0} y2={ROW_HEIGHT} stroke={LANE_EDGE} strokeWidth={1} />
      <line x1={width} y1={0} x2={width} y2={ROW_HEIGHT} stroke={LANE_EDGE} strokeWidth={1} />

      {beatYs.length > 0 && <path d={hLinePath(beatYs, width)} stroke={BEAT_LINE} strokeWidth={1} fill="none" />}
      {barYs.length > 0 && <path d={hLinePath(barYs, width)} stroke={BAR_LINE} strokeWidth={1.5} fill="none" />}
      {minuteYs.length > 0 && (
        <path d={hLinePath(minuteYs, width)} stroke={MINUTE_LINE} strokeWidth={1.5} strokeDasharray="2,2" fill="none" />
      )}
      {greenYs.length > 0 && (
        <path d={hLinePath(greenYs, width)} stroke={SV_LINE} strokeWidth={1} strokeDasharray="2,2" opacity={0.8} fill="none" />
      )}
      {redYs.length > 0 && <path d={hLinePath(redYs, width)} stroke={BPM_LINE} strokeWidth={2} fill="none" />}
      {pvYs.length > 0 && <path d={hLinePath(pvYs, width)} stroke={PV_LINE} strokeWidth={2} fill="none" />}

      {svPointsToPath(svPoints)}

      {/* SV 模式但这一条竖条里没有绿线:画一条竖线表示进入本切片时的速度。 */}
      {model.svMode && svPoints.length === 0 && chunk.notes.length > 0 && (
        <line
          x1={svToX(chunk.initialSv, centerX, model.maxSv, model.minSv)}
          y1={0}
          x2={svToX(chunk.initialSv, centerX, model.maxSv, model.minSv)}
          y2={ROW_HEIGHT}
          stroke={SV_LINE}
          strokeWidth={3}
          opacity={Math.abs(chunk.initialSv - 1) < 1e-4 ? 0.2 : 0.5}
        />
      )}

      {labels.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
          fill={label.fill}
          fontSize={label.size}
          fontFamily={MONO}
          opacity={label.opacity ?? 1}
        >
          {label.text}
        </text>
      ))}

      {laneRects}
    </g>
  )
}

function clampY(y: number): number {
  return Math.min(ROW_HEIGHT, Math.max(0, y))
}

function svPointsToPath(points: [number, number][]): ReactElement | null {
  if (points.length < 2) return null
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  return <path d={d} fill="none" stroke={SV_LINE} strokeWidth={3} opacity={0.5} strokeLinecap="round" strokeLinejoin="round" />
}

export const ManiaChartSvg = memo(function ManiaChartSvg({
  model,
  page,
  source,
}: {
  model: ManiaChartModel
  page: ChartPage
  source: ChartSource
}) {
  const t = useT()
  const beatmap = model.beatmap
  const laneColors = getKeyOverlay(beatmap.keys, beatmap.specialStyle)
  const bodyTop = HEADER_HEIGHT + 40
  const visibleChunks = page.chunks.slice(0, page.rows * page.chunksPerRow)
  const longNoteCount = beatmap.notes.filter((n) => n.isLong).length
  const sourceLabel = source === 'r2' ? t('chart.source.r2') : t('chart.source.online')

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 1920 ${page.height}`}
      width={1920}
      height={page.height}
      style={{ display: 'block', width: '100%', height: 'auto' }}
      role="img"
      aria-label={`${beatmap.artist} - ${beatmap.title} [${beatmap.version}]`}
    >
      <rect x={0} y={0} width={1920} height={page.height} rx={40} fill={PANEL_BG} />
      <rect x={0} y={HEADER_HEIGHT} width={1920} height={page.height - HEADER_HEIGHT} rx={40} fill={BODY_BG} />

      {/* 页眉卡片:没有 osu 封面素材,用纯色卡片 + 文本信息 */}
      <rect x={40} y={40} width={1180} height={210} rx={16} fill={PANEL_BG} stroke="#4A3E44" strokeWidth={1} />
      <text x={76} y={132} fill="#FFFFFF" fontSize={38} fontWeight={700} fontFamily={SANS}>
        {clip(`${beatmap.artist} - ${beatmap.title}`, 46)}
      </text>
      <text x={76} y={178} fill={BPM_TEXT} fontSize={22} fontFamily={SANS}>
        {clip(`[${beatmap.version}]`, 60)}
      </text>
      <text x={76} y={216} fill="#B9AEB4" fontSize={18} fontFamily={MONO}>
        {`${beatmap.keys}K  ·  OD ${formatSv(beatmap.od)}  ·  HP ${formatSv(beatmap.hp)}  ·  BPM ${formatBpm(model.normalizedBpm)}  ·  ${formatClock(model.lastNoteTime)}  ·  BID ${beatmap.beatmapId ?? '-'}`}
      </text>

      <text x={1880} y={104} textAnchor="end" fill="#FFFFFF" fontSize={34} fontWeight={700} fontFamily={SANS}>
        {t('chart.panelName')}
      </text>
      <text x={1880} y={146} textAnchor="end" fill="#B9AEB4" fontSize={18} fontFamily={MONO}>
        {`${sourceLabel}  ·  ${t('chart.requestTime')} ${new Date().toLocaleString()}`}
      </text>
      <text x={1880} y={182} textAnchor="end" fill="#8C8087" fontSize={17} fontFamily={MONO}>
        {`${t('chart.metaNotes', { total: beatmap.notes.length, ln: longNoteCount })}  ·  ${beatmap.keys}K`}
      </text>

      {visibleChunks.map((_chunk, i) => {
        const row = Math.floor(i / page.chunksPerRow)
        if (row % 2 === 0) return null
        return (
          <rect
            key={`bg${i}`}
            x={0}
            y={bodyTop + row * (ROW_HEIGHT + ROW_GAP) - 5}
            width={1920}
            height={ROW_HEIGHT + 10}
            fill={ROW_ALT_BG}
          />
        )
      })}

      {visibleChunks.map((chunk, i) => {
        const row = Math.floor(i / page.chunksPerRow)
        const column = i % page.chunksPerRow
        const x = column * page.chunkWidth + page.chunkX
        const y = bodyTop + row * (ROW_HEIGHT + ROW_GAP)
        return (
          <g key={chunk.index} transform={`translate(${x.toFixed(2)} ${y})`}>
            <Chunk chunk={chunk} model={model} laneColors={laneColors} />
          </g>
        )
      })}

      <text x={960} y={page.height - 14} textAnchor="middle" fill="#FFFFFF" opacity={0.6} fontSize={20} fontFamily={MONO}>
        {t('chart.pageOf', { page: page.page, total: page.totalPages })}
      </text>
    </svg>
  )
})

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
