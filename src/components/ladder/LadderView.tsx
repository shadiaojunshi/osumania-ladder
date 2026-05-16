'use client'

import { useViewStore } from '@/stores/viewStore'
import { difficultyToY, getGradientForRange, getDifficultyColor } from '@/lib/difficulty'
import type { Tournament, Round } from '@/lib/types'
import { tournaments } from '@/generated/tournaments'
import { useState, useRef, useCallback, useEffect } from 'react'
import { HoverCard } from './HoverCard'

const DIFFICULTY_RANGE = { min: 0.5, max: 17.5 }
const BOX_HEIGHT_TYPE = 28

export function LadderView() {
  const { mode, zoom, columnWidth, rowHeight, rfLnOffset, activeFilter, searchQuery, sortMode, customOrder } = useViewStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  const [hoveredRound, setHoveredRound] = useState<{ round: Round; tournament: Tournament; x: number; y: number; type?: string } | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min
  const containerHeight = diffRange * rowHeight * zoom

  const filteredTournaments = tournaments.filter((t) => {
    if (!searchQuery) return true
    return t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.abbreviation.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const sortedTournaments = (() => {
    if (customOrder) {
      return [...filteredTournaments].sort((a, b) => {
        const ai = customOrder.indexOf(a.id)
        const bi = customOrder.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    }
    if (sortMode === 'default') return filteredTournaments
    const getAvg = (t: Tournament) => {
      const allDiffs = t.rounds.flatMap((r) => r.maps.map((m) => m.difficulty))
      return allDiffs.length > 0 ? allDiffs.reduce((s, d) => s + d, 0) / allDiffs.length : 0
    }
    return [...filteredTournaments].sort((a, b) =>
      sortMode === 'difficulty-desc' ? getAvg(b) - getAvg(a) : getAvg(a) - getAvg(b)
    )
  })()

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const scrollTop = el.scrollTop
    if (leftRef.current) leftRef.current.scrollTop = scrollTop
    if (rightRef.current) rightRef.current.scrollTop = scrollTop
  }, [])

  const showHover = useCallback((round: Round, tournament: Tournament, x: number, y: number, type?: string) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setHoveredRound({ round, tournament, x, y, type })
  }, [])

  const scheduleHide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredRound(null)
    }, 150)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current) }
  }, [])

  return (
    <div className="flex-1 flex overflow-hidden">
      <LeftScaleInner ref={leftRef} containerHeight={containerHeight} />

      <div
        className="flex-1 overflow-auto"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <div
          className="relative flex gap-2 px-2 pt-2"
          style={{
            height: containerHeight,
            minWidth: sortedTournaments.length * (columnWidth + 8),
          }}
        >
          {sortedTournaments.map((tournament) => (
            <TournamentColumn
              key={tournament.id}
              tournament={tournament}
              mode={mode}
              containerHeight={containerHeight}
              columnWidth={columnWidth}
              activeFilter={activeFilter}
              rfLnOffset={rfLnOffset}
              onHover={(round, x, y, type) => showHover(round, tournament, x, y, type)}
              onLeave={scheduleHide}
            />
          ))}
        </div>
      </div>

      <RightRefInner ref={rightRef} containerHeight={containerHeight} />

      {hoveredRound && (
        <HoverCard
          round={hoveredRound.round}
          tournament={hoveredRound.tournament}
          hoveredType={hoveredRound.type}
          x={hoveredRound.x}
          y={hoveredRound.y}
          onMouseEnter={cancelHide}
          onMouseLeave={() => setHoveredRound(null)}
        />
      )}
    </div>
  )
}

/* Inline left scale that scrolls in sync */
import { forwardRef } from 'react'
import { difficultyToY as d2y } from '@/lib/difficulty'
import reformDanData from '@data/scales/reform-dan.json'
import lnDanData from '@data/scales/ln-dan.json'
import type { DanLevel } from '@/lib/types'

const reformLevels = reformDanData.levels as DanLevel[]
const lnLevels = lnDanData.levels as DanLevel[]

const MAJOR_RF = new Set([
  'eta', 'zeta', 'epsilon', 'delta', 'gamma', 'beta', 'alpha',
  'rf10', 'rf9', 'rf8', 'rf7', 'rf6', 'rf5', 'rf4', 'rf3', 'rf2', 'rf1',
  'intro3', 'intro2', 'intro1',
])

const MAJOR_LN = new Set(
  lnLevels.filter((l) => !l.id.includes('+') && !l.id.includes('-')).map((l) => l.id)
)

