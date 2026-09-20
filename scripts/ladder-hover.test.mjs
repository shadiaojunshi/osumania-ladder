import assert from 'node:assert/strict'
import test from 'node:test'
import { updateLadderHover } from '../src/lib/ladderHover.ts'

test('whole tournament: pointer motion and scroll change content without moving the card', () => {
  const tournament = { id: 'test' }
  const first = { tournament, round: { id: 'F' }, x: 100, y: 200 }
  const moved = updateLadderHover(first, { ...first, x: 130, y: 260 }, true)
  assert.equal(moved, first)
  const next = updateLadderHover(moved, { ...first, round: { id: 'QF' }, x: 150, y: 290 }, true)
  assert.equal(next.round.id, 'QF')
  assert.deepEqual([next.x, next.y], [100, 200])
  const other = updateLadderHover(next, { ...next, tournament: { id: 'other' }, x: 400, y: 300 }, true)
  assert.deepEqual([other.x, other.y], [400, 300])
})

test('round/type views retain their existing anchoring; a closed session starts fresh', () => {
  const first = { tournament: { id: 'test' }, round: { id: 'F' }, x: 100, y: 200 }
  const next = { ...first, x: 150, y: 280, type: 'TB', slot: 'SHOWTB' }
  assert.deepEqual(updateLadderHover(first, next, false), next)
  assert.deepEqual(updateLadderHover(null, next, true), next)
})
