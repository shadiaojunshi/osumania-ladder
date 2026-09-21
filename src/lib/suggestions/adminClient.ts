import type { ReviewPreview, ReviewState, SuggestionRef } from './review'
import type { SuggestReviewAction } from './types'

/** 只读的 `preview` 走 `previewRequest`，这里只接会改状态的动作（拼错动作名 = 编译错误）。 */
type MutatingAction = Exclude<SuggestReviewAction, 'preview'>

async function send<T>(action: SuggestReviewAction, ref: SuggestionRef, planHash?: string): Promise<T> {
  const response = await fetch('/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ref, planHash }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
  return result as T
}
export const reviewRequest = <T,>(action: MutatingAction, ref: SuggestionRef, planHash?: string) => send<T>(action, ref, planHash)
export const previewRequest = (ref: SuggestionRef) => send<ReviewPreview>('preview', ref)
export const stageRequest = (ref: SuggestionRef, planHash: string) => send<{ review: ReviewState }>('stage', ref, planHash)
