'use client'

// 「可视化」按钮 —— 自带弹窗状态,可以直接丢进任何列表行里。
// 同一个页面里可能有很多个,所以弹窗只在被点开的那一个实例上挂载。

import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { isUsableBeatmapId } from '@/lib/beatmapIds'
import type { ManiaChartTarget } from '@/lib/osuTextClient'
import { ManiaChartModal } from './ManiaChartModal'

export function ManiaChartButton({
  target,
  heading,
  className,
  label,
}: {
  target: ManiaChartTarget
  /** 弹窗标题;不给就用默认的"谱面可视化" */
  heading?: string
  className?: string
  label?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // 判据用**唯一实现** `isUsableBeatmapId`：占位值 0/1/负数一律不可用（见 beatmapIds.ts）。
  // 这里原来写的是 `> 0`，会把占位值 1 当成真 BID 放行 —— 按钮出现，点开后弹窗里从
  // useEffect 同步抛 OsuTextError(400)（未捕获），而不是显示错误状态。
  const hasId = isUsableBeatmapId(target.beatmapId)
  const hasSlot = Boolean(target.tournamentId && target.roundId && target.slot)
  if (!hasId && !hasSlot) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || 'text-[10px] text-purple-700 dark:text-purple-300 hover:underline'}
        title={t('chart.openTitle')}
      >
        {label || t('chart.open')}
      </button>
      {open && (
        <ManiaChartModal
          target={target}
          heading={heading || t('chart.title')}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
