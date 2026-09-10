import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ORIGIN_Y,
  COLUMN_HEADER_HEIGHT,
  OVERFLOW_BAND_HEIGHT,
  yForDifficulty,
  plotOffsetY,
  computeRangeGeometry,
  computeScalarGeometry,
} from '../src/lib/ladderGeometry.ts'

// 与 src/lib/difficulty.ts 的 difficultyToY 相同的公式(该文件因 @data 别名无法在
// node --test 下导入,这里锁定两处实现一致;改动 difficultyToY 必须同步)。
function referenceDifficultyToY(difficulty, containerHeight, range) {
  const ratio = (range.max - difficulty) / (range.max - range.min)
  return ratio * containerHeight
}

const RANGE = { min: 0.5, max: 16.5 }
const PLOT = 3200

test('layout partitions: origin equals header 32px + overflow band 32px', () => {
  assert.equal(COLUMN_HEADER_HEIGHT, 32)
  assert.equal(OVERFLOW_BAND_HEIGHT, 32)
  assert.equal(ORIGIN_Y, 64)
})

test('yForDifficulty matches the shared linear mapping and the origin offset', () => {
  for (const d of [0.5, 4, 8.5, 12, 16.5]) {
    const expected = ORIGIN_Y + referenceDifficultyToY(d, PLOT, RANGE)
    assert.equal(yForDifficulty(d, PLOT, RANGE), expected)
  }
  // 上界落在原点,下界落在绘图区底。
  assert.equal(yForDifficulty(16.5, PLOT, RANGE), ORIGIN_Y)
  assert.equal(yForDifficulty(0.5, PLOT, RANGE), ORIGIN_Y + PLOT)
  assert.equal(plotOffsetY(16.5, PLOT, RANGE), 0)
})

test('in-range geometry: raw equals paint, no above/below', () => {
  const g = computeRangeGeometry(15, 8, PLOT, RANGE)
  assert.ok(g)
  assert.equal(g.above, false)
  assert.equal(g.below, false)
  assert.equal(g.rawTop, g.paintTop)
  assert.equal(g.rawBottom, g.paintBottom)
  assert.ok(g.paintBottom - g.paintTop >= 0)
})

test('exactly 16.5 is not overflow; 16.51 is', () => {
  const exact = computeRangeGeometry(16.5, 10, PLOT, RANGE)
  assert.ok(exact)
  assert.equal(exact.above, false)
  assert.equal(exact.rawTop, ORIGIN_Y)

  const over = computeRangeGeometry(16.51, 10, PLOT, RANGE)
  assert.ok(over)
  assert.equal(over.above, true)
  assert.ok(over.rawTop < ORIGIN_Y)
  assert.equal(over.paintTop, ORIGIN_Y)
})

test('max above the bound keeps the raw value and clips the paint area', () => {
  const g = computeRangeGeometry(17, 14, PLOT, RANGE)
  assert.ok(g)
  assert.equal(g.above, true)
  // 真实数值保留(不 clamp)。
  assert.equal(g.rawTop, ORIGIN_Y + referenceDifficultyToY(17, PLOT, RANGE))
  assert.ok(g.rawTop < ORIGIN_Y)
  // 绘制区裁到原点。
  assert.equal(g.paintTop, ORIGIN_Y)
  assert.ok(g.paintBottom > ORIGIN_Y)
})

test('a range entirely above the bound paints nothing (height 0) but stays marked', () => {
  const g = computeRangeGeometry(17.5, 17.2, PLOT, RANGE)
  assert.ok(g)
  assert.equal(g.above, true)
  assert.equal(g.paintTop, ORIGIN_Y)
  assert.equal(g.paintBottom, ORIGIN_Y)
  assert.equal(g.paintBottom - g.paintTop, 0)
})

test('below-bound ranges clip at the plot bottom and set the below flag', () => {
  const g = computeRangeGeometry(3, 0.3, PLOT, RANGE)
  assert.ok(g)
  assert.equal(g.below, true)
  assert.equal(g.paintBottom, ORIGIN_Y + PLOT)
  assert.ok(g.rawBottom > ORIGIN_Y + PLOT)
})

test('invalid (non-finite) input returns null instead of NaN', () => {
  assert.equal(computeRangeGeometry(NaN, 5, PLOT, RANGE), null)
  assert.equal(computeRangeGeometry(10, Infinity, PLOT, RANGE), null)
  assert.equal(computeRangeGeometry(10, 5, NaN, RANGE), null)
})

test('scalar geometry: in-range center is untouched', () => {
  const anchor = yForDifficulty(10, PLOT, RANGE)
  const s = computeScalarGeometry(anchor, 28, PLOT)
  assert.equal(s.paintTop, anchor - 14)
  assert.equal(s.paintBottom, anchor + 14)
  assert.equal(s.fullyOutside, false)
})

test('scalar geometry: a center slightly above the bound clips at the origin', () => {
  // 16.55 → 锚点在原点上方 10px,28px 的框下半截仍落在绘图区内(部分可见)。
  const anchor = yForDifficulty(16.55, PLOT, RANGE)
  assert.ok(anchor < ORIGIN_Y)
  const s = computeScalarGeometry(anchor, 28, PLOT)
  assert.equal(s.paintTop, ORIGIN_Y)
  assert.ok(s.paintBottom > ORIGIN_Y)
  assert.equal(s.fullyOutside, false)
})

test('scalar geometry: the CET TB weighted value 16.8667 is fully outside at default size', () => {
  // 现有 TB 算法 16.2 + (17.2-16.2)*2/3 = 16.8667(偏移 0)。
  // 锚点 y = 64 + (16.5-16.8667)/16*3200 ≈ -9.3,框底仍在原点上方 → 无普通框体,
  // 只渲染超界带按钮(与规格"完全在上界外时可以没有普通框体,但必须有边界按钮"一致)。
  const anchor = yForDifficulty(16.8667, PLOT, RANGE)
  assert.ok(anchor < ORIGIN_Y)
  const s = computeScalarGeometry(anchor, 28, PLOT)
  assert.equal(s.fullyOutside, true)
  assert.equal(s.paintTop, ORIGIN_Y)
  assert.equal(s.paintBottom, ORIGIN_Y)
})

test('scalar geometry: fully above the bound reports fullyOutside', () => {
  const anchor = yForDifficulty(17.2, PLOT, RANGE)
  const s = computeScalarGeometry(anchor, 28, PLOT)
  assert.ok(s.paintBottom <= ORIGIN_Y + 2)
  assert.equal(s.fullyOutside, true)
})

test('scalar geometry: a center exactly at the boundary keeps a clickable area', () => {
  const anchor = yForDifficulty(16.5, PLOT, RANGE)
  const s = computeScalarGeometry(anchor, 28, PLOT)
  assert.equal(s.paintTop, ORIGIN_Y)
  assert.equal(s.fullyOutside, false)
  assert.ok(s.paintBottom - s.paintTop >= 14)
})
