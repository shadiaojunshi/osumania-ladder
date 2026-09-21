import { readRawChart, type RawChartEnv } from '../osu/raw.ts'
import { clientIp, hashIp } from '../../../workers/feedback/src/policy.ts'
import type { ChartDecision } from '../../../workers/charts/src/ChartQuota.ts'

export type ChartTarget = [string, string, string, number | null]
export interface PublicChartsEnv extends RawChartEnv {
  CHART_READS_ENABLED?: string
  CHART_IP_HASH_SALT?: string
  CHART_QUOTA?: DurableObjectNamespace
}
type CacheLike = Pick<Cache, 'match' | 'put'>
interface Deps { cache?: CacheLike; reader?: typeof readRawChart; now?: () => Date }
const inFlight = new Map<string, Promise<Response>>()
const MAX_INFLIGHT_PER_ISOLATE = 2

export function makeChartCatalog(targets: ChartTarget[]) {
  const slots = new Map<string, ChartTarget | null>()
  const ids = new Set<number>()
  for (const target of targets) {
    const key = JSON.stringify(target.slice(0, 3))
    slots.set(key, slots.has(key) ? null : target) // ambiguous legacy targets fail closed
    if (target[3] !== null) ids.add(target[3])
  }
  return { slots, ids }
}
type Catalog = ReturnType<typeof makeChartCatalog>
export function resolvePublicTarget(url: URL, catalog: Catalog): string | null {
  const allowed = ['tournamentId', 'roundId', 'slot', 'id']
  if ([...url.searchParams.keys()].some(k => !allowed.includes(k) || url.searchParams.getAll(k).length !== 1)) return null
  const params = url.searchParams
  if (params.has('tournamentId') || params.has('roundId') || params.has('slot')) {
    const target = catalog.slots.get(JSON.stringify([params.get('tournamentId'), params.get('roundId'), params.get('slot')]))
    if (!target || (params.has('id') && params.get('id') !== String(target[3]))) return null
    return new URLSearchParams({ tournamentId: target[0], roundId: target[1], slot: target[2], ...(target[3] === null ? {} : { id: String(target[3]) }) }).toString()
  }
  const id = params.get('id') ?? ''
  return /^[1-9]\d*$/.test(id) && catalog.ids.has(Number(id)) ? new URLSearchParams({ id }).toString() : null
}
const failure = (code: string, status: number, retry = 0) => new Response(code, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', ...(retry ? { 'Retry-After': String(retry) } : {}) } })

/** No session/KV/GitHub reads. Only published targets, canonical cache keys,
 * globally serialized budgets, and range-based source access. */
export async function publicChart(request: Request, env: PublicChartsEnv, catalog: Catalog, version: string, deps: Deps = {}): Promise<Response> {
  if (request.method !== 'GET') return failure('METHOD_NOT_ALLOWED', 405)
  if (env.CHART_READS_ENABLED !== 'true' || !env.CHART_QUOTA || !env.CHART_IP_HASH_SALT || !env.R2_BUCKET) return failure('CHART_DISABLED', 503, 3600)
  const query = resolvePublicTarget(new URL(request.url), catalog)
  if (!query) return failure('CHART_NOT_PUBLISHED', 404)
  const ip = clientIp(request)
  if (!ip) return failure('CHART_UNAVAILABLE', 503, 60)
  const now = (deps.now ?? (() => new Date()))()
  const cacheUrl = new URL(`/api/charts-cache/${version}?${query}`, request.url).href
  const cacheRequest = new Request(cacheUrl)
  const cache = deps.cache ?? await caches.open('public-charts')
  let cached: Response | undefined
  try { cached = await cache.match(cacheRequest) } catch { /* cache outage still consumes source quota */ }
  const waiting = inFlight.get(cacheUrl)
  const cold = !cached && !waiting
  if (cold && inFlight.size >= MAX_INFLIGHT_PER_ISOLATE) return failure('CHART_BUSY', 503, 5)
  const id = crypto.randomUUID()
  const ipHash = await hashIp(ip, `${env.CHART_IP_HASH_SALT}:${now.toISOString().slice(0, 10)}`)
  const stub = env.CHART_QUOTA.get(env.CHART_QUOTA.idFromName('public-charts-global-v1'))
  const call = async (body: object) => {
    const response = await stub.fetch('https://quota.internal/', { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error('quota unavailable')
    return response.json<ChartDecision>()
  }
  let decision: ChartDecision
  try { decision = await call({ kind: 'reserve', ipHash, id, cold }) } catch { return failure('CHART_QUOTA_UNAVAILABLE', 503, 60) }
  if (!decision.allow) return failure(decision.code, decision.status, decision.retryAfter)
  try {
    let response = cached
    if (!response) {
      let task = waiting ?? inFlight.get(cacheUrl)
      if (!task) {
        // Quota reservations yield; other requests may have filled the isolate
        // while this request awaited its reservation. Recheck before starting IO.
        if (inFlight.size >= MAX_INFLIGHT_PER_ISOLATE) return failure('CHART_BUSY', 503, 5)
        task = (async () => {
          // Do not forward cookies, cache-busting params or client If-None-Match.
          const read = await (deps.reader ?? readRawChart)(new Request(new URL(`/api/osu/raw?${query}`, request.url)), env, 1)
          const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' })
          if (read.headers.has('X-Beatmap-Source')) headers.set('X-Beatmap-Source', read.headers.get('X-Beatmap-Source')!)
          if (!read.ok) {
            const out = failure(read.status === 404 ? 'CHART_NOT_FOUND' : 'CHART_SOURCE_UNAVAILABLE', read.status, read.status === 429 || read.status >= 500 ? Math.max(60, Number(read.headers.get('Retry-After')) || 0) : 0)
            // Short negative caching prevents repeated missing/corrupt-map reads.
            if ([404, 422].includes(read.status)) { out.headers.set('Cache-Control', 'public, max-age=60'); try { await cache.put(cacheRequest, out.clone()) } catch { /* best effort */ } }
            await read.body?.cancel()
            return out
          }
          const text = await read.text()
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
          headers.set('ETag', `"chart-${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}"`)
          const out = new Response(text, { headers })
          try { await cache.put(cacheRequest, out.clone()) } catch { /* successful reads remain usable */ }
          return out
        })()
        inFlight.set(cacheUrl, task)
        void task.finally(() => { if (inFlight.get(cacheUrl) === task) inFlight.delete(cacheUrl) }).catch(() => {})
      }
      response = (await task).clone()
    }
    const headers = new Headers(response.headers)
    // CDN cache is accessed explicitly above, after the canonical target check.
    // Browser cache doesn't turn the quota-aware HTTP route into a public bypass.
    headers.set('Cache-Control', response.ok ? 'private, max-age=300' : 'no-store')
    if (response.ok && headers.get('ETag') === request.headers.get('If-None-Match')) {
      // A cloned stream's cancellation can wait for another consumer. A 304
      // must not wait for that consumer to read or cancel its branch.
      void response.body?.cancel().catch(() => {})
      return new Response(null, { status: 304, headers })
    }
    return new Response(response.body, { status: response.status, headers })
  } catch { return failure('CHART_UNAVAILABLE', 503, 60) }
  finally {
    if (cold) try { await call({ kind: 'release', ipHash, id, day: decision.day }) } catch { /* lease expires; never refund spent quota */ }
  }
}
