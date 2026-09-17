'use client'

import type { Round, Tournament } from '@/lib/types'
import { useViewStore } from '@/stores/viewStore'
import { useT } from '@/lib/i18n'
import { countableMaps } from '@/lib/difficultyCount'
import { buildDifficultyLabel, type DanLevel, type DanLevels } from '@/lib/danLabels'
import reformDanData from '@data/scales/reform-dan.json'
import lnDanData from '@data/scales/ln-dan.json'

const rfLevels = reformDanData.levels as DanLevel[]
const lnLevels = lnDanData.levels as DanLevel[]
const dans: DanLevels = { rf: rfLevels, ln: lnLevels }

export function HoverCard({
  round,
  tournament,
  hoveredType,
  hoveredSlot,
  x,
  y,
  onMouseEnter,
  onMouseLeave,
  onOpenDetail,
}: {
  round: Round
  tournament: Tournament
  hoveredType?: string
  // 被悬浮的那个框的槽位名(多 TB/HB 拆框时是 slot,如 SHOWTB / FS/TB)。
  // 给了它就按"那一张图自己的实际难度"出段位,不再拿同键型的聚合值充数。
  hoveredSlot?: string
  x: number
  y: number
  onMouseEnter: () => void
  onMouseLeave: () => void
  onOpenDetail: (trigger?: HTMLElement | null) => void
}) {
  const { activeFilter } = useViewStore()
  const t = useT()
  const diffLabel = buildDifficultyLabel(round, { activeFilter, type: hoveredType, slot: hoveredSlot }, dans)

  const cardX = typeof window !== 'undefined' ? Math.min(x + 12, window.innerWidth - 300) : x + 12
  const cardY = typeof window !== 'undefined' ? Math.min(y + 12, window.innerHeight - 220) : y + 12

  // 无 hoveredType 时不数 TB(TB 不进框范围,数进去会显得"框过大"且张数虚高)。
  // 有 hoveredSlot 时进一步收窄到那张图,保证"张数/范围/段位"三处口径一致。
  const typeMaps = countableMaps(round.maps).filter((m) => {
    if (hoveredType) {
      if (m.type !== hoveredType) return false
      return hoveredSlot ? (m.slot || m.type) === hoveredSlot : true
    }
    return m.type !== 'TB'
  })
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
      {/* 没有任何实际难度可依据时整行不显示 —— 以前会拿"整轮平均"兜底,
          看起来像真值其实是错的(站长反馈:TB 段位显示的是平均难度)。 */}
      {diffLabel && (
        <div className="text-xs text-gray-700 dark:text-neutral-300 mb-2 font-mono">
          {diffLabel}
        </div>
      )}
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

