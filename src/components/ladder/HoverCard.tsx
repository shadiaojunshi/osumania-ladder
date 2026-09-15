'use client'

import type { Round, Tournament } from '@/lib/types'
import { useViewStore } from '@/stores/viewStore'
import { useT } from '@/lib/i18n'
import { countableMaps } from '@/lib/difficultyCount'
import reformDanData from '@data/scales/reform-dan.json'
import lnDanData from '@data/scales/ln-dan.json'

interface DanLevel { id: string; name: string; numericValue: number; color: string }
const rfLevels = reformDanData.levels as DanLevel[]
const lnLevels = lnDanData.levels as DanLevel[]

export function HoverCard({
  round,
  tournament,
  hoveredType,
  x,
  y,
  onMouseEnter,
  onMouseLeave,
  onOpenDetail,
}: {
  round: Round
  tournament: Tournament
  hoveredType?: string
  x: number
  y: number
  onMouseEnter: () => void
  onMouseLeave: () => void
  onOpenDetail: (trigger?: HTMLElement | null) => void
}) {
  const { activeFilter } = useViewStore()
  const t = useT()
  const diffLabel = buildDifficultyLabel(round, activeFilter, hoveredType)

  const cardX = typeof window !== 'undefined' ? Math.min(x + 12, window.innerWidth - 300) : x + 12
  const cardY = typeof window !== 'undefined' ? Math.min(y + 12, window.innerHeight - 220) : y + 12

  // 无 hoveredType 时不数 TB(TB 不进框范围,数进去会显得"框过大"且张数虚高)。
  const typeMaps = hoveredType ? countableMaps(round.maps).filter((m) => m.type === hoveredType) : countableMaps(round.maps).filter((m) => m.type !== 'TB')
  let minDiff: number, maxDiff: number
  if (hoveredType && typeMaps.length > 0) {
    minDiff = Math.min(...typeMaps.map((m) => m.difficultyLn || m.difficulty))
    maxDiff = Math.max(...typeMaps.map((m) => m.difficultyLn || m.difficulty))
  } else if (typeMaps.length > 0) {
    // 与 LadderView 的 round 框口径一致:逐图难度(排除 TB)是权威,stored 只作 fallback。
    const vals = typeMaps.map((m) => m.difficultyLn || m.difficulty).filter((d) => d > 0)
    minDiff = vals.length > 0 ? Math.min(...vals) : round.difficulty.min
    maxDiff = vals.length > 0 ? Math.max(...vals) : round.difficulty.max
  } else {
    minDiff = round.difficulty.min
    maxDiff = round.difficulty.max
  }

  return (
    <div
      className="fixed z-50 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg dark:shadow-black/40 p-3 max-w-xs"
      style={{ left: cardX, top: cardY }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="font-semibold text-sm mb-1 text-gray-900 dark:text-neutral-100 flex items-center justify-between gap-2">
        <span className="truncate">
          {tournament.abbreviation} {round.abbreviation}{hoveredType ? ` ${hoveredType}` : ''}
        </span>
        <button
          onClick={(e) => onOpenDetail(e.currentTarget)}
          className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-600 dark:text-neutral-300"
        >
          {t('hover.detail')}
        </button>
      </div>
      <div className="text-xs text-gray-700 dark:text-neutral-300 mb-2 font-mono">
        {diffLabel}
      </div>
      {tournament.forumUrl && (
        <a
          href={tournament.forumUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 dark:text-blue-300 hover:underline block mb-0.5"
        >
          {t('hover.forum')}
        </a>
      )}
      {tournament.wikiUrl && (
        <a
          href={tournament.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 dark:text-blue-300 hover:underline block mb-0.5"
        >
          {t('hover.wiki')}
        </a>
      )}
      {tournament.sheetUrl && (
        <a
          href={tournament.sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 dark:text-blue-300 hover:underline block mb-0.5"
        >
          {t('hover.sheet')}
        </a>
      )}
      <div className="text-xs text-gray-400 dark:text-neutral-500 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-neutral-800">
        {t('hover.summary', { count: typeMaps.length, min: minDiff.toFixed(1), max: maxDiff.toFixed(1) })}
      </div>
    </div>
  )
}

function buildDifficultyLabel(round: Round, activeFilter: string | null, hoveredType?: string): string {
  const type = hoveredType || activeFilter
  const td = round.typeDifficulties

  // 先按**图上现算**的值出段位:这是框高用的同一份数据(见 LadderView 的 adjustedAvg),
  // 也让悬浮卡与框不会各说各话。typeDifficulties 只是汇总缓存,会随数据改动过期 ——
  // 曾经的表现:CET GF TB 实际 rf16.2/ln17.2,缓存里还是 15.3/16.4,
  // 于是框高按实际值画、悬浮卡按旧缓存显示 ε/ε+，看起来就是"显示的段位偏低一档"。
  if (type) {
    const live = liveLabelForType(round, type)
    if (live) return live
  }

  if (type && td?.[type]) {
    const entry = td[type]
    if (type === 'LN') {
      const val = entry.ln ?? entry.rf
      return val ? `~${getLnDanName(val)}` : `~${getLnDanName(round.difficulty.average)}`
    }
    // HB / TB 都是 rf + ln 双段:两侧各出一个分档标签(如 ~ε+/ζ- / LN16-/16)。
    if (type === 'HB' || type === 'TB') {
      const rfVal = entry.rf
      const lnVal = entry.ln
      const parts: string[] = []
      if (rfVal) parts.push(getRfDanName(rfVal))
      if (lnVal) parts.push(getLnDanName(lnVal))
      return parts.length > 0 ? `~${parts.join(' / ')}` : `~${getRfDanName(round.difficulty.average)}`
    }
    const val = entry.rf
    return val ? `~${getRfDanName(val)}` : `~${getRfDanName(round.difficulty.average)}`
  }

  if (type === 'LN') {
    const typeMaps = countableMaps(round.maps).filter((m) => m.type === 'LN')
    const avg = typeMaps.length > 0 ? typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length : round.difficulty.average
    return `~${getLnDanName(avg)}`
  }
  if (type === 'RC' || type === 'SV') {
    const typeMaps = countableMaps(round.maps).filter((m) => m.type === type)
    const avg = typeMaps.length > 0 ? typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length : round.difficulty.average
    return `~${getRfDanName(avg)}`
  }
  if (type === 'HB') {
    const typeMaps = countableMaps(round.maps).filter((m) => m.type === 'HB')
    const rfs = typeMaps.map((m) => m.difficulty).filter((d) => d > 0)
    const lns = typeMaps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0)
    const parts: string[] = []
    if (rfs.length > 0) parts.push(getRfDanName(rfs.reduce((s, d) => s + d, 0) / rfs.length))
    if (lns.length > 0) parts.push(getLnDanName(lns.reduce((s, d) => s + d, 0) / lns.length))
    if (parts.length > 0) return `~${parts.join(' / ')}`
    return `~${getRfDanName(round.difficulty.average)}`
  }
  if (type === 'TB') {
    const typeMaps = countableMaps(round.maps).filter((m) => m.type === 'TB')
    if (typeMaps.length > 0) {
      const rfAvg = typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length
      const lnAvg = typeMaps.reduce((s, m) => s + (m.difficultyLn ?? m.difficulty), 0) / typeMaps.length
      return `~${getRfDanName(rfAvg)} / ${getLnDanName(lnAvg)}`
    }
  }

  // 无 hoveredType / activeFilter 时的默认 fallback:
  //   按 type 分成 rf 桶(RC/SV + HB.difficulty) 和 ln 桶(LN.difficulty + HB.difficultyLn)。
  //   TB 完全排除。桶为空就不显示对应段位;两边都空就什么都不显示。
  //   避免 o!mln4 那种只有 LN+TB 的比赛显示 rf 段位。
  const rfBucket: number[] = []
  const lnBucket: number[] = []
  for (const m of countableMaps(round.maps)) {
    if (m.type === 'TB') continue
    if (m.type === 'LN') {
      if (m.difficulty > 0) lnBucket.push(m.difficulty)
    } else if (m.type === 'HB') {
      if (m.difficulty > 0) rfBucket.push(m.difficulty)
      if (m.difficultyLn && m.difficultyLn > 0) lnBucket.push(m.difficultyLn)
    } else {
      // RC / SV / SPECIAL — 存 rf 值
      if (m.difficulty > 0) rfBucket.push(m.difficulty)
    }
  }
  const parts: string[] = []
  if (rfBucket.length > 0) {
    const avg = rfBucket.reduce((s, d) => s + d, 0) / rfBucket.length
    parts.push(getRfDanName(avg))
  }
  if (lnBucket.length > 0) {
    const avg = lnBucket.reduce((s, d) => s + d, 0) / lnBucket.length
    parts.push(getLnDanName(avg))
  }
  return parts.length > 0 ? `~${parts.join(' / ')}` : ''
}

// 主档 = numericValue 落在整数上(α=11、β=12、rf10=10...)。副档 = ±0.3 偏移档(α+/α-)。
function isMajorLevel(v: number): boolean {
  return Math.abs(v - Math.round(v)) < 0.05
}

// 分档:给一个数值返回它落在哪个"纯档"或"双档"。levels 按 numericValue 降序。
//   每档纯档半宽:主档朝任意邻档 ±0.10;副档朝 0.4 间隔邻档 ±0.10、朝 0.3 间隔主档 ±0.05。
//   落在某档纯档内 → primary=该档,secondary=null;
//   落在两纯档之间 → primary=低档、secondary=高档(显示"低/高")。
// 该规则精确复现手排的分档表(10.9-11.1=α、10.75-10.89=α-/α、11.25-11.4=α+ ...)。
function danBand(
  diff: number,
  levels: DanLevel[]
): { primary: DanLevel; secondary: DanLevel | null } {
  if (diff >= levels[0].numericValue) return { primary: levels[0], secondary: null }
  const last = levels[levels.length - 1]
  if (diff <= last.numericValue) return { primary: last, secondary: null }
  let hi = levels[0]
  let lo = last
  for (let i = 0; i < levels.length - 1; i++) {
    if (levels[i].numericValue >= diff && levels[i + 1].numericValue <= diff) {
      hi = levels[i]
      lo = levels[i + 1]
      break
    }
  }
  const gap = hi.numericValue - lo.numericValue
  const half = (lvl: DanLevel) =>
    gap >= 0.35 ? 0.1 : isMajorLevel(lvl.numericValue) ? 0.1 : 0.05
  let hLo = half(lo)
  let hHi = half(hi)
  // 极小 gap(intro 区)兜底:纯档不重叠,退化到三等分。
  if (hLo + hHi >= gap) {
    hLo = gap / 3
    hHi = gap / 3
  }
  if (diff <= lo.numericValue + hLo) return { primary: lo, secondary: null }
  if (diff >= hi.numericValue - hHi) return { primary: hi, secondary: null }
  return { primary: lo, secondary: hi }
}

// 从比赛的谱面字段现算这个键型的段位标签;没有可用数值时返回 null(交给 typeDifficulties 兜底)。
// 取值口径与 LadderView 的框高一致:RC/SV 用 difficulty;LN 用 difficulty(存的就是 ln 值);
// HB/TB 两侧各有:rf 用 difficulty、ln 用 difficultyLn。
function liveLabelForType(round: Round, type: string): string | null {
  const maps = countableMaps(round.maps).filter((m) => m.type === type)
  if (maps.length === 0) return null
  const avgOf = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const rfAvg = avgOf(maps.map((m) => m.difficulty).filter((d) => d > 0))
  const lnAvg = avgOf(maps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0))

  if (type === 'TB' || type === 'HB') {
    const parts: string[] = []
    if (rfAvg !== null) parts.push(getRfDanName(rfAvg))
    if (lnAvg !== null) parts.push(getLnDanName(lnAvg))
    return parts.length > 0 ? `~${parts.join(' / ')}` : null
  }
  if (type === 'LN') {
    const val = lnAvg ?? rfAvg
    return val !== null ? `~${getLnDanName(val)}` : null
  }
  return rfAvg !== null ? `~${getRfDanName(rfAvg)}` : null
}

function getRfDanName(diff: number): string {
  const { primary, secondary } = danBand(diff, rfLevels)
  return secondary ? `${primary.name}/${secondary.name}` : primary.name
}

function getLnDanName(diff: number): string {
  const { primary, secondary } = danBand(diff, lnLevels)
  const label = secondary ? `${primary.name}/${secondary.name}` : primary.name
  return `LN${label}`
}
