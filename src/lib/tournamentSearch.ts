import type { BeatmapMeta, Round, Tournament } from './types.ts'

export interface MapSearchMatch {
  round: Round
  map: BeatmapMeta
}

/**
 * 轮次级命中(站长 2026-09-19):搜「MMT SF」这种「比赛 + 轮次」的组合,过去一条都不出 ——
 * 比赛名只跟比赛名比、谱面名只跟谱面名比,轮次的名字/缩写从来没进过检索。
 * 现在所有词都落在「同一场比赛 + 同一轮」的文本里时,这一轮整体算一条命中;
 * 点它打开的正是那轮的图池(与框体左键同一条详情入口),不需要先挑一张图。
 */
export interface RoundSearchMatch {
  round: Round
}

export interface TournamentSearchResult {
  tournament: Tournament
  /** 轮次级命中(整场比赛名命中时为 [] —— 那本来就代表整场比赛)。 */
  rounds: RoundSearchMatch[]
  /** 谱面级命中。 */
  maps: MapSearchMatch[]
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * 词首匹配:term 出现在 text 里,且出现位置是"一个词的开头"(串首,或前一字符不是 a-z0-9)。
 *
 * 轮次不做自由文本那种任意子串匹配 —— 否则搜 "F" 会把 QF / Semifinals / Finals 全拉出来,
 * 看起来就像坏了。词首匹配同时照顾两种真实写法:
 *   "sf"   → 命中 "semifinals sf" 里的缩写(词首)
 *   "qf"   → 命中 "ro16&qf & sf&f" 里的 "&qf"('&' 是词边界)
 * 而 "finals" 不会命中 "semifinals"(那一段在词中间)。
 */
function matchesWordStart(text: string, term: string): boolean {
  if (!term) return false
  let from = 0
  for (;;) {
    const at = text.indexOf(term, from)
    if (at === -1) return false
    if (at === 0) return true
    const prev = text.charCodeAt(at - 1)
    const prevIsWordChar = (prev >= 48 && prev <= 57) || (prev >= 97 && prev <= 122)
    if (!prevIsWordChar) return true
    from = at + 1
  }
}

export function createTournamentSearchIndex(tournaments: readonly Tournament[]) {
  return tournaments.map((tournament) => ({
    tournament,
    text: normalize(`${tournament.name} ${tournament.abbreviation}`),
    // 轮次也进索引:name 与 abbreviation 都要能搜到(轮次 id 是内部标识,不参与检索)。
    rounds: tournament.rounds.map((round) => ({
      round,
      text: normalize(`${round.name || ''} ${round.abbreviation || ''}`),
    })),
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
  if (!normalized) return index.map(({ tournament }) => ({ tournament, rounds: [], maps: [] }))

  const link = parseOsuLink(normalized)
  const terms = normalized.split(' ')
  return index.flatMap((entry) => {
    const tournamentMatches = !link && terms.every((term) => entry.text.includes(term))
    // 轮次级:和谱面同一套契约 —— 所有词必须描述**同一个**对象(这里是一轮),
    // 词不能拆到两轮里去凑("alpha beta" 不该把两轮拉出来当命中)。
    // 轮次文本用"词首匹配"(见 matchesWordStart);比赛名那半边沿用原来的包含匹配。
    // osu 链接指向具体谱面,不参与轮次检索。
    const rounds = link ? [] : entry.rounds.filter(({ text }) =>
      terms.every((term) => entry.text.includes(term) || matchesWordStart(text, term)))
    const maps = entry.maps.filter(({ text, map }) => {
      if (link) return map[link.field] === link.id
      // All terms must describe the same map (plus its tournament), never separate maps.
      return terms.every((term) => entry.text.includes(term) || text.includes(term)
        || (map.beatmapId !== undefined && String(map.beatmapId) === term)
        || (map.beatmapsetId !== undefined && String(map.beatmapsetId) === term))
    })
    if (!tournamentMatches && rounds.length === 0 && maps.length === 0) return []
    return [{
      tournament: entry.tournament,
      // A tournament-name search needs no list of every round/map in that tournament.
      rounds: tournamentMatches ? [] : rounds.map(({ round }) => ({ round })),
      maps: tournamentMatches ? [] : maps.map(({ round, map }) => ({ round, map })),
    }]
  })
}
