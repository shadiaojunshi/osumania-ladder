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

/**
 * 这份比赛数据**是否正好就是**这条建议当时要的值。
 *
 * 必须**永远不抛**：调用方问的是一个布尔问题（"这条建议还算不算数"），
 * 身份/槽位算不出来时的答案就是"不算数"。踩过的坑：槽位被改名或删掉之后
 * `planIdentity` 会抛（它刻意不猜重复槽位），异常一路冒到 `reviewFailure`，
 * 本该是 409「请先撤销这条建议的关联」的响应变成 503「反馈服务暂时不可用」，
 * 而且 `beginSuggestionBatch` 的 catch 会把**整批**建议取消并释放关联 ——
 * 一次只需要跳过一条的发布，变成审核员看不懂的服务故障、重试还是同一结果。
 */
export function planSatisfied(tournament: Tournament, state: ReviewState): boolean {
  const p = state.plan
  if (!p) return false
  let identity: string
  try { identity = planIdentity(tournament, p) } catch { return false }
  if (identity !== state.identity) return false
  const rounds = tournament.rounds.filter(r => r.id === p.roundId)
  if (rounds.length !== 1) return false
  const changes = p.slot ? p.changes.map(c => ({ ...c, slot: p.slot! })) : p.roundChanges
  return changes.length > 0 && changes.every(c => {
    // 重复槽位同样算"不算数"：`planIdentity` 只是不做猜测，这里也一样，不做取巧的 `find`。
    const maps = rounds[0].maps.filter(m => m.slot === c.slot)
    if (maps.length !== 1) return false
    return (maps[0][c.field] ?? (c.field === 'realType' ? '' : 0)) === c.after
  })
}
