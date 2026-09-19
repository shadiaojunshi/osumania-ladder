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

// ---------- 搜索补全（站长 2026-09-19）----------
// 站长原话:「好像搜索搜比赛的全名也搜不到，你完善完善，我应该搜一个谱面的任何信息都能被搜到」。
// 真因不是匹配不上,而是**整场命中不产出任何结果行**:所有词都落在比赛名/缩写里时,
// rounds/maps 被刻意清空(防刷屏),面板于是一行可点的都没有 —— 55 场里 48 场如此。
// 现在整场命中带 tournamentMatch 标记,面板据此补一行「整场比赛」入口(点开再展开轮次)。

const fieldIndex = createTournamentSearchIndex([
  {
    id: 'four-digit-osumania-world-cup-2023', name: '4 Digit osu!mania World Cup 2023',
    abbreviation: '4DM2023', year: 2023, keyCount: 4, tags: ['4k，chinese'],
    rounds: [
      {
        id: 'qual', name: 'Qualifiers', abbreviation: 'Qual', order: 1,
        difficulty: { min: 0, max: 0, average: 0 },
        maps: [
          { slot: 'SV1', type: 'SV', realType: 'DPSV', difficulty: 0, name: '', beatmapId: 7001, beatmapsetId: 900 },
          { slot: 'RC2', type: 'RC', realType: 'FCJ', difficulty: 0, name: 'Camellia - Gamma [Chord]', beatmapId: 7002, beatmapsetId: 900 },
          { slot: 'RC3', type: 'RC', realType: 'CJ', difficulty: 0, name: 'Camellia - Delta [Jack]', beatmapId: 7003, beatmapsetId: 900 },
        ],
      },
      { id: 'ro16qf', name: 'RO16&QF', abbreviation: 'RO16&QF & SF&F', order: 2, difficulty: { min: 0, max: 0, average: 0 }, maps: [] },
    ],
  },
])

test('搜比赛全名 / 缩写 / 内部 id 都算「整场命中」,面板据此才有行可点', () => {
  for (const query of ['4 Digit osu!mania World Cup 2023', '4DM2023', 'four-digit-osumania-world-cup-2023']) {
    const results = searchTournaments(fieldIndex, query)
    assert.equal(results.length, 1, `「${query}」该只命中这一场`)
    assert.equal(results[0].tournamentMatch, true, `「${query}」应标记为整场命中`)
  }
})

test('面板"有结果却一行都没有"在数据层就不可能 —— 每条结果至少贡献一行', () => {
  for (const query of ['4 Digit osu!mania World Cup 2023', '2023', '4k', 'a', 'LN', 'qual']) {
    for (const r of searchTournaments(fieldIndex, query)) {
      assert.ok(r.tournamentMatch || r.rounds.length > 0 || r.maps.length > 0,
        `「${query}」命中了比赛却没有任何可渲染的行`)
    }
  }
})

test('标点折成空格:osu!mania / osu mania / 全角逗号 tag / 连写 osumania 都搜得到', () => {
  for (const query of ['4 digit osu!mania world cup', '4 digit osu mania world cup']) {
    assert.equal(searchTournaments(fieldIndex, query)[0]?.tournamentMatch, true, `「${query}」`)
  }
  assert.equal(searchTournaments(fieldIndex, '4k，chinese')[0].tournamentMatch, true, '全角逗号 tag')
  // 连写形态靠内部 id 接住(id 就是去标点连写的那份写法)
  assert.equal(searchTournaments(fieldIndex, '4 digit osumania world cup 2023')[0].tournamentMatch, true)
})

test('谱面自身的每一项都能搜到:槽位 / 大类 / 键型 / 歌名 / BID / BSID', () => {
  const slotsOf = (query) => searchTournaments(fieldIndex, query).flatMap((r) => r.maps.map((m) => m.map.slot))
  assert.deepEqual(slotsOf('SV1'), ['SV1'], '槽位')
  assert.ok(slotsOf('SV').includes('SV1'), '大类')
  assert.deepEqual(slotsOf('DPSV'), ['SV1'], '键型代号')
  assert.deepEqual(slotsOf('Chord'), ['RC2'], '歌名片段')
  assert.deepEqual(slotsOf('7003'), ['RC3'], 'BID')
  assert.equal(slotsOf('900').length, 3, 'BSID 命中同 set 的全部图')
})

