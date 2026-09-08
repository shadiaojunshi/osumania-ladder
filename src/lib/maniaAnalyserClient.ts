export interface ManiaAnalysisEstimate {
  beatmapId: number
  estDiff: string
  rcLabel: string
  lnLabel: string
  rcNumeric: number | null
  lnRatio: number
  columnCount: number
  source?: 'r2' | 'proxy' | 'osu'
}

export interface ManiaAnalysisTarget {
  beatmapId?: number
  tournamentId?: string
  roundId?: string
  slot?: string
}

export class ManiaAnalysisError extends Error {
  status: number
  constructor(status: number) {
    super(`estimation service HTTP ${status}`)
    this.status = status
  }
}

type MixedEstimatorModule = {
  runMixedEstimatorFromText: (osuText: string, options?: Record<string, unknown>) => {
    estDiff?: string
    numericDifficulty?: number | null
    lnRatio?: number
    columnCount?: number
  }
}

type QueueItem<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const analysisCache = new Map<string, { etag: string | null; result: ManiaAnalysisEstimate }>()
const analysisInFlight = new Map<string, Promise<ManiaAnalysisEstimate>>()
const analysisQueue: QueueItem<ManiaAnalysisEstimate>[] = []
let queueRunning = false
let serviceUnavailableUntil = 0
let lastRequestStartedAt = 0
let estimatorModulePromise: Promise<MixedEstimatorModule> | null = null

// The raw-map proxy and parser may need a few seconds on a cold request, but
// never allow a stalled upstream to hold the serial queue forever.
const REQUEST_TIMEOUT_MS = 20_000
const MIN_REQUEST_GAP_MS = 300
const MAX_SERVICE_RETRIES = 2
const RETRY_BACKOFF_MS = 1_000
const MAX_RETRY_DELAY_MS = 10_000

function splitDifficulty(value: unknown): { rc: string; ln: string } {
  const parts = String(value || '')
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
  return {
    rc: parts[0] || '-',
    ln: parts[1] || parts[0] || '-',
  }
}

function isLikelyServiceFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /abort|network|failed|cors|fetch|estimation service HTTP (?:429|5\d\d)/i.test(error.message))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function retryAfterMs(response: Response | null, attempt: number): number {
  const value = response?.headers.get('Retry-After')?.trim()
  if (value) {
    const seconds = Number(value)
    if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1000))
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - Date.now()))
  }
  return Math.min(MAX_RETRY_DELAY_MS, RETRY_BACKOFF_MS * 2 ** attempt)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForRequestSlot() {
  const cooldown = serviceUnavailableUntil - Date.now()
  const pacing = lastRequestStartedAt + MIN_REQUEST_GAP_MS - Date.now()
  const delay = Math.max(cooldown, pacing, 0)
  if (delay > 0) await wait(delay)
  lastRequestStartedAt = Date.now()
}

