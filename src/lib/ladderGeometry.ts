// 任务 D:天梯几何的唯一权威。
// 三个视图(tournament/round/type)与任务 B 的标题层、左右标尺全部从这里取 y,
// 不允许各自再写 clamp 或重复偏移。
//
// 布局分区:比赛列头 32px + 顶部超界带 32px + 常规绘图区。
// ORIGIN_Y = 64 是绘图区顶;所有列都预留同样的 64px,防止某列出现超界标记
// 导致它的难度坐标相对其他列整体错开。
//
// 注意:此处的线性映射与 src/lib/difficulty.ts 的 difficultyToY 保持同一公式
// (后者因 @data JSON 别名无法在 node --test 下导入,故此处独立实现,
// 由 scripts/ladder-geometry.test.mjs 锁定两者公式一致,改动需同步)。

export type Bounds = { min: number; max: number }

export interface RangeGeometry {
  // 真实坐标(可能落在 ORIGIN_Y 之外),给解释、hover 和连接线用。
  rawTop: number
  rawBottom: number
  // 裁切到 [ORIGIN_Y, ORIGIN_Y + plotHeight] 后的实际绘制坐标。
  paintTop: number
  paintBottom: number
  // above = maxDifficulty > bounds.max(恰好等于不算超界);
  // below = minDifficulty < bounds.min。
  above: boolean
  below: boolean
}

export const COLUMN_HEADER_HEIGHT = 32
export const OVERFLOW_BAND_HEIGHT = 32
export const ORIGIN_Y = COLUMN_HEADER_HEIGHT + OVERFLOW_BAND_HEIGHT

// 比赛/轮次共用一个连续表面，熔岩头包含在按钮内部；没有残片副框。
export function computeRangeSurface(geometry: RangeGeometry) {
  const bodyVisible = geometry.paintBottom - geometry.paintTop >= 2
  const bodyHeight = Math.max(geometry.paintBottom - geometry.paintTop, 40)
  return {
    top: geometry.above ? COLUMN_HEADER_HEIGHT : geometry.paintTop,
    height: geometry.above ? OVERFLOW_BAND_HEIGHT + (bodyVisible ? bodyHeight : 0) : bodyHeight,
    visible: geometry.above || bodyVisible,
    bodyVisible,
  }
}

// 绘图区内的偏移(0 = 绘图区顶)。与 difficulty.ts 的 difficultyToY 同公式。
export function plotOffsetY(difficulty: number, plotHeight: number, bounds: Bounds): number {
  const ratio = (bounds.max - difficulty) / (bounds.max - bounds.min)
  return ratio * plotHeight
}

// 难度 → 列内容坐标。三视图与左右标尺统一使用。
export function yForDifficulty(difficulty: number, plotHeight: number, bounds: Bounds): number {
  return ORIGIN_Y + plotOffsetY(difficulty, plotHeight, bounds)
}

// 范围 [minDifficulty, maxDifficulty] 的真实/裁切几何。
// 非有限输入返回 null(数据无效,调用方跳过该框),保证不产生 NaN/负高度。
export function computeRangeGeometry(
  maxDifficulty: number,
  minDifficulty: number,
  plotHeight: number,
  bounds: Bounds,
): RangeGeometry | null {
  if (!Number.isFinite(maxDifficulty) || !Number.isFinite(minDifficulty) || !Number.isFinite(plotHeight)) {
    return null
  }
  const rawTop = yForDifficulty(maxDifficulty, plotHeight, bounds)
  const rawBottom = yForDifficulty(minDifficulty, plotHeight, bounds)
  const paintTop = Math.min(Math.max(rawTop, ORIGIN_Y), ORIGIN_Y + plotHeight)
  const paintBottom = Math.min(Math.max(rawBottom, ORIGIN_Y), ORIGIN_Y + plotHeight)
  return {
    rawTop,
    rawBottom,
    paintTop,
    paintBottom,
    above: maxDifficulty > bounds.max,
    below: minDifficulty < bounds.min,
  }
}

// 标量(键型/TB)框的裁切:中心锚点 anchorY,视觉高 boxHeight。
// 只裁绘制区,不 clamp 数值本身(超界信息由调用方用 adjustedAvg 对比 bounds 得出)。
export function computeScalarGeometry(
  anchorY: number,
  boxHeight: number,
  plotHeight: number,
): { paintTop: number; paintBottom: number; fullyOutside: boolean } {
  const rawTop = anchorY - boxHeight / 2
  const rawBottom = anchorY + boxHeight / 2
  const paintTop = Math.min(Math.max(rawTop, ORIGIN_Y), ORIGIN_Y + plotHeight)
  const paintBottom = Math.min(Math.max(rawBottom, ORIGIN_Y), ORIGIN_Y + plotHeight)
  // <2px 视为完全在外:调用方跳过普通框体,只渲染超界带按钮。
  return { paintTop, paintBottom, fullyOutside: paintBottom - paintTop < 2 }
}
