import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { analyzeImportedMapIds, findPendingMaps } from '../src/lib/tournamentDiagnostics.ts'
import { classifySetConflict, extractRate } from '../src/lib/mapConflictDetection.ts'

const require = createRequire(import.meta.url)
const { formatSources } = require('./source-label.js')

const tournament = (id, abbreviation, rounds) => ({
  id, name: abbreviation, abbreviation, keyCount: 4, year: 2026, rounds,
})
const round = (id, abbreviation, maps) => ({
  id, name: abbreviation, abbreviation, order: 1, difficulty: { min: 0, max: 0, average: 0 }, maps,
})
const map = (slot, beatmapId, realType = 'SS') => ({ slot, type: 'RC', realType, difficulty: 0, beatmapId })

test('import diagnostics catch identical rounds before metadata lookup, including invalid numeric BIDs', () => {
  const diagnostics = analyzeImportedMapIds([
    { groupIndex: 0, mapIds: ['999999991', '999999992'] },
    { groupIndex: 1, mapIds: ['999999992', '999999991'] },
  ], [])
  assert.deepEqual(diagnostics.identicalRounds, [{ firstGroupIndex: 0, secondGroupIndex: 1, mapCount: 2 }])
  assert.equal(diagnostics.crossRoundMaps.length, 2)
})

test('import diagnostics warn when at least half of imported unique BIDs belong to one tournament', () => {
  const existing = tournament('known', 'KNOWN', [round('qf', 'QF', [map('RC1', 1), map('RC2', 2), map('RC3', 3)])])
  const diagnostics = analyzeImportedMapIds([{ groupIndex: 0, mapIds: ['1', '2', '9', '10'] }], [existing])
  assert.equal(diagnostics.duplicateTournaments.length, 1)
  assert.equal(diagnostics.duplicateTournaments[0].ratio, 0.5)
})

test('pending scan can exclude PDSV from submit warnings', () => {
  const input = tournament('new', 'NEW', [round('qf', 'QF', [
    map('RC1', 1, 'PDRC'),
    { ...map('SV1', 2, 'PDSV'), type: 'SV' },
  ])])
  assert.deepEqual(findPendingMaps(input, { excludeSv: true }).map((item) => item.realType), ['PDRC'])
})

test('same-set conflicts distinguish explicit rate variants from uncertain set reuse', () => {
  assert.equal(extractRate('Song [Challenge 1,1x]'), 1.1)
  assert.equal(classifySetConflict([
    { beatmapId: 1, realType: 'SS', name: 'Song [1.0x]' },
    { beatmapId: 2, realType: 'JS', name: 'Song [1.1x]' },
  ]), 'rateSet')
  assert.equal(classifySetConflict([
    { beatmapId: 1, realType: 'SS', name: 'Song [Hard]' },
    { beatmapId: 2, realType: 'JS', name: 'Song [Insane]' },
  ]), 'setReview')
})

test('known MMT set variants reproduce the intended history classifications', () => {
  assert.equal(classifySetConflict([
    { beatmapId: 5396437, realType: 'HB2', name: 'ariiol - Sorry, I\'m daria emotional [[1.0CCCD_16]]' },
    { beatmapId: 5711523, realType: 'HB2', name: 'ariiol - Sorry, I\'m daria emotional [[1.1999A_16]]' },
  ]), null)
  assert.equal(classifySetConflict([
    { beatmapId: 5309392, realType: 'PDRC', name: 'buelow - Revolver (Sped Up Ver.) [Femme Fatale 1.05x]' },
    { beatmapId: 5309394, realType: 'SS', name: 'buelow - Revolver (Sped Up Ver.) [Femme Fatale 1.1x]' },
  ]), 'rateSet')
})

test('source labels collapse cross-round reuse within one tournament', () => {
  assert.equal(formatSources([
    { tournamentAbbr: 'XXX', roundAbbr: 'QF', slot: 'RC1' },
    { tournamentAbbr: 'XXX', roundAbbr: 'SF', slot: 'RC1' },
  ], false), 'XXX QF&SF')
})

test('source labels retain slots when reuse stays within one round', () => {
  assert.equal(formatSources([
    { tournamentAbbr: 'XXX', roundAbbr: 'QF', slot: 'RC1' },
    { tournamentAbbr: 'XXX', roundAbbr: 'QF', slot: 'LN1' },
  ], false), 'XXX QF RC1 & XXX QF LN1')
})
