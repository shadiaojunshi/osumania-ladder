'use client'

import { useViewStore } from '@/stores/viewStore'
import { difficultyToY, getGradientForRange, getDifficultyColor } from '@/lib/difficulty'
import type { Tournament, Round } from '@/lib/types'
import { tournaments } from '@/generated/tournaments'
import { useState, useRef, useCallback, useEffect } from 'react'
import { HoverCard } from './HoverCard'
import { normalizeRealType } from '@/lib/realType'

const DIFFICULTY_RANGE = { min: 0.5, max: 16.5 }
const BOX_HEIGHT_TYPE = 28

const LN_REAL_TYPES = new Set(['RE', 'CO', 'TE', 'DE', 'JW', 'SW', 'LNMX', 'LNWC', 'LNTC', 'IN', 'LNWL', 'OLN'])
const HB_REAL_TYPES = new Set(['HB1', 'HB2', 'HB3', 'HB4', 'HB5', 'RCmainHB', 'LNmainHB', 'MXHB', 'MNTB', 'OHB'])

function isLnBased(m: { type: string; realType: string }): boolean {
  const realType = normalizeRealType(m.realType)
  return m.type === 'LN' || m.type === 'HB' || LN_REAL_TYPES.has(realType) || HB_REAL_TYPES.has(realType)
}

function getLnDiff(m: { type: string; realType: string; difficulty: number; difficultyLn?: number }): number {
  if (m.type === 'LN') return m.difficulty
  const realType = normalizeRealType(m.realType)
  if (LN_REAL_TYPES.has(realType)) return m.difficultyLn || m.difficulty
  if (m.type === 'HB' || HB_REAL_TYPES.has(realType)) return m.difficultyLn || m.difficulty
  return m.difficulty
}

export function LadderView() {
  const { mode, zoom, columnWidth, rowHeight, rfLnOffset, activeFilter, searchQuery, sortMode, customOrder, hideQualifiers, yearFilter, roundFilter, roundBorderAlways } = useViewStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  const [hoveredRound, setHoveredRound] = useState<{ round: Round; tournament: Tournament; x: number; y: number; type?: string } | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min
  const containerHeight = diffRange * rowHeight * zoom

  const filteredTournaments = tournaments.filter((t) => {
    if (yearFilter !== null && t.year !== yearFilter) return false
    if (roundFilter && !t.rounds.some((r) => r.abbreviation === roundFilter)) return false
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
      const allDiffs = t.rounds.flatMap((r) => r.maps.filter((m) => m.type !== 'TB').map((m) => m.difficulty))
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
              hideQualifiers={hideQualifiers}
              roundFilter={roundFilter}
              roundBorderAlways={roundBorderAlways}
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
import { adjustScaleColorForTheme } from '@/lib/scaleColor'
import { usePrefsStore } from '@/stores/prefsStore'

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

// 检测视口宽度档位。'wide' = >=768,'narrow' = 480-767,'tiny' = <480。
// SSR 时返回 'wide',挂载后即纠正。tiny 给左栏再瘦一档。
type ViewportTier = 'wide' | 'narrow' | 'tiny'
function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>('wide')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tinyMq = window.matchMedia('(max-width: 479px)')
    const narrowMq = window.matchMedia('(max-width: 767px)')
    const handler = () => {
      if (tinyMq.matches) setTier('tiny')
      else if (narrowMq.matches) setTier('narrow')
      else setTier('wide')
    }
    handler()
    tinyMq.addEventListener('change', handler)
    narrowMq.addEventListener('change', handler)
    return () => {
      tinyMq.removeEventListener('change', handler)
      narrowMq.removeEventListener('change', handler)
    }
  }, [])
  return tier
}

