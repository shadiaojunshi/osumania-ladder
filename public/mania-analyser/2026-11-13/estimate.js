import { OsuFileParser } from './parser/osuFileParser.js'
import { runSunnyEstimatorFromText } from './estimator/sunnyEstimator.js'
import { runSunnyWindowEstimatorFromText } from './estimator/sunnyWindowEstimator.js'
import { runMixedEstimatorFromText, applyCompanellaToMixedResult } from './estimator/mixedEstimator.js'
import { APP_CONFIG } from './config.js'

// Match config.js defaults and the difficulty-only stages of the upstream
// pipeline/analysis.js. Keep this entry native ESM: the optional WASM loaders
// resolve their own assets relative to import.meta.url, outside the Next bundle.
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
    ...options,
  }
  const parser = new OsuFileParser(osuText)
  parser.process()
  const sunny = runSunnyEstimatorFromText(osuText, settings, parser)
  let result = runMixedEstimatorFromText(osuText, {
    ...settings,
    precomputedSunnyResult: sunny,
  }, parser)
  const sunnyWindow = settings.forceSunnyWindow
    ? runSunnyWindowEstimatorFromText(osuText, settings, parser)
    : null

  const windowLnLabel = sunnyWindow?.estDiff.split('||')[1]?.trim()
  if (windowLnLabel) {
    result = {
      ...result,
      estDiff: `${result.estDiff.split('||')[0].trim()} || ${windowLnLabel}`,
      mixedCompanellaPlan: result.mixedCompanellaPlan ? {
        ...result.mixedCompanellaPlan,
        lnDifficulty: windowLnLabel,
        // Upstream keeps the SunnyWindow LN label even below the usual LN% gate.
        lnRatio: 4e65,
      } : null,
    }
  }

  if (result.mixedCompanellaPlan) {
    const { estimateCompanella } = await loadCompanella()
    const prediction = await estimateCompanella(osuText, Number(sunny.star), settings)
    result = applyCompanellaToMixedResult(result, prediction)
  }

  return { ...result, star: sunny.star, lnStar: sunnyWindow?.lnStar ?? 0 }
}
