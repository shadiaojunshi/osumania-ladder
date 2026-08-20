import type { Round, Tournament } from './types'
import type { LadderEntry } from './referenceData'

export type DifficultyDimensionId =
  | 'rc-rf'
  | 'ln-ln'
  | 'hb-rf'
  | 'hb-ln'
  | 'tb-rf'
  | 'tb-ln'

export interface DifficultyDimension {
  id: DifficultyDimensionId
  type: 'RC' | 'LN' | 'HB' | 'TB'
  field: 'rf' | 'ln'
}

export const DIFFICULTY_DIMENSIONS: DifficultyDimension[] = [
  { id: 'rc-rf', type: 'RC', field: 'rf' },
  { id: 'ln-ln', type: 'LN', field: 'ln' },
  { id: 'hb-rf', type: 'HB', field: 'rf' },
  { id: 'hb-ln', type: 'HB', field: 'ln' },
  { id: 'tb-rf', type: 'TB', field: 'rf' },
  { id: 'tb-ln', type: 'TB', field: 'ln' },
]

export interface DifficultyReading {
  value: number
  source: 'typeDifficulty' | 'mapAverage'
  sampleCount: number
}

export interface FitPoint {
  x: number
  y: number
}

export interface LinearFit {
  slope: number
  intercept: number
  rSquared: number
  rmse: number
  sampleCount: number
  predict: (x: number) => number
}

export interface KnownRound {
  key: string
  tournament: Tournament
  round: Round
  reading: DifficultyReading
  difference: number
}

function dimensionConfig(id: DifficultyDimensionId): DifficultyDimension {
  return DIFFICULTY_DIMENSIONS.find((item) => item.id === id) ?? DIFFICULTY_DIMENSIONS[0]
}

export function roundKey(tournamentId: string, roundId: string): string {
  return `${tournamentId}::${roundId}`
}

export function getRoundDifficulty(
  round: Round,
  dimensionId: DifficultyDimensionId,
): DifficultyReading | null {
  const dimension = dimensionConfig(dimensionId)
  const explicit = round.typeDifficulties?.[dimension.type]?.[dimension.field]

  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return { value: explicit, source: 'typeDifficulty', sampleCount: 1 }
  }

  const values = round.maps
    .filter((map) => map.type === dimension.type)
    .map((map) => {
      if (dimension.id === 'ln-ln') return map.difficulty
      return dimension.field === 'rf' ? map.difficulty : map.difficultyLn
    })
    .filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value > 0
    )

  if (values.length === 0) return null

  return {
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
    source: 'mapAverage',
    sampleCount: values.length,
  }
}

export function buildLadderPositionMap(
  tournaments: Tournament[],
  entries: LadderEntry[],
): Map<string, number> {
  const positions = new Map<string, number>()
  let position = 0
  let first = true

  for (const entry of entries) {
    const tournament = tournaments.find((item) => item.id === entry.tournamentId)
    const round = tournament?.rounds.find((item) => item.id === entry.roundId)
    if (!tournament || !round) continue

    if (!first) {
      const step = typeof entry.step === 'number' && Number.isFinite(entry.step) && entry.step > 0
        ? entry.step
        : 1
      position += step
    }

    first = false
    positions.set(roundKey(entry.tournamentId, entry.roundId), position)
  }

  return positions
}

export function linearRegression(points: FitPoint[]): LinearFit | null {
  const valid = points.filter((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y)
  )
  if (valid.length < 2 || new Set(valid.map((point) => point.x)).size < 2) return null

  const meanX = valid.reduce((sum, point) => sum + point.x, 0) / valid.length
  const meanY = valid.reduce((sum, point) => sum + point.y, 0) / valid.length
  const denominator = valid.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  if (denominator <= Number.EPSILON) return null

  const numerator = valid.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  )
  const slope = numerator / denominator
  const intercept = meanY - slope * meanX
  const predict = (x: number) => slope * x + intercept

  const residualSum = valid.reduce((sum, point) => sum + (point.y - predict(point.x)) ** 2, 0)
  const totalSum = valid.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0)

  return {
    slope,
    intercept,
    rSquared: totalSum <= Number.EPSILON ? 1 : Math.max(0, 1 - residualSum / totalSum),
    rmse: Math.sqrt(residualSum / valid.length),
    sampleCount: valid.length,
    predict,
  }
}

export function findNearestKnownRounds(
  tournaments: Tournament[],
  dimensionId: DifficultyDimensionId,
  targetDifficulty: number,
  excludedKeys: Set<string> = new Set(),
  limit = 5,
): KnownRound[] {
  if (!Number.isFinite(targetDifficulty)) return []

  const known: KnownRound[] = []
  for (const tournament of tournaments) {
    for (const round of tournament.rounds) {
      const key = roundKey(tournament.id, round.id)
      if (excludedKeys.has(key)) continue
      const reading = getRoundDifficulty(round, dimensionId)
      if (!reading) continue
      known.push({
        key,
        tournament,
        round,
        reading,
        difference: Math.abs(reading.value - targetDifficulty),
      })
    }
  }

  return known
    .sort((a, b) => a.difference - b.difference || b.tournament.year - a.tournament.year)
    .slice(0, limit)
}
