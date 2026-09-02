'use client'

// 轮次图池详情弹窗:从悬浮卡的"详细信息"打开。
// 每张图按槽位排列(RC1 / RC2 / LN1 / TB ...),有 BID 的链到 osu! 谱面页。
// 纯静态数据渲染,零请求 —— 不会碰 Cloudflare 免费额度。

import { useEffect, useMemo, useRef } from 'react'
import type { BeatmapMeta, Round, Tournament } from '@/lib/types'
import { useT } from '@/lib/i18n'

// 槽位排序:RC/SV 按数字, LN/HB 同理, TB/FS-TB 沉底。
const TYPE_ORDER: Record<string, number> = { RC: 0, SV: 1, HB: 2, LN: 3, TB: 9 }
function slotSortKey(slot: string, type: string): number {
  const typeKey = TYPE_ORDER[type] ?? 5
  const num = parseInt(slot.replace(/^.*?(\d+)$/, '$1'), 10)
  return typeKey * 1000 + (Number.isFinite(num) ? num : 99)
}

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
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-neutral-100 truncate">
              {tournament.abbreviation} {round.abbreviation} · {round.name}
            </div>
            <div className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
              {t('roundDetail.summary', { count: round.maps.length, min: round.difficulty.min.toFixed(1), max: round.difficulty.max.toFixed(1) })}
            </div>
          </div>
          <button
            onClick={onClose}
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
    </div>
  )
}

function MapRow({ map }: { map: BeatmapMeta }) {
  const t = useT()
  const label = map.name || map.slot
  const content = (
    <>
      <span className="w-14 shrink-0 font-mono text-xs text-gray-500 dark:text-neutral-400">{map.slot}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-neutral-200">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-neutral-500">
        {map.difficulty > 0 ? map.difficulty.toFixed(1) : ''}
      </span>
    </>
  )
  return (
    <div className="py-1.5 flex items-center gap-2">
      {map.beatmapId ? (
        <a
          href={`https://osu.ppy.sh/b/${map.beatmapId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 min-w-0 flex-1 hover:text-purple-600 dark:hover:text-purple-300"
          title={t('roundDetail.openOsu')}
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-2 min-w-0 flex-1">{content}</div>
      )}
    </div>
  )
}