async function drainQueue() {
  if (queueRunning) return
  queueRunning = true
  try {
    while (analysisQueue.length > 0) {
      const item = analysisQueue.shift()!
      try {
        item.resolve(await item.run())
      } catch (error) {
        item.reject(error)
      }
      // Keep a small gap between maps so entering a large tournament does not
      // turn the local estimator into a burst of CPU/memory work.
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  } finally {
    queueRunning = false
  }
}

function enqueue(run: () => Promise<ManiaAnalysisEstimate>): Promise<ManiaAnalysisEstimate> {
  return new Promise<ManiaAnalysisEstimate>((resolve, reject) => {
    analysisQueue.push({ run, resolve, reject })
    void drainQueue()
  })
}

async function fetchEstimate(target: ManiaAnalysisTarget, query: string, retry: boolean): Promise<ManiaAnalysisEstimate> {
  const cached = retry ? undefined : analysisCache.get(query)
  let lastError: unknown = null
  let osuText = ''
  let etag: string | null = null
  let source: ManiaAnalysisEstimate['source']

  for (let attempt = 0; attempt <= MAX_SERVICE_RETRIES; attempt += 1) {
    await waitForRequestSlot()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`/api/osu/raw?${query}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
      })
      if (response.status === 304 && cached) return cached.result
      if (response.ok) {
        // Keep the timeout active until the response body has finished too.
        osuText = await response.text()
        etag = response.headers.get('ETag')
        const header = response.headers.get('X-Beatmap-Source')
        source = header === 'r2' || header === 'proxy' || header === 'osu' ? header : undefined
        lastError = null
        break
      }
    } catch (error) {
      lastError = error
      if (!isLikelyServiceFailure(error) || attempt >= MAX_SERVICE_RETRIES) throw error
      const delay = retryAfterMs(null, attempt)
      serviceUnavailableUntil = Math.max(serviceUnavailableUntil, Date.now() + delay)
      continue
    } finally { window.clearTimeout(timeout) }

    const error = new ManiaAnalysisError(response.status)
    lastError = error
    if (!isRetryableStatus(response.status) || attempt >= MAX_SERVICE_RETRIES) {
      if (isRetryableStatus(response.status)) {
        serviceUnavailableUntil = Math.max(serviceUnavailableUntil, Date.now() + retryAfterMs(response, attempt))
      }
      throw error
    }
    const delay = retryAfterMs(response, attempt)
    serviceUnavailableUntil = Math.max(serviceUnavailableUntil, Date.now() + delay)
  }

  if (!osuText) throw lastError || new Error('empty beatmap response')
  if (!estimatorModulePromise) {
    estimatorModulePromise = (import('../vendor/mania-analyser/estimator/mixedEstimator.js') as Promise<MixedEstimatorModule>)
      .catch((error) => { estimatorModulePromise = null; throw error })
  }
  const { runMixedEstimatorFromText } = await estimatorModulePromise
  const data = runMixedEstimatorFromText(osuText, {
    estimatorAlgorithm: 'Mixed',
    speedRate: 1,
    cvtFlag: '',
    withGraph: false,
  })
  const labels = splitDifficulty(data.estDiff)
  const numeric = data.numericDifficulty === null || data.numericDifficulty === undefined
    ? null
    : Number(data.numericDifficulty)
  const result: ManiaAnalysisEstimate = {
    beatmapId: target.beatmapId || 0,
    source,
    estDiff: String(data.estDiff || '-'),
    rcLabel: labels.rc,
    lnLabel: labels.ln,
    rcNumeric: numeric !== null && Number.isFinite(numeric) ? numeric : null,
    lnRatio: Number(data.lnRatio) || 0,
    columnCount: Number(data.columnCount) || 0,
  }
  analysisCache.delete(query)
  analysisCache.set(query, { etag, result })
  if (analysisCache.size > 300) analysisCache.delete(analysisCache.keys().next().value!)
  return result
}

export function estimateBeatmapDifficulty(input: number | ManiaAnalysisTarget, retry = false): Promise<ManiaAnalysisEstimate> {
  const target = typeof input === 'number' ? { beatmapId: input } : { ...input }
  const hasBid = Number.isSafeInteger(target.beatmapId) && target.beatmapId! > 0
  const hasSlot = Boolean(target.tournamentId && target.roundId && target.slot)
  if (!hasBid && !hasSlot) {
    return Promise.reject(new Error('invalid beatmap ID or location'))
  }
  const params = new URLSearchParams()
  if (hasBid) params.set('id', String(target.beatmapId))
  if (hasSlot) {
    params.set('tournamentId', target.tournamentId!)
    params.set('roundId', target.roundId!)
    params.set('slot', target.slot!)
  }
  const query = params.toString()
  if (retry) serviceUnavailableUntil = 0
  const pending = analysisInFlight.get(query)
  if (pending) return pending
  // Revalidate the R2 object on every request, even if we already calculated it.
  // Upload replacement changes its ETag; an unchanged object needs only a HEAD.
  const request = enqueue(() => fetchEstimate(target, query, retry))
    .finally(() => analysisInFlight.delete(query))
  analysisInFlight.set(query, request)
  return request
}
