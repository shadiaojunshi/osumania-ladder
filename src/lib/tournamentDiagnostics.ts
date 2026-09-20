import type { Tournament } from './types'
import { normalizeRealType } from './realType.ts'
import { usableBeatmapId } from './beatmapIds.ts'
import { extractVersionName } from './mapConflictDetection.ts'

// PDEX = 特殊槽位(跨大类,如 HB&SV)的"待分类",2026-09-15 加。
// 它和 PDSV 不同:PDEX 只当分类队列,不进合包(见 scripts/generate-pack.js),
// 所以它在"排除 SV 待分类"的集合里也要保留。
export const PENDING_REAL_TYPES = new Set(['PDRC', 'PDLN', 'PDHB', 'PDSV', 'PDEX'])
export const NON_SV_PENDING_REAL_TYPES = new Set(['PDRC', 'PDLN', 'PDHB', 'PDEX'])

export interface PendingMapLocation {
  tournamentId: string
  tournamentAbbr: string
  roundId: string
  roundAbbr: string
  slot: string
  type: string
  realType: string
  beatmapId?: number
  name?: string
  /** 从 `name` 末尾方括号取出的版本名（osu! difficulty name）；历史手传的数据取不到。 */
  versionName?: string | null
}

export interface ImportedRoundInput {
  groupIndex: number
  mapIds: string[]
  /** Stable, human-independent keys for rows that do not have a numeric BID. */
  mapKeys?: string[]
}

export interface IdenticalRoundWarning {
  firstGroupIndex: number
  secondGroupIndex: number
  mapCount: number
}

export interface CrossRoundMapWarning {
  mapId: string
  groupIndexes: number[]
}

export interface DuplicateTournamentWarning {
  tournamentId: string
  tournamentAbbr: string
  overlap: number
  importedUniqueMaps: number
  ratio: number
}

export interface ImportDiagnostics {
  identicalRounds: IdenticalRoundWarning[]
  crossRoundMaps: CrossRoundMapWarning[]
  duplicateTournaments: DuplicateTournamentWarning[]
}

export interface DuplicateRoundMapWarning {
  tournamentId: string
  tournamentAbbr: string
  beatmapId?: number
  mapKey: string
  mapName?: string
  rounds: string[]
  slots: string[]
}

function normalizeMapName(name: unknown): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * 「name 其实写的是槽位名」的占位判读。
 *
 * 全库有 227 张图的 `name` 不是曲名而是槽位记号（`SV1` / `ln3` / `RC8` / `TB1`，
 * 集中在 4DM2023 / ASC 2025 / TTI / MCNC 2025 …）。这类名字**不是可靠身份**：
 * 身份键是「大类 + 曲名 + 难度」，而「同大类 + 同槽位名 + 同难度」在不同轮次必然相撞
 * —— 4DM2023 的 SV1 就是这么在 7 个轮次里被报成"同一张图被复用了"。
 *
 * 两条判据（命中任意一条即视为占位）：
 *   ① `1~4 个字母 + 1~3 位数字` 的短记号（要求**至少一位数字**，避免误伤 `MU` 这类短曲名）；
 *   ② 归一化后与**自己的槽位名**完全相同（兜住 `FS/TB`、`GM(HR/SD)` 这种带符号的槽位）。
 *
 * 命中后这个名字被忽略，身份退到 BID（没有可用 BID 就当"没有身份"，不报警）——
 * 宁可漏报也不能拿槽位名当曲名去误报。
 */
const PLACEHOLDER_SLOT_NAME = /^[a-z]{1,4}\d{1,3}$/

function isSlotPlaceholderName(name: string, slot: unknown): boolean {
  if (!name) return false
  if (PLACEHOLDER_SLOT_NAME.test(name)) return true
  const normalizedSlot = normalizeMapName(slot)
  return normalizedSlot.length > 0 && normalizedSlot === name
}

