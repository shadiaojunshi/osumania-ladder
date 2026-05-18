'use client'

import { useViewStore } from '@/stores/viewStore'
import { difficultyToY, getGradientForRange, getDifficultyColor } from '@/lib/difficulty'
import type { Tournament, Round } from '@/lib/types'
import { tournaments } from '@/generated/tournaments'
import { useState, useRef, useCallback, useEffect } from 'react'
import { HoverCard } from './HoverCard'

const DIFFICULTY_RANGE = { min: 0.5, max: 17.5 }
const BOX_HEIGHT_TYPE = 28

const LN_REAL_TYPES = new Set(['RE', 'CO', 'TE', 'DE', 'SW', 'JW', 'IN', 'LNMX', 'OLN'])
const HB_REAL_TYPES = new Set(['HB1', 'HB2', 'HB3', 'HB4', 'HB5', 'OHB'])

function isLnBased(m: { type: string; realType: string }): boolean {
  return m.type === 'LN' || m.type === 'HB' || LN_REAL_TYPES.has(m.realType) || HB_REAL_TYPES.has(m.realType)
}

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
  type?: 'rice' | 'ln' | 'both'
}

const LABEL_HEIGHT = 16

const RightRefInner = forwardRef<HTMLDivElement, { containerHeight: number }>(
  function RightRefInner({ containerHeight }, ref) {
    const { rfLnOffset } = useViewStore()
    const points = referencesData.points as RefPoint[]

    const positioned = points
      .map((point) => {
        const adjustedDiff = point.type === 'ln' ? point.difficulty - rfLnOffset : point.difficulty
        const y = d2y(adjustedDiff, containerHeight, DIFFICULTY_RANGE)
        return { ...point, rawY: y, displayY: y }
      })
      .sort((a, b) => a.rawY - b.rawY)

    for (let i = 1; i < positioned.length; i++) {
      const prev = positioned[i - 1]
      const curr = positioned[i]
      if (curr.displayY - prev.displayY < LABEL_HEIGHT) {
        curr.displayY = prev.displayY + LABEL_HEIGHT
      }
    }

    return (
      <div className="w-[160px] border-l border-gray-200 overflow-hidden shrink-0" ref={ref}>
        <div className="relative" style={{ height: containerHeight }}>
          {positioned.map((point, i) => (
            <div
              key={`${point.label}-${i}`}
              className="absolute left-0 right-0 flex items-center"
              style={{ top: point.displayY - 8 }}
            >
              <div className={`w-3 h-px mr-1 ${point.type === 'ln' ? 'bg-indigo-400' : 'bg-purple-300'}`} />
              <span className={`text-xs truncate ${point.type === 'ln' ? 'text-indigo-600' : 'text-gray-600'}`}>{point.label}</span>
            </div>
          ))}
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
      r.maps.map((m) => isLnBased(m) ? m.difficulty - rfLnOffset : m.difficulty)
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
    const totalRounds = tournament.rounds.length
    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        <div className="text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20">
          {tournament.abbreviation}
        </div>
        {tournament.rounds.map((round, idx) => {
          const adjustedDiffs = round.maps.map((m) =>
            isLnBased(m) ? m.difficulty - rfLnOffset : m.difficulty
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
                zIndex: totalRounds - idx,
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
  const allTypeBoxes: { round: Round; type: string; adjustedAvg: number }[] = []
  for (const round of tournament.rounds) {
    const types = getUniqueTypes(round)
    for (const type of types) {
      const typeMaps = round.maps.filter((m) => m.type === type)
      const typeAvg = typeMaps.reduce((s, m) => s + m.difficulty, 0) / typeMaps.length
      const adjustedAvg = typeMaps.some((m) => isLnBased(m)) ? typeAvg - rfLnOffset : typeAvg
      allTypeBoxes.push({ round, type, adjustedAvg })
    }
  }

  const overlapGroups = new Map<string, number>()
  for (let i = 0; i < allTypeBoxes.length; i++) {
    const a = allTypeBoxes[i]
    for (let j = i + 1; j < allTypeBoxes.length; j++) {
      const b = allTypeBoxes[j]
      if (Math.abs(a.adjustedAvg - b.adjustedAvg) < 0.05) {
        const keyA = `${a.round.id}-${a.type}`
        const keyB = `${b.round.id}-${b.type}`
        if (!overlapGroups.has(keyA)) overlapGroups.set(keyA, 0)
        if (!overlapGroups.has(keyB)) overlapGroups.set(keyB, 1)
      }
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: columnWidth }}>
      <div className="text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20">
        {tournament.abbreviation}
      </div>
      {allTypeBoxes.map(({ round, type, adjustedAvg }) => {
        const y = difficultyToY(adjustedAvg, containerHeight, DIFFICULTY_RANGE)
        const boxH = BOX_HEIGHT_TYPE
        const isDimmed = activeFilter && activeFilter !== type
        const color = getDifficultyColor(adjustedAvg)
        const key = `${round.id}-${type}`
        const overlapIdx = overlapGroups.get(key)
        const hasOverlap = overlapIdx !== undefined

        return (
          <div
            key={key}
            className={`round-box absolute ${isDimmed ? 'dimmed' : ''}`}
            style={{
              top: y - boxH / 2,
              height: boxH,
              background: color,
              fontSize: '10px',
              left: hasOverlap ? (overlapIdx === 0 ? '2px' : '50%') : '4px',
              right: hasOverlap ? (overlapIdx === 0 ? '50%' : '2px') : '4px',
            }}
            onMouseEnter={(e) => onHover(round, e.clientX, e.clientY, type)}
            onMouseLeave={onLeave}
          >
            <span className="truncate block w-full text-center">
              {tournament.abbreviation} {round.abbreviation} {type}
            </span>
          </div>
        )
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
