import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { analyzeImportedMapIds, findDuplicateRoundMaps, findPendingMaps } from '../src/lib/tournamentDiagnostics.ts'
import { classifySetConflict, extractRate, extractVersionName } from '../src/lib/mapConflictDetection.ts'
import { isMatchingTournamentId, isValidTournamentId } from '../functions/api/_lib/tournamentId.ts'

const require = createRequire(import.meta.url)
const { formatSources } = require('./source-label.js')

const tournament = (id, abbreviation, rounds) => ({
  id, name: abbreviation, abbreviation, keyCount: 4, year: 2026, rounds,
})
const round = (id, abbreviation, maps) => ({
  id, name: abbreviation, abbreviation, order: 1, difficulty: { min: 0, max: 0, average: 0 }, maps,
})
const map = (slot, beatmapId, realType = 'SS') => ({ slot, type: 'RC', realType, difficulty: 0, beatmapId })

test('batch tournament IDs accept the existing case-sensitive filename format', () => {
  const id = 'gbc-2025-spring-A-and-B'
  assert.equal(isValidTournamentId(id), true)
  assert.equal(isMatchingTournamentId(id, { id }), true)
  assert.equal(isMatchingTournamentId(id, { id: id.toLowerCase() }), false)
  assert.equal(isValidTournamentId('../main'), false)
  assert.equal(isValidTournamentId('folder/name'), false)
})

test('import diagnostics catch identical rounds before metadata lookup, including invalid numeric BIDs', () => {
  const diagnostics = analyzeImportedMapIds([
    { groupIndex: 0, mapIds: ['999999991', '999999992'] },
    { groupIndex: 1, mapIds: ['999999992', '999999991'] },
  ], [])
  assert.deepEqual(diagnostics.identicalRounds, [{ firstGroupIndex: 0, secondGroupIndex: 1, mapCount: 2 }])
  assert.equal(diagnostics.crossRoundMaps.length, 2)
})

test('import diagnostics catch identical rounds from raw rows when no BID is available', () => {
  const diagnostics = analyzeImportedMapIds([
    { groupIndex: 0, mapIds: [], mapKeys: ['raw:artist - song [hard]', 'raw:artist - song [insane]'] },
    { groupIndex: 1, mapIds: [], mapKeys: ['raw:artist - song [insane]', 'raw:artist - song [hard]'] },
  ], [])
  assert.deepEqual(diagnostics.identicalRounds, [{ firstGroupIndex: 0, secondGroupIndex: 1, mapCount: 2 }])
})

