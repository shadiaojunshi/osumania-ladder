import { jsonResponse } from '../_lib/cors'
import { readJsonBody } from '../_lib/validation'
import type { SessionUser } from '../_lib/auth'
import { checkReviewer, checkDate, parseRef, previewSuggestion, readItem, readState, writeState, ownsLease, ReviewError, reviewFailure, type SuggestionsEnv } from '../_lib/suggestions'

export const onRequestGet: PagesFunction<SuggestionsEnv> = async ({ env, request, data }) => {
  try {
    checkReviewer(env, (data as { user?: SessionUser }).user)
    const params = new URL(request.url).searchParams
    const date = params.get('date') ?? new Date().toISOString().slice(0, 10)
    const prefix = `suggest/items/${checkDate(date)}/`
    const cursor = params.get('cursor') ?? undefined
    if (cursor && cursor.length > 2048) throw new ReviewError('分页参数无效', 400)
    const list = await env.SUGGESTIONS!.list({ prefix, cursor, limit: 20 })
    const items = []
    for (const object of list.objects) {
      const id = object.key.slice(prefix.length).replace(/\.json$/, '')
      items.push(await readItem(env, id, date))
    }
    return jsonResponse({ items, cursor: list.truncated ? list.cursor : null })
  } catch (error) { return reviewFailure(error) }
}

export const onRequestPost: PagesFunction<SuggestionsEnv> = async ({ env, request, data }) => {
  try {
    const user = (data as { user?: SessionUser }).user
    checkReviewer(env, user)
    const parsed = await readJsonBody(request)
    if (!parsed.ok) throw new ReviewError('请求正文无效', 400)
    const body = parsed.value as { action: string; ref: unknown; planHash?: string }
    const ref = parseRef(body.ref)
    if (body.action === 'preview') return jsonResponse(await previewSuggestion(env, ref.id, ref.date))
    if (!['stage', 'ignore', 'release', 'resolve'].includes(body.action)) throw new ReviewError('审核动作无效', 400)
    const item = await readItem(env, ref.id, ref.date)
    const isText = item.submission.proposal.kind === 'text'
    if ((isText && !['ignore', 'resolve'].includes(body.action)) || (!isText && body.action === 'resolve')) throw new ReviewError('此操作不适用于该反馈类型', 400)
    const { state, etag } = await readState(env, ref.id, ref.date)
    // An expired local source may have been reclaimed elsewhere. Detach that
    // stale source without releasing or changing the newer reviewer's claim.
    if (body.action === 'release' && ref.revision < state.revision) return jsonResponse({ review: state, detached: true })
    // Response loss after a release must not strand the browser's source record.
    if (body.action === 'release' && state.status === 'pending' && state.revision === ref.revision + 1 && state.reviewerUid === user.uid && state.draftId === ref.draftId) return jsonResponse({ review: state })
    if (state.revision !== ref.revision || state.batchId) throw new ReviewError('建议已更新或正在发布，请刷新')
    // 终态：已发布 / 已处理 / **已忽略**。`ignored` 原来漏在这里，于是 release 会把
    // 它拉回 pending、stage 会重新采纳 —— 等于静默撤销一次已经做出的"忽略"决定，
    // 而状态机里没有这条迁移（界面自己就把 ignored 当 closed，见 SuggestionReview 的 closed）。
    // 终态上的 release 按幂等处理：它只是"把本地来源记录摘掉"，沿用上面两条 release
    // 守卫的用意 —— 否则浏览器里的来源记录永远清不掉，每次打开都重试、每次都报错。
    if (['applied', 'resolved', 'ignored'].includes(state.status)) {
      if (body.action === 'release') return jsonResponse({ review: state })
      throw new ReviewError('已处理的建议不能再次审核')
    }
    if (state.status === 'staged' && Date.parse(state.leaseExpiresAt ?? '') > Date.now() && !ownsLease(state, ref, user)) throw new ReviewError('另一份草稿正在处理这条建议')
    if (body.action === 'stage') {
      const preview = await previewSuggestion(env, ref.id, ref.date)
      if (preview.planHash !== body.planHash) throw new ReviewError('预览后比赛数据发生变化，请重新预览')
      if (preview.plan.noop) throw new ReviewError('当前值已符合建议，可以忽略并保留记录')
      const next = { status: 'staged' as const, revision: state.revision + 1, reviewerUid: user.uid, draftId: ref.draftId, leaseExpiresAt: new Date(Date.now() + 86400000).toISOString(), plan: preview.plan, identity: preview.identity }
      await writeState(env, ref.id, ref.date, next, etag)
      return jsonResponse({ review: next })
    }
    const next = { status: body.action === 'resolve' ? 'resolved' as const : body.action === 'ignore' ? 'ignored' as const : 'pending' as const, revision: state.revision + 1, reviewerUid: user.uid, draftId: ref.draftId }
    await writeState(env, ref.id, ref.date, next, etag)
    return jsonResponse({ review: next })
  } catch (error) { return reviewFailure(error) }
}
