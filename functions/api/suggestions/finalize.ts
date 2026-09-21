import type { SessionUser } from '../_lib/auth'
import { jsonResponse } from '../_lib/cors'
import { readJsonBody } from '../_lib/validation'
import { checkReviewer, ReviewError, reviewFailure, type SuggestionsEnv } from '../_lib/suggestions'
import { finishSuggestionBatch } from '../_lib/suggestionBatch'

export const onRequestPost: PagesFunction<SuggestionsEnv> = async ({ env, request, data }) => {
  try {
    const user = (data as { user?: SessionUser }).user
    checkReviewer(env, user)
    const body = await readJsonBody(request)
    if (!body.ok) throw new ReviewError('请求无效', 400)
    const id = (body.value as { batchId: string }).batchId
    return jsonResponse(await finishSuggestionBatch(env, user, id))
  } catch (error) { return reviewFailure(error) }
}