/** Build a stable identity for duplicate-map checks, even when a BID is absent or stale. */
export function mapIdentityKey(map: {
  beatmapId?: number
  type?: string
  realType?: string
  name?: string
  /** 用来识别「name 只是槽位名」的占位写法；缺省时不做这层判读。 */
  slot?: string
  difficulty?: number
  difficultyLn?: number
}): string | null {
  const name = normalizeMapName(map.name)
  if (name && !isSlotPlaceholderName(name, map.slot)) {
    return `meta:${String(map.type || '').toUpperCase()}|${name}|${map.difficulty ?? ''}|${map.difficultyLn ?? ''}`
  }
  // 占位 ID（0/1/负数）不是身份：拿它当 key 会让 36 张无关谱面互相判成
  // "同一张图被复用了"（MKTC 2025 的 BeatmapSetID:1 就是）。见 lib/beatmapIds.ts。
  const bid = usableBeatmapId(map.beatmapId)
  return bid ? `bid:${bid}` : null
}

interface MapUsage {
  /** 轮次唯一键（比赛唯一键契约：轮次的 id 才是身份，abbreviation 允许重复/为空）。 */
  roundId: string
  /** 给人看的轮次名（abbreviation → name → id）。 */
  round: string
  slot: string
  beatmapId?: number
  name?: string
}

/** Find a map reused in more than one round of the same tournament. */
export function findDuplicateRoundMaps(tournaments: Tournament[]): DuplicateRoundMapWarning[] {
  const byTournament = new Map<string, Map<string, MapUsage[]>>()
  for (const tournament of tournaments) {
    const byIdentity = new Map<string, MapUsage[]>()
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        const mapKey = mapIdentityKey(map)
        if (!mapKey) continue
        if (!byIdentity.has(mapKey)) byIdentity.set(mapKey, [])
        byIdentity.get(mapKey)!.push({
          roundId: round.id,
          round: round.abbreviation || round.name || round.id,
          slot: map.slot,
          beatmapId: map.beatmapId,
          name: map.name,
        })
      }
    }
    byTournament.set(tournament.id, byIdentity)
  }

  const result: DuplicateRoundMapWarning[] = []
  for (const tournament of tournaments) {
    const byIdentity = byTournament.get(tournament.id)
    if (!byIdentity) continue
    for (const [mapKey, usages] of byIdentity) {
      // 按轮次 **id** 判定"到底跨了几轮"（不是按显示名）：两轮缩写都叫 "F" 时，
      // 按名字去重会把两轮合成一轮、把真正的复用吞掉。
      // `rounds` 是**给人看的**列表，所以这里要按显示名去重（否则会输出 "F & F"）。
      // 也就是说 warnings 非空即等于"确实跨了 ≥2 轮"，调用方不要再拿 rounds.length 当判据。
      const roundIds = new Set<string>()
      const roundLabels: string[] = []
      for (const usage of usages) {
        if (roundIds.has(usage.roundId)) continue
        roundIds.add(usage.roundId)
        if (!roundLabels.includes(usage.round)) roundLabels.push(usage.round)
      }
      if (roundIds.size < 2) continue
      const beatmapId = usages.find((usage) => usage.beatmapId)?.beatmapId
      result.push({
        tournamentId: tournament.id,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        beatmapId,
        mapKey,
        mapName: usages.find((usage) => usage.name)?.name,
        rounds: roundLabels,
        slots: usages.map((usage) => usage.slot),
      })
    }
  }
  return result.sort((a, b) => a.tournamentAbbr.localeCompare(b.tournamentAbbr)
    || (a.mapName || a.mapKey).localeCompare(b.mapName || b.mapKey))
}

