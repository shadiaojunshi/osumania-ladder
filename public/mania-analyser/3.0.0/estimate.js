import { runAnalysisPipeline } from './pipeline/runAnalysisPipeline.js'
import { applyCompanellaToMixedResult } from './estimator/mixedEstimator.js'
import { APP_CONFIG } from './config.js'

// Use the upstream pipeline for routing, normalization and marathon correction.
// Only run auxiliary model features if Mixed actually leaves a Companella plan.
export async function runDefaultEstimatorFromText(osuText, options = {}, {
  loadCompanella = () => import('./companella.js'),
} = {}) {
  const defaults = APP_CONFIG.defaults
  const settings = {
    speedRate: 1, cvtFlag: '', withGraph: false,
    forceSunnyWindow: defaults.forceSunnyWindow,
    enableAnalyzeLN: defaults.enableAnalyzeLN,
    enableAlwaysShowLNDifficulty: defaults.enableAlwaysShowLNDifficulty,
    extendedEstimationRange: defaults.extendedEstimationRange,
    etternaVersion: defaults.etternaVersion,
    ...options,
    // These display-only stages are not needed for a difficulty estimate.
    // Companella features use its own configured MSD version in companella.js.
    withPattern: false, withEtterna: false, withInterlude: false,
    companellaEtternaVersion: undefined,
  }
  const pipeline = await runAnalysisPipeline({
    rawText: osuText,
    estimatorAlgorithm: defaults.estimatorAlgorithm,
    options: settings,
  })
  let result = pipeline.rework
  const window = pipeline.sunnyWindow
  const windowLnLabel = window?.estDiff.split('||').map(part => part.trim()).filter(Boolean)[1]
  const allowWindowLn = result?.unsupported !== true
    && pipeline.actualEstimatorAlgorithm !== 'Proj7k'
    && (pipeline.actualEstimatorAlgorithm !== 'XDC1'
      || Number(result.lnRatio) >= 0.15
      || settings.enableAlwaysShowLNDifficulty === true)
  if (windowLnLabel && allowWindowLn) {
    result = {
      ...result,
      estDiff: `${result.estDiff.split('||')[0].trim()} || ${windowLnLabel}`,
      mixedCompanellaPlan: result.mixedCompanellaPlan ? {
        ...result.mixedCompanellaPlan,
        lnDifficulty: windowLnLabel,
        lnRatio: 4e65,
      } : null,
    }
  }

  if (result.mixedCompanellaPlan) {
    const { estimateCompanella } = await loadCompanella()
    const prediction = await estimateCompanella(osuText, Number(result.star), settings)
    result = applyCompanellaToMixedResult(result, prediction)
  }
  return { ...result, lnStar: window?.lnStar ?? 0 }
}