test('键型代号按词首匹配:搜 CJ 不会把 FCJ 的图一起拖出来', () => {
  // 若 realType 走任意子串,"fcj" 里含 "cj" → FCJ 的图会被误当成 CJ(Chordjack)。
  assert.deepEqual(searchTournaments(fieldIndex, 'CJ').flatMap((r) => r.maps.map((m) => m.map.realType)), ['CJ'])
  assert.deepEqual(searchTournaments(fieldIndex, 'FCJ').flatMap((r) => r.maps.map((m) => m.map.realType)), ['FCJ'])
})

test('整场命中不再顺手吞掉真命中:比赛 id 里含 ln 时,搜 LN 仍要出那张 LN 的图', () => {
  const lnIndex = createTournamentSearchIndex([
    {
      id: 'osumania-ln-tournament-4', name: 'osu!mania LN Tournament 4', abbreviation: 'LN4',
      year: 2026, keyCount: 4,
      rounds: [{
        id: 'r1', name: 'Round 1', abbreviation: 'R1', order: 1, difficulty: { min: 0, max: 0, average: 0 },
        maps: [{ slot: 'SV1', type: 'SV', realType: 'LN', difficulty: 0, name: '' }],
      }],
    },
  ])
  const results = searchTournaments(lnIndex, 'ln')
  assert.equal(results[0].tournamentMatch, true, 'id 里含 ln,算整场命中')
  assert.deepEqual(results[0].maps.map((m) => m.map.slot), ['SV1'], '但那场里 LN 的图不能被一起清掉')
})

test('轮次 id 也进检索,且轮次仍然只认词首匹配', () => {
  assert.deepEqual(searchTournaments(fieldIndex, 'qual').map((r) => r.rounds.map((x) => x.round.id)), [['qual']])
  assert.deepEqual(searchTournaments(fieldIndex, 'ro16qf')[0].rounds.map((x) => x.round.id), ['ro16qf'])
})

test('纯标点查询(折完为空)返回空结果,不能退化成"列出全库"', () => {
  // searchKey 把标点折成空格,于是 `!` / `&` 折完是空串。这与**空白查询**是两回事:
  //   空白   = 没在搜 → 天梯列要原样显示全部(调用方依赖这一点,面板此时不显示)
  //   纯标点 = 搜了,但没有可匹配的词 → 空结果,诚实地说匹配不到
  // 混为一谈的话一句 `!` 会把全库当成无行结果列出来(面板全空 + 天梯列不筛)。
  for (const q of ['!', '!!!', '&', '---', '、、', '!!!&---']) {
    assert.deepEqual(searchTournaments(fieldIndex, q), [], `「${q}」折完为空 → 该是空结果`)
  }
  // 空白查询仍然把整张表原样还给调用方(这是天梯列的契约,别顺手改掉)
  for (const q of ['', '   ', '\t']) {
    const blank = searchTournaments(fieldIndex, q)
    assert.equal(blank.length, 1, `空白查询「${JSON.stringify(q)}」该原样返回全表`)
    assert.equal(blank[0].tournamentMatch, false)
    assert.deepEqual(blank[0].rounds, [])
    assert.deepEqual(blank[0].maps, [])
  }
})

test('标点只是被折掉,夹在词中间时两边照样能各自命中', () => {
  // 折成空格(而不是删掉)就是为了这个:a!b 折成 "a b",两个词仍然各自是完整的词。
  // 直接删掉会粘成 "ab",短词就会产生跨词假命中。
  assert.equal(searchTournaments(fieldIndex, '!!!osu!mania!!!')[0]?.tournamentMatch, true)
  assert.equal(searchTournaments(fieldIndex, '4-digit')[0]?.tournamentMatch, true, '连字符折成空格后仍是词首命中')
})