const LeftScaleInner = forwardRef<HTMLDivElement, { containerHeight: number }>(
  function LeftScaleInner({ containerHeight }, ref) {
    const { activeFilter, rfLnOffset } = useViewStore()
    const theme = usePrefsStore((s) => s.theme)
    const showOnlyLn = activeFilter === 'LN' || activeFilter === 'HB'
    const showOnlyRf = activeFilter === 'RC' || activeFilter === 'SV'
    const showBoth = !showOnlyLn && !showOnlyRf
    const tier = useViewportTier()
    const tiny = tier === 'tiny'
    const narrow = tier !== 'wide'

    // tiny 档(< 480px)再砍一档:双轴 50px,单轴 32px。左栏只放两列小数字,够看就行。
    const totalWidth = tiny
      ? (showBoth ? 50 : 32)
      : narrow
      ? (showBoth ? 70 : 42)
      : (showBoth ? 110 : 70)

    return (
      <div className={`border-r border-gray-200 dark:border-neutral-800 overflow-hidden shrink-0`} style={{ width: totalWidth }} ref={ref}>
        <div className="relative" style={{ height: containerHeight }}>
          {/* RF scale - show when not filtering LN/HB only */}
          {!showOnlyLn && reformLevels.map((level) => {
            const y = d2y(level.numericValue, containerHeight, DIFFICULTY_RANGE)
            const isMajor = MAJOR_RF.has(level.id)
            const labelW = tiny
              ? (showBoth ? 26 : 32)
              : narrow
              ? (showBoth ? 36 : 42)
              : (showBoth ? 55 : 70)
            const padCls = tiny ? 'pl-0.5' : narrow ? 'pl-1' : 'pl-2'
            const fontMajor = tiny ? '9px' : narrow ? '10px' : '12px'
            const fontMinor = tiny ? '7px' : narrow ? '8px' : '9px'
            return (
              <div
                key={level.id}
                className="absolute flex items-center"
                style={{ top: y - 8, left: 0, width: labelW }}
              >
                <span
                  className={`scale-label ${padCls}`}
                  style={{
                    color: adjustScaleColorForTheme(level.color, theme),
                    fontSize: isMajor ? fontMajor : fontMinor,
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
            const labelW = tiny
              ? (showBoth ? 24 : 32)
              : narrow
              ? (showBoth ? 32 : 42)
              : (showBoth ? 50 : 70)
            const padCls = tiny ? 'pr-0.5' : narrow ? 'pr-1' : 'pr-2'
            const fontMajor = tiny ? '9px' : narrow ? '10px' : '11px'
            const fontMinor = tiny ? '7px' : narrow ? '8px' : '9px'
            return (
              <div
                key={level.id}
                className="absolute flex items-center"
                style={{ top: lnY - 8, right: 0, width: labelW }}
              >
                <span
                  className={`scale-label text-right w-full ${padCls}`}
                  style={{
                    color: '#6366f1',
                    fontSize: isMajor ? fontMajor : fontMinor,
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
      <div className="w-[88px] md:w-[160px] border-l border-gray-200 dark:border-neutral-800 overflow-hidden shrink-0" ref={ref}>
        <div className="relative" style={{ height: containerHeight }}>
          {positioned.map((point, i) => (
            <div
              key={`${point.label}-${i}`}
              className="absolute left-0 right-0 flex items-center"
              style={{ top: point.displayY - 8 }}
            >
              <div className={`w-2 md:w-3 h-px mr-1 shrink-0 ${point.type === 'ln' ? 'bg-indigo-400' : 'bg-purple-300 dark:bg-purple-400'}`} />
              <span className={`text-[10px] md:text-xs truncate ${point.type === 'ln' ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-600 dark:text-neutral-300'}`}>{point.label}</span>
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
  hideQualifiers,
  roundFilter,
  roundBorderAlways,
  onHover,
  onLeave,
}: {
  tournament: Tournament
  mode: string
  containerHeight: number
  columnWidth: number
  activeFilter: string | null
  rfLnOffset: number
  hideQualifiers: boolean
  roundFilter: string | null
  roundBorderAlways: boolean
  onHover: (round: Round, x: number, y: number, type?: string) => void
  onLeave: () => void
}) {
  let visibleRounds = hideQualifiers ? tournament.rounds.filter((r) => !r.isQualifier) : tournament.rounds
  if (roundFilter) visibleRounds = visibleRounds.filter((r) => r.abbreviation === roundFilter)
  if (visibleRounds.length === 0) return null

  if (mode === 'tournament') {
    const allDiffs = visibleRounds.flatMap((r) =>
      r.maps.filter((m) => m.type !== 'TB').map((m) => isLnBased(m) ? getLnDiff(m) - rfLnOffset : m.difficulty)
    ).filter((d) => d > 0)
    // maps 都是 0 时 fallback 到每轮 difficulty.average
    const fallbackAvgs = visibleRounds
      .map((r) => {
        if (r.difficulty.average <= 0) return null
        const allLn = r.maps.filter((m) => m.type !== 'TB').length > 0 &&
          r.maps.filter((m) => m.type !== 'TB').every((m) => isLnBased(m))
        return r.difficulty.average - (allLn ? rfLnOffset : 0)
      })
      .filter((v): v is number => v !== null)
    const pool = allDiffs.length > 0 ? allDiffs : fallbackAvgs
    if (pool.length === 0) return null
    const minDiff = Math.min(...pool)
    const maxDiff = Math.max(...pool)
    const top = difficultyToY(maxDiff, containerHeight, DIFFICULTY_RANGE)
    const bottom = difficultyToY(minDiff, containerHeight, DIFFICULTY_RANGE)
    const height = Math.max(bottom - top, 40)

    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        <div className="text-xs text-center text-gray-500 dark:text-neutral-400 truncate mb-1 font-medium sticky top-0 bg-white dark:bg-neutral-950 z-20">
          {tournament.abbreviation}
        </div>
        <div
          className="round-box absolute left-0 right-0"
          style={{ top: top + 20, height, background: getGradientForRange(minDiff, maxDiff) }}
          onMouseEnter={(e) => onHover(visibleRounds[visibleRounds.length - 1], e.clientX, e.clientY)}
          onMouseLeave={onLeave}
        >
          {tournament.abbreviation}
        </div>
      </div>
    )
  }

  if (mode === 'round') {
    const totalRounds = visibleRounds.length
    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        <div className="text-xs text-center text-gray-500 dark:text-neutral-400 truncate mb-1 font-medium sticky top-0 bg-white dark:bg-neutral-950 z-20">
          {tournament.abbreviation}
        </div>
        {visibleRounds.map((round, idx) => {
          // TB 不参与 round 框的高度/颜色/段位统计(仅红条另外画)。
          // LN 系(含 HB)取 ln 值再减 rfLnOffset,统一投影到 rf 轴上。
          const adjustedDiffs: number[] = []
          for (const m of round.maps) {
            if (m.type === 'TB') continue
            if (isLnBased(m)) {
              const d = getLnDiff(m) - rfLnOffset
              if (d > 0) adjustedDiffs.push(d)
            } else if (m.difficulty > 0) {
              adjustedDiffs.push(m.difficulty)
            }
          }
          const computedMin = adjustedDiffs.length > 0 ? Math.min(...adjustedDiffs) : Infinity
          const computedMax = adjustedDiffs.length > 0 ? Math.max(...adjustedDiffs) : -Infinity
          const allLn = round.maps.filter((m) => m.type !== 'TB').length > 0 &&
            round.maps.filter((m) => m.type !== 'TB').every((m) => isLnBased(m))
          const offsetForStored = allLn ? rfLnOffset : 0
          const storedMin = round.difficulty.min > 0 ? round.difficulty.min - offsetForStored : Infinity
          const storedMax = round.difficulty.max > 0 ? round.difficulty.max - offsetForStored : -Infinity
          const storedAvg = round.difficulty.average > 0 ? round.difficulty.average - offsetForStored : null
          // computed 有值就完全信任(逐图难度是权威),stored 只作 fallback。
          // 避免 stored 存量脏数据(如把 round.difficulty.min 手工写成 8.5 后没重算)
          // 反过来污染前端显示。
          let minDiff = isFinite(computedMin) ? computedMin : storedMin
          let maxDiff = isFinite(computedMax) ? computedMax : storedMax
          // 用户只填平均、没填 min/max,也没逐图填难度时,用 average 撑出一个单点小框
          if ((!isFinite(minDiff) || !isFinite(maxDiff)) && storedAvg !== null) {
            minDiff = storedAvg
            maxDiff = storedAvg
          }
          if (!isFinite(minDiff) || !isFinite(maxDiff)) return null
          // 只填平均 / 方差很小时框太窄不好看:跨度 <0.7 就以中心撑到 ±0.35。
          // center 优先用 stored 平均,否则退到 (min+max)/2。纯视觉,不改数据。
          if (maxDiff - minDiff < 0.7) {
            const center = storedAvg !== null ? storedAvg : (minDiff + maxDiff) / 2
            minDiff = Math.min(minDiff, center - 0.35)
            maxDiff = Math.max(maxDiff, center + 0.35)
          }
          const top = difficultyToY(maxDiff, containerHeight, DIFFICULTY_RANGE)
          const bottom = difficultyToY(minDiff, containerHeight, DIFFICULTY_RANGE)
          const boxH = Math.max(bottom - top, 24)
          const isDimmed = activeFilter && !round.maps.some((m) => m.type === activeFilter)
          const isQualifier = round.isQualifier

          return (
            <div
              // Round ids are legacy data and are not guaranteed unique within a tournament
              // (SSR SF/F both use round-8). Include the visible index so React and the
              // overlap layout keep the two rounds separate.
              key={`${round.id}-${idx}`}
              className={`round-box absolute left-1 right-1 ${isDimmed ? 'dimmed' : ''} ${roundBorderAlways ? 'always-border' : ''}`}
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
  const allTypeBoxes: { round: Round; type: string; adjustedAvg: number; roundKey: string }[] = []
  for (const [roundIdx, round] of visibleRounds.entries()) {
    const roundKey = `${round.id}-${roundIdx}`
    const types = getUniqueTypes(round)
    for (const type of types) {
      const typeMaps = round.maps.filter((m) => m.type === type)
      // TB 特判:RF 用 difficulty,LN 用 difficultyLn(都减偏移),两侧平均得 adjustedAvg。
      // 缺 LN 值时退化到 RF only;站长填 typeDifficulties 时同理两侧平均。
      if (type === 'TB') {
        const rfVals = typeMaps.map((m) => m.difficulty).filter((d) => d > 0)
        const lnVals = typeMaps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0)
        let rfAvg: number | null = null
        let lnAvg: number | null = null
        if (rfVals.length > 0) rfAvg = rfVals.reduce((s, d) => s + d, 0) / rfVals.length
        if (lnVals.length > 0) lnAvg = lnVals.reduce((s, d) => s + d, 0) / lnVals.length
        if (rfAvg === null && lnAvg === null) {
          const td = round.typeDifficulties?.[type]
          if (td?.rf && td.rf > 0) rfAvg = td.rf
          if (td?.ln && td.ln > 0) lnAvg = td.ln
        }
        let adjustedAvg: number | null = null
        if (rfAvg !== null && lnAvg !== null) {
          // 双值:偏 ln 2/3。rf + (ln - rf)*2/3,比简单平均更贴近实际手感。
          const lnAdj = lnAvg - rfLnOffset
          adjustedAvg = rfAvg + (lnAdj - rfAvg) * (2 / 3)
        } else if (rfAvg !== null) {
          adjustedAvg = rfAvg
        } else if (lnAvg !== null) {
          adjustedAvg = lnAvg - rfLnOffset
        }
        if (adjustedAvg === null) continue
        allTypeBoxes.push({ round, type, adjustedAvg, roundKey })
        continue
      }

      // HB 特判:与 TB 同样 rf(difficulty) / ln(difficultyLn) 两侧,偏 ln 2/3。
      // 缺 ln 就退化到纯 rf。fallback 到 typeDifficulties.HB。
      if (type === 'HB') {
        const rfVals = typeMaps.map((m) => m.difficulty).filter((d) => d > 0)
        const lnVals = typeMaps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0)
        let rfAvg: number | null = null
        let lnAvg: number | null = null
        if (rfVals.length > 0) rfAvg = rfVals.reduce((s, d) => s + d, 0) / rfVals.length
        if (lnVals.length > 0) lnAvg = lnVals.reduce((s, d) => s + d, 0) / lnVals.length
        if (rfAvg === null && lnAvg === null) {
          const td = round.typeDifficulties?.[type]
          if (td?.rf && td.rf > 0) rfAvg = td.rf
          if (td?.ln && td.ln > 0) lnAvg = td.ln
        }
        let adjustedAvg: number | null = null
        if (rfAvg !== null && lnAvg !== null) {
          const lnAdj = lnAvg - rfLnOffset
          adjustedAvg = rfAvg + (lnAdj - rfAvg) * (2 / 3)
        } else if (rfAvg !== null) {
          adjustedAvg = rfAvg
        } else if (lnAvg !== null) {
          adjustedAvg = lnAvg - rfLnOffset
        }
        if (adjustedAvg === null) continue
        allTypeBoxes.push({ round, type, adjustedAvg, roundKey })
        continue
      }

      const diffs = typeMaps.map((m) => (isLnBased(m) ? getLnDiff(m) : m.difficulty)).filter((d) => d > 0)
      const typeIsLn = typeMaps.some((m) => isLnBased(m))
      let typeAvg: number | null = null
      if (diffs.length > 0) {
        typeAvg = diffs.reduce((s, d) => s + d, 0) / diffs.length
      } else {
        // 谱面难度全是 0,fallback 到 round.typeDifficulties 站长填的值
        const td = round.typeDifficulties?.[type]
        const stored = typeIsLn ? (td?.ln ?? td?.rf) : (td?.rf ?? td?.ln)
        if (stored && stored > 0) typeAvg = stored
      }
      if (typeAvg === null) continue
      const adjustedAvg = typeIsLn ? typeAvg - rfLnOffset : typeAvg
      allTypeBoxes.push({ round, type, adjustedAvg, roundKey })
    }
  }

  // N-way 重叠分组:把 |adjustedAvg 差| < 0.05 的相邻 box 连成一组,组内每个 box
  // 拿到 (idx, size),渲染时按 idx/size 等分列宽。这样 3/4-way 也不会互相吞键。
  // 旧实现是 2-way pair-wise,3 个挤一起会有两个 idx=1 互相覆盖,hover 显示错的那个。
  const overlapInfo = new Map<string, { idx: number; size: number }>()
  {
    const sorted = allTypeBoxes
      .map((b, i) => ({ ...b, _i: i }))
      .sort((a, b) => a.adjustedAvg - b.adjustedAvg)
    let i = 0
    while (i < sorted.length) {
      let j = i + 1
      while (j < sorted.length && Math.abs(sorted[j].adjustedAvg - sorted[i].adjustedAvg) < 0.05) j++
      const size = j - i
      if (size > 1) {
        for (let k = i; k < j; k++) {
          const key = `${sorted[k].roundKey}-${sorted[k].type}`
          overlapInfo.set(key, { idx: k - i, size })
        }
      }
      i = j
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: columnWidth }}>
      <div className="text-xs text-center text-gray-500 dark:text-neutral-400 truncate mb-1 font-medium sticky top-0 bg-white dark:bg-neutral-950 z-20">
        {tournament.abbreviation}
      </div>
      {allTypeBoxes.map(({ round, type, adjustedAvg, roundKey }) => {
        const y = difficultyToY(adjustedAvg, containerHeight, DIFFICULTY_RANGE)
        const boxH = BOX_HEIGHT_TYPE
        const isDimmed = activeFilter && activeFilter !== type
        const color = getDifficultyColor(adjustedAvg)
        const key = `${roundKey}-${type}`
        const info = overlapInfo.get(key)
        // 重叠时把可用区间(cellWidth - 8px,两侧各留 4px)等分 N,box 变窄不撑总宽。
        const left = info
          ? `calc(4px + (100% - 8px) * ${info.idx / info.size})`
          : '4px'
        const right = info
          ? `calc(4px + (100% - 8px) * ${(info.size - info.idx - 1) / info.size})`
          : '4px'

        return (
          <div
            key={key}
            className={`round-box absolute ${isDimmed ? 'dimmed' : ''}`}
            style={{
              top: y - boxH / 2,
              height: boxH,
              background: color,
              fontSize: '10px',
              left,
              right,
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
