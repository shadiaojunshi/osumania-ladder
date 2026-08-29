export interface ManiaAnalysisEstimate {
  beatmapId: number
  estDiff: string
  rcLabel: string
  lnLabel: string
  rcNumeric: number | null
  lnRatio: number
  columnCount: number
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

const analysisCache = new Map<number, ManiaAnalysisEstimate>()
const analysisInFlight = new Map<number, Promise<ManiaAnalysisEstimate>>()
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

async function fetchEstimate(beatmapId: number): Promise<ManiaAnalysisEstimate> {
  const cached = analysisCache.get(beatmapId)
  if (cached) return cached
  let lastError: unknown = null
  let osuText = ''

  for (let attempt = 0; attempt <= MAX_SERVICE_RETRIES; attempt += 1) {
    await waitForRequestSlot()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`/api/osu/raw?id=${encodeURIComponent(beatmapId)}`, { signal: controller.signal, cache: 'no-store' })
    } catch (error) {
      lastError = error
      window.clearTimeout(timeout)
      if (!isLikelyServiceFailure(error) || attempt >= MAX_SERVICE_RETRIES) throw error
      const delay = retryAfterMs(null, attempt)
      serviceUnavailableUntil = Math.max(serviceUnavailableUntil, Date.now() + delay)
      continue
    }
    window.clearTimeout(timeout)

    if (response.ok) {
      osuText = await response.text()
      lastError = null
      break
    }

    const error = new Error(`estimation service HTTP ${response.status}`)
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
    estimatorModulePromise = import('../vendor/mania-analyser/estimator/mixedEstimator.js') as Promise<MixedEstimatorModule>
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
    beatmapId,
    estDiff: String(data.estDiff || '-'),
    rcLabel: labels.rc,
    lnLabel: labels.ln,
    rcNumeric: numeric !== null && Number.isFinite(numeric) ? numeric : null,
    lnRatio: Number(data.lnRatio) || 0,
    columnCount: Number(data.columnCount) || 0,
  }
  analysisCache.set(beatmapId, result)
  return result
}

export function estimateBeatmapDifficulty(beatmapId: number, retry = false): Promise<ManiaAnalysisEstimate> {
  if (!Number.isFinite(beatmapId) || beatmapId <= 0) {
    return Promise.reject(new Error('invalid beatmap ID'))
  }
  const cached = analysisCache.get(beatmapId)
  if (cached) return Promise.resolve(cached)
  if (retry) serviceUnavailableUntil = 0
  const pending = analysisInFlight.get(beatmapId)
  if (pending) return pending
  const request = enqueue(() => fetchEstimate(beatmapId))
    .finally(() => analysisInFlight.delete(beatmapId))
  analysisInFlight.set(beatmapId, request)
  return request
}