test('import diagnostics warn when at least half of imported unique BIDs belong to one tournament', () => {
  // R33 起这里的 BID 必须用真实量级的值：`analyzeImportedMapIds` 比较的是
  // "JSON 里已有的 BID"，占位 ID（`<=1`，见 lib/beatmapIds.ts）不进比较集 ——
  // 拿 1/2/3 当夹具会被判读滤掉，测的就不是重叠率本身了。
  const existing = tournament('known', 'KNOWN', [round('qf', 'QF', [
    map('RC1', 5000001), map('RC2', 5000002), map('RC3', 5000003),
  ])])
  const diagnostics = analyzeImportedMapIds([{ groupIndex: 0, mapIds: ['5000001', '5000002', '9999991', '9999992'] }], [existing])
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

test('duplicate-round scan identifies reused maps within one tournament', () => {
  const duplicate = findDuplicateRoundMaps([
    tournament('reuse', 'REUSE', [
      round('qf', 'QF', [map('RC1', 123)]),
      round('sf', 'SF', [map('RC1', 123)]),
    ]),
  ])
  assert.deepEqual(duplicate.map(({ tournamentAbbr, beatmapId, rounds }) => ({ tournamentAbbr, beatmapId, rounds })), [
    { tournamentAbbr: 'REUSE', beatmapId: 123, rounds: ['QF', 'SF'] },
  ])
})

test('duplicate-round scan falls back to map metadata when BID is absent', () => {
  const duplicate = findDuplicateRoundMaps([
    tournament('reuse-no-bid', 'REUSE-NB', [
      round('qf', 'QF', [{ ...map('RC1', undefined), name: 'Artist - Song [Hard]', difficulty: 10 }]),
      round('sf', 'SF', [{ ...map('RC1', undefined), name: 'Artist - Song [Hard]', difficulty: 10 }]),
    ]),
  ])
  assert.equal(duplicate.length, 1)
  assert.equal(duplicate[0].beatmapId, undefined)
  assert.equal(duplicate[0].rounds.join('&'), 'QF&SF')
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

test('rate extraction also reads bare decimals (no "x", no 倍速)', () => {
  // 真实案例：GBC 2026 IRL 的 QF/RC7 与 GBC 2024 Spring 的 F/RC6 是同一个 set
  // （1517816）下的两张图，Version 直接写成 `[1.05]` / `[1.1]` —— **既没有 x 也没有
  // 「倍速」字样**。旧实现三条模式全都够不到，于是两张明显是倍速变体的图被判成
  // 「同 set 待核对」，而不是可识别的 rateSet。
  assert.equal(extractRate('Fusq x Moe Shop ft. Hentai Dude - Perfume x Superstar [1.05]'), 1.05)
  assert.equal(extractRate('Fusq x Moe Shop ft. Hentai Dude - Perfume x Superstar [1.1]'), 1.1)
  assert.equal(classifySetConflict([
    { beatmapId: 3107132, realType: 'DP', name: 'Fusq x Moe Shop - Perfume x Superstar [1.05]' },
    { beatmapId: 3107133, realType: 'STC', name: 'Fusq x Moe Shop - Perfume x Superstar [1.1]' },
  ]), 'rateSet', '修好之后这两张该被认成同 set 的倍速变体')

  // 歌名里的 `x` 是连接词（`A x B`），不是倍速记号。
  assert.equal(extractRate('A x B - Song'), 1)
  // 结尾裸小数：**要求带小数点**，否则 `Song 2` / `Vol 3` 会被当成倍速。
  assert.equal(extractRate('Artist - Title 0.95'), 0.95)
  assert.equal(extractRate('Artist - Title 2'), 1)
  // 方括号里是版本名而不是数字时不瞎猜。
  assert.equal(extractRate('Song [Hard]'), 1)
  assert.equal(extractRate('Song [[1.0CCCD_16]]'), 1, '复合版本名里的数字不是倍速')
  // 超出 0.5~2.5 的数字不是倍速。
  assert.equal(extractRate('Song [2024]'), 1)
  assert.equal(extractRate('Song [0.25]'), 1)
})

test('version name comes from the trailing bracket; slot-shaped names have none', () => {
  assert.equal(extractVersionName('Fusq x Moe Shop ft. Hentai Dude - Perfume x Superstar [1.05]'), '1.05')
  assert.equal(extractVersionName('Song [Hard]'), 'Hard')
  // 取**最后一组**：曲名里也可能带方括号。
  assert.equal(extractVersionName('Artist - Song [Lunatic] [1.1]'), '1.1')
  // 最内层方括号 —— 真实数据里有 `[[1.0CCCD_16]]` 这种复合版本名。
  assert.equal(extractVersionName("ariiol - Sorry, I'm daria emotional [[1.0CCCD_16]]"), '1.0CCCD_16')
  // 历史手传的数据里 name 就是槽位记号（ASC 2025 有 80/88 张如此）—— 没有版本名。
  assert.equal(extractVersionName('SV1'), null)
  assert.equal(extractVersionName('[RC7]'), null)
  assert.equal(extractVersionName('Artist - Song'), null)
  assert.equal(extractVersionName(''), null)
  assert.equal(extractVersionName(undefined), null)
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

// ---------------------------------------------------------------------------
// 反复报"同一场比赛的不同轮次复用了同一张图"的**误报**（2026-09-19）
// ---------------------------------------------------------------------------
// 身份键在 name 非空时用「大类 + 曲名 + 难度」，但全库有 227 张图的 name 根本不是曲名，
// 而是槽位记号（SV1 / ln3 / RC8 / TB1 …）。「同大类 + 同槽位名 + 同难度」在不同轮次必然
// 相撞 —— 4DM2023 的 SV1 就是这么在 7 个轮次里被报出来的。占位名不是身份。

test('R34：槽位名当 name 用时不作为身份，退到 BID；没有可用 BID 就当没有身份', async () => {
  const { mapIdentityKey } = await import('../src/lib/tournamentDiagnostics.ts')
  // 槽位记号（大小写、带不带空格都算）：忽略 name，用 BID。
  assert.equal(mapIdentityKey({ slot: 'SV1', type: 'SV', name: 'SV1', difficulty: 0, beatmapId: 3970874 }), 'bid:3970874')
  assert.equal(mapIdentityKey({ slot: 'LN3', type: 'LN', name: ' ln3 ', difficulty: 8, beatmapId: 5234260 }), 'bid:5234260')
  // 槽位名 + 没有可用 BID → 没有身份（过去会返回 meta:SV|sv1|0| 并跨轮互撞）。
  assert.equal(mapIdentityKey({ slot: 'SV1', type: 'SV', name: 'SV1', difficulty: 0 }), null)
  assert.equal(mapIdentityKey({ slot: 'ST1', type: 'SV', name: 'SV1', difficulty: 0 }), null, 'name 与自己的槽位名不一致也算占位记号')

  // 真实曲名照旧当身份（不受影响）。
  assert.equal(
    mapIdentityKey({ slot: 'RC1', type: 'RC', name: 'Camellia - ANOMALY (Cut Ver.) [BEYOND]', difficulty: 12 }),
    'meta:RC|camellia - anomaly (cut ver.) [beyond]|12|',
  )
  // 纯字母的短名不算占位（要求至少一位数字），避免误伤 MU 这类短曲名。
  assert.equal(mapIdentityKey({ slot: 'RC1', type: 'RC', name: 'MU', difficulty: 9 }), 'meta:RC|mu|9|')
})

test('R34：4DM2023 式跨轮同名槽位不再被报成"同一张图被复用"', () => {
  const svMap = (beatmapId) => ({ slot: 'SV1', type: 'SV', realType: 'PDSV', name: 'SV1', difficulty: 0, beatmapId })
  const warnings = findDuplicateRoundMaps([
    tournament('4dm2023', '4DM2023', [
      round('qual', 'Qual', [svMap(3958440)]),
      round('qf', 'QF', [svMap(3990217)]),
      round('sf', 'SF', [svMap(3999979)]),
      round('gf', 'GF', [svMap(4021087)]),
    ]),
  ])
  assert.deepEqual(warnings, [], '每轮各自的 SV1 是不同文件，不该报重复')
})

test('R34：真正的跨轮复用（同 BID / 同真实曲名）仍然要报', () => {
  const reused = findDuplicateRoundMaps([
    // name 是槽位记号 → 被忽略，身份退到 BID：两轮的 SV1 用的是**同一个**文件 → 必须报。
    tournament('reuse-bid', 'REUSE-BID', [
      round('sf', 'SF', [{ slot: 'SV1', type: 'SV', realType: 'PDSV', name: 'SV1', difficulty: 0, beatmapId: 3960212 }]),
      round('f', 'F', [{ slot: 'SV1', type: 'SV', realType: 'PDSV', name: 'SV1', difficulty: 0, beatmapId: 3960212 }]),
    ]),
    // 没有 BID，但真实曲名 + 难度逐字相同 → 走 meta 那条道，也要报。
    tournament('reuse-meta', 'REUSE-META', [
      round('qf', 'QF', [{ slot: 'LN2', type: 'LN', realType: 'DE', name: 'rejection - Hypnotize [1.05x]', difficulty: 7.08 }]),
      round('gf', 'GF', [{ slot: 'LN2', type: 'LN', realType: 'DE', name: 'rejection - Hypnotize [1.05x]', difficulty: 7.08 }]),
    ]),
  ])
  assert.deepEqual(warnings_abbr(reused), ['REUSE-BID', 'REUSE-META'])

  const byBid = reused.find((w) => w.tournamentAbbr === 'REUSE-BID')
  assert.equal(byBid.beatmapId, 3960212)
  assert.deepEqual(byBid.rounds, ['SF', 'F'])
  assert.deepEqual(byBid.slots, ['SV1', 'SV1'])

  // 已知边界（刻意不动）：name 非空且是**真实曲名**时，身份就只看名字+难度，不看 BID。
  // 所以"同 BID 但两轮曲名写法不同"不会报 —— 这是 R33 定下的契约（名字优先）。
  const sameBidDifferentName = findDuplicateRoundMaps([
    tournament('name-wins', 'NAME-WINS', [
      round('sf', 'SF', [{ slot: 'RC1', type: 'RC', realType: 'SS', name: 'Camellia - X [A]', difficulty: 12, beatmapId: 5000001 }]),
      round('f', 'F', [{ slot: 'RC1', type: 'RC', realType: 'SS', name: 'Camellia - X [B]', difficulty: 12, beatmapId: 5000001 }]),
    ]),
  ])
  assert.deepEqual(sameBidDifferentName, [], '名字优先于 BID，这是刻意保留的契约（不是本次要改的误报）')
})

test('R34：轮次按 id 判重，缩写相同（都叫 F）的两轮不会被合成一轮而漏报', () => {
  const warnings = findDuplicateRoundMaps([
    tournament('same-abbr', 'SAME-ABBR', [
      round('final-a', 'F', [{ slot: 'RC1', type: 'RC', realType: 'SS', name: 'X - Song [A]', difficulty: 12 }]),
      round('final-b', 'F', [{ slot: 'RC1', type: 'RC', realType: 'SS', name: 'X - Song [A]', difficulty: 12 }]),
    ]),
  ])
  assert.equal(warnings.length, 1, '缩写相同的两个轮次仍然算跨轮复用')
  assert.deepEqual(warnings[0].rounds, ['F'], '给人看的列表按显示名去重（不输出 "F & F"）')
  assert.deepEqual(warnings[0].slots, ['RC1', 'RC1'], '两个轮次都在 slots 里，说明确实认出两轮')

  // 对照：同一轮里两张同身份的图**不算**跨轮复用。
  const single = findDuplicateRoundMaps([
    tournament('one-round', 'ONE-ROUND', [
      round('qf', 'QF', [
        { slot: 'RC1', type: 'RC', realType: 'SS', name: 'X - Song [A]', difficulty: 12 },
        { slot: 'RC2', type: 'RC', realType: 'SS', name: 'X - Song [A]', difficulty: 12 },
      ]),
    ]),
  ])
  assert.deepEqual(single, [], '同一轮内重复不算跨轮复用')
})

function warnings_abbr(warnings) {
  return warnings.map((w) => w.tournamentAbbr)
}
