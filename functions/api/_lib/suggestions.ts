import { hasRole, type AuthEnv, type SessionUser } from './auth'
import { jsonResponse } from './cors'
import { githubFetch } from './github'
import { validateSubmission, stripToken } from '../../../src/lib/suggestions/validation'
import { planSuggestChange } from '../../../src/lib/suggestions/patch'
import { digest, targetFingerprint } from '../../../src/lib/suggestions/fingerprint'
import { planIdentity, type ReviewItem, type ReviewState, type SuggestionRef } from '../../../src/lib/suggestions/review'
import type { Tournament } from '../../../src/lib/types'

export interface SuggestionsEnv extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  SUGGESTIONS?: R2Bucket
  SUGGESTION_REVIEWS?: R2Bucket
}
export class ReviewError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 409, code?: string) { super(message); this.status = status; this.code = code }
}
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function checkDate(date: string) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new ReviewError('日期无效', 400)
  return date.replaceAll('-', '/')
}
export function itemKey(id: string, date: string, kind = 'items') {
  if (!UUID.test(id)) throw new ReviewError('编号无效', 400)
  return `suggest/${kind}/${checkDate(date)}/${id}.json`
}
export function checkReviewer(env: SuggestionsEnv, user?: SessionUser): asserts user is SessionUser {
  if (!hasRole(user ?? null, 'admin')) throw new ReviewError('需要 admin 或 owner 权限', user ? 403 : 401)
  if (!env.SUGGESTIONS || !env.SUGGESTION_REVIEWS) throw new ReviewError('反馈存储尚未配置', 503)
}
/** 审核状态只认这五个 —— 与 `ReviewState['status']` 一字不差。 */
const REVIEW_STATUSES = ['pending', 'staged', 'ignored', 'applied', 'resolved']

/**
 * 读审核状态。记录**存在但形状不对**时报错，不当作"默认待审核"糊过去。
 *
 * 为什么这比"容错成 pending"更安全：状态里的每个动作都要过 `state.revision !== ref.revision`
 * 这道 CAS 守卫，而缺 `revision` 的记录永远不等 → 任何动作都返回 409「建议已更新或正在发布，
 * 请刷新」，可刷新永远不会变好，这条建议等于永久卡死、而审核员看到的原因还是假的。
 * `readItem` 对损坏记录的态度是「建议记录损坏」422，这里沿用同一条规矩 ——
 * 说"坏了"，让站长能定位到那个 R2 对象去处理，而不是编一个看得懂但不对的理由。
 * （尚不存在"历史格式"的包袱：反馈功能还没上线，线上一条记录都没有。）
 */
export async function readState(env: SuggestionsEnv, id: string, date: string) {
  const object = await env.SUGGESTION_REVIEWS!.get(itemKey(id, date, 'reviews'))
  if (!object) return { state: { status: 'pending', revision: 0 } as ReviewState, etag: undefined }
  const state = await object.json<ReviewState>()
  if (!state || typeof state !== 'object' || !Number.isInteger(state.revision) || state.revision < 0 || !REVIEW_STATUSES.includes(state.status)) throw new ReviewError('审核状态记录损坏，请联系站长核对该建议', 422)
  return { state, etag: object.etag }
}
export async function writeState(env: SuggestionsEnv, id: string, date: string, state: ReviewState, etag?: string) {
  const saved = await env.SUGGESTION_REVIEWS!.put(itemKey(id, date, 'reviews'), JSON.stringify(state), {
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' },
  })
  if (!saved) throw new ReviewError('审核状态已被其他操作更新，请刷新后重试')
  return saved.etag
}
export async function readItem(env: SuggestionsEnv, id: string, date: string): Promise<ReviewItem> {
  const object = await env.SUGGESTIONS!.get(itemKey(id, date))
  if (!object) throw new ReviewError('建议不存在或已过保留期', 404)
  const raw = await object.json<{ id: string; receivedAt: string; submission: object }>()
  const parsed = validateSubmission({ ...raw.submission, turnstileToken: 'stored-record' })
  if (!parsed.ok || raw.id !== id || raw.receivedAt.slice(0, 10) !== date) throw new ReviewError('建议记录损坏', 422)
  return { id, receivedAt: raw.receivedAt, submission: stripToken(parsed.value), review: (await readState(env, id, date)).state }
}
export async function authoritative(env: SuggestionsEnv, id: string, ref = 'main') {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(id)) throw new ReviewError('比赛 ID 无效', 400)
  const response = await githubFetch(`/contents/data/tournaments/${id}.json?ref=${encodeURIComponent(ref)}`, env)
  if (!response.ok) throw new ReviewError('无法读取比赛的权威版本', 502)
  const file = await response.json<{ content: string; sha: string }>()
  const tournament = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0)))) as Tournament
  if (tournament.id !== id) throw new ReviewError('文件与比赛 ID 不一致', 422)
  return { tournament, sha: file.sha }
}
export async function previewSuggestion(env: SuggestionsEnv, id: string, date: string) {
  const item = await readItem(env, id, date)
  if (item.submission.proposal.kind === 'text') throw new ReviewError('文字反馈请人工处理，不能直接采纳成比赛修改', 400)
  const { tournament, sha } = await authoritative(env, item.submission.proposal.target.tournamentId)
  const plan = planSuggestChange({ rounds: tournament.rounds, proposal: item.submission.proposal })
  if (!plan.ok) throw new ReviewError(plan.detail, 422)
  const identity = planIdentity(tournament, plan)
  return { item, tournament, sha, plan, identity, planHash: await digest({ plan, identity, sha }), changedSinceSubmission: await targetFingerprint(tournament, item.submission.proposal.target) !== item.submission.baseFingerprint }
}
export function parseRef(value: unknown): SuggestionRef {
  const ref = value as SuggestionRef | null
  if (!ref || !UUID.test(ref.id ?? '') || !UUID.test(ref.draftId ?? '') || !Number.isSafeInteger(ref.revision) || ref.revision < 0) throw new ReviewError('审核参数无效', 400)
  checkDate(ref.date)
  return { id: ref.id, date: ref.date, revision: ref.revision, draftId: ref.draftId }
}
export function ownsLease(state: ReviewState, ref: SuggestionRef, user: SessionUser) {
  return state.status === 'staged' && state.revision === ref.revision && state.reviewerUid === user.uid && state.draftId === ref.draftId && Date.parse(state.leaseExpiresAt ?? '') > Date.now()
}
export function reviewFailure(error: unknown) {
  return jsonResponse({ error: error instanceof ReviewError ? error.message : '反馈服务暂时不可用，请保留草稿后重试', ...(error instanceof ReviewError && error.code ? { code: error.code } : {}) }, error instanceof ReviewError ? error.status : 503)
}
