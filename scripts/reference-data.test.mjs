import assert from 'node:assert/strict'
import test from 'node:test'

import { baseLadderRounds, resolveLadder, sampleLadderAtPos } from '../src/lib/referenceData.ts'

const tournament = (id, abbreviation, rounds) => ({
  id,
  name: abbreviation,
  abbreviation,
  keyCount: 4,
  year: 2025,
  rounds,
})

const round = (id, abbreviation, difficulty = 0) => ({
  id,
  name: abbreviation,
  abbreviation,
  order: 1,
  difficulty: { min: difficulty, max: difficulty, average: difficulty },
  maps: difficulty > 0 ? [{ slot: 'RC1', type: 'RC', realType: 'SS', difficulty }] : [],
})

test('base ladder uses an available MWC series when the configured 2025 rounds are removed', () => {
  const tournaments = [
    tournament('osumania-4k-world-cup-2024', 'MWC 4K 2024', [round('qf', 'QF', 10)]),
    tournament('osumania-4k-world-cup-2025', 'MWC 4K 2025', [round('qf', 'QF', 11)]),
  ]
  const entries = [{ tournamentId: 'osumania-4k-world-cup-2024', roundId: 'qf' }]

  assert.deepEqual(baseLadderRounds(tournaments, entries).map((entry) => entry.tournamentId), [
    'osumania-4k-world-cup-2024',
  ])
})

test('base ladder keeps remaining MWC rounds when some pools are replaced', () => {
  const tournaments = [
    tournament('osumania-4k-world-cup-2025', 'MWC 4K 2025', [
      round('qf', 'QF', 11),
      round('gf', 'GF', 13),
    ]),
    tournament('better-fit-cup', 'BFC', [round('sf', 'SF', 12)]),
  ]
  const entries = [
    { tournamentId: 'osumania-4k-world-cup-2025', roundId: 'qf' },
    { tournamentId: 'better-fit-cup', roundId: 'sf' },
    { tournamentId: 'osumania-4k-world-cup-2025', roundId: 'gf' },
  ]

  const rounds = baseLadderRounds(tournaments, entries)
  assert.deepEqual(rounds.map((entry) => entry.roundId), ['qf', 'gf'])
  assert.deepEqual(rounds.map((entry) => entry.pos), [0, 2])
  assert.equal(rounds.every((entry) => !entry.isFallback), true)
})

test('base ladder provides a synthetic GF one round after F when MWC GF is missing', () => {
  const tournaments = [
    tournament('osumania-4k-world-cup-2025', 'MWC 4K 2025', [
      round('f', 'F', 12),
    ]),
  ]
  const entries = [{ tournamentId: 'osumania-4k-world-cup-2025', roundId: 'f' }]

  const rounds = baseLadderRounds(tournaments, entries)
  assert.deepEqual(rounds.map((entry) => entry.roundAbbr), ['F', 'GF'])
  assert.deepEqual(rounds.map((entry) => entry.pos), [0, 1])
  assert.equal(rounds[1].isSynthetic, true)
  assert.notEqual(rounds[1].key, rounds[0].key)
})

test('synthetic MWC GF minus one samples the remaining MWC F difficulty', () => {
  const tournaments = [
    tournament('osumania-4k-world-cup-2025', 'MWC 4K 2025', [
      round('f', 'F', 12),
    ]),
  ]
  const entries = [{ tournamentId: 'osumania-4k-world-cup-2025', roundId: 'f' }]
  const baseRounds = baseLadderRounds(tournaments, entries)
  const gf = baseRounds.find((entry) => entry.roundAbbr === 'GF')
  assert.ok(gf)

  const ladder = resolveLadder(tournaments, entries, 'RC', 'rf')
  assert.equal(sampleLadderAtPos(ladder, gf.pos, -1), 12)
})

test('base ladder falls back to ordinary ladder entries when no MWC round remains', () => {
  const tournaments = [
    tournament('better-fit-cup', 'BFC', [round('qf', 'QF', 9)]),
  ]
  const entries = [{ tournamentId: 'better-fit-cup', roundId: 'qf' }]

  const rounds = baseLadderRounds(tournaments, entries)
  assert.equal(rounds.length, 1)
  assert.equal(rounds[0].tournamentId, 'better-fit-cup')
  assert.equal(rounds[0].isFallback, true)
})

test('invalid ladder references are skipped without destroying fallback coordinates', () => {
  const tournaments = [
    tournament('better-fit-cup', 'BFC', [round('qf', 'QF', 9)]),
  ]
  const entries = [
    { tournamentId: 'missing', roundId: 'qf' },
    { tournamentId: 'better-fit-cup', roundId: 'qf' },
  ]

  const resolved = resolveLadder(tournaments, entries, 'RC', 'rf')
  assert.deepEqual(resolved.map((entry) => entry.pos), [0])
  assert.equal(baseLadderRounds(tournaments, entries)[0].pos, 0)
})
