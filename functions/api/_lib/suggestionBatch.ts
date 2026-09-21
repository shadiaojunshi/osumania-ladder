import type { SessionUser } from './auth'
import { githubFetch } from './github'
import { digest } from '../../../src/lib/suggestions/fingerprint'
import { planSatisfied, type SuggestionRef } from '../../../src/lib/suggestions/review'
import type { Tournament } from '../../../src/lib/types'
import { authoritative, checkReviewer, ownsLease, parseRef, readState, ReviewError, UUID, writeState, type SuggestionsEnv } from './suggestions'

interface Item { id: string; tournament: unknown; baseSha: string | null }
export interface BatchJournal {
  id: string
  uid: string
  hash: string
  refs: SuggestionRef[]
  expires: number
  cancelled?: boolean
  commit?: string
  parent?: string
  files?: { id: string; sha: string }[]
}
export interface BatchLease { journal: BatchJournal; etag: string }
const key = (id: string) => `suggest/batches/${id}.json`

export async function loadJournal(env: SuggestionsEnv, id: string): Promise<BatchLease | null> {
  if (!UUID.test(id)) throw new ReviewError('批次 ID 无效', 400)
  const object = await env.SUGGESTION_REVIEWS!.get(key(id))
  return object ? { journal: await object.json<BatchJournal>(), etag: object.etag } : null
}

