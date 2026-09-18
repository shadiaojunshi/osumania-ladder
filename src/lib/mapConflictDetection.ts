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
  return 1
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
