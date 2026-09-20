// 图标按当前可见框体居中，完整 contain。位置不依赖难度标题或统一固定高度。
export function emblemPlacement(boxTop: number, boxBottom: number, boxWidth: number, viewportTop: number, viewportBottom: number) {
  const top = Math.max(boxTop, viewportTop)
  const bottom = Math.min(boxBottom, viewportBottom)
  const height = Math.max(0, bottom - top)
  return {
    center: (top + bottom) / 2 - boxTop,
    width: Math.max(0, Math.min(208, boxWidth - 16)),
    height: Math.max(0, Math.min(192, height - 12)),
    visible: height > 16 && boxWidth > 32,
  }
}