export function findPendingMaps(
  tournaments: Tournament | Tournament[],
  options: { excludeSv?: boolean } = {},
): PendingMapLocation[] {
  const list = Array.isArray(tournaments) ? tournaments : [tournaments]
  const pendingTypes = options.excludeSv ? NON_SV_PENDING_REAL_TYPES : PENDING_REAL_TYPES
  const result: PendingMapLocation[] = []

  for (const tournament of list) {
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        const realType = normalizeRealType(map.realType)
        if (!pendingTypes.has(realType)) continue
        result.push({
          tournamentId: tournament.id,
          tournamentAbbr: tournament.abbreviation || tournament.id,
          roundId: round.id,
          roundAbbr: round.abbreviation || round.name || round.id,
          slot: map.slot,
          type: map.type,
          realType,
          beatmapId: map.beatmapId,
          versionName: extractVersionName(map.name),
          name: map.name,
        })
      }
    }
  }

  return result
}

function canonicalRoundMapIds(mapIds: string[]): string {
  return mapIds.filter(Boolean).map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join('|')
}

export function analyzeImportedMapIds(
  rounds: ImportedRoundInput[],
  existingTournaments: Tournament[],
  excludeTournamentId?: string,
): ImportDiagnostics {
  const normalizedRounds = rounds
    .map((round) => {
      const mapIds = round.mapIds.filter(Boolean).map(String)
      const mapKeys = round.mapKeys && round.mapKeys.length > 0
        ? round.mapKeys.filter(Boolean).map(String)
        : mapIds.map((mapId) => `bid:${mapId}`)
      return { ...round, mapIds, mapKeys }
    })
    .filter((round) => round.mapKeys.length > 0)

  const identicalRounds: IdenticalRoundWarning[] = []
  for (let i = 0; i < normalizedRounds.length; i++) {
    const left = normalizedRounds[i]
    const leftSignature = canonicalRoundMapIds(left.mapKeys)
    for (let j = i + 1; j < normalizedRounds.length; j++) {
      const right = normalizedRounds[j]
      if (left.mapKeys.length !== right.mapKeys.length) continue
      if (leftSignature !== canonicalRoundMapIds(right.mapKeys)) continue
      identicalRounds.push({
        firstGroupIndex: left.groupIndex,
        secondGroupIndex: right.groupIndex,
        mapCount: left.mapKeys.length,
      })
    }
  }

  const groupsByMapId = new Map<string, Set<number>>()
  for (const round of normalizedRounds) {
    for (const mapId of new Set(round.mapIds)) {
      if (!groupsByMapId.has(mapId)) groupsByMapId.set(mapId, new Set())
      groupsByMapId.get(mapId)!.add(round.groupIndex)
    }
  }
  const crossRoundMaps = Array.from(groupsByMapId.entries())
    .filter(([, groups]) => groups.size >= 2)
    .map(([mapId, groups]) => ({ mapId, groupIndexes: Array.from(groups).sort((a, b) => a - b) }))
    .sort((a, b) => Number(a.mapId) - Number(b.mapId))

  const importedIds = new Set(normalizedRounds.flatMap((round) => round.mapIds))
  const duplicateTournaments: DuplicateTournamentWarning[] = []
  if (importedIds.size > 0) {
    for (const tournament of existingTournaments) {
      if (!tournament?.rounds || tournament.id === excludeTournamentId) continue
      const tournamentIds = new Set(
        tournament.rounds.flatMap((round) =>
          // 同上：占位 ID 不进"这个 BID 在别处出现过"的比较集。
          (round.maps || []).flatMap((map) => {
            const bid = usableBeatmapId(map.beatmapId)
            return bid ? [String(bid)] : []
          }),
        ),
      )
      let overlap = 0
      for (const mapId of importedIds) if (tournamentIds.has(mapId)) overlap++
      const ratio = overlap / importedIds.size
      if (ratio < 0.5) continue
      duplicateTournaments.push({
        tournamentId: tournament.id,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        overlap,
        importedUniqueMaps: importedIds.size,
        ratio,
      })
    }
  }
  duplicateTournaments.sort((a, b) => b.ratio - a.ratio || b.overlap - a.overlap)

  return { identicalRounds, crossRoundMaps, duplicateTournaments }
}
