'use client'

import { useViewStore } from '@/stores/viewStore'
import { getGradientForRange, getDifficultyColor } from '@/lib/difficulty'
import type { Tournament, Round } from '@/lib/types'
import { tournaments } from '@/generated/tournaments'
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { HoverCard } from './HoverCard'
import { RoundDetailModal } from './RoundDetailModal'
import { countableMaps } from '@/lib/difficultyCount'
// 键型判读与筛选收敛的唯一实现在 lib（集合从键型目录推导，不再硬编码）
import { scopeToFilter, isLnBased, getLnDiff, projectedDifficulties, resolveTitleAvg } from '@/lib/ladderScope'
import { createTournamentSearchIndex, searchTournaments } from '@/lib/tournamentSearch'
import { LadderSearchResults } from './LadderSearchResults'
import { useT } from '@/lib/i18n'
import type { RoundLayout } from '@/lib/roundLabelLayout'
import { COLUMN_HEADER_HEIGHT, OVERFLOW_BAND_HEIGHT, ORIGIN_Y, yForDifficulty, computeRangeGeometry, computeScalarGeometry } from '@/lib/ladderGeometry'

const searchIndex = createTournamentSearchIndex(tournaments)

const DIFFICULTY_RANGE = { min: 0.5, max: 16.5 }
const BOX_HEIGHT_TYPE = 28

