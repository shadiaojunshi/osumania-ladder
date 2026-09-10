import type { Round } from './types'

// 任务 B:round 分支"一次计算布局、两层渲染"的共享形状。
// 框体层与标题层都从这一份数组取数,禁止两套难度计算。
// rawTop/rawBottom 保留原始几何坐标(任务 D 的超界解释与连接线使用);
// paintTop/paintHeight 是实际绘制用的裁切后坐标。
export interface RoundLayout {
  key: string // tournament.id + round.id + visible index,沿用兼容旧数据的策略
  round: Round
  rawTop: number
  rawBottom: number
  paintTop: number
  paintHeight: number
  minDifficulty: number
  maxDifficulty: number
  dimmed: boolean
}

// 一个标题的最终摆放结果。anchorY 是理想锚点(paintTop + 4),
// labelY 是碰撞处理后实际渲染的 y;moved = true 时需要画连接线指回框顶。
export interface LabelPlacement {
  key: string
  anchorY: number
  labelY: number
  moved: boolean
}

export const LABEL_HEIGHT = 24
export const LABEL_GAP = 28
export const LABEL_ANCHOR_OFFSET = 4

export interface LabelLayoutResult {
  placements: LabelPlacement[]
  // 极端合成数据:标题数量 × LABEL_GAP 大于可用高度时放弃逐个排布,
  // 上层改显"轮次"集合按钮 + 完整列表。正常比赛不会走到。
  degraded: boolean
}

// 确定性标签布局(纯函数,禁 hover 状态/随机数):
// 1. 按原始锚点(paintTop + 4)升序;同锚点用 round.order、稳定 key 打破平局。
// 2. 无碰撞保持原锚点;碰撞时向下按 LABEL_GAP(28px)最小间距排:
//    labelY[i] = max(anchorY[i], labelY[i-1] + LABEL_GAP)。
// 3. 最后一个标题超出可用区底部时钳制到底部,再从末尾向前回推:
//    labelY[i] = min(labelY[i], labelY[i+1] - LABEL_GAP)。
// 只移动标签;框体与标尺坐标不变。仅在数据/列宽/缩放/行高/筛选变化时调用,
// 不在动画每一帧重算。
export function buildRoundLabelPlacements(
  layouts: RoundLayout[],
  availableTop: number,
  availableBottom: number,
): LabelLayoutResult {
  if (layouts.length === 0) return { placements: [], degraded: false }

  const sorted = [...layouts].sort((a, b) => {
    const ay = a.paintTop + LABEL_ANCHOR_OFFSET
    const by = b.paintTop + LABEL_ANCHOR_OFFSET
    if (ay !== by) return ay - by
    const oa = a.round.order ?? 0
    const ob = b.round.order ?? 0
    if (oa !== ob) return oa - ob
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })

  if (sorted.length * LABEL_GAP > availableBottom - availableTop) {
    return { placements: [], degraded: true }
  }

  const ys: number[] = []
  let prev = -Infinity
  for (const item of sorted) {
    const anchor = item.paintTop + LABEL_ANCHOR_OFFSET
    const y = Math.max(anchor, prev + LABEL_GAP)
    ys.push(y)
    prev = y
  }

  const last = ys.length - 1
  if (ys[last] + LABEL_HEIGHT > availableBottom) {
    ys[last] = availableBottom - LABEL_HEIGHT
    for (let i = last - 1; i >= 0; i--) {
      ys[i] = Math.min(ys[i], ys[i + 1] - LABEL_GAP)
    }
  }

  const placements = sorted.map((item, i) => {
    const anchorY = item.paintTop + LABEL_ANCHOR_OFFSET
    const labelY = ys[i]
    return { key: item.key, anchorY, labelY, moved: Math.abs(labelY - anchorY) > 0.5 }
  })
  return { placements, degraded: false }
}
