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
  const distinctBids = new Set(usages.map((usage) => usage.beatmapId).filter(Boolean))
  if (distinctBids.size < 2) return null
  return new Set(usages.map((usage) => extractRate(usage.name))).size >= 2 ? 'rateSet' : 'setReview'
}
