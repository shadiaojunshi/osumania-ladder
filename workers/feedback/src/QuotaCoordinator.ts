import { DEFAULT_LIMITS, decideAcceptanceGate, decideVerificationGate, type RateCounters } from './policy.ts'
import type { Reservation, ReserveResult } from './coordinatorAdapter.ts'

const DAY = 86400000
interface DayCounts { accepted: number; verifications: number; recent: number[] }
interface IpCounts { accepted: number; attempts: number[]; recent: number[] }

/** Durable storage transactions serialize concurrent reservations and survive restarts.
 * No R2/GitHub/admin credentials are needed for this object. Failed writes conservatively
 * retain their reservation. Immutable R2 conditional creation handles response loss.
 */
export class QuotaCoordinator {
  private state: DurableObjectState
  constructor(state: DurableObjectState) { this.state = state }

  async fetch(request: Request): Promise<Response> {
    const input = await request.json<{ kind: string; ipHash: string; requestId?: string; payloadHash?: string }>()
    if (!/^[a-f0-9]{32,64}$/.test(input.ipHash) || !['verification', 'acceptance'].includes(input.kind)) return new Response(null, { status: 400 })
    if (input.kind === 'acceptance' && (!/^[a-f0-9-]{36}$/i.test(input.requestId ?? '') || !/^[a-f0-9]{64}$/.test(input.payloadHash ?? ''))) return new Response(null, { status: 400 })
    const result = await this.reserve(input)
    if (await this.state.storage.getAlarm() === null) await this.state.storage.setAlarm(Date.now() + DAY)
    return Response.json(result)
  }

  async reserve(input: { kind: string; ipHash: string; requestId?: string; payloadHash?: string }, now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10)
    return this.state.storage.transaction(async (tx) => {
      const requestKey = `request:${input.requestId}`
      if (input.kind === 'acceptance') {
        const existing = await tx.get<Reservation>(requestKey)
        if (existing) return existing.payloadHash === input.payloadHash
          ? { allow: true, reservation: existing } as ReserveResult
          : { allow: false, code: 'DUPLICATE_CONFLICT', status: 409 } as ReserveResult
      }
      const globalKey = `day:${day}`
      const ipKey = `ip:${day}:${input.ipHash}`
      const global = await tx.get<DayCounts>(globalKey) ?? { accepted: 0, verifications: 0, recent: [] }
      const ip = await tx.get<IpCounts>(ipKey) ?? { accepted: 0, attempts: [], recent: [] }
      ip.attempts = ip.attempts.filter(time => time > now - 60000)
      ip.recent = ip.recent.filter(time => time > now - DEFAULT_LIMITS.ipWindowMinutes * 60000)
      global.recent = global.recent.filter(time => time > now - 60000)
      const counters: RateCounters = { ipWindow: ip.recent.length, ipDaily: ip.accepted, ipAttemptsThisMinute: ip.attempts.length, globalAcceptedToday: global.accepted, globalVerificationsToday: global.verifications }
      const decision = input.kind === 'verification'
        ? decideVerificationGate(counters, { now: new Date(now) })
        : decideAcceptanceGate(counters, { now: new Date(now) })
      if (!decision.allow) return { ...decision, retryAfterSeconds: Math.max(decision.retryAfterSeconds, decision.scope === 'ip-attempts' ? 60 : 1) }
      // A site-wide burst guard bounds Turnstile work even across many IP addresses.
      if (input.kind === 'verification' && global.recent.length >= 60) return { allow: false, code: 'BUDGET_EXHAUSTED', status: 503, scope: 'global-verifications', retryAfterSeconds: 60 }
      let reservation: Reservation | undefined
      if (input.kind === 'verification') {
        global.verifications++
        global.recent.push(now)
        ip.attempts.push(now)
      } else {
        global.accepted++
        ip.accepted++
        ip.recent.push(now)
        reservation = { id: input.requestId!, receivedAt: new Date(now).toISOString(), payloadHash: input.payloadHash! }
        await tx.put(requestKey, reservation)
        await tx.put(`expire:${now + 181 * DAY}:${requestKey}`, requestKey)
      }
      await tx.put(globalKey, global)
      await tx.put(ipKey, ip)
      await tx.put(`expire:${Date.parse(day) + 2 * DAY}:${globalKey}`, globalKey)
      await tx.put(`expire:${Date.parse(day) + 2 * DAY}:${ipKey}`, ipKey)
      return reservation ? { allow: true, reservation } : { allow: true }
    })
  }

  async alarm() {
    // Bounded cleanup, with continuation; no full-store scan per submission.
    const expired = await this.state.storage.list<string>({ prefix: 'expire:', end: `expire:${Date.now()}:\uffff`, limit: 128 })
    if (expired.size) {
      await this.state.storage.delete([...expired.values()])
      await this.state.storage.delete([...expired.keys()])
    }
    await this.state.storage.setAlarm(Date.now() + (expired.size === 128 ? 60000 : DAY))
  }
}
