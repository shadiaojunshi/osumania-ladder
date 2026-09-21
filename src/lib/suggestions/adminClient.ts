import type { ReviewPreview, ReviewState, SuggestionRef } from './review'

export async function reviewRequest<T>(action: string, ref: SuggestionRef, planHash?: string): Promise<T> {
  const response = await fetch('/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ref, planHash }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
  return result as T
}
export const previewRequest = (ref: SuggestionRef) => reviewRequest<ReviewPreview>('preview', ref)
export const stageRequest = (ref: SuggestionRef, planHash: string) => reviewRequest<{ review: ReviewState }>('stage', ref, planHash)
