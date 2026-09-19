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
  /**
   * 整场命中(站长 2026-09-19「好像搜索搜比赛的全名也搜不到」):
   * 所有词都落在**这场比赛本身**的文本里(名字 / 缩写 / 内部 id / 年份 / 键数 / tags),
   * 而不是某张图或某一轮。
   *
   * 过去这种命中只把 rounds/maps 置空、自己也不产出任何一条结果行,面板于是显示
   * 「找到 1 场比赛 · 0 个轮次命中 · 0 个谱面命中」,下面空空如也 —— 看起来就是"搜不到"。
   * 实测 55 场比赛里有 48 场是这样(搜全名能匹配上,却没有任何可点的东西)。
   * 现在带这个标记出来,面板渲染一行「整场比赛」入口,点开原地展开该场的轮次。
   * 一场比赛几十轮几百张图,不能全铺出来刷屏,所以标记为真时 rounds/maps 仍恒为空。
   */
  tournamentMatch: boolean
  /** 轮次级命中(整场命中时为 [],改成由上面那个入口展开)。 */
  rounds: RoundSearchMatch[]
  /** 谱面级命中。 */
  maps: MapSearchMatch[]
}

/**
 * 检索用归一化:NFKC(全角→半角) → 小写 → **标点/符号折成空格** → 压空白。
 *
 * 为什么标点必须折成空格(站长 2026-09-19「我应该搜一个谱面的任何信息都能被搜到」):
 * 比赛名/谱面名/tag 里到处是标点 —— `osu!mania`、`RO16&QF`、`GBC2025春季节后赛A&B组`、tag `4k，chinese`,
 * 而人复述时写的是 `osu mania` / `ro16 qf` / `4k chinese`。过去只做 NFKC + 小写,
 * 半角 `!` `&` 和全角 `，` 两侧的词永远接不上,同一个东西换个写法就搜不到。
 *
 * 折成空格而不是直接删掉:删掉会把两个词粘成一个(`a b` → `ab`),让短词产生跨词假命中。
 * 代价是连写形态 `osumania` 接不上 `osu!mania` —— 这一头由内部 id 补上(id 正是连写形态)。
 */
function searchKey(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * 词首匹配:term 出现在 text 里,且出现位置是"一个词的开头"(串首,或前一字符不是 a-z0-9)。
 *
 * 轮次不做自由文本那种任意子串匹配 —— 否则搜 "F" 会把 QF / Semifinals / Finals 全拉出来,
 * 看起来就像坏了。词首匹配同时照顾两种真实写法:
 *   "sf"   → 命中 "semifinals sf" 里的缩写(词首)
 *   "qf"   → 命中 "ro16 qf" 里的 "qf"(标点折成空格后就是词边界)
 * 而 "finals" 不会命中 "semifinals"(那一段在词中间)。
 * 中日韩字符的 charCode 都 > 122,天然算"非词字符",所以中文/日文标题里的词首判定同样成立。
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
    // 整场文本(2026-09-19 扩充):名字、缩写、内部 id、年份、键数、tags 全部进检索。
    // id 就是数据文件名,也正是「去掉标点连写」的那份形态(如 4-digit-osumania-world-cup-2023),
    // 正好接住 searchKey 折掉标点后剩下的 `osumania` 这一类写法。
    text: searchKey([
      tournament.name,
      tournament.abbreviation,
      tournament.id,
      String(tournament.year ?? ''),
      tournament.keyCount ? `${tournament.keyCount}k` : '',
      (tournament.tags ?? []).join(' '),
    ].filter(Boolean).join(' ')),
    // 轮次也进索引:name、abbreviation、id 都要能搜到。
    rounds: tournament.rounds.map((round) => ({
      round,
      text: searchKey([round.name, round.abbreviation, round.id].filter(Boolean).join(' ')),
    })),
    // 谱面文本(2026-09-19 扩充):歌名之外,槽位(RC1/SV1)、大类(RC/LN/HB)、
    // 具体键型(SS/RE/HB1/PDRC)都进检索 —— 站长要的是「一张谱面的任何信息都能被搜到」。
    // 两类文本分开存,因为匹配规则不同(见 searchTournaments 里的谱面过滤)。
    maps: tournament.rounds.flatMap((round) => round.maps.map((map) => ({
      round,
      map,
      // 歌名:自由文本,任意子串都算命中("Metaroom" 要能在长标题中间命中)。
      text: searchKey(map.name || ''),
      // 槽位 / 大类 / 键型:是**代号**(RC1、RC、CJ),按词首匹配。
      // 任意子串会把 FCJ 的图也当成 "CJ"(Chordjack)的命中(fcj 里含 cj),那就不叫按键型找了。
      code: searchKey([map.slot, map.type, map.realType].filter(Boolean).join(' ')),
    }))),
  }))
}