const LeftScaleInner = forwardRef<HTMLDivElement, { containerHeight: number }>(
  function LeftScaleInner({ containerHeight }, ref) {
    const { activeFilter, rfLnOffset } = useViewStore()
    const showOnlyLn = activeFilter === 'LN' || activeFilter === 'HB'
    const showOnlyRf = activeFilter === 'RC' || activeFilter === 'SV'
    const showBoth = !showOnlyLn && !showOnlyRf

    const totalWidth = showBoth ? 110 : 70

    return (
      <div className={`border-r border-gray-200 overflow-hidden shrink-0`} style={{ width: totalWidth }} ref={ref}>
        <div className="relative" style={{ height: containerHeight }}>
          {/* RF scale - show when not filtering LN/HB only */}
          {!showOnlyLn && reformLevels.map((level) => {
            const y = d2y(level.numericValue, containerHeight, DIFFICULTY_RANGE)
            const isMajor = MAJOR_RF.has(level.id)
            return (
              <div
                key={level.id}
                className="absolute flex items-center"
                style={{ top: y - 8, left: 0, width: showBoth ? 55 : 70 }}
              >
                <span
                  className="scale-label pl-2"
                  style={{
                    color: level.color,
                    fontSize: isMajor ? '12px' : '9px',
                    opacity: isMajor ? 1 : 0.4,
                  }}
                >
                  {level.name}
                </span>
              </div>
            )
          })}

          {/* LN scale - show when not filtering RC/SV only */}
          {!showOnlyRf && lnLevels.map((level) => {
            const lnY = d2y(level.numericValue - rfLnOffset, containerHeight, DIFFICULTY_RANGE)
            const isMajor = MAJOR_LN.has(level.id)
            return (
              <div
                key={level.id}
                className="absolute flex items-center"
                style={{ top: lnY - 8, right: 0, width: showBoth ? 50 : 70 }}
              >
                <span
                  className="scale-label text-right w-full pr-2"
                  style={{
                    color: '#6366f1',
                    fontSize: isMajor ? '11px' : '9px',
                    opacity: isMajor ? 0.9 : 0.35,
                  }}
                >
                  {level.name}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

import referencesData from '@data/references.json'

interface RefPoint {
  label: string
  difficulty: number
}

function useReferencePoints() {
  const [points, setPoints] = useState<RefPoint[]>(() => {
    if (typeof window === 'undefined') return referencesData.points
    const saved = localStorage.getItem('ladder-references')
    return saved ? JSON.parse(saved) : referencesData.points
  })

  const save = useCallback((pts: RefPoint[]) => {
    setPoints(pts)
    localStorage.setItem('ladder-references', JSON.stringify(pts))
  }, [])

  const reset = useCallback(() => {
    setPoints(referencesData.points)
    localStorage.removeItem('ladder-references')
  }, [])

  return { points, save, reset }
}

const RightRefInner = forwardRef<HTMLDivElement, { containerHeight: number }>(
  function RightRefInner({ containerHeight }, ref) {
    const { points, save, reset } = useReferencePoints()
    const [editing, setEditing] = useState(false)
    const [newLabel, setNewLabel] = useState('')
    const [newDiff, setNewDiff] = useState('')

    const addPoint = () => {
      const diff = parseFloat(newDiff)
      if (!newLabel.trim() || isNaN(diff)) return
      const updated = [...points, { label: newLabel.trim(), difficulty: diff }]
        .sort((a, b) => b.difficulty - a.difficulty)
      save(updated)
      setNewLabel('')
      setNewDiff('')
    }

    const removePoint = (index: number) => {
      save(points.filter((_, i) => i !== index))
    }

    return (
      <div className="w-[180px] border-l border-gray-200 overflow-hidden shrink-0 flex flex-col" ref={ref}>
        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">参考</span>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-purple-500 hover:text-purple-700"
          >
            {editing ? '完成' : '编辑'}
          </button>
        </div>

        {editing && (
          <div className="px-2 py-1.5 border-b border-gray-100 space-y-1 shrink-0">
            <div className="flex gap-1">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="名称"
                className="flex-1 min-w-0 px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-purple-400"
              />
              <input
                type="number"
                step="0.5"
                value={newDiff}
                onChange={(e) => setNewDiff(e.target.value)}
                placeholder="难度"
                className="w-12 px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={addPoint}
                className="px-1.5 py-0.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
              >
                +
              </button>
            </div>
            <button
              onClick={reset}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              恢复默认
            </button>
          </div>
        )}

        <div className="relative flex-1 overflow-hidden" style={{ height: containerHeight }}>
          {points.map((point, i) => {
            const y = d2y(point.difficulty, containerHeight, DIFFICULTY_RANGE)
            return (
              <div
                key={`${point.label}-${i}`}
                className="absolute left-0 right-0 flex items-center group"
                style={{ top: y - 8 }}
              >
                <div className="w-3 h-px bg-purple-300 mr-1" />
                <span className="text-xs text-gray-600 truncate flex-1">{point.label}</span>
                {editing && (
                  <button
                    onClick={() => removePoint(i)}
                    className="text-xs text-red-400 hover:text-red-600 pr-1 opacity-0 group-hover:opacity-100"
                  >
                    x
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

function TournamentColumn({
  tournament,
  mode,
  containerHeight,
  columnWidth,
  activeFilter,
  rfLnOffset,
  onHover,
  onLeave,
}: {
  tournament: Tournament
  mode: string
  containerHeight: number
  columnWidth: number
  activeFilter: string | null
  rfLnOffset: number
  onHover: (round: Round, x: number, y: number, type?: string) => void
  onLeave: () => void
}) {
  if (mode === 'tournament') {
    const allDiffs = tournament.rounds.flatMap((r) =>
      r.maps.map((m) => (m.type === 'LN' || m.type === 'HB') ? m.difficulty - rfLnOffset : m.difficulty)
    )
    const minDiff = Math.min(...allDiffs)
    const maxDiff = Math.max(...allDiffs)
    const top = difficultyToY(maxDiff, containerHeight, DIFFICULTY_RANGE)
    const bottom = difficultyToY(minDiff, containerHeight, DIFFICULTY_RANGE)
    const height = Math.max(bottom - top, 40)

    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        <div className="text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20">
          {tournament.abbreviation}
        </div>
        <div
          className="round-box absolute left-0 right-0"
          style={{ top: top + 20, height, background: getGradientForRange(minDiff, maxDiff) }}
          onMouseEnter={(e) => onHover(tournament.rounds[tournament.rounds.length - 1], e.clientX, e.clientY)}
          onMouseLeave={onLeave}
        >
          {tournament.abbreviation}
        </div>
      </div>
    )
  }

  if (mode === 'round') {
    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        <div className="text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20">
          {tournament.abbreviation}
        </div>
        {tournament.rounds.map((round) => {
          const adjustedDiffs = round.maps.map((m) =>
            (m.type === 'LN' || m.type === 'HB') ? m.difficulty - rfLnOffset : m.difficulty
          )
          const minDiff = Math.min(...adjustedDiffs)
          const maxDiff = Math.max(...adjustedDiffs)
          const top = difficultyToY(maxDiff, containerHeight, DIFFICULTY_RANGE)
          const bottom = difficultyToY(minDiff, containerHeight, DIFFICULTY_RANGE)
          const boxH = Math.max(bottom - top, 24)
          const isDimmed = activeFilter && !round.maps.some((m) => m.type === activeFilter)

          return (
            <div
              key={round.id}
              className={`round-box absolute left-1 right-1 ${isDimmed ? 'dimmed' : ''}`}
              style={{
                top,
                height: boxH,
                background: getGradientForRange(minDiff, maxDiff),
              }}
              onMouseEnter={(e) => onHover(round, e.clientX, e.clientY)}
              onMouseLeave={onLeave}
            >
              <span className="truncate block w-full text-center">
                {tournament.abbreviation} {round.abbreviation}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // mode === 'type'
  return (
    <div className="relative shrink-0" style={{ width: columnWidth }}>
      <div className="text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20">
        {tournament.abbreviation}
      </div>
      {tournament.rounds.map((round) => {
        const types = getUniqueTypes(round)
        return types.map((type) => {
          const typeMaps = round.maps.filter((m) => m.type === type)
          const typeAvg = typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length
          const adjustedAvg = (type === 'LN' || type === 'HB') ? typeAvg - rfLnOffset : typeAvg
          const y = difficultyToY(adjustedAvg, containerHeight, DIFFICULTY_RANGE)
          const boxH = BOX_HEIGHT_TYPE
          const isDimmed = activeFilter && activeFilter !== type
          const color = getDifficultyColor(adjustedAvg)

          return (
            <div
              key={`${round.id}-${type}`}
              className={`round-box absolute left-1 right-1 ${isDimmed ? 'dimmed' : ''}`}
              style={{
                top: y - boxH / 2,
                height: boxH,
                background: color,
                fontSize: '10px',
              }}
              onMouseEnter={(e) => onHover(round, e.clientX, e.clientY, type)}
              onMouseLeave={onLeave}
            >
              <span className="truncate block w-full text-center">
                {tournament.abbreviation} {round.abbreviation} {type}
              </span>
            </div>
          )
        })
      })}
    </div>
  )
}

function getUniqueTypes(round: Round): string[] {
  const seen = new Set<string>()
  return round.maps
    .map((m) => m.type)
    .filter((t) => {
      if (seen.has(t)) return false
      seen.add(t)
      return true
    })
}
