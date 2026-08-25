import type { Tournament } from './types'

export const PENDING_REAL_TYPES = new Set(['PDRC', 'PDLN', 'PDHB', 'PDSV'])
export const NON_SV_PENDING_REAL_TYPES = new Set(['PDRC', 'PDLN', 'PDHB'])

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
        if (!pendingTypes.has(map.realType)) continue
        result.push({
          tournamentId: tournament.id,
          tournamentAbbr: tournament.abbreviation || tournament.id,
          roundId: round.id,
          roundAbbr: round.abbreviation || round.name || round.id,
          slot: map.slot,
          type: map.type,
          realType: map.realType,
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
    .map((round) => ({ ...round, mapIds: round.mapIds.filter(Boolean).map(String) }))
    .filter((round) => round.mapIds.length > 0)

  const identicalRounds: IdenticalRoundWarning[] = []
  for (let i = 0; i < normalizedRounds.length; i++) {
    const left = normalizedRounds[i]
    const leftSignature = canonicalRoundMapIds(left.mapIds)
    for (let j = i + 1; j < normalizedRounds.length; j++) {
      const right = normalizedRounds[j]
      if (left.mapIds.length !== right.mapIds.length) continue
      if (leftSignature !== canonicalRoundMapIds(right.mapIds)) continue
      identicalRounds.push({
        firstGroupIndex: left.groupIndex,
        secondGroupIndex: right.groupIndex,
        mapCount: left.mapIds.length,
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
          (round.maps || []).flatMap((map) => map.beatmapId ? [String(map.beatmapId)] : []),
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
