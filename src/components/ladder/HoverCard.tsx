'use client'

import type { Round, Tournament } from '@/lib/types'
import { useViewStore } from '@/stores/viewStore'

export function HoverCard({
  round,
  tournament,
  x,
  y,
  onMouseEnter,
  onMouseLeave,
}: {
  round: Round
  tournament: Tournament
  x: number
  y: number
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const { activeFilter } = useViewStore()
  const diffLabel = buildDifficultyLabel(round, activeFilter)

  const cardX = typeof window !== 'undefined' ? Math.min(x + 12, window.innerWidth - 300) : x + 12
  const cardY = typeof window !== 'undefined' ? Math.min(y + 12, window.innerHeight - 220) : y + 12

  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs"
      style={{ left: cardX, top: cardY }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="font-semibold text-sm mb-1">
        {tournament.abbreviation} {round.abbreviation}
      </div>
      <div className="text-xs text-gray-700 mb-2 font-mono">
        {diffLabel}
      </div>
      {tournament.forumUrl && (
        <a
          href={tournament.forumUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline block mb-0.5"
        >
          🔗 论坛帖
        </a>
      )}
      {tournament.wikiUrl && (
        <a
          href={tournament.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline block mb-0.5"
        >
          📖 Wiki
        </a>
      )}
      <div className="text-xs text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100">
        {round.maps.length} 张谱面 · 难度 {round.difficulty.min.toFixed(1)} ~ {round.difficulty.max.toFixed(1)}
      </div>
    </div>
  )
}

function buildDifficultyLabel(round: Round, activeFilter: string | null): string {
  const avg = round.difficulty.average
  const rfLabel = getRfDanName(avg)
  const lnLabel = getLnDanName(avg)

  if (activeFilter === 'RC' || activeFilter === 'SV') {
    return `~${rfLabel}`
  }
  if (activeFilter === 'LN') {
    return `~${lnLabel}`
  }
  if (activeFilter === 'HB') {
    return `~${rfLabel} / ${lnLabel}`
  }

  return `~${rfLabel} / ${lnLabel}`
}

function getRfDanName(diff: number): string {
  if (diff >= 17) return 'η'
  if (diff >= 16) return 'ζ'
  if (diff >= 15) return 'ε'
  if (diff >= 14) return 'δ'
  if (diff >= 13) return 'γ'
  if (diff >= 12) return 'β'
  if (diff >= 11) return 'α'
  if (diff >= 10) return '10th'
  if (diff >= 9) return '9th'
  if (diff >= 8) return '8th'
  if (diff >= 7) return '7th'
  if (diff >= 6) return '6th'
  if (diff >= 5) return '5th'
  if (diff >= 4) return '4th'
  if (diff >= 3) return '3rd'
  if (diff >= 2) return '2nd'
  if (diff >= 1) return '1st'
  return 'intro'
}

function getLnDanName(diff: number): string {
  const lnVal = Math.round(diff)
  if (lnVal >= 17) return 'LN17'
  if (lnVal <= 1) return 'LN1'
  return `LN${lnVal}`
}
