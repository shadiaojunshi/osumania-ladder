// 「按键型浏览谱面」表格的**纯逻辑**（行生成 / 筛选 / 排序 / 下拉项 / 重复提示）。
//
// 从 `src/components/admin/RealTypeMapBrowser.tsx` 的 useMemo 里原样抽出，行为不改。
// 抽出来的理由（见 docs/anonymous-feedback-and-abuse-plan.md 第 8 节）：
// 公开的反馈页也要让用户"找到那张图"，而公开页不能 import 带 OAuth/KV 的后台组件。
// 于是把判定逻辑放在 `src/lib`（纯函数、可单测），后台组件退化成"适配器 + 表格 JSX"，
// 公开页用同一份逻辑配自己的表格。
//
// 三条不变量：
//   ① **行身份稳定**：`key` 一旦变了，React 会重挂整行、`overrides` 也会对不上。
//      组成是 `${比赛}:${轮次}:${轮次下标}:${槽位}:${BID || 图在该轮里的下标}`。
//   ② **override 先于筛选**：用户改了键型之后，那一行要立刻出现在新键型的筛选结果里
//      （所以是先套 overrides 再按 realType 过滤）。
//   ③ **排序是展示排序**：比赛名 → 轮次 order → 槽位（数字感知，`RC2` 排在 `RC10` 前）。

import { REAL_TYPES, categoryOfRaw, type MapCategory, type RealTypeOption } from './realTypeCatalog.ts'
import { normalizeRealType } from './realType.ts'
import { isValidPackAs } from './packAs.ts'
import { findDuplicateRoundMaps, mapIdentityKey, type DuplicateRoundMapWarning } from './tournamentDiagnostics.ts'
import type { Tournament } from './types.ts'

/** 界面上的大类分组顺序。SPECIAL 不在这里（它只在键型下拉里单独成组）。 */
export const BROWSER_CATEGORY_ORDER = ['RC', 'LN', 'HB', 'SV', 'TB'] as const

export interface MapBrowserRow {
  /** 稳定的行身份（见文件头 ①）。 */
  key: string
  tournamentId: string
  tournamentName: string
  tournamentAbbr: string
  roundId: string
  roundIndex: number
  roundName: string
  roundAbbr: string
  roundOrder: number
  slot: string
  type: string
  /** 已规范化（历史别名 `WC` → `LNWC`）。 */
  realType: string
  /** 「临时归类到别的键型包」（合包时生效，不改 realType）。空 = 没填。 */
  packAs?: string
  name: string
  difficulty: number
  difficultyLn?: number
  beatmapId?: number
  category: MapCategory
  /** 「这一行的身份在别处被复用了」——由 findDuplicateRoundMaps 决定，只跨 ≥2 个轮次才产出。 */
  duplicateRounds?: string[]
}

export interface BrowserOverrideMap {
  [rowKey: string]: string | undefined
}

/** Drafts override fetched/saved data; removing a draft restores the latest saved value. */
export function browserTournamentsWithDrafts(
  base: Tournament[],
  saved: Record<string, Tournament>,
  drafts: Record<string, { data: Tournament }>,
): Tournament[] {
  const merged = new Map(base.map((tournament) => [tournament.id, tournament]))
  for (const tournament of Object.values(saved)) merged.set(tournament.id, tournament)
  for (const entry of Object.values(drafts)) merged.set(entry.data.id, entry.data)
  return [...merged.values()]
}

/**
 * 把 `findDuplicateRoundMaps` 的警告转成行级索引。
 * 键 = `${tournamentId}:${mapKey}` —— 注意这里的 mapKey 是 `mapIdentityKey` 的结果，
 * 不是行的 key，两张表别混用。
 */
export function duplicateRoundIndex(warnings: DuplicateRoundMapWarning[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const warning of warnings) {
    index.set(`${warning.tournamentId}:${warning.mapKey}`, warning.rounds)
  }
  return index
}

/** 从全库比赛建索引（后台浏览器用；公开页应自己按需构造，别把整库索引带进公开包）。 */
export function duplicateRoundIndexOf(tournaments: Tournament[]): Map<string, string[]> {
  return duplicateRoundIndex(findDuplicateRoundMaps(tournaments))
}

/**
 * 展开成全库行。`duplicateIndex` 缺省时不做重复标记（公开页可以省掉这一步）。
 */
export function buildMapBrowserRows(
  tournaments: Tournament[],
  duplicateIndex?: Map<string, string[]>,
): MapBrowserRow[] {
  const rows: MapBrowserRow[] = []
  for (const tournament of tournaments) {
    const tournamentAbbr = tournament.abbreviation || tournament.id
    for (const [roundIndex, round] of (tournament.rounds || []).entries()) {
      for (const [index, map] of (round.maps || []).entries()) {
        const realType = normalizeRealType(map.realType)
        const duplicateRounds = (() => {
          if (!duplicateIndex) return undefined
          const mapKey = mapIdentityKey(map)
          return mapKey ? duplicateIndex.get(`${tournament.id}:${mapKey}`) : undefined
        })()
        rows.push({
          key: `${tournament.id}:${round.id}:${roundIndex}:${map.slot}:${map.beatmapId || index}`,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          tournamentAbbr,
          roundId: round.id,
          roundIndex,
          roundName: round.name,
          roundAbbr: round.abbreviation || round.name,
          roundOrder: round.order,
          slot: map.slot,
          type: map.type,
          realType,
          // 只带出"填了"的值：空串/空白当没填（判读在 src/lib/packAs.ts）。
          ...(isValidPackAs(map.packAs) ? { packAs: map.packAs } : {}),
          name: map.name,
          difficulty: map.difficulty,
          difficultyLn: map.difficultyLn,
          beatmapId: map.beatmapId,
          category: categoryOfRaw(map.type),
          ...(duplicateRounds ? { duplicateRounds } : {}),
        })
      }
    }
  }
  return rows
}

