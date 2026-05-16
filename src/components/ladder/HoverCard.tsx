'use client'

import type { Round, Tournament } from '@/lib/types'
import { useViewStore } from '@/stores/viewStore'

export function HoverCard({
  round,
  tournament,
  hoveredType,
  x,
  y,
  onMouseEnter,
  onMouseLeave,
}: {
  round: Round
  tournament: Tournament
  hoveredType?: string
  x: number
  y: number
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const { activeFilter } = useViewStore()
  const diffLabel = buildDifficultyLabel(round, activeFilter, hoveredType)

  const cardX = typeof window !== 'undefined' ? Math.min(x + 12, window.innerWidth - 300) : x + 12
  const cardY = typeof window !== 'undefined' ? Math.min(y + 12, window.innerHeight - 220) : y + 12

  const typeMaps = hoveredType ? round.maps.filter((m) => m.type === hoveredType) : round.maps
  const minDiff = typeMaps.length > 0 ? Math.min(...typeMaps.map((m) => m.difficulty)) : round.difficulty.min
  const maxDiff = typeMaps.length > 0 ? Math.max(...typeMaps.map((m) => m.difficulty)) : round.difficulty.max

  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs"
      style={{ left: cardX, top: cardY }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="font-semibold text-sm mb-1">
        {tournament.abbreviation} {round.abbreviation}{hoveredType ? ` ${hoveredType}` : ''}
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
          论坛帖
        </a>
      )}
      {tournament.wikiUrl && (
        <a
          href={tournament.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline block mb-0.5"
        >
          Wiki
        </a>
      )}
      <div className="text-xs text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100">
        {typeMaps.length} 张谱面 · 难度 {minDiff.toFixed(1)} ~ {maxDiff.toFixed(1)}
      </div>
    </div>
  )
}

function buildDifficultyLabel(round: Round, activeFilter: string | null, hoveredType?: string): string {
  const type = hoveredType || activeFilter
  const td = round.typeDifficulties

  if (type && td?.[type]) {
    const entry = td[type]
    if (type === 'LN') {
      const val = entry.ln ?? entry.rf
      return val ? `~${getLnDanName(val)}` : `~${getLnDanName(round.difficulty.average)}`
    }
    if (type === 'HB') {
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
    const typeMaps = round.maps.filter((m) => m.type === 'LN')
    const avg = typeMaps.length > 0 ? typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length : round.difficulty.average
    return `~${getLnDanName(avg)}`
  }
  if (type === 'RC' || type === 'SV') {
    const typeMaps = round.maps.filter((m) => m.type === type)
    const avg = typeMaps.length > 0 ? typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length : round.difficulty.average
    return `~${getRfDanName(avg)}`
  }
  if (type === 'HB') {
    const typeMaps = round.maps.filter((m) => m.type === 'HB')
    const avg = typeMaps.length > 0 ? typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length : round.difficulty.average
    return `~${getRfDanName(avg)} / ${getLnDanName(avg)}`
  }

  const avg = round.difficulty.average
  return `~${getRfDanName(avg)} / ${getLnDanName(avg)}`
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
