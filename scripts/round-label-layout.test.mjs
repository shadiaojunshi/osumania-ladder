import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRoundLabelPlacements,
  LABEL_GAP,
  LABEL_HEIGHT,
  LABEL_ANCHOR_OFFSET,
} from '../src/lib/roundLabelLayout.ts'

const layout = (key, paintTop, order = 1) => ({
  key,
  round: { order },
  rawTop: paintTop,
  rawBottom: paintTop + 50,
  paintTop,
  paintHeight: 50,
  minDifficulty: 5,
  maxDifficulty: 8,
  dimmed: false,
})

test('a single label keeps its anchor at paintTop + 4', () => {
  const { placements, degraded } = buildRoundLabelPlacements([layout('a', 100)], 0, 3000)
  assert.equal(degraded, false)
  assert.equal(placements.length, 1)
  assert.equal(placements[0].labelY, 100 + LABEL_ANCHOR_OFFSET)
  assert.equal(placements[0].moved, false)
})

test('two partially overlapping boxes: the lower one is pushed down by the 24px gap', () => {
  const { placements } = buildRoundLabelPlacements(
    [layout('a', 100), layout('b', 104)],
    0,
    3000,
  )
  assert.deepEqual(placements.map((p) => p.labelY), [104, Math.max(108, 104 + LABEL_GAP)])
  assert.equal(placements[0].moved, false)
  assert.equal(placements[1].moved, true)
})

test('two identical tops: round.order breaks the tie deterministically', () => {
  const { placements } = buildRoundLabelPlacements(
    [layout('late', 100, 2), layout('early', 100, 1)],
    0,
    3000,
  )
  // order 小的先排,占据原锚点;order 小的后排被推下。
  assert.equal(placements[0].key, 'early')
  assert.equal(placements[0].labelY, 104)
  assert.equal(placements[1].key, 'late')
  assert.equal(placements[1].labelY, 104 + LABEL_GAP)
})

test('sorting is stable for identical anchors and identical order (key tie-break)', () => {
  const a = layout('a', 100, 1)
  const b = layout('b', 100, 1)
  const first = buildRoundLabelPlacements([a, b], 0, 3000).placements.map((p) => p.key)
  const second = buildRoundLabelPlacements([b, a], 0, 3000).placements.map((p) => p.key)
  assert.deepEqual(first, ['a', 'b'])
  assert.deepEqual(second, ['a', 'b'])
})

test('five tightly packed boxes keep a 24px spacing without collision', () => {
  const tops = [100, 110, 118, 122, 130]
  const { placements } = buildRoundLabelPlacements(
    tops.map((t, i) => layout(`k${i}`, t)),
    0,
    3000,
  )
  for (let i = 1; i < placements.length; i++) {
    assert.ok(
      placements[i].labelY - placements[i - 1].labelY >= LABEL_GAP,
      `labels ${i - 1} and ${i} must be at least ${LABEL_GAP}px apart`,
    )
  }
  assert.equal(placements[0].labelY, 104)
})

test('labels exceeding the bottom are clamped and pushed back up (boxes do not move)', () => {
  // 三个锚点都靠近底部,正向排布会让最后一个超出 availableBottom。
  const { placements } = buildRoundLabelPlacements(
    [layout('a', 900), layout('b', 905), layout('c', 908)],
    0,
    950,
  )
  const ys = placements.map((p) => p.labelY)
  // 最后一个被钳到底部内。
  assert.ok(ys[2] + LABEL_HEIGHT <= 950)
  // 回推后仍保持间距。
  assert.ok(ys[1] + LABEL_GAP <= ys[2])
  assert.ok(ys[0] + LABEL_GAP <= ys[1])
  // 框体坐标不动:锚点仍然是 paintTop + 4。
  assert.deepEqual(placements.map((p) => p.anchorY), [904, 909, 912])
})

test('degrades when label count × 24px exceeds the available height', () => {
  const layouts = Array.from({ length: 10 }, (_, i) => layout(`k${i}`, 10 + i * 3))
  const { placements, degraded } = buildRoundLabelPlacements(layouts, 0, 200)
  assert.equal(degraded, true)
  assert.deepEqual(placements, [])
})

test('no degradation right at the limit (count × 24 == height)', () => {
  const layouts = Array.from({ length: 10 }, (_, i) => layout(`k${i}`, 10 + i * 3))
  const { degraded } = buildRoundLabelPlacements(layouts, 0, 10 * LABEL_GAP)
  assert.equal(degraded, false)
})

test('empty input yields empty placements without degradation', () => {
  const { placements, degraded } = buildRoundLabelPlacements([], 0, 100)
  assert.deepEqual(placements, [])
  assert.equal(degraded, false)
})
