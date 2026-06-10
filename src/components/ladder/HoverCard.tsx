'use client'

import type { Round, Tournament } from '@/lib/types'
import { useViewStore } from '@/stores/viewStore'
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
  let minDiff: number, maxDiff: number
  if (hoveredType && typeMaps.length > 0) {
    minDiff = Math.min(...typeMaps.map((m) => m.difficultyLn || m.difficulty))
    maxDiff = Math.max(...typeMaps.map((m) => m.difficultyLn || m.difficulty))
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
      <div className="font-semibold text-sm mb-1 text-gray-900 dark:text-neutral-100">
        {tournament.abbreviation} {round.abbreviation}{hoveredType ? ` ${hoveredType}` : ''}
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
          论坛帖
        </a>
      )}
      {tournament.wikiUrl && (
        <a
          href={tournament.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 dark:text-blue-300 hover:underline block mb-0.5"
        >
          Wiki
        </a>
      )}
      {tournament.sheetUrl && (
        <a
          href={tournament.sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 dark:text-blue-300 hover:underline block mb-0.5"
        >
          主表格
        </a>
      )}
      <div className="text-xs text-gray-400 dark:text-neutral-500 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-neutral-800">
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
  if (type === 'TB') {
    const typeMaps = round.maps.filter((m) => m.type === 'TB')
    if (typeMaps.length > 0) {
      const rfAvg = typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length
      const lnAvg = typeMaps.reduce((s, m) => s + (m.difficultyLn ?? m.difficulty), 0) / typeMaps.length
      return `~${getRfDanName(rfAvg)} / ${getLnDanName(lnAvg)}`
    }
  }

  const avg = round.difficulty.average
  return `~${getRfDanName(avg)} / ${getLnDanName(avg)}`
}

function getRfDanName(diff: number): string {
  let closest = rfLevels[0]
  let minDist = Math.abs(diff - closest.numericValue)
  for (const level of rfLevels) {
    const dist = Math.abs(diff - level.numericValue)
    if (dist < minDist) { closest = level; minDist = dist }
  }
  return closest.name
}

function getLnDanName(diff: number): string {
  let closest = lnLevels[0]
  let minDist = Math.abs(diff - closest.numericValue)
  for (const level of lnLevels) {
    const dist = Math.abs(diff - level.numericValue)
    if (dist < minDist) { closest = level; minDist = dist }
  }
  return `LN${closest.name}`
}
