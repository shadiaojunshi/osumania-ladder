import { analyzeEtternaFromText } from './ett/index.js'
import { calculateInterludeStar } from './interlude/index.js'
import { classifyCompanellaDifficulty } from './estimator/companellaEstimator.js'
import { APP_CONFIG } from './config.js'

export async function estimateCompanella(osuText, sunnyStar, options = {}) {
  const [etterna, interludeStar] = await Promise.all([
    analyzeEtternaFromText(osuText, {
      musicRate: options.speedRate ?? 1,
      cvtFlag: options.cvtFlag,
      etternaVersion: APP_CONFIG.defaults.companellaEtternaVersion,
    }),
    calculateInterludeStar(osuText, options.speedRate ?? 1, options.cvtFlag),
  ])
  return classifyCompanellaDifficulty({ msdValues: etterna.values, interludeStar, sunnyStar })
}
