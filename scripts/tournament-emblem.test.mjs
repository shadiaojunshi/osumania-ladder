import assert from 'node:assert/strict'
import test from 'node:test'
import { emblemPlacement } from '../src/lib/tournamentEmblem.ts'
import { computeRangeGeometry, computeRangeSurface, ORIGIN_Y } from '../src/lib/ladderGeometry.ts'

test('a tall competition keeps its complete emblem inside the visible interval while scrolling', () => {
  for (const boxTop of [150, -400, -1100]) {
    const p = emblemPlacement(boxTop, boxTop + 1600, 140, 100, 700)
    assert.ok(p.visible)
    assert.ok(boxTop + p.center - p.height / 2 >= 100)
    assert.ok(boxTop + p.center + p.height / 2 <= 700)
    assert.equal(p.width, 124)
  }
})
test('short ranges fit rather than crop; narrow columns shrink; offscreen is hidden', () => {
  const short = emblemPlacement(300, 340, 100, 100, 700)
  assert.equal(short.height, 28)
  assert.equal(short.center, 20)
  assert.equal(emblemPlacement(300, 600, 60, 100, 700).width, 44)
  assert.equal(emblemPlacement(800, 1000, 140, 100, 700).visible, false)
})
test('round and tournament overflow share one surface and the same gradient coordinate origin', () => {
  const range = { min: 0.5, max: 16.5 }
  const normal = computeRangeSurface(computeRangeGeometry(15, 8, 3200, range))
  const overflow = computeRangeSurface(computeRangeGeometry(18, 8, 3200, range))
  assert.equal(overflow.top, 32)
  assert.equal(overflow.top + overflow.height, normal.top + normal.height)
  // Background origin = surface top + CSS background-position.
  assert.equal(normal.top + (ORIGIN_Y - normal.top), overflow.top + (ORIGIN_Y - overflow.top))
  const outside = computeRangeSurface(computeRangeGeometry(19, 18, 3200, range))
  assert.equal(outside.height, 32)
  assert.equal(outside.bodyVisible, false)
  assert.equal(outside.visible, true)
})
