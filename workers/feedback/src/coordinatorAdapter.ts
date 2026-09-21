import type { RateDecision } from './policy.ts'

export interface Reservation {
  id: string
  receivedAt: string
  payloadHash: string
}
export type ReserveResult =
  | { allow: true; reservation: Reservation }
  | Exclude<RateDecision, { allow: true }>
  | { allow: false; code: 'DUPLICATE_CONFLICT'; status: 409 }

export interface Coordinator {
  reserve(ipHash: string, kind: 'verification'): Promise<RateDecision>
  submission(ipHash: string, requestId: string, payloadHash: string): Promise<ReserveResult>
}

/** One named object for the entire site: per-IP objects would multiply global budgets. */
export function coordinatorFor(namespace: DurableObjectNamespace): Coordinator {
  const stub = namespace.get(namespace.idFromName('feedback-global-v1'))
  async function call<T>(body: unknown): Promise<T> {
    const response = await stub.fetch('https://quota.internal/', { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error('Coordinator unavailable')
    return response.json<T>()
  }
  return {
    reserve: (ipHash) => call({ kind: 'verification', ipHash }),
    submission: (ipHash, requestId, payloadHash) => call({ kind: 'acceptance', ipHash, requestId, payloadHash }),
  }
}
