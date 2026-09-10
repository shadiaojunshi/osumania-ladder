'use client'

// 轮次图池详情弹窗:框体左键 / 悬浮卡"详细信息" / 搜索结果共用同一详情入口。
// 每张图按槽位排列(RC1 / RC2 / LN1 / TB ...),有 BID 的链到 osu! 谱面页。
// 纯静态数据渲染,零请求 —— 不会碰 Cloudflare 免费额度。

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AnimationEvent as ReactAnimationEvent } from 'react'
import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react'
import type { BeatmapMeta, Round, Tournament } from '@/lib/types'
import { useT } from '@/lib/i18n'

// 槽位排序:RC/SV 按数字, LN/HB 同理, TB/FS-TB 沉底。
const TYPE_ORDER: Record<string, number> = { RC: 0, SV: 1, HB: 2, LN: 3, TB: 9 }
function slotSortKey(slot: string, type: string): number {
  const typeKey = TYPE_ORDER[type] ?? 5
  const num = parseInt(slot.replace(/^.*?(\d+)$/, '$1'), 10)
  return typeKey * 1000 + (Number.isFinite(num) ? num : 99)
}

// 退场动画名:只有这两个动画的 animationend 才触发真正卸载,
// 入场动画(ladder-fade-in / ladder-reveal)的事件会被过滤掉。
const EXIT_ANIMATION_NAMES = new Set(['ladder-fade-out', 'ladder-dismiss'])

export function RoundDetailModal({
  round,
  tournament,
  onClose,
}: {
  round: Round
  tournament: Tournament
  onClose: () => void
}) {
  const t = useT()
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const titleId = useId()

  // 统一关闭入口:动画期间重复触发会被 closingRef 挡住。
  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    // 减少动态效果:立即关闭,不做平移/淡出。
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    setClosing(true)
    // CSS 退场 140ms;200ms 定时器兜底,animationend 丢失也能关闭。
    fallbackTimerRef.current = setTimeout(onClose, 200)
  }, [onClose])

  // 退场动画结束时才真正卸载(父组件清空 detailRound,焦点还原到触发控件)。
  const handleAnimationEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (!closingRef.current || !EXIT_ANIMATION_NAMES.has(e.animationName)) return
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    onClose()
  }, [onClose])

  // 卸载时清理兜底定时器;父组件换轮重开(key 变化强制重挂载)时同样生效,
  // 旧实例的计时器不会误关新弹窗。
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [])

  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) requestClose()
    },
  })
  // Esc / 点击遮罩空白关闭;点击内容不关闭。沿用原有 mousedown 语义。
  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePress: true,
    outsidePressEvent: 'mousedown',
  })
  const { getFloatingProps } = useInteractions([dismiss])

  const sortedMaps = useMemo(
    () =>
      [...round.maps].sort((a, b) => {
        const ka = slotSortKey(a.slot, a.type)
        const kb = slotSortKey(b.slot, b.type)
        return ka !== kb ? ka - kb : a.slot.localeCompare(b.slot)
      }),
    [round.maps],
  )

  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className={`ladder-detail-backdrop flex items-center justify-center ${closing ? 'ladder-detail-closing' : ''}`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 100 }}
        onAnimationEnd={handleAnimationEnd}
      >
        <FloatingFocusManager context={context} initialFocus={closeBtnRef} returnFocus={false} modal>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="ladder-detail-panel bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shadow-xl flex flex-col"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div id={titleId} className="font-semibold text-sm text-gray-900 dark:text-neutral-100 truncate">
                  {tournament.abbreviation} {round.abbreviation} · {round.name}
                </div>
                <div className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                  {t('roundDetail.summary', { count: round.maps.length, min: round.difficulty.min.toFixed(1), max: round.difficulty.max.toFixed(1) })}
                </div>
              </div>
              <button
                ref={closeBtnRef}
                onClick={requestClose}
                className="shrink-0 w-7 h-7 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400"
                aria-label={t('roundDetail.close')}
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-2 divide-y divide-gray-100 dark:divide-neutral-800">
              {sortedMaps.map((m, i) => (
                <MapRow key={`${m.slot}-${i}`} map={m} />
              ))}
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}

function MapRow({ map }: { map: BeatmapMeta }) {
  const t = useT()
  const label = map.name || map.slot
  // 只有有效正整数 BID 才渲染 osu! 链接;没有 BID 的是普通文本,不伪装成可点击。
  const hasBID = typeof map.beatmapId === 'number' && Number.isInteger(map.beatmapId) && map.beatmapId > 0
  const slot = (
    <span className="w-14 shrink-0 font-mono text-xs text-gray-500 dark:text-neutral-400">{map.slot}</span>
  )
  const diff = (
    <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-neutral-500">
      {map.difficulty > 0 ? map.difficulty.toFixed(1) : ''}
    </span>
  )
  if (!hasBID) {
    return (
      <div className="py-1.5 flex items-center gap-2">
        {slot}
        <span className="min-w-0 flex-1 text-sm break-words line-clamp-2 text-gray-800 dark:text-neutral-200">{label}</span>
        {diff}
      </div>
    )
  }
  return (
    <div className="py-1.5 flex items-center gap-2">
      <a
        href={`https://osu.ppy.sh/b/${map.beatmapId}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} · ${t('roundDetail.openOsu')}`}
        title={t('roundDetail.openOsu')}
        className="group flex items-center gap-2 min-w-0 flex-1 rounded text-gray-800 dark:text-neutral-200 hover:text-purple-700 dark:hover:text-purple-300 focus-visible:text-purple-700 dark:focus-visible:text-purple-300 focus-visible:outline-2 focus-visible:outline-purple-500"
      >
        {slot}
        {/* 歌名继承链接颜色;下划线 + hover/focus 加深,保证链接可辨认。 */}
        <span className="min-w-0 flex-1 text-sm break-words line-clamp-2 underline underline-offset-4 decoration-1 group-hover:decoration-2 group-focus-visible:decoration-2">
          {label}
        </span>
        {diff}
      </a>
    </div>
  )
}
