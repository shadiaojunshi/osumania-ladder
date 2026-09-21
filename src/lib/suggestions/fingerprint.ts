import type { Tournament } from '../types.ts'
import type { SuggestTarget } from './types.ts'

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
}

export async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)))
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('')
}

export function targetSnapshot(tournament: Tournament, target: SuggestTarget) {
  return tournament.rounds.filter(r => r.id === target.roundId).map(r => ({ id: r.id, maps: r.maps.filter(m => !target.slot || m.slot === target.slot).map(m => ({ slot: m.slot, type: m.type, beatmapId: m.beatmapId, name: m.name, realType: m.realType, difficulty: m.difficulty, difficultyLn: m.difficultyLn })) }))
}

export const targetFingerprint = (tournament: Tournament, target: SuggestTarget) => digest(targetSnapshot(tournament, target))
