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
  if (maxDiff - minDiff < 1) {
    const midColor = getDifficultyColor((minDiff + maxDiff) / 2)
    return midColor
  }

  const stops: string[] = []
  const steps = Math.min(Math.ceil(maxDiff - minDiff), 8)
  for (let i = 0; i <= steps; i++) {
    const diff = maxDiff - (i / steps) * (maxDiff - minDiff)
    const color = getDifficultyColor(diff)
    const pct = Math.round((i / steps) * 100)
    stops.push(`${color} ${pct}%`)
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}