type SearchIndex = ReturnType<typeof createTournamentSearchIndex>

// A set link with a selected difficulty must match that BID, not every map in the set.
// 注意:传进来的是**没折过标点**的查询 —— 折标点会把 URL 拆成一堆空格,链接就再也认不出来了。
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
  const link = parseOsuLink(query.normalize('NFKC').trim())
  const normalized = searchKey(query)
  // 空白查询 = 「没在搜」,把整张天梯原样还给调用方(列行为依赖这一点;面板此时不显示)。
  if (!link && !query.trim()) {
    return index.map(({ tournament }) => ({ tournament, tournamentMatch: false, rounds: [], maps: [] }))
  }
  // 有内容但被折成了空(纯标点,如 `!` / `&`)—— 与上面那条**必须分开**。
  // 混为一谈的话,一句 `!` 会走"空白查询"分支把全库当成无行结果列出来:
  // 面板显示「找到 55 场比赛 · 0 个轮次命中 · 0 个谱面命中」下面空空如也,
  // 天梯列还从"筛出 52 场"变成"显示全库 55 场"——看起来就像搜索框没反应。
  // 没有任何可匹配的词 → 空结果,诚实地说"这个输入匹配不到东西"。
  if (!link && !normalized) return []

  const terms = normalized.split(' ').filter(Boolean)
  return index.flatMap((entry) => {
    const tournamentMatch = !link && terms.every((term) => entry.text.includes(term))
    // 谱面/轮次**自身**是否每条词都命中(歌名 / 槽位 / 键型 / BID;轮次是 name/abbr/id),
    // 不算"靠比赛文本凑出来"的那半边。这是「这场里真有一张图 / 一轮是你搜的东西」的判据。
    const ownMaps = entry.maps.filter(({ text, code, map }) => {
      if (link) return map[link.field] === link.id
      // 歌名用任意子串(词首匹配是它的子集,不必再判);槽位/键型代号用词首匹配。
      // BID / BSID 仍要**整串相等** —— 放宽成包含的话,搜 "1234" 会把 12345、123456 一起拖出来。
      return terms.every((term) => text.includes(term) || matchesWordStart(code, term)
        || (map.beatmapId !== undefined && String(map.beatmapId) === term)
        || (map.beatmapsetId !== undefined && String(map.beatmapsetId) === term))
    })
    const ownRounds = link ? [] : entry.rounds.filter(({ text }) =>
      terms.every((term) => matchesWordStart(text, term)))
    // 整场命中时只留"自身命中"的轮次/谱面:否则搜一个比赛缩写会把这场几十轮几百张图全倒出来。
    // 但不能顺手把真命中丢掉 —— 比赛 id 里恰好含 `ln`(osumania-ln-tournament-4)时,
    // 搜「LN」既要出这场比赛的入口,也要照出它那些 LN 的图。
    const rounds = tournamentMatch ? ownRounds : link ? [] : entry.rounds.filter(({ text }) =>
      terms.every((term) => entry.text.includes(term) || matchesWordStart(text, term)))
    const maps = tournamentMatch ? ownMaps : entry.maps.filter(({ text, code, map }) => {
      if (link) return map[link.field] === link.id
      // All terms must describe the same map (plus its tournament), never separate maps.
      return terms.every((term) => entry.text.includes(term) || text.includes(term)
        || matchesWordStart(code, term)
        || (map.beatmapId !== undefined && String(map.beatmapId) === term)
        || (map.beatmapsetId !== undefined && String(map.beatmapsetId) === term))
    })
    if (!tournamentMatch && rounds.length === 0 && maps.length === 0) return []
    return [{
      tournament: entry.tournament,
      tournamentMatch,
      rounds: rounds.map(({ round }) => ({ round })),
      maps: maps.map(({ round, map }) => ({ round, map })),
    }]
  })
}
