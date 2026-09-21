import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// 「按键型浏览谱面」的纯逻辑。
//
// 这段逻辑原本内联在 `src/components/admin/RealTypeMapBrowser.tsx` 的 useMemo 里，
// 抽到 `src/lib/mapBrowserRows.ts` 是为了让**公开的反馈页**也能用同一份
// （公开页不能 import 带 OAuth/KV 的后台组件）。抽出必须行为一致，所以这里：
//   ① 用真实全库数据把**行生成**与**筛选/排序**和旧内联实现逐行比对；
//   ② 单独钉住几条容易被改坏的规则：override 先于筛选、排序三键、占位 ID 不当身份。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  BROWSER_CATEGORY_ORDER,
  browserTournamentsWithDrafts,
  browserOptionGroups,
  browserRowTarget,
  buildMapBrowserRows,
  conversionGroupsFor,
  duplicateGroupsOf,
  duplicateRoundIndexOf,
  matchingTournamentsFor,
  realTypeCounts,
  visibleBrowserRows,
} = await import('../src/lib/mapBrowserRows.ts')
const { categoryOfRaw, REAL_TYPES } = await import('../src/lib/realTypeCatalog.ts')
const { findDuplicateRoundMaps, mapIdentityKey } = await import('../src/lib/tournamentDiagnostics.ts')
const { normalizeRealType } = await import('../src/lib/realType.ts')

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url))