export function LadderView() {
  const { mode, zoom, columnWidth, rowHeight, rfLnOffset, activeFilter, searchQuery, sortMode, customOrder, hideQualifiers, yearFilter, roundFilter, roundBorderAlways } = useViewStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  // slot = 被悬浮的那个框的槽位名(多 TB/HB 拆框时才有);有它才能按"那张图的实际难度"出段位。
  const [hoveredRound, setHoveredRound] = useState<{ round: Round; tournament: Tournament; x: number; y: number; type?: string; slot?: string } | null>(null)
  const [detailRound, setDetailRound] = useState<{ round: Round; tournament: Tournament } | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailTriggerRef = useRef<HTMLElement | null>(null)

  const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min
  // 任务 D 统一几何:比赛列头 32px + 顶部超界带 32px + 常规绘图区。
  // 所有难度 y = ORIGIN_Y + 线性映射;三视图与左右标尺共用同一 contentHeight。
  const plotHeight = diffRange * rowHeight * zoom
  const contentHeight = ORIGIN_Y + plotHeight

  const searchResults = useMemo(() => searchTournaments(searchIndex, searchQuery).filter(({ tournament }) => {
    if (yearFilter !== null && tournament.year !== yearFilter) return false
    return !roundFilter || tournament.rounds.some((round) => round.abbreviation === roundFilter)
  }), [searchQuery, yearFilter, roundFilter])
  const filteredTournaments = useMemo(() => searchResults.map(({ tournament }) => tournament), [searchResults])

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
      const allDiffs = t.rounds.flatMap((r) => countableMaps(r.maps).filter((m) => m.type !== 'TB').map((m) => m.difficulty))
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

  const showHover = useCallback((round: Round, tournament: Tournament, x: number, y: number, type?: string, slot?: string) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setHoveredRound({ round, tournament, x, y, type, slot })
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

  // 详情统一入口:框体左键、悬浮卡"详细信息"、搜索结果都走这里。
  // 集中清理待执行的 hover 定时器、清除悬浮态、记录触发控件以便关闭后还原焦点。
  const openRoundDetail = useCallback((tournament: Tournament, round: Round, trigger?: HTMLElement | null) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setHoveredRound(null)
    if (trigger) {
      detailTriggerRef.current = trigger
    } else {
      const active = typeof document !== 'undefined' ? document.activeElement : null
      detailTriggerRef.current = active instanceof HTMLElement ? active : null
    }
    setDetailRound({ tournament, round })
  }, [])

  // 详情退场动画结束后由 RoundDetailModal 调用:卸载弹窗并还原触发控件焦点。
  const closeDetailRound = useCallback(() => {
    setDetailRound(null)
    const trigger = detailTriggerRef.current
    detailTriggerRef.current = null
    if (trigger) {
      // 等弹窗卸载提交完成再还原焦点。
      requestAnimationFrame(() => {
        if (trigger.isConnected) trigger.focus()
      })
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {searchQuery.trim() && (
        <LadderSearchResults
          key={`${searchQuery}/${yearFilter}/${roundFilter}`}
          results={searchResults}
          onSelect={(tournament, round, trigger) => openRoundDetail(tournament, round, trigger)}
        />
      )}
      <div className="flex-1 flex overflow-hidden">
        <LeftScaleInner ref={leftRef} plotHeight={plotHeight} />

        <div
          className="flex-1 overflow-auto"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          <div
            className="relative flex gap-2 px-2"
            style={{
              height: contentHeight,
              minWidth: sortedTournaments.length * (columnWidth + 8),
            }}
          >
            {sortedTournaments.map((tournament) => (
              <TournamentColumn
                key={tournament.id}
                tournament={tournament}
                mode={mode}
                plotHeight={plotHeight}
                columnWidth={columnWidth}
                activeFilter={activeFilter}
                rfLnOffset={rfLnOffset}
                hideQualifiers={hideQualifiers}
                roundFilter={roundFilter}
                roundBorderAlways={roundBorderAlways}
                onHover={(round, x, y, type, slot) => showHover(round, tournament, x, y, type, slot)}
                onLeave={scheduleHide}
                onOpenDetail={(round, trigger) => openRoundDetail(tournament, round, trigger)}
              />
            ))}
          </div>
        </div>

        <RightRefInner ref={rightRef} plotHeight={plotHeight} />

        {hoveredRound && (
          <HoverCard
            round={hoveredRound.round}
            tournament={hoveredRound.tournament}
            hoveredType={hoveredRound.type}
            hoveredSlot={hoveredRound.slot}
            x={hoveredRound.x}
            y={hoveredRound.y}
            onMouseEnter={cancelHide}
            onMouseLeave={() => setHoveredRound(null)}
            onOpenDetail={(trigger) => {
              if (hoveredRound) openRoundDetail(hoveredRound.tournament, hoveredRound.round, trigger)
            }}
          />
        )}

        {detailRound && (
          <RoundDetailModal
            // 换轮重开时强制重新挂载:旧实例的退场计时器随卸载清理,不会误关新弹窗。
            key={`${detailRound.tournament.id}/${detailRound.round.id}`}
            round={detailRound.round}
            tournament={detailRound.tournament}
            onClose={closeDetailRound}
          />
        )}
      </div>
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

const LeftScaleInner = forwardRef<HTMLDivElement, { plotHeight: number }>(
  function LeftScaleInner({ plotHeight }, ref) {
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

    // 任务 D:与三视图共用同一原点。标尺顶部同样预留列头+超界带 64px。
    const contentHeight = ORIGIN_Y + plotHeight

    return (
      <div className={`border-r border-gray-200 dark:border-neutral-800 overflow-hidden shrink-0`} style={{ width: totalWidth }} ref={ref}>
        <div className="relative" style={{ height: contentHeight }}>
          {/* RF scale - show when not filtering LN/HB only */}
          {!showOnlyLn && reformLevels.map((level) => {
            const y = ORIGIN_Y + d2y(level.numericValue, plotHeight, DIFFICULTY_RANGE)
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
            const lnY = ORIGIN_Y + d2y(level.numericValue - rfLnOffset, plotHeight, DIFFICULTY_RANGE)
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

const RightRefInner = forwardRef<HTMLDivElement, { plotHeight: number }>(
  function RightRefInner({ plotHeight }, ref) {
    const { rfLnOffset } = useViewStore()
    const points = referencesData.points as RefPoint[]

    // 任务 D:与三视图共用同一原点与内容高度。
    const contentHeight = ORIGIN_Y + plotHeight

    const positioned = points
      .map((point) => {
        const adjustedDiff = point.type === 'ln' ? point.difficulty - rfLnOffset : point.difficulty
        const y = ORIGIN_Y + d2y(adjustedDiff, plotHeight, DIFFICULTY_RANGE)
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
        <div className="relative" style={{ height: contentHeight }}>
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

// 超界带条目(任务 D):每列收集超出绘图区上界的项,渲染成暗红边界按钮。
interface BandItem {
  key: string
  round: Round
  type?: string
  // 多 TB 拆框时的槽位显示名(如 SHOWTB);缺省回退到 type。
  label?: string
  // 排序用真实难度(降序);标量是 adjustedAvg,范围是 maxDifficulty。
  sortValue: number
  // 标量在按钮文本里显示数值;范围只显示轮次名。
  displayValue: number | null
  dimmed: boolean
}

// 任务 D:列顶超界带内容。单条 → 直接按钮;多条 → "↑ 超界 N" 集合按钮 + 降序列表。
// 每一项点击都走 A 的统一详情入口;hover/focus 显示完整信息(悬浮卡),不只靠红色。
// bordered:跟随"框体常驻边框"开关,给熔岩牌同款白描边,保证与框体接缝白线连续。
function OverflowBand({ items, bordered, onHover, onLeave, onOpenDetail }: {
  items: BandItem[]
  bordered?: boolean
  onHover: (round: Round, x: number, y: number, type?: string, slot?: string) => void
  onLeave: () => void
  onOpenDetail: (round: Round, trigger?: HTMLElement | null) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => {
    if (b.sortValue !== a.sortValue) return b.sortValue - a.sortValue
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
  // 箭头由 JSX 的 .overflow-marker-arrow 元素提供(带闪烁动画);展开列表项用纯文本 "↑ "。
  // 视觉文本不显示"超出标尺"(用户要求):标量项显示数值,范围项只显示轮次名;
  // 完整语义保留在 aria-label 里。
  const describe = (item: BandItem) =>
    item.type
      ? `${item.round.abbreviation} ${item.label ?? item.type} · ${item.sortValue.toFixed(2)}`
      : item.round.abbreviation
  const ariaOf = (item: BandItem) =>
    `${item.round.name}${item.type ? ` ${item.label ?? item.type}` : ''} · ${t('ladder.overflow.beyond')}${
      item.displayValue !== null ? ` (${item.displayValue.toFixed(2)})` : ''
    }`
  const activate = (item: BandItem, x: number, y: number) => onHover(item.round, x, y, item.type, item.label && item.label !== item.type ? item.label : undefined)

  if (items.length === 1) {
    const item = sorted[0]
    return (
      <button
        type="button"
        className={`overflow-marker pointer-events-auto absolute ${bordered ? 'always-border' : ''} ${item.dimmed ? 'marker-dimmed' : ''}`}
        style={{ left: 4, right: 4 }}
        aria-label={ariaOf(item)}
        onMouseEnter={(e) => activate(item, e.clientX, e.clientY)}
        onMouseLeave={onLeave}
        onFocus={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          activate(item, r.left + r.width / 2, r.bottom)
        }}
        onBlur={onLeave}
        onClick={(e) => onOpenDetail(item.round, e.currentTarget)}
      >
        <span aria-hidden className="overflow-marker-arrow">↑</span>
        {describe(item)}
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`overflow-marker overflow-marker-summary pointer-events-auto absolute ${bordered ? 'always-border' : ''}`}
        style={{ left: 4 }}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden className="overflow-marker-arrow">↑</span>
        {t('ladder.overflow.count', { n: items.length })}
      </button>
      {open && (
        <div className="pointer-events-auto absolute left-1 right-1 top-full mt-1 z-50 max-h-48 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {sorted.map((item) => (
            <button
              key={item.key}
              type="button"
              className="block w-full px-2 py-1.5 text-left text-[11px] text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
              onClick={(e) => onOpenDetail(item.round, e.currentTarget)}
            >
              ↑ {describe(item)}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function TournamentColumn({
  tournament,
  mode,
  plotHeight,
  columnWidth,
  activeFilter,
  rfLnOffset,
  hideQualifiers,
  roundFilter,
  roundBorderAlways,
  onHover,
  onLeave,
  onOpenDetail,
}: {
  tournament: Tournament
  mode: string
  plotHeight: number
  columnWidth: number
  activeFilter: string | null
  rfLnOffset: number
  hideQualifiers: boolean
  roundFilter: string | null
  roundBorderAlways: boolean
  onHover: (round: Round, x: number, y: number, type?: string, slot?: string) => void
  onLeave: () => void
  onOpenDetail: (round: Round, trigger?: HTMLElement | null) => void
}) {
  const visibleRounds = useMemo(() => {
    let rs = hideQualifiers ? tournament.rounds.filter((r) => !r.isQualifier) : tournament.rounds
    if (roundFilter) rs = rs.filter((r) => r.abbreviation === roundFilter)
    return rs
  }, [tournament, hideQualifiers, roundFilter])

  // round 分支一次算好几何(坐标取自 ladderGeometry 唯一权威),渲染直接读 rawTop/rawBottom,
  // 避免出现第二处难度→y 映射。用户已拍板:本视图不做独立标题层。
  const roundLayouts = useMemo<RoundLayout[]>(() => {
    if (mode !== 'round') return []
    const layouts: RoundLayout[] = []
    visibleRounds.forEach((round, idx) => {
      // TB 不参与 round 框的高度/颜色/段位统计(仅红条另外画)。
      // LN 系(含 HB)取 ln 值再减 rfLnOffset,统一投影到 rf 轴上。
      // 勾了"不参与难度统计"的图不进框高/颜色(与后台平均值同一口径)。
      // 键型筛选生效时再收窄到该大类 —— 切 RC/LN/HB/TB 时框高与标题高度都会跟着变。
      // 取值口径的唯一实现在 lib/ladderScope(判读集合从键型目录推导,不再硬编码)。
      const roundMaps = countableMaps(round.maps)
      const adjustedDiffs = projectedDifficulties(roundMaps, activeFilter, rfLnOffset)
      const computedMin = adjustedDiffs.length > 0 ? Math.min(...adjustedDiffs) : Infinity
      const computedMax = adjustedDiffs.length > 0 ? Math.max(...adjustedDiffs) : -Infinity
      const allLn = countableMaps(round.maps).filter((m) => m.type !== 'TB').length > 0 &&
        countableMaps(round.maps).filter((m) => m.type !== 'TB').every((m) => isLnBased(m))
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
      if (!isFinite(minDiff) || !isFinite(maxDiff)) return
      // 只填平均 / 方差很小时框太窄不好看:跨度 <0.7 就以中心撑到 ±0.35。
      // center 优先用 stored 平均,否则退到 (min+max)/2。纯视觉,不改数据。
      if (maxDiff - minDiff < 0.7) {
        const center = storedAvg !== null ? storedAvg : (minDiff + maxDiff) / 2
        minDiff = Math.min(minDiff, center - 0.35)
        maxDiff = Math.max(maxDiff, center + 0.35)
      }
      // 任务 D:不 clamp 真实难度,先判超界再裁切绘制区。
      const geometry = computeRangeGeometry(maxDiff, minDiff, plotHeight, DIFFICULTY_RANGE)
      if (!geometry) return
      // 标题高度口径见 lib/ladderScope.resolveTitleAvg(先存量平均、再逐图平均，
      // 两个来源都收窄到当前键型 → 切 RC/LN/HB/TB 时标题位置会跟着变)。
      // 注意这对混合键型轮次是"整轮平均"，若落在框外会被下面的 minY/maxY 夹住。
      const titleAvg = resolveTitleAvg(round, roundMaps, activeFilter, rfLnOffset)
      layouts.push({
        key: `${round.id}-${idx}`,
        round,
        rawTop: geometry.rawTop,
        rawBottom: geometry.rawBottom,
        paintTop: geometry.paintTop,
        paintHeight: geometry.paintBottom - geometry.paintTop,
        minDifficulty: minDiff,
        maxDifficulty: maxDiff,
        avgDifficulty: titleAvg ?? (minDiff + maxDiff) / 2,
        dimmed: !!(activeFilter && !round.maps.some((m) => m.type === activeFilter)),
      })
    })
    return layouts
  }, [mode, visibleRounds, rfLnOffset, plotHeight, activeFilter])

  if (visibleRounds.length === 0) return null

  // 每列共用:列头 z-40(固定预留 32px)。超界带由各视图分支自行渲染,层级见各自分支。
  const columnHeader = (
    <div className="text-xs text-center text-gray-500 dark:text-neutral-400 truncate font-medium sticky top-0 z-40 h-8 flex items-center justify-center bg-white dark:bg-neutral-950">
      {tournament.abbreviation}
    </div>
  )

  if (mode === 'tournament') {
    // 键型筛选生效时，整列的高度与"指针落在哪一轮"的判定都只看该大类 ——
    // 否则会出现"框只有 RC 的高度、但指针按全部图反解难度"的错位。
    const allDiffs = visibleRounds.flatMap((r) =>
      scopeToFilter(countableMaps(r.maps), activeFilter)
        .filter((m) => m.type !== 'TB')
        .map((m) => isLnBased(m) ? getLnDiff(m) - rfLnOffset : m.difficulty)
    ).filter((d) => d > 0)
    // maps 都是 0 时 fallback 到每轮 difficulty.average
    const fallbackAvgs = visibleRounds
      .map((r) => {
        if (r.difficulty.average <= 0) return null
        const allLn = countableMaps(r.maps).filter((m) => m.type !== 'TB').length > 0 &&
          countableMaps(r.maps).filter((m) => m.type !== 'TB').every((m) => isLnBased(m))
        return r.difficulty.average - (allLn ? rfLnOffset : 0)
      })
      .filter((v): v is number => v !== null)
    const pool = allDiffs.length > 0 ? allDiffs : fallbackAvgs
    if (pool.length === 0) return null
    const minDiff = Math.min(...pool)
    const maxDiff = Math.max(...pool)
    // 任务 D:统一几何,去掉旧 `top + 20` 专用偏移;超界时裁切并给红边。
    const geometry = computeRangeGeometry(maxDiff, minDiff, plotHeight, DIFFICULTY_RANGE)
    if (!geometry) return null
    const lastRound = visibleRounds[visibleRounds.length - 1]
    const height = Math.max(geometry.paintBottom - geometry.paintTop, 40)
    const surfaceTop = geometry.above ? COLUMN_HEADER_HEIGHT : geometry.paintTop
    const bodyVisible = geometry.paintBottom - geometry.paintTop >= 2
    const surfaceHeight = geometry.above ? OVERFLOW_BAND_HEIGHT + (bodyVisible ? height : 0) : height
    // 悬浮/点击按"指针所在高度"决定指哪一轮:整个比赛只有一个框(最低→最高),
    // 固定绑最后一轮会让任何位置都显示决赛(站长反馈)。这里把指针 y 反解成难度,
    // 再取难度区间离它最近的那一轮。
    // plotHeight 是整段难度区间的高度,perUnit = 每 1 点难度多少像素
    const perUnit = plotHeight / (DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min)
    const roundRanges = visibleRounds.map((round) => {
      const diffs = scopeToFilter(countableMaps(round.maps), activeFilter)
        .filter((m) => m.type !== 'TB')
        .map((m) => (isLnBased(m) ? getLnDiff(m) - rfLnOffset : m.difficulty))
        .filter((d) => d > 0)
      return diffs.length > 0
        ? { round, min: Math.min(...diffs), max: Math.max(...diffs) }
        : { round, min: null, max: null }
    })
    const pickRoundAtPointer = (clientY: number, rectTop: number, rectHeight: number) => {
      if (perUnit <= 0) return lastRound
      const ratio = rectHeight > 0 ? (clientY - rectTop) / rectHeight : 0
      const yContent = surfaceTop + ratio * surfaceHeight
      const diff = Math.min(
        DIFFICULTY_RANGE.max,
        Math.max(DIFFICULTY_RANGE.min, DIFFICULTY_RANGE.max - (yContent - ORIGIN_Y) / perUnit),
      )
      let best: { round: Round; min: number | null; max: number | null } | null = null
      let bestDistance = Infinity
      for (const entry of roundRanges) {
        if (entry.min === null || entry.max === null) continue
        const distance = diff < entry.min ? entry.min - diff : diff > entry.max ? diff - entry.max : 0
        if (distance < bestDistance) {
          bestDistance = distance
          best = entry
        }
      }
      return best ? best.round : lastRound
    }

    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        {columnHeader}
        {/* 熔岩头和范围框共用一个按钮、背景和外边框，避免接缝及两套 hover。 */}
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
          {(geometry.above || bodyVisible) && (
            <button
              type="button"
              className={`round-box absolute ${geometry.above ? 'left-1 right-1 overflow-range' : 'left-0 right-0'} ${geometry.below ? 'overflow-cropped-bottom' : ''} ${roundBorderAlways ? 'always-border' : ''}`}
              style={{ top: surfaceTop, height: surfaceHeight, paddingTop: geometry.above && bodyVisible ? OVERFLOW_BAND_HEIGHT : undefined, background: getGradientForRange(minDiff, maxDiff) }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                onHover(pickRoundAtPointer(e.clientY, rect.top, rect.height), e.clientX, e.clientY)
              }}
              onMouseLeave={onLeave}
              onFocus={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                onHover(lastRound, rect.left + rect.width / 2, rect.bottom)
              }}
              onBlur={onLeave}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                onOpenDetail(e.detail === 0 ? lastRound : pickRoundAtPointer(e.clientY, rect.top, rect.height), e.currentTarget)
              }}
            >
              {geometry.above && <span aria-hidden className="overflow-range-heat" />}
              <span className="relative">
                {geometry.above && <span aria-hidden className="overflow-marker-arrow mr-1">↑</span>}
                {tournament.abbreviation}
              </span>
              {geometry.below && <span aria-hidden className="overflow-edge-bottom" />}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'round') {
    const totalRounds = roundLayouts.length
    return (
      <div className="relative shrink-0" style={{ width: columnWidth }}>
        {columnHeader}
        {/* 框体层:z-10 独立层叠上下文(把 hover 白边限制在本层内)。
            框内文字改 sr-only,可见标题由上面的 z-30 标题层绘制(不被其他框遮挡)。
            超界框不裁切/不标红,伸出顶部的部分由 sticky 列头自然遮挡。 */}
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
          {roundLayouts.map((l, i) => {
            return (
              <button
                type="button"
                key={l.key}
                className={`round-box absolute left-1 right-1 ${l.dimmed ? 'dimmed' : ''} ${roundBorderAlways ? 'always-border' : ''}`}
                style={{
                  // 直接取 layout 里已算好的真实坐标;最小高度由 CSS 的
                  // .round-box min-height 兜底,这里不再重复 clamp。
                  top: l.rawTop,
                  height: l.rawBottom - l.rawTop,
                  background: getGradientForRange(l.minDifficulty, l.maxDifficulty),
                  zIndex: totalRounds - i,
                }}
                onMouseEnter={(e) => onHover(l.round, e.clientX, e.clientY)}
                onMouseLeave={onLeave}
                onClick={(e) => onOpenDetail(l.round, e.currentTarget)}
              >
                <span className="sr-only">{tournament.abbreviation} {l.round.abbreviation}</span>
              </button>
            )
          })}
        </div>
        {/* 标题层:z-30,纯文本、不吃指针(点击/悬浮照常落到框体)。
            高度取该轮的**平均难度**(不是框的几何中心),水平+垂直居中于该高度,
            画在框体之上,所以不会被任何轮次框盖住。
            夹两道:列头下方(否则超界框的标题会被吸顶列头压住)、框底之上。 */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>
          {roundLayouts.map((l) => {
            if (l.dimmed) return null
            const desired = yForDifficulty(l.avgDifficulty, plotHeight, DIFFICULTY_RANGE)
            const minY = Math.max(l.rawTop + 6, 40)
            const maxY = Math.max(l.rawBottom - 6, minY)
            const centerY = Math.min(Math.max(desired, minY), maxY)
            return (
              <span
                key={l.key}
                className="round-box-text absolute left-1 right-1"
                style={{ top: centerY, transform: 'translateY(-50%)' }}
              >
                {tournament.abbreviation} {l.round.abbreviation}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  // mode === 'type'
  // label 是框面显示名:多 TB 轮按 slot 拆框时为槽位名(SHOWTB 等),其余等于 type。
  const allTypeBoxes: { round: Round; type: string; label: string; adjustedAvg: number; roundKey: string }[] = []
  for (const [roundIdx, round] of visibleRounds.entries()) {
    const roundKey = `${round.id}-${roundIdx}`
    const types = getUniqueTypes(round)
    for (const type of types) {
      const typeMaps = countableMaps(round.maps).filter((m) => m.type === type)
      // TB 特判:RF 用 difficulty,LN 用 difficultyLn(都减偏移),两侧平均得 adjustedAvg。
      // 缺 LN 值时退化到 RF only;站长填 typeDifficulties 时同理两侧平均。
      // 一轮多张 TB 型图(如 TB + SHOWTB)时按 slot 各自成框,沿用同一加权(用户要求);
      // 单张时保持聚合显示 "TB"。全部无有效值才退化到 typeDifficulties 单框。
      if (type === 'TB') {
        const weighted = (rfAvg: number | null, lnAvg: number | null): number | null => {
          if (rfAvg !== null && lnAvg !== null) {
            // 双值:偏 ln 2/3。rf + (ln - rf)*2/3,比简单平均更贴近实际手感。
            const lnAdj = lnAvg - rfLnOffset
            return rfAvg + (lnAdj - rfAvg) * (2 / 3)
          }
          if (rfAvg !== null) return rfAvg
          if (lnAvg !== null) return lnAvg - rfLnOffset
          return null
        }
        const avgOf = (maps: typeof typeMaps): number | null => {
          const rfVals = maps.map((m) => m.difficulty).filter((d) => d > 0)
          const lnVals = maps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0)
          const rfAvg = rfVals.length > 0 ? rfVals.reduce((s, d) => s + d, 0) / rfVals.length : null
          const lnAvg = lnVals.length > 0 ? lnVals.reduce((s, d) => s + d, 0) / lnVals.length : null
          return weighted(rfAvg, lnAvg)
        }
        let pushed = 0
        if (typeMaps.length > 1) {
          const bySlot = new Map<string, typeof typeMaps>()
          for (const m of typeMaps) {
            const slot = m.slot || 'TB'
            const arr = bySlot.get(slot)
            if (arr) arr.push(m)
            else bySlot.set(slot, [m])
          }
          for (const [slot, maps] of bySlot) {
            const adjustedAvg = avgOf(maps)
            if (adjustedAvg === null) continue
            allTypeBoxes.push({ round, type, label: slot, adjustedAvg, roundKey })
            pushed++
          }
        } else {
          const adjustedAvg = avgOf(typeMaps)
          if (adjustedAvg !== null) {
            allTypeBoxes.push({ round, type, label: type, adjustedAvg, roundKey })
            pushed++
          }
        }
        if (pushed === 0) {
          const td = round.typeDifficulties?.[type]
          const rfAvg = td?.rf && td.rf > 0 ? td.rf : null
          const lnAvg = td?.ln && td.ln > 0 ? td.ln : null
          const adjustedAvg = weighted(rfAvg, lnAvg)
          if (adjustedAvg !== null) allTypeBoxes.push({ round, type, label: type, adjustedAvg, roundKey })
        }
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
        allTypeBoxes.push({ round, type, label: type, adjustedAvg, roundKey })
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
      allTypeBoxes.push({ round, type, label: type, adjustedAvg, roundKey })
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
          const key = `${sorted[k].roundKey}-${sorted[k].label}`
          overlapInfo.set(key, { idx: k - i, size })
        }
      }
      i = j
    }
  }

  // 任务 D:type 标量先由现有算法得出 adjustedAvg,再判超界;不把真实难度 clamp 到 16.5。
  const bandItems: BandItem[] = []
  for (const b of allTypeBoxes) {
    if (b.adjustedAvg > DIFFICULTY_RANGE.max) {
      bandItems.push({
        key: `${b.roundKey}-${b.label}-band`,
        round: b.round,
        type: b.type,
        label: b.label,
        sortValue: b.adjustedAvg,
        displayValue: b.adjustedAvg,
        dimmed: !!(activeFilter && activeFilter !== b.type),
      })
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: columnWidth }}>
      {columnHeader}
      {/* 超界带:与 tournament 分支一致——随内容滚动不 sticky,z-35 低于列头,滚过头被列头盖住。 */}
      <div className="absolute top-8 left-0 right-0 h-8 pointer-events-none" style={{ zIndex: 35 }}>
        <OverflowBand items={bandItems} bordered={roundBorderAlways} onHover={onHover} onLeave={onLeave} onOpenDetail={onOpenDetail} />
      </div>
      {/* 框体层:z-10 独立层叠上下文。 */}
      <div className="absolute inset-0" style={{ zIndex: 10 }}>
        {allTypeBoxes.map(({ round, type, label, adjustedAvg, roundKey }) => {
          // 超界标量完全由顶部熔岩按钮承担；裁切后的残片会被 min-height 撑成第二个框。
          if (adjustedAvg > DIFFICULTY_RANGE.max) return null
          const anchorY = yForDifficulty(adjustedAvg, plotHeight, DIFFICULTY_RANGE)
          const boxH = BOX_HEIGHT_TYPE
          const scalar = computeScalarGeometry(anchorY, boxH, plotHeight)
          const isDimmed = activeFilter && activeFilter !== type
          const color = getDifficultyColor(adjustedAvg)
          const key = `${roundKey}-${label}`
          const info = overlapInfo.get(key)
          // 重叠时把可用区间(cellWidth - 8px,两侧各留 4px)等分 N,box 变窄不撑总宽。
          const left = info
            ? `calc(4px + (100% - 8px) * ${info.idx / info.size})`
            : '4px'
          const right = info
            ? `calc(4px + (100% - 8px) * ${(info.size - info.idx - 1) / info.size})`
            : '4px'
          // 完全在绘图区外:不渲染普通框体,只留超界带按钮(above 时)。
          if (scalar.fullyOutside) return null
          const paintHeight = scalar.paintBottom - scalar.paintTop

          return (
            <button
              type="button"
              key={key}
              className={`round-box absolute ${isDimmed ? 'dimmed' : ''} ${roundBorderAlways ? 'always-border' : ''} ${adjustedAvg < DIFFICULTY_RANGE.min ? 'overflow-cropped-bottom' : ''}`}
              style={{
                top: scalar.paintTop,
                // 最小点击高度只改绘制外观,不改变锚点。
                height: Math.max(paintHeight, boxH),
                background: color,
                fontSize: '10px',
                left,
                right,
              }}
              onMouseEnter={(e) => onHover(round, e.clientX, e.clientY, type, label && label !== type ? label : undefined)}
              onMouseLeave={onLeave}
              // type 分支左键打开该框所属轮次的详情(不改变原始数据)。
              onClick={(e) => onOpenDetail(round, e.currentTarget)}
            >
              <span className="truncate block w-full text-center">
                {tournament.abbreviation} {round.abbreviation} {label}
              </span>
              {adjustedAvg < DIFFICULTY_RANGE.min && <span aria-hidden className="overflow-edge-bottom" />}
            </button>
          )
        })}
      </div>
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
