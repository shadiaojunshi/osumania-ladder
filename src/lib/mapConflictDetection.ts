import { SET_ID_UNRELIABLE_SONG_COUNT, songKeyOf } from './beatmapIds.ts'

export interface ConflictCandidateUsage {
  beatmapId: number
  beatmapsetId?: number
  realType: string
  name?: string
}

export type SetConflictKind = 'rateSet' | 'setReview'

export function extractRate(name?: string): number {
  if (!name) return 1
  const normalize = (value: string) => parseFloat(value.replace(',', '.'))
  const valid = (rate: number) => (Number.isFinite(rate) && rate >= 0.5 && rate <= 2.5 ? rate : null)
  let match: RegExpMatchArray | null
  let rate: number | null

  match = name.match(/([0-9]+[.,][0-9]+)x(?![0-9A-Za-z])/i)
  if (match) { rate = valid(normalize(match[1])); if (rate !== null) return rate }
  match = name.match(/(?:^|[^0-9A-Za-z])x([0-9]+(?:[.,][0-9]+)?)/i)
  if (match) { rate = valid(normalize(match[1])); if (rate !== null) return rate }
  match = name.match(/([0-9]+(?:[.,][0-9]+)?)倍速/)
  if (match) { rate = valid(normalize(match[1])); if (rate !== null) return rate }

  // 方括号里的小数：osu! 的 Version 大量直接写成 `[1.05]` / `[1.1]` —— **既没有 x 也没有
  // 「倍速」字样**，上面三条全都够不到。取**最后一组**方括号：歌名本身也可能带方括号
  // （`[Lunatic]` 之类），版本名总在末尾。
  const brackets = [...name.matchAll(/\[([0-9]+[.,][0-9]+)\]/g)]
  if (brackets.length > 0) {
    rate = valid(normalize(brackets[brackets.length - 1][1]))
    if (rate !== null) return rate
  }

  // 结尾的裸小数（`... 1.05`）。**要求带小数点**，否则 `Song 2`、`Vol 3` 这类会被当成倍速。
  match = name.match(/(?:^|\s)([0-9]+[.,][0-9]+)\s*$/)
  if (match) { rate = valid(normalize(match[1])); if (rate !== null) return rate }

  return 1
}

/**
 * 从「Artist - Title [Version]」里取出版本名（osu! 的 difficulty name）。
 *
 * 用途：同 set 待核对那一栏光看槽位（`RC7` / `RC6`）分不清「同 set 里两张不同的谱面」
 * 和「同一张谱的倍速版本」—— 把版本名并排显示出来就一眼能看出来。
 *
 * 取不到时返回 null：历史手传的数据里 `name` 可能**就是槽位记号**（ASC 2025 有 80/88 张
 * 是这样），那种没有版本名可言。
 */
export function extractVersionName(name?: string): string | null {
  if (!name) return null
  const trimmed = name.trim()
  // 用**最内层**方括号（捕获组里不含方括号）：真实数据里有 `[[1.0CCCD_16]]` 这种
  // 复合版本名，用 `\[([^\]]+)\]` 会把开头的 `[` 一起吞进捕获组。
  const matches = [...trimmed.matchAll(/\[([^[\]]+)\]/g)]
  if (matches.length === 0) return null
  const last = matches[matches.length - 1][1].trim()
  if (!last) return null
  // `[RC7]` 这种"整份 name 就是槽位记号加了方括号"的，不算版本名。
  if (`[${last}]` === trimmed) return null
  return last
}

export function classifySetConflict(usages: ConflictCandidateUsage[]): SetConflictKind | null {
  if (usages.length < 2 || new Set(usages.map((usage) => usage.realType)).size < 2) return null
  // 同一个 setId 下出现 ≥3 首不同的歌 → 这个 setId 本身不可靠（占位 ID，见 beatmapIds.ts）。
  // 不能当成"同 set 的键型分歧"报出去 —— MKTC 2025 那 36 张就是被 .mcz→.osz 的占位
  // `BeatmapSetID:1` 粘成一组，真实的键型冲突会被这一组淹掉。
  const songs = new Set(usages.map((usage) => songKeyOf(usage.name)).filter(Boolean))
  if (songs.size >= SET_ID_UNRELIABLE_SONG_COUNT) return null
  const distinctBids = new Set(usages.map((usage) => usage.beatmapId).filter(Boolean))
  if (distinctBids.size < 2) return null
  return new Set(usages.map((usage) => extractRate(usage.name))).size >= 2 ? 'rateSet' : 'setReview'
}
