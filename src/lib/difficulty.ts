import type { DanLevel } from './types'
import reformDanData from '@data/scales/reform-dan.json'

const levels = reformDanData.levels as DanLevel[]

export function difficultyToY(difficulty: number, containerHeight: number, range: { min: number; max: number }): number {
  const ratio = (range.max - difficulty) / (range.max - range.min)
  return ratio * containerHeight
}

export function yToDifficulty(y: number, containerHeight: number, range: { min: number; max: number }): number {
  const ratio = y / containerHeight
  return range.max - ratio * (range.max - range.min)
}

export function getDifficultyColor(difficulty: number): string {
  for (let i = 0; i < levels.length - 1; i++) {
    const upper = levels[i]
    const lower = levels[i + 1]
    if (difficulty >= lower.numericValue && difficulty <= upper.numericValue) {
      const t = (difficulty - lower.numericValue) / (upper.numericValue - lower.numericValue)
      return interpolateColor(lower.color, upper.color, t)
    }
  }
  if (difficulty >= levels[0].numericValue) return levels[0].color
  return levels[levels.length - 1].color
}

function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16)
  const g1 = parseInt(color1.slice(3, 5), 16)
  const b1 = parseInt(color1.slice(5, 7), 16)
  const r2 = parseInt(color2.slice(1, 3), 16)
  const g2 = parseInt(color2.slice(3, 5), 16)
  const b2 = parseInt(color2.slice(5, 7), 16)

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function getGradientForRange(minDiff: number, maxDiff: number): string {
  const span = maxDiff - minDiff
  // 跨度极小(几乎单点)才退化成纯色。撑到 ±0.35 的窄框(跨度 0.7)也要有渐变,
  // 否则最小高度的框看起来是死板的一块纯色。
  if (span < 0.15) {
    const midColor = getDifficultyColor((minDiff + maxDiff) / 2)
    return midColor
  }

  const stops: string[] = []
  // 小跨度至少 3 段(顶/中/底两色过渡),大跨度按每格约一段、封顶 8 段。
  const steps = Math.max(3, Math.min(Math.ceil(span), 8))
  for (let i = 0; i <= steps; i++) {
    const diff = maxDiff - (i / steps) * (maxDiff - minDiff)
    const color = getDifficultyColor(diff)
    const pct = Math.round((i / steps) * 100)
    stops.push(`${color} ${pct}%`)
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}
