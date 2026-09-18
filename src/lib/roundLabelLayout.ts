import type { Round } from './types'

// round 分支"一次计算布局、两层渲染"的共享形状。
// 框体层与（曾经的）标题层都从这一份数组取数，禁止出现第二套难度 → y 映射。
// rawTop/rawBottom 保留原始几何坐标（超界解释与连接线使用）；
// paintTop/paintHeight 是实际绘制用的裁切后坐标。
//
// 注意（R22，2026-09-18）：本文件原先还导出 buildRoundLabelPlacements /
// LabelPlacement / LabelLayoutResult / LABEL_HEIGHT / LABEL_GAP /
// LABEL_ANCHOR_OFFSET —— 那是为"独立标题层"准备的标签防碰撞排布。
// 该标题层已撤回（LadderView.tsx 里已注明"用户已拍板：本视图不做独立标题层"），
// 这套算法没有任何生产调用，只被它自己的测试引用，因此连同
// scripts/round-label-layout.test.mjs 一并删除。
// 需要时用 `git show 419c4b4:src/lib/roundLabelLayout.ts` 取回。
export interface RoundLayout {
  key: string // tournament.id + round.id + visible index，沿用兼容旧数据的策略
  round: Round
  rawTop: number
  rawBottom: number
  paintTop: number
  paintHeight: number
  minDifficulty: number
  maxDifficulty: number
  dimmed: boolean
}
