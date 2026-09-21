import type { SuggestPlan } from './patch.ts'
import type { SuggestStoredSubmission } from './types.ts'
import type { Tournament } from '../types.ts'

export interface SuggestionRef { id: string; date: string; revision: number; draftId: string }
export interface ReviewState {
  status: 'pending' | 'staged' | 'ignored' | 'applied' | 'resolved'
  revision: number
  reviewerUid?: string
  draftId?: string
  leaseExpiresAt?: string
  plan?: SuggestPlan
  identity?: string
  batchId?: string
  appliedCommitSha?: string
}
export interface ReviewItem {
  id: string
  receivedAt: string
  submission: SuggestStoredSubmission
  review: ReviewState
}
export interface ReviewPreview {
  item: ReviewItem
  tournament: Tournament
  sha: string
  plan: SuggestPlan
  planHash: string
  changedSinceSubmission: boolean
}

/** Includes map identity even when no usable BID exists. Never guess duplicate slots. */
export function planIdentity(tournament: Tournament, plan: SuggestPlan): string {
  if (tournament.id !== plan.tournamentId) throw new Error('比赛身份不匹配')
  const rounds = tournament.rounds.filter(r => r.id === plan.roundId)
  if (rounds.length !== 1) throw new Error('轮次缺失或重复')
  const slots = plan.slot ? [plan.slot] : plan.affectedSlots
  return JSON.stringify(slots.map(slot => {
    const hits = rounds[0].maps.filter(m => m.slot === slot)
    if (hits.length !== 1) throw new Error('槽位缺失或重复')
    const m = hits[0]
    return [slot, m.beatmapId ?? null, m.beatmapsetId ?? null, m.name, m.type]
  }))
}

export function planSatisfied(tournament: Tournament, state: ReviewState): boolean {
  const p = state.plan
  if (!p || planIdentity(tournament, p) !== state.identity) return false
  const round = tournament.rounds.find(r => r.id === p.roundId)!
  const changes = p.slot ? p.changes.map(c => ({ ...c, slot: p.slot! })) : p.roundChanges
  return changes.length > 0 && changes.every(c => {
    const map = round.maps.find(m => m.slot === c.slot)!
    return (map[c.field] ?? (c.field === 'realType' ? '' : 0)) === c.after
  })
}
