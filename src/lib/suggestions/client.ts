import type { SuggestStoredSubmission } from './types'

export class SubmissionError extends Error {
  retryAfter: number
  constructor(message: string, retryAfter = 0) { super(message); this.retryAfter = retryAfter }
}
export async function submitSuggestion(endpoint: string, submission: SuggestStoredSubmission, token: string) {
  const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...submission, turnstileToken: token }), signal: AbortSignal.timeout(20000) })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) throw new SubmissionError(body?.code ?? 'NETWORK', Math.min(86400, Math.max(0, Number(response.headers.get('Retry-After')) || 0)))
  if (![200, 201].includes(response.status) || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id) || typeof body.receivedAt !== 'string' || !Number.isFinite(Date.parse(body.receivedAt))) throw new SubmissionError('INVALID_RECEIPT')
  return { id: body.id as string, receivedAt: body.receivedAt as string }
}