export async function beginSuggestionBatch(env: SuggestionsEnv, user: SessionUser, input: unknown, items: Item[]): Promise<BatchLease> {
  checkReviewer(env, user)
  const raw = input as { id?: string; refs?: unknown[] }
  if (!raw || !UUID.test(raw.id ?? '') || !Array.isArray(raw.refs) || raw.refs.length < 1 || raw.refs.length > 50) throw new ReviewError('建议批次无效（最多 50 条）', 400)
  const refs = raw.refs.map(parseRef)
  if (new Set(refs.map(r => r.id)).size !== refs.length) throw new ReviewError('建议重复', 400)
  const hash = await digest({ refs, items })
  const previous = await loadJournal(env, raw.id!)
  if (previous) {
    if (previous.journal.uid !== user.uid || previous.journal.hash !== hash) throw new ReviewError('批次内容变化，请保留原批次以恢复结果')
    if (previous.journal.cancelled) {
      await releaseBatchClaims(env, previous)
      throw new ReviewError('该批次未发布，已释放关联。请处理冲突后重新保存。', 409, 'SUGGESTION_BATCH_CANCELLED')
    }
    if (previous.journal.commit) return previous
    if (previous.journal.expires > Date.now()) throw new ReviewError('该批次仍在处理中，请两分钟后重试')
  }
  const journal: BatchJournal = { id: raw.id!, uid: user.uid, hash, refs, expires: Date.now() + 120000 }
  const saved = await env.SUGGESTION_REVIEWS!.put(key(journal.id), JSON.stringify(journal), { onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' } })
  if (!saved) throw new ReviewError('该批次已被另一请求接管，请重试')
  const lease = { journal, etag: saved.etag }
  try {
    for (const ref of refs) {
      const { state, etag } = await readState(env, ref.id, ref.date)
      const sameBatch = state.batchId === journal.id && state.reviewerUid === user.uid && state.draftId === ref.draftId && state.revision === ref.revision
      if (!sameBatch && (state.batchId || !ownsLease(state, ref, user))) throw new ReviewError('建议租约过期或已被其他草稿处理，请重新采纳')
      const item = items.find(i => i.id === state.plan?.tournamentId)
      if (!item || !planSatisfied(item.tournament as Tournament, state)) throw new ReviewError('暂存内容已覆盖建议值或替换谱面，请先撤销这条建议的关联')
      if (!sameBatch) await writeState(env, ref.id, ref.date, { ...state, batchId: journal.id }, etag)
    }
    return lease
  } catch (error) {
    await cancelSuggestionBatch(env, lease)
    throw error
  }
}

/** Publish only the candidate that wins this CAS. A delayed old request cannot publish. */
export async function recordCandidate(env: SuggestionsEnv, lease: BatchLease, commit: string, parent: string, files: { id: string; sha: string }[]) {
  const journal = { ...lease.journal, commit, parent, files }
  const object = await env.SUGGESTION_REVIEWS!.put(key(journal.id), JSON.stringify(journal), { onlyIf: { etagMatches: lease.etag } })
  if (!object) throw new ReviewError('发布租约已变化，本请求没有推进分支')
  lease.journal = journal
  lease.etag = object.etag
}

/** Known pre-publication conflicts can release claims; uncertain publication never can. */
export async function cancelSuggestionBatch(env: SuggestionsEnv, lease: BatchLease) {
  if (lease.journal.commit) return
  // Terminal tombstone prevents same-ID takeover racing claim release.
  const saved = await env.SUGGESTION_REVIEWS!.put(key(lease.journal.id), JSON.stringify({ ...lease.journal, cancelled: true }), { onlyIf: { etagMatches: lease.etag } })
  if (!saved) return
  await releaseBatchClaims(env, lease)
}

async function releaseBatchClaims(env: SuggestionsEnv, lease: BatchLease) {
  for (const ref of lease.journal.refs) {
    const { state, etag } = await readState(env, ref.id, ref.date)
    if (state.batchId !== lease.journal.id) continue
    const next = { ...state }
    delete next.batchId
    await writeState(env, ref.id, ref.date, next, etag)
  }
}

export async function isPublished(env: SuggestionsEnv, commit: string) {
  const response = await githubFetch(`/compare/${commit}...main`, env)
  if (!response.ok) throw new ReviewError('无法确认批次是否已发布，保留原批次并重试', 502)
  const comparison = await response.json<{ status: string }>()
  return comparison.status === 'ahead' || comparison.status === 'identical'
}

export async function finishSuggestionBatch(env: SuggestionsEnv, user: SessionUser, id: string) {
  checkReviewer(env, user)
  const lease = await loadJournal(env, id)
  if (!lease || lease.journal.uid !== user.uid || lease.journal.cancelled || !lease.journal.commit) throw new ReviewError('尚无可恢复的发布记录')
  const { journal } = lease
  if (!await isPublished(env, journal.commit!)) throw new ReviewError('候选提交尚未进入发布分支')
  const failed: string[] = []
  const files = new Map<string, Tournament>()
  for (const ref of journal.refs) {
    try {
      const { state, etag } = await readState(env, ref.id, ref.date)
      if (state.status === 'applied' && state.appliedCommitSha === journal.commit && state.batchId === id) continue
      if (state.status !== 'staged' || state.batchId !== id || state.revision !== ref.revision || state.reviewerUid !== user.uid || state.draftId !== ref.draftId || !state.plan) throw new Error('Claim changed')
      const tid = state.plan.tournamentId
      if (!files.has(tid)) files.set(tid, (await authoritative(env, tid, journal.commit)).tournament)
      if (!planSatisfied(files.get(tid)!, state)) throw new Error('Published values changed')
      await writeState(env, ref.id, ref.date, { ...state, status: 'applied', revision: state.revision + 1, appliedCommitSha: journal.commit }, etag)
    } catch { failed.push(ref.id) }
  }
  return { commit: journal.commit, files: journal.files, pending: failed }
}

/** Recovery resumes the exact candidate; it never creates a replacement commit. */
export async function recoverCandidate(env: SuggestionsEnv, user: SessionUser, lease: BatchLease) {
  const { journal } = lease
  if (!journal.commit) throw new ReviewError('没有候选提交')
  if (!await isPublished(env, journal.commit)) {
    const head = await githubFetch('/git/ref/heads/main', env)
    if (!head.ok) throw new ReviewError('无法确认发布分支', 502)
    const ref = await head.json<{ object: { sha: string } }>()
    if (ref.object.sha !== journal.parent) {
      // Prove the branch diverged from this candidate. On an append-only branch,
      // a delayed publisher cannot fast-forward this candidate onto that HEAD.
      const comparison = await githubFetch(`/compare/${journal.commit}...${ref.object.sha}`, env)
      if (!comparison.ok || (await comparison.json<{ status: string }>()).status !== 'diverged') throw new ReviewError('分支状态异常，请保留批次编号联系站长核对', 409)
      const cancelled = await env.SUGGESTION_REVIEWS!.put(key(journal.id), JSON.stringify({ ...journal, cancelled: true }), { onlyIf: { etagMatches: lease.etag } })
      if (!cancelled) throw new ReviewError('批次状态变化，请重试恢复')
      await releaseBatchClaims(env, lease)
      throw new ReviewError('发布分支已更新，原批次未发布。建议已释放，请合并草稿后重新保存。', 409, 'SUGGESTION_BATCH_CANCELLED')
    }
    const update = await githubFetch('/git/refs/heads/main', env, { method: 'PATCH', body: JSON.stringify({ sha: journal.commit, force: false }) })
    if (!update.ok) throw new ReviewError('批次发布未确认，请重试同一批次', 502)
  }
  let pending = journal.refs.map(r => r.id)
  try { pending = (await finishSuggestionBatch(env, user, journal.id)).pending } catch { /* data saved, state retry only */ }
  return { success: true, count: journal.files?.length, commit: journal.commit, files: journal.files, pendingSuggestions: pending }
}
