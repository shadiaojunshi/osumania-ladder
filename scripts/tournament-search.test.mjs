import assert from 'node:assert/strict'
import test from 'node:test'
import { createTournamentSearchIndex, searchTournaments } from '../src/lib/tournamentSearch.ts'

const makeTournament = (id, name, maps, rounds) => ({
  id, name, abbreviation: id, year: 2026, keyCount: 4,
  rounds: rounds ?? [{ id: 'qf', name: 'Quarterfinals', abbreviation: 'QF', order: 1,
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
  assert.deepEqual(searchTournaments(index, '   ')[0].rounds, [], '空查询不产生轮次命中')
  const results = searchTournaments(index, 'abc')
  assert.equal(results[0].tournament.id, 'ABC')
  assert.deepEqual(results[0].maps, [])
  assert.deepEqual(results[0].rounds, [], '整场比赛名命中时不必再列每一轮')
})

// ---------- 「比赛 + 轮次」整体检索（站长 2026-09-19）----------
// 站长原话:"目前的搜索还不支持直接搜如 MMT SF 这一整个轮次这种情况"。
// 过去比赛名只跟比赛名比、谱面名只跟谱面名比,轮次的 name/abbreviation 从没进过检索。

const mmt = createTournamentSearchIndex([
  makeTournament('MMT', 'Mania Master Tournament', maps[0] ? [maps[0]] : [], [
    { id: 'sf', name: 'Semifinals', abbreviation: 'SF', order: 1, difficulty: { min: 0, max: 0, average: 0 }, maps: [maps[0], maps[1]] },
    { id: 'f', name: 'Finals', abbreviation: 'F', order: 2, difficulty: { min: 0, max: 0, average: 0 }, maps: [maps[2]].filter(Boolean) },
  ]),
])

test('搜「比赛缩写 + 轮次缩写」命中整轮,且不附带该轮的每张图', () => {
  const results = searchTournaments(mmt, 'mmt sf')
  assert.equal(results.length, 1)
  assert.deepEqual(results[0].rounds.map(({ round }) => round.id), ['sf'])
  assert.deepEqual(results[0].maps, [], '轮次命中只给一轮;具体图由打开后的图池给')
})

test('轮次检索认轮次全名,并沿用既有的全角/大小写/多空格归一化', () => {
  assert.deepEqual(searchTournaments(mmt, 'ＭＭＴ semifinals')[0].rounds.map(({ round }) => round.id), ['sf'])
  assert.deepEqual(searchTournaments(mmt, '   mmt    finals  ')[0].rounds.map(({ round }) => round.id), ['f'])
  assert.equal(searchTournaments(mmt, 'mania master tournament')[0].rounds.length, 0, '整场比赛名命中仍是比赛级')
})

test('轮次文本用词首匹配:单字母缩写不会把同字母开头的整串轮次名一起拖出来', () => {
  // 搜 "mmt f" 只该出 F 轮;若用任意子串匹配,"Semifinals" 里的 f 会让 SF 也命中。
  assert.deepEqual(searchTournaments(mmt, 'mmt f')[0].rounds.map(({ round }) => round.id), ['f'])
  // "finals" 不能命中 "semifinals"(它在词中间),只能命中 F 轮的全名。
  assert.deepEqual(searchTournaments(mmt, 'mmt finals')[0].rounds.map(({ round }) => round.id), ['f'])
})

test('轮次缩写里带 & 的写法照样能搜到(词首命中在 & 之后)', () => {
  const bracket = createTournamentSearchIndex([
    makeTournament('COEMT', 'COE Mania Tournament', [], [
      { id: 'ro16qf', name: 'RO16&QF', abbreviation: 'RO16&QF & SF&F', order: 1, difficulty: { min: 0, max: 0, average: 0 }, maps: [] },
    ]),
  ])
  assert.deepEqual(searchTournaments(bracket, 'coemt qf').map((r) => r.rounds.map((x) => x.round.id)), [['ro16qf']])
  assert.deepEqual(searchTournaments(bracket, 'coemt sf&f').length, 1)
})

test('轮次检索的短语不能拆到两轮去凑 —— 与谱面同一套契约', () => {
  const twoRounds = createTournamentSearchIndex([
    makeTournament('ZZZ', 'Zeta Cup', [], [
      { id: 'a', name: 'Alpha Round', abbreviation: 'AR', order: 1, difficulty: { min: 0, max: 0, average: 0 }, maps: [] },
      { id: 'b', name: 'Beta Round', abbreviation: 'BR', order: 2, difficulty: { min: 0, max: 0, average: 0 }, maps: [] },
    ]),
  ])
  assert.equal(searchTournaments(twoRounds, 'alpha beta').length, 0, '两个词分属两轮,不许凑成一条命中')
  assert.deepEqual(searchTournaments(twoRounds, 'zeta alpha').map((r) => r.rounds.map((x) => x.round.id)), [['a']])
})

test('osu 链接指向具体谱面,不产生轮次命中', () => {
  const results = searchTournaments(mmt, 'https://osu.ppy.sh/beatmaps/1234')
  assert.deepEqual(results[0].rounds, [])
  assert.deepEqual(results[0].maps.map(({ map }) => map.slot), ['RC1'])
})

test('没有轮次命中时,结果形状与以前一致(rounds 为空数组)', () => {
  const results = searchTournaments(index, 'release')
  assert.deepEqual(results[0].rounds, [])
  assert.equal(results[0].maps[0].map.slot, 'LN1')
})
