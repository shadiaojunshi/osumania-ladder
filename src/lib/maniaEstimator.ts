export interface EstimatorResult {
  estDiff?: string
  numericDifficulty?: number | null
  lnRatio?: number
  columnCount?: number
}

type EstimatorModule = {
  runDefaultEstimatorFromText: (osuText: string) => Promise<EstimatorResult>
}

const RUNTIME_ROOT = '/mania-analyser/2026-11-13'
const ANALYSIS_TIMEOUT_MS = 60_000
let estimatorModulePromise: Promise<EstimatorModule> | null = null
let worker: Worker | null = null
let nextId = 0

// Callers already serialize maps. Reuse one worker and its loaded model across
// the batch; a failed request releases the worker so the next retry starts clean.
export async function runManiaEstimator(osuText: string): Promise<EstimatorResult> {
  if (typeof Worker === 'undefined') {
    if (!estimatorModulePromise) {
      const moduleUrl = `${RUNTIME_ROOT}/estimate.js`
      estimatorModulePromise = (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl) as Promise<EstimatorModule>)
        .catch(error => { estimatorModulePromise = null; throw error })
    }
    return (await estimatorModulePromise).runDefaultEstimatorFromText(osuText)
  }

  const activeWorker = worker ??= new Worker(`${RUNTIME_ROOT}/worker.js`, { type: 'module' })
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      activeWorker.removeEventListener('message', onMessage)
      activeWorker.removeEventListener('error', onError)
      activeWorker.removeEventListener('messageerror', onError)
    }
    const fail = (error: Error) => {
      cleanup()
      activeWorker.terminate()
      if (worker === activeWorker) worker = null
      reject(error)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data.id !== id) return
      if (event.data.error) { fail(new Error(event.data.error)); return }
      cleanup()
      resolve(event.data.result)
    }
    const onError = () => fail(new Error('estimator worker failed'))
    const timeout = setTimeout(() => fail(new Error('estimation timed out')), ANALYSIS_TIMEOUT_MS)
    activeWorker.addEventListener('message', onMessage)
    activeWorker.addEventListener('error', onError)
    activeWorker.addEventListener('messageerror', onError)
    try { activeWorker.postMessage({ id, osuText }) } catch (error) { fail(error as Error) }
  })
}
