'use client'

// 谱面可视化弹窗 —— 包住 ManiaChartSvg,负责取谱面、翻页、缩放与 PNG 导出。
// 关闭动效沿用 RoundDetailModal 的模式:closing 状态 + animationend 按动画名过滤
// + 200ms 兜底定时器 + reduced-motion 立即关闭。

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
import { useT } from '@/lib/i18n'
import { ManiaChartError } from '@/lib/maniaChart'
import {
  chartErrorKind,
  loadManiaChart,
  type ManiaChartPayload,
  type ManiaChartTarget,
} from '@/lib/osuTextClient'
import { ManiaChartSvg } from './ManiaChartSvg'

const EXIT_ANIMATION_NAMES = new Set(['ladder-fade-out', 'ladder-dismiss'])

type Status = 'loading' | 'ready' | 'error'
type ErrorKind = 'noFile' | 'sessionExpired' | 'rateLimited' | 'unavailable' | 'invalid'

export function ManiaChartModal({
  target,
  heading,
  onClose,
}: {
  target: ManiaChartTarget
  heading: string
  onClose: () => void
}) {
  const t = useT()
  const [status, setStatus] = useState<Status>('loading')
  const [payload, setPayload] = useState<ManiaChartPayload | null>(null)
  const [errorKind, setErrorKind] = useState<ErrorKind>('unavailable')
  const [pageIndex, setPageIndex] = useState(1)
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit')
  const [exporting, setExporting] = useState(false)
  const [closing, setClosing] = useState(false)

  const closingRef = useRef(false)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const svgHostRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  const { beatmapId, tournamentId, roundId, slot } = target

  const request = useCallback((retry: boolean) => {
    const generation = ++generationRef.current
    setStatus('loading')
    setErrorKind('unavailable')
    loadManiaChart({ beatmapId, tournamentId, roundId, slot }, retry)
      .then((value) => {
        if (generation !== generationRef.current) return
        setPayload(value)
        setPageIndex(1)
        setStatus('ready')
      })
      .catch((error) => {
        if (generation !== generationRef.current) return
        setPayload(null)
        setErrorKind(error instanceof ManiaChartError ? 'invalid' : chartErrorKind(error))
        setStatus('error')
      })
  }, [beatmapId, tournamentId, roundId, slot])

  useEffect(() => {
    request(false)
    // 换谱面时旧请求的结果必须作废。
    return () => { generationRef.current += 1 }
  }, [request])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    setClosing(true)
    fallbackTimerRef.current = setTimeout(onClose, 200)
  }, [onClose])

  const handleAnimationEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (!closingRef.current || !EXIT_ANIMATION_NAMES.has(e.animationName)) return
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    onClose()
  }, [onClose])

  useEffect(() => () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
  }, [])

  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => { if (!open) requestClose() },
  })
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true, outsidePressEvent: 'mousedown' })
  const { getFloatingProps } = useInteractions([dismiss])

  const page = useMemo(() => (payload ? payload.model.buildPage(pageIndex) : null), [payload, pageIndex])
  const totalPages = payload?.model.totalPages ?? 1

  const downloadName = useMemo(() => {
    if (!payload) return 'beatmap-chart.png'
    const b = payload.model.beatmap
    const raw = `${b.artist} - ${b.title} [${b.version}] p${pageIndex}`
    return `${raw.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120) || 'beatmap'}.png`
  }, [payload, pageIndex])

  const handleDownload = useCallback(async () => {
    const svg = svgHostRef.current?.querySelector('svg')
    if (!svg || !payload || exporting) return
    setExporting(true)
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.removeAttribute('style')
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const width = svg.viewBox.baseVal.width
      const height = svg.viewBox.baseVal.height
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      const markup = new XMLSerializer().serializeToString(clone)
      const objectUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
      try {
        const image = new Image()
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('rasterize failed'))
          image.src = objectUrl
        })
        // 1920 逻辑宽 × 2 倍,导出图够清晰又不至于让 canvas 爆掉。
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas unavailable')
        ctx.fillStyle = '#2A2226'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('encode failed')
        const downloadUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = downloadUrl
        anchor.download = downloadName
        anchor.click()
        URL.revokeObjectURL(downloadUrl)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch {
      // 导出失败不弹错,界面上的按钮会恢复可点。
      setErrorKind('unavailable')
    } finally {
      setExporting(false)
    }
  }, [downloadName, exporting, payload])

  const errorText = t(
    errorKind === 'noFile' ? 'chart.error.noFile'
      : errorKind === 'sessionExpired' ? 'chart.error.sessionExpired'
        : errorKind === 'rateLimited' ? 'chart.error.rateLimited'
          : errorKind === 'invalid' ? 'chart.error.invalid'
            : 'chart.error.unavailable',
  )

  const toolButton = 'px-2.5 py-1 rounded text-xs border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className={`mania-chart-backdrop flex items-center justify-center ${closing ? 'mania-chart-closing' : ''}`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 110 }}
        onAnimationEnd={handleAnimationEnd}
      >
        <FloatingFocusManager context={context} initialFocus={closeBtnRef} returnFocus={false} modal>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="mania-chart-panel bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shadow-xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div id={titleId} className="font-semibold text-sm text-gray-900 dark:text-neutral-100 truncate">
                  {heading}
                </div>
                <div className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5 truncate">
                  {payload
                    ? `${payload.model.beatmap.artist} - ${payload.model.beatmap.title} [${payload.model.beatmap.version}]`
                    : t('chart.loading')}
                </div>
              </div>
              <button
                ref={closeBtnRef}
                onClick={requestClose}
                className="shrink-0 w-7 h-7 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400"
                aria-label={t('chart.close')}
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-2 border-b border-gray-200 dark:border-neutral-800 flex flex-wrap items-center gap-2 shrink-0">
              <span className={`px-2 py-0.5 rounded text-[11px] ${payload?.source === 'r2' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                {payload?.source === 'r2' ? t('chart.source.r2') : t('chart.source.online')}
              </span>
              {payload?.cached && (
                <span className="text-[11px] text-gray-400 dark:text-neutral-500">{t('chart.cached')}</span>
              )}
              <div className="flex-1" />
              {status === 'ready' && (
                <>
                  <button type="button" className={toolButton} onClick={() => setPageIndex((p) => Math.max(1, p - 1))} disabled={pageIndex <= 1}>
                    {t('chart.prev')}
                  </button>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-neutral-400 px-1">
                    {t('chart.pageOf', { page: Math.min(pageIndex, totalPages), total: totalPages })}
                  </span>
                  <button type="button" className={toolButton} onClick={() => setPageIndex((p) => Math.min(totalPages, p + 1))} disabled={pageIndex >= totalPages}>
                    {t('chart.next')}
                  </button>
                  <button
                    type="button"
                    className={toolButton}
                    onClick={() => setZoom((z) => (z === 'fit' ? 'full' : 'fit'))}
                  >
                    {zoom === 'fit' ? t('chart.zoom.full') : t('chart.zoom.fit')}
                  </button>
                  <button type="button" className={toolButton} onClick={() => void handleDownload()} disabled={exporting}>
                    {exporting ? t('chart.downloading') : t('chart.download')}
                  </button>
                </>
              )}
              <button type="button" className={toolButton} onClick={() => request(true)} disabled={status === 'loading'}>
                {t('chart.refresh')}
              </button>
            </div>

            <div className={`flex-1 overflow-auto bg-[#2A2226] flex items-start ${zoom === 'full' ? 'justify-start' : 'justify-center'}`}>
              {status === 'loading' && (
                <div className="flex flex-col items-center gap-3 py-24 text-neutral-400">
                  <div className="w-6 h-6 rounded-full border-2 border-neutral-600 border-t-neutral-200 animate-spin" />
                  <div className="text-sm">{t('chart.loading')}</div>
                  <div className="text-xs text-neutral-500">{t('chart.loadingHint')}</div>
                </div>
              )}
              {status === 'error' && (
                <div className="flex flex-col items-center gap-3 py-24 px-6 text-center">
                  <div className="text-sm text-neutral-300">{errorText}</div>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded text-xs bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                    onClick={() => request(true)}
                  >
                    {t('chart.retry')}
                  </button>
                </div>
              )}
              {status === 'ready' && page && payload && (
                <div ref={svgHostRef} data-chart-host style={zoom === 'full' ? { width: 1920, flex: '0 0 auto' } : { width: '100%' }}>
                  <ManiaChartSvg model={payload.model} page={page} source={payload.source} />
                </div>
              )}
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}
