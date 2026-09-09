import type { BeatmapMeta, Round, Tournament } from './types.ts'

export interface MapSearchMatch {
  round: Round
  map: BeatmapMeta
}

export interface TournamentSearchResult {
  tournament: Tournament
  maps: MapSearchMatch[]
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
}

export function createTournamentSearchIndex(tournaments: readonly Tournament[]) {
  return tournaments.map((tournament) => ({
    tournament,
    text: normalize(`${tournament.name} ${tournament.abbreviation}`),
    maps: tournament.rounds.flatMap((round) => round.maps.map((map) => ({
      round,
      map,
      text: normalize(map.name || ''),
    }))),
  }))
}

type SearchIndex = ReturnType<typeof createTournamentSearchIndex>

// A set link with a selected difficulty must match that BID, not every map in the set.
function parseOsuLink(query: string): { field: 'beatmapId' | 'beatmapsetId'; id: number } | null {
  try {
    const url = new URL(query)
    if (url.hostname !== 'osu.ppy.sh' || !['https:', 'http:'].includes(url.protocol)) return null
    const map = url.pathname.match(/^\/(?:beatmaps|b)\/(\d+)\/?$/)
    if (map) return { field: 'beatmapId', id: Number(map[1]) }
    const set = url.pathname.match(/^\/(?:beatmapsets|s)\/(\d+)\/?$/)
    if (!set) return null
    const selected = url.hash.match(/^#(?:osu|taiko|fruits|mania)\/(\d+)$/)
    return selected
      ? { field: 'beatmapId', id: Number(selected[1]) }
      : { field: 'beatmapsetId', id: Number(set[1]) }
  } catch {
    return null
  }
}

export function searchTournaments(index: SearchIndex, query: string): TournamentSearchResult[] {
  const normalized = normalize(query)
  if (!normalized) return index.map(({ tournament }) => ({ tournament, maps: [] }))

  const link = parseOsuLink(normalized)
  const terms = normalized.split(' ')
  return index.flatMap((entry) => {
    const tournamentMatches = !link && terms.every((term) => entry.text.includes(term))
    const maps = entry.maps.filter(({ text, map }) => {
      if (link) return map[link.field] === link.id
      // All terms must describe the same map (plus its tournament), never separate maps.
      return terms.every((term) => entry.text.includes(term) || text.includes(term)
        || (map.beatmapId !== undefined && String(map.beatmapId) === term)
        || (map.beatmapsetId !== undefined && String(map.beatmapsetId) === term))
    })
    return tournamentMatches || maps.length ? [{
      tournament: entry.tournament,
      // A tournament-name search needs no list of every map in that tournament.
      maps: tournamentMatches ? [] : maps.map(({ round, map }) => ({ round, map })),
    }] : []
  })
}
