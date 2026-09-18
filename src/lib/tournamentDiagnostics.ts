import type { Tournament } from './types'
import { normalizeRealType } from './realType.ts'
import { usableBeatmapId } from './beatmapIds.ts'

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

/** Build a stable identity for duplicate-map checks, even when a BID is absent or stale. */
export function mapIdentityKey(map: {
  beatmapId?: number
  type?: string
  realType?: string
  name?: string
  difficulty?: number
  difficultyLn?: number
}): string | null {
  const name = normalizeMapName(map.name)
  if (name) {
    return `meta:${String(map.type || '').toUpperCase()}|${name}|${map.difficulty ?? ''}|${map.difficultyLn ?? ''}`
  }
  // 占位 ID（0/1/负数）不是身份：拿它当 key 会让 36 张无关谱面互相判成
  // "同一张图被复用了"（MKTC 2025 的 BeatmapSetID:1 就是）。见 lib/beatmapIds.ts。
  const bid = usableBeatmapId(map.beatmapId)
  return bid ? `bid:${bid}` : null
}

/** Find a map reused in more than one round of the same tournament. */
export function findDuplicateRoundMaps(tournaments: Tournament[]): DuplicateRoundMapWarning[] {
  const byTournament = new Map<string, Map<string, { round: string; slot: string; beatmapId?: number; name?: string }[]>>()
  for (const tournament of tournaments) {
    const byIdentity = new Map<string, { round: string; slot: string; beatmapId?: number; name?: string }[]>()
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        const mapKey = mapIdentityKey(map)
        if (!mapKey) continue
        if (!byIdentity.has(mapKey)) byIdentity.set(mapKey, [])
        byIdentity.get(mapKey)!.push({
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
      const rounds = Array.from(new Set(usages.map((usage) => usage.round)))
      if (rounds.length < 2) continue
      const beatmapId = usages.find((usage) => usage.beatmapId)?.beatmapId
      result.push({
        tournamentId: tournament.id,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        beatmapId,
        mapKey,
        mapName: usages.find((usage) => usage.name)?.name,
        rounds,
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
