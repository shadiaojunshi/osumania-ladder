export interface ManiaAnalysisEstimate {
  beatmapId: number
  estDiff: string
  rcLabel: string
  lnLabel: string
  rcNumeric: number | null
  lnRatio: number
  columnCount: number
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

// A stopped local bridge should fail quickly while an estimator that is
// loading its parser still gets a few seconds to respond.
const REQUEST_TIMEOUT_MS = 20_000
const SERVICE_COOLDOWN_MS = 60_000

function analyserBaseUrl(): string {
  // A deploy can point at a different local bridge, while the bundled
  // osu-toolbox uses this default during local editing.
  const configured = process.env.NEXT_PUBLIC_OSU_TOOLBOX_URL?.trim()
  return (configured || 'http://localhost:5173').replace(/\/$/, '')
}

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
  return error instanceof TypeError || (error instanceof Error && /abort|network|failed|cors|fetch|osu-toolbox HTTP 5/i.test(error.message))
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
  if (Date.now() < serviceUnavailableUntil) {
    throw new Error('osu-toolbox unavailable')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${analyserBaseUrl()}/api/analyse/${encodeURIComponent(beatmapId)}?mod=NM`,
      { signal: controller.signal, cache: 'no-store' },
    )
    if (!response.ok) throw new Error(`osu-toolbox HTTP ${response.status}`)
    const data = await response.json() as {
      beatmapId?: number
      estDiff?: string
      numericDifficulty?: number | null
      lnRatio?: number
      columnCount?: number
      supported?: boolean
    }
    if (data.supported === false) throw new Error('unsupported beatmap')
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
  } catch (error) {
    if (isLikelyServiceFailure(error)) serviceUnavailableUntil = Date.now() + SERVICE_COOLDOWN_MS
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
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