export interface BrowserOptionGroup {
  category: string
  options: RealTypeOption[]
}

/**
 * 键型下拉的分组：标准五类 + 「自定义」组（数据里出现过、但不在目录里的键型）。
 * `customLabel` 由调用方注入（i18n 在组件层）。
 */
export function browserOptionGroups(rows: MapBrowserRow[], customLabel: string): BrowserOptionGroup[] {
  const known = new Set(BROWSER_CATEGORY_ORDER.flatMap((category) => REAL_TYPES[category].map((item) => item.id)))
  const custom = Array.from(new Set(rows.map((row) => row.realType).filter((id) => id && !known.has(id)))).sort((a, b) =>
    a.localeCompare(b),
  )
  return [
    ...BROWSER_CATEGORY_ORDER.map((category) => ({ category, options: REAL_TYPES[category] })),
    ...(custom.length > 0 ? [{ category: customLabel, options: custom.map((id) => ({ id, name: id })) }] : []),
  ]
}

/** 当前键型下「真的有图」的比赛（用于比赛下拉，避免列出几千个空选项）。 */
export function matchingTournamentsFor(
  tournaments: Tournament[],
  rows: MapBrowserRow[],
  selectedRealType: string,
): Tournament[] {
  const matchingIds = new Set(rows.filter((row) => row.realType === selectedRealType).map((row) => row.tournamentId))
  return tournaments.filter((tournament) => matchingIds.has(tournament.id))
}

/**
 * 先套 overrides（本地回显）再筛选，最后排序。
 * `tournamentId === 'all'` 表示不按比赛过滤。
 */
export function visibleBrowserRows(
  rows: MapBrowserRow[],
  {
    realType,
    tournamentId = 'all',
    overrides,
  }: { realType: string; tournamentId?: string; overrides?: BrowserOverrideMap },
): MapBrowserRow[] {
  return rows
    .map((row) => {
      const override = overrides?.[row.key]
      return override ? { ...row, realType: override } : row
    })
    .filter((row) => row.realType === realType)
    .filter((row) => tournamentId === 'all' || row.tournamentId === tournamentId)
    .sort(
      (a, b) =>
        a.tournamentName.localeCompare(b.tournamentName) ||
        a.roundOrder - b.roundOrder ||
        a.slot.localeCompare(b.slot, undefined, { numeric: true }),
    )
}

/**
 * 警告横幅里要列出**真正触发**的比赛，不能写死某个历史事故的名字。
 * 按「比赛 + 涉及的轮次集合」去重，一行代表一组复用。
 * 判据是"这一行的身份有警告"——`findDuplicateRoundMaps` 只在跨 ≥2 个轮次时才产出条目，
 * 所以条目存在本身就是证据，不能再拿 `rounds.length` 当门槛。
 */
export function duplicateGroupsOf(rows: MapBrowserRow[]): { abbr: string; rounds: string[] }[] {
  const seen = new Map<string, { abbr: string; rounds: string[] }>()
  for (const row of rows) {
    if (!row.duplicateRounds) continue
    const key = `${row.tournamentId}:${row.duplicateRounds.join('&')}`
    if (!seen.has(key)) seen.set(key, { abbr: row.tournamentAbbr, rounds: row.duplicateRounds })
  }
  return [...seen.values()]
}

/**
 * 「改成别的键型」下拉：当前大类排第一，其余大类按目录顺序跟在后面。
 * SPECIAL 行没有自己所属的大类，就按目录原顺序。当前值不在目录里（自定义键型）时
 * 把它作为第一组的第一项补上，避免下拉里看不到自己现在的值。
 */
export function conversionGroupsFor(rowCategory: MapCategory, realType: string): BrowserOptionGroup[] {
  const entries = (Object.entries(REAL_TYPES) as [string, RealTypeOption[]][]).filter(
    ([category]) => category !== 'SPECIAL',
  )
  const ordered =
    rowCategory === 'SPECIAL'
      ? entries
      : [
          ...entries.filter(([category]) => category === rowCategory),
          ...entries.filter(([category]) => category !== rowCategory),
        ]
  return ordered
    .map(([category, options], index) => {
      const current =
        index === 0 && realType && !options.some((option) => option.id === realType)
          ? [{ id: realType, name: `${realType} (current)` }, ...options]
          : options
      return { category, options: current }
    })
    .filter((group) => group.options.length > 0)
}

/** 每种键型有多少张图（全库口径，不受筛选影响）。给"键型分布"这类摘要用。 */
export function realTypeCounts(rows: MapBrowserRow[], overrides?: BrowserOverrideMap): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const realType = overrides?.[row.key] || row.realType
    counts.set(realType, (counts.get(realType) || 0) + 1)
  }
  return counts
}

/** 行 → 建议目标（tournamentId/roundId/slot/BID）。占位 ID 会被丢掉（见 beatmapIds.ts）。 */
export function browserRowTarget(row: MapBrowserRow): {
  tournamentId: string
  roundId: string
  slot: string
  beatmapId?: number
} {
  const beatmapId = Number(row.beatmapId)
  const usable = Number.isInteger(beatmapId) && beatmapId > 1
  return {
    tournamentId: row.tournamentId,
    roundId: row.roundId,
    slot: row.slot,
    ...(usable ? { beatmapId } : {}),
  }
}
