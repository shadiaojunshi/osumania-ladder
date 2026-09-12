'use client'

// 「可视化」按钮 —— 自带弹窗状态,可以直接丢进任何列表行里。
// 同一个页面里可能有很多个,所以弹窗只在被点开的那一个实例上挂载。

import { useState } from 'react'
import { useT } from '@/lib/i18n'
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
  const hasId = Number.isSafeInteger(target.beatmapId) && (target.beatmapId as number) > 0
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
