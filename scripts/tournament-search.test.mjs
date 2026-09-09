import assert from 'node:assert/strict'
import test from 'node:test'
import { createTournamentSearchIndex, searchTournaments } from '../src/lib/tournamentSearch.ts'

const makeTournament = (id, name, maps) => ({
  id, name, abbreviation: id, year: 2026, keyCount: 4,
  rounds: [{ id: 'qf', name: 'Quarterfinals', abbreviation: 'QF', order: 1,
    difficulty: { min: 0, max: 0, average: 0 }, maps }],
})
const maps = [
  { slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 0, name: 'Camellia - Alpha [Another]', beatmapId: 1234, beatmapsetId: 987 },
  { slot: 'LN1', type: 'LN', realType: 'RE', difficulty: 0, name: 'Other Artist - Beta [Release]', beatmapId: 12345, beatmapsetId: 987 },
  { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 0, name: '', beatmapId: 555 },
]
const index = createTournamentSearchIndex([
  makeTournament('ABC', 'Example Cup', maps),
  makeTournament('XYZ', 'Another Tournament', [maps[0]]),
])

test('song metadata finds every containing tournament and the exact round/slot', () => {
  const results = searchTournaments(index, '  ＣＡＭＥＬＬＩＡ   alpha  ')
  assert.deepEqual(results.map((r) => r.tournament.id), ['ABC', 'XYZ'])
  assert.deepEqual(results[0].maps.map(({ round, map }) => [round.id, map.slot]), [['qf', 'RC1']])
  assert.equal(searchTournaments(index, 'release')[0].maps[0].map.slot, 'LN1')
})

test('multiword searches combine tournament and map metadata, but never different maps', () => {
  assert.equal(searchTournaments(index, 'example alpha').length, 1)
  assert.equal(searchTournaments(index, 'alpha beta').length, 0)
  assert.equal(searchTournaments(index, 'no such song').length, 0)
})

test('numeric identifiers match exactly and also find unnamed maps', () => {
  assert.deepEqual(searchTournaments(index, '1234')[0].maps.map(({ map }) => map.slot), ['RC1'])
  assert.equal(searchTournaments(index, '123').length, 0)
  assert.equal(searchTournaments(index, '555')[0].maps[0].map.slot, 'HB1')
  assert.equal(searchTournaments(index, '987')[0].maps.length, 2)
})

test('osu links distinguish a selected beatmap from the whole set', () => {
  for (const query of ['https://osu.ppy.sh/beatmaps/1234', 'https://osu.ppy.sh/b/1234', 'https://osu.ppy.sh/beatmapsets/987#mania/1234']) {
    assert.deepEqual(searchTournaments(index, query)[0].maps.map(({ map }) => map.slot), ['RC1'])
  }
  assert.equal(searchTournaments(index, 'https://osu.ppy.sh/beatmapsets/987')[0].maps.length, 2)
  assert.equal(searchTournaments(index, 'https://example.com/beatmaps/1234').length, 0)
})

test('blank and tournament searches preserve the existing ladder behavior', () => {
  assert.equal(searchTournaments(index, '   ').length, 2)
  const results = searchTournaments(index, 'abc')
  assert.equal(results[0].tournament.id, 'ABC')
  assert.deepEqual(results[0].maps, [])
})
