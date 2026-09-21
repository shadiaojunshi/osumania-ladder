const DAY = 86400000
export const CHART_LIMITS = { coldDaily: 10000, requestsDaily: 20000, ipDaily: 100, ipMinute: 10, ipConcurrent: 2, leaseMs: 90000 } as const
interface DayState { requests: number; cold: number }
interface IpState { requests: number; recent: number[]; active: { id: string; expires: number }[] }
export type ChartDecision = { allow: true; day: string } | { allow: false; status: 429 | 503; code: string; retryAfter: number }
interface QuotaInput { kind: 'reserve' | 'release'; ipHash: string; id: string; cold?: boolean; day?: string }

/** One global object, transactional reservations. Failed source reads still cost
 * a cold slot. Cache hits use the separate total/IP read allowance. */
export class ChartQuota {
  private state: DurableObjectState
  constructor(state: DurableObjectState) { this.state = state }
  async fetch(request: Request) {
    const input = await request.json<QuotaInput>()
    // ipHash 的口径必须和唯一的生产方 `hashIp()` 对齐：它默认只取 32 个十六进制字符
    // （workers/feedback/src/policy.ts 的 `length = 32`）。这里原来钉死 {64}，导致
    // `/api/charts` 每次 reserve 都被判 400 → publicCharts 抛 "quota unavailable"
    // → 每个请求都 503 CHART_QUOTA_UNAVAILABLE，公开图表整个不可用。
    // 兄弟 DO QuotaCoordinator 用的是 {32,64}，两边保持同一口径，别再各自钉死。
    // 长度只是防御性断言：ipHash 由服务端从 clientIp 算出，客户端无法提供。
    if (!input || !/^[a-f0-9]{32,64}$/.test(input.ipHash) || !/^[a-f0-9-]{36}$/.test(input.id) || !['reserve', 'release'].includes(input.kind)) return new Response(null, { status: 400 })
    if (input.kind === 'release' && (!/^\d{4}-\d{2}-\d{2}$/.test(input.day ?? '') || !Number.isFinite(Date.parse(input.day!)))) return new Response(null, { status: 400 })
    const result = await this.reserve(input)
    if (await this.state.storage.getAlarm() === null) await this.state.storage.setAlarm(Date.now() + DAY)
    return Response.json(result)
  }
  async reserve(input: QuotaInput, now = Date.now()): Promise<ChartDecision> {
    const day = new Date(now).toISOString().slice(0, 10)
    const reset = Math.max(1, Math.ceil((Date.parse(day) + DAY - now) / 1000))
    return this.state.storage.transaction(async tx => {
      const ipKey = `day:${input.kind === 'release' ? input.day : day}:ip:${input.ipHash}`
      if (input.kind === 'release') {
        const ip = await tx.get<IpState>(ipKey)
        if (ip?.active.some(a => a.id === input.id)) {
          ip.active = ip.active.filter(a => a.id !== input.id)
          await tx.put(ipKey, ip)
        }
        return { allow: true, day }
      }
      const globalKey = `day:${day}:global`
      const global = await tx.get<DayState>(globalKey) ?? { requests: 0, cold: 0 }
      if (global.requests >= CHART_LIMITS.requestsDaily) return { allow: false, status: 503, code: 'CHART_REQUEST_BUDGET', retryAfter: reset }
      if (input.cold && global.cold >= CHART_LIMITS.coldDaily) return { allow: false, status: 503, code: 'CHART_SOURCE_BUDGET', retryAfter: reset }
      const ip = await tx.get<IpState>(ipKey) ?? { requests: 0, recent: [], active: [] }
      ip.recent = ip.recent.filter(t => t > now - 60000)
      ip.active = ip.active.filter(a => a.expires > now)
      if (ip.requests >= CHART_LIMITS.ipDaily) return { allow: false, status: 429, code: 'CHART_IP_DAILY', retryAfter: reset }
      if (ip.recent.length >= CHART_LIMITS.ipMinute) return { allow: false, status: 429, code: 'CHART_IP_MINUTE', retryAfter: Math.max(1, Math.ceil((ip.recent[0] + 60000 - now) / 1000)) }
      if (input.cold && ip.active.length >= CHART_LIMITS.ipConcurrent) return { allow: false, status: 429, code: 'CHART_CONCURRENT', retryAfter: 5 }
      global.requests++
      if (input.cold) { global.cold++; ip.active.push({ id: input.id, expires: now + CHART_LIMITS.leaseMs }) }
      ip.requests++; ip.recent.push(now)
      await tx.put(globalKey, global)
      await tx.put(ipKey, ip)
      return { allow: true, day }
    })
  }
  async alarm() {
    const cutoff = new Date(Date.now() - DAY).toISOString().slice(0, 10)
    const old = await this.state.storage.list({ prefix: 'day:', end: `day:${cutoff}:`, limit: 128 })
    if (old.size) await this.state.storage.delete([...old.keys()])
    await this.state.storage.setAlarm(Date.now() + (old.size === 128 ? 60000 : DAY))
  }
}
