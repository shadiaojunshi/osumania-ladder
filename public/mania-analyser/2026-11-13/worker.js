import { runDefaultEstimatorFromText } from './estimate.js'

self.onmessage = async ({ data }) => {
  try {
    const result = await runDefaultEstimatorFromText(data.osuText)
    const { estDiff, numericDifficulty, lnRatio, columnCount, lnStar } = result
    self.postMessage({ id: data.id, result: { estDiff, numericDifficulty, lnRatio, columnCount, lnStar } })
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) })
  }
}