const tournaments = readdirSync(`${DATA_DIR}tournaments`)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${DATA_DIR}tournaments/${f}`, 'utf-8')))

// 后台浏览器传的是"带重复索引"的行；顶层就用同一口径，后面的用例才对得上。
const rows = buildMapBrowserRows(tournaments, duplicateRoundIndexOf(tournaments))

test('归包回显跟随草稿：修改、取消、刷新恢复、清空与保存均不回到旧构建值', () => {
  const original = structuredClone(tournaments[0])
  const saved = structuredClone(original)
  saved.rounds[0].maps[0].packAs = 'SS'
  const draft = structuredClone(saved)
  draft.rounds[0].maps[0].packAs = 'ORC'
  const value = (data) => buildMapBrowserRows(data)[0].packAs
  assert.equal(value(browserTournamentsWithDrafts([original], { [saved.id]: saved }, { [draft.id]: { data: draft } })), 'ORC')
  const restored = JSON.parse(JSON.stringify({ [draft.id]: { data: draft } }))
  assert.equal(value(browserTournamentsWithDrafts([original], {}, restored)), 'ORC')
  delete draft.rounds[0].maps[0].packAs
  assert.equal(value(browserTournamentsWithDrafts([original], { [saved.id]: saved }, { [draft.id]: { data: draft } })), undefined)
  assert.equal(value(browserTournamentsWithDrafts([original], { [saved.id]: saved }, {})), 'SS')
  assert.equal(value(browserTournamentsWithDrafts([original], { [draft.id]: draft }, {})), undefined)
})

function countSlots() {
  let n = 0
  for (const t of tournaments) for (const r of t.rounds || []) n += (r.maps || []).length
  return n
}

// ---------------------------------------------------------------------------
// 行生成：与旧内联实现逐行比对
// ---------------------------------------------------------------------------

test('行生成与旧内联实现逐行一致（fields + key 全等）', () => {
  const duplicateMapIndex = duplicateRoundIndexOf(tournaments)
  const legacyRows = tournaments.flatMap((tournament) =>
    (tournament.rounds || []).flatMap((round, roundIndex) =>
      (round.maps || []).map((map, index) => ({
        key: `${tournament.id}:${round.id}:${roundIndex}:${map.slot}:${map.beatmapId || index}`,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        roundName: round.name,
        roundAbbr: round.abbreviation || round.name,
        roundId: round.id,
        roundIndex,
        roundOrder: round.order,
        slot: map.slot,
        type: map.type,
        realType: normalizeRealType(map.realType),
        name: map.name,
        difficulty: map.difficulty,
        difficultyLn: map.difficultyLn,
        beatmapId: map.beatmapId,
        category: (['RC', 'LN', 'HB', 'SV', 'TB'].includes(map.type) ? map.type : 'SPECIAL'),
        duplicateRounds: (() => {
          const mapKey = mapIdentityKey(map)
          return mapKey ? duplicateMapIndex.get(`${tournament.id}:${mapKey}`) : undefined
        })(),
      })),
    ),
  )

  assert.equal(rows.length, legacyRows.length, '行数不一致')
  assert.ok(rows.length > 4900, `全库槽位只有 ${rows.length} 行，数据可能没读全`)
  assert.equal(rows.length, countSlots(), '行数应等于全库槽位总数')

  const nextByKey = new Map(rows.map((r) => [r.key, r]))
  for (const legacy of legacyRows) {
    const row = nextByKey.get(legacy.key)
    assert.ok(row, `缺少行 ${legacy.key}`)
    for (const field of Object.keys(legacy)) {
      assert.deepEqual(row[field], legacy[field], `${legacy.key} 的 ${field} 不一致`)
    }
    assert.equal('duplicateRounds' in row, legacy.duplicateRounds !== undefined, `${legacy.key} 的 duplicateRounds 存在性不一致`)
  }
  assert.equal(nextByKey.size, rows.length, '行 key 必须唯一（否则 React 会重挂整行）')
})

test('大类判定与目录一致：标准五类之外归 SPECIAL', () => {
  for (const row of rows) {
    const expected = ['RC', 'LN', 'HB', 'SV', 'TB'].includes(row.type) ? row.type : 'SPECIAL'
    assert.equal(row.category, expected, `${row.key} type=${row.type}`)
  }
  const specials = rows.filter((r) => r.category === 'SPECIAL')
  assert.ok(specials.length > 0, '全库应该有跨大类的 SPECIAL 槽位')
  assert.equal(BROWSER_CATEGORY_ORDER.includes('SPECIAL'), false, 'SPECIAL 不该出现在大类分组顺序里')
  assert.equal(categoryOfRaw('HBSV'), 'SPECIAL')
})

test('realType 已规范化（历史别名 WC → LNWC）', () => {
  for (const row of rows) assert.equal(row.realType, normalizeRealType(row.realType))
})

// ---------------------------------------------------------------------------
// 筛选 / 排序
// ---------------------------------------------------------------------------

test('筛选与排序和旧内联实现逐行一致', () => {
  const legacyVisible = (base, { realType, tournamentId, overrides }) =>
    base
      .map((row) => ({ ...row, realType: overrides[row.key] || row.realType }))
      .filter((row) => row.realType === realType)
      .filter((row) => tournamentId === 'all' || row.tournamentId === tournamentId)
      .sort(
        (a, b) =>
          a.tournamentName.localeCompare(b.tournamentName) ||
          a.roundOrder - b.roundOrder ||
          a.slot.localeCompare(b.slot, undefined, { numeric: true }),
      )

  const realTypes = ['SS', 'HB3', 'LNWC', 'SV1', 'TB']
  for (const realType of realTypes) {
    for (const tournamentId of ['all', tournaments[0].id, tournaments[5].id]) {
      const legacy = legacyVisible(rows, { realType, tournamentId, overrides: {} })
      const next = visibleBrowserRows(rows, { realType, tournamentId, overrides: {} })
      assert.deepEqual(next.map((r) => r.key), legacy.map((r) => r.key), `${realType} / ${tournamentId} 结果不一致`)
    }
  }

  // 有 override 的情况：那一行的 key 会跳到新键型下
  const sample = rows.find((r) => r.realType === 'SS' && r.category === 'RC')
  assert.ok(sample, '找不到一张 SS 图做用例')
  const overrides = { [sample.key]: 'HB3' }
  const legacy = legacyVisible(rows, { realType: 'HB3', tournamentId: 'all', overrides })
  const next = visibleBrowserRows(rows, { realType: 'HB3', tournamentId: 'all', overrides })
  assert.deepEqual(next.map((r) => r.key), legacy.map((r) => r.key))
  assert.equal(next.some((r) => r.key === sample.key), true, 'override 后这一行必须出现在新键型下')
  assert.equal(
    visibleBrowserRows(rows, { realType: 'SS', tournamentId: 'all', overrides }).some((r) => r.key === sample.key),
    false,
    'override 后它不该再出现在旧键型下',
  )
})

test('排序三键：比赛名 → 轮次 order → 槽位（数字感知）', () => {
  const realType = rows.find((r) => r.category === 'RC' && r.realType === 'SS')?.realType ?? 'SS'
  const visible = visibleBrowserRows(rows, { realType })
  for (let i = 1; i < visible.length; i++) {
    const a = visible[i - 1]
    const b = visible[i]
    const byName = a.tournamentName.localeCompare(b.tournamentName)
    if (byName < 0) continue
    assert.equal(byName, 0, `第 ${i} 行比赛名顺序不对`)
    if (a.roundOrder !== b.roundOrder) {
      assert.ok(a.roundOrder <= b.roundOrder, `第 ${i} 行轮次顺序不对`)
      continue
    }
    assert.ok(a.slot.localeCompare(b.slot, undefined, { numeric: true }) <= 0, `第 ${i} 行槽位顺序不对`)
  }

  // 数字感知：RC2 必须排在 RC10 前面（普通 localeCompare 会反过来）
  const numeric = ['RC10', 'RC2', 'RC1'].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
  assert.deepEqual(numeric, ['RC1', 'RC2', 'RC10'])
})

test('比赛下拉只列当前键型下真的有图的比赛', () => {
  const realType = 'HB3'
  const matching = matchingTournamentsFor(tournaments, rows, realType)
  const ids = new Set(rows.filter((r) => r.realType === realType).map((r) => r.tournamentId))
  assert.deepEqual(matching.map((t) => t.id).sort(), [...ids].sort())
  assert.ok(matching.length > 0 && matching.length < tournaments.length, '应该只有一部分比赛，用例才有意义')

  const none = matchingTournamentsFor(tournaments, rows, 'NOT_A_REAL_TYPE')
  assert.deepEqual(none, [])
})

test('键型下拉：五个标准大类分组 + 自定义组；自定义为空时不出现', () => {
  const groups = browserOptionGroups(rows, '自定义')
  const standard = groups.filter((g) => BROWSER_CATEGORY_ORDER.includes(g.category))
  assert.deepEqual(standard.map((g) => g.category), [...BROWSER_CATEGORY_ORDER])
  for (const g of standard) {
    assert.deepEqual(g.options.map((o) => o.id), REAL_TYPES[g.category].map((o) => o.id))
  }
  assert.equal(groups.length, BROWSER_CATEGORY_ORDER.length, '现有全库没有目录外键型，不该多出分组')

  // 造一行目录外的键型（历史上真的出现过，比如改名前的旧键型）→ 必须出现在自定义组里，
  // 否则那些行会从界面上"消失"（用户没法把它们改回目录里的值）。
  const withCustom = [...rows, { ...rows[0], key: 'custom:1', realType: 'MADEUP' }]
  const custom = browserOptionGroups(withCustom, '自定义').find((g) => g.category === '自定义')
  assert.ok(custom, '有目录外键型时必须出现自定义组')
  assert.deepEqual(custom.options.map((o) => o.id), ['MADEUP'])
  const known = new Set(BROWSER_CATEGORY_ORDER.flatMap((c) => REAL_TYPES[c].map((i) => i.id)))
  for (const option of custom.options) assert.equal(known.has(option.id), false)

  assert.equal(browserOptionGroups([], '自定义').length, BROWSER_CATEGORY_ORDER.length)
})

test('「改成别的键型」下拉：当前大类排第一，当前值不在目录里时补在第一组', () => {
  const groups = conversionGroupsFor('HB', 'HB3')
  assert.equal(groups[0].category, 'HB')
  assert.equal(groups.some((g) => g.category === 'SPECIAL'), false, 'SPECIAL 不出现在转换下拉里')
  const flat = groups.flatMap((g) => g.options.map((o) => o.id))
  assert.equal(flat.length, new Set(flat).size, '不该有重复选项')
  assert.equal(flat.includes('HB3'), true)

  // 自定义键型：不补的话下拉里看不到自己现在的值
  const custom = conversionGroupsFor('SPECIAL', 'MYTYPE')
  assert.equal(custom[0].options[0].id, 'MYTYPE')
  assert.match(custom[0].options[0].name, /current/)

  // 目录里的值时不要多补一个 "(current)" 项
  const known = conversionGroupsFor('RC', 'SS')
  assert.equal(known[0].options.filter((o) => o.id === 'SS').length, 1)
  assert.equal(known[0].options.some((o) => /\(current\)/.test(o.name)), false)
})

// ---------------------------------------------------------------------------
// 重复提示汇总
// ---------------------------------------------------------------------------

test('警告汇总按「比赛 + 轮次集合」去重，且只在真的跨轮复用时出现', () => {
  const warnings = findDuplicateRoundMaps(tournaments)
  assert.ok(warnings.length > 0, '全库应该有重复警告（否则这个用例没意义）')

  const index = duplicateRoundIndexOf(tournaments)
  const allRows = buildMapBrowserRows(tournaments, index)
  const flagged = allRows.filter((r) => r.duplicateRounds)
  assert.ok(flagged.length > 0, '应该有行被标上重复')

  const groups = duplicateGroupsOf(flagged)
  const keys = groups.map((g) => `${g.abbr}:${g.rounds.join('&')}`)
  assert.equal(keys.length, new Set(keys).size, '汇总结果不该有重复行')

  // 判据是"这一行的身份有警告"，不能再拿 rounds.length 当门槛。
  // findDuplicateRoundMaps 只在跨 ≥2 轮时产出，所以条目本身就是证据。
  for (const w of warnings) assert.ok(w.rounds.length >= 2, `${w.mapKey} 的轮次数少于 2，判据可能被改坏了`)

  // 不传索引时不该有任何标记（公开页可以省掉这一步）
  const plain = buildMapBrowserRows(tournaments)
  assert.equal(plain.some((r) => r.duplicateRounds), false)
  assert.deepEqual(duplicateGroupsOf(plain), [])
})

// ---------------------------------------------------------------------------
// 反馈页要用的两个小工具
// ---------------------------------------------------------------------------

test('键型计数与行总数自洽', () => {
  const counts = realTypeCounts(rows)
  let sum = 0
  for (const n of counts.values()) sum += n
  assert.equal(sum, rows.length)

  const overridden = realTypeCounts(rows, { [rows[0].key]: 'HB3' })
  let sum2 = 0
  for (const n of overridden.values()) sum2 += n
  assert.equal(sum2, rows.length)
  assert.equal(
    overridden.get('HB3'),
    (counts.get('HB3') || 0) + (rows[0].realType === 'HB3' ? 0 : 1),
    'override 后 HB3 的计数要加一',
  )
})

test('行 → 建议目标：占位 ID（0 / 1 / 非整数）不写进目标', () => {
  assert.deepEqual(browserRowTarget({ tournamentId: 't', roundId: 'r', slot: 'HB1', beatmapId: 5416946 }), {
    tournamentId: 't',
    roundId: 'r',
    slot: 'HB1',
    beatmapId: 5416946,
  })
  for (const beatmapId of [0, 1, -3, undefined, 1.5, Number.NaN]) {
    const target = browserRowTarget({ tournamentId: 't', roundId: 'r', slot: 'HB1', beatmapId })
    assert.equal('beatmapId' in target, false, `beatmapId=${beatmapId} 不该出现在目标里`)
  }
})
