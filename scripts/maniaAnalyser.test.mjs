import test from 'node:test'
import assert from 'node:assert/strict'

test('browser Mixed estimator bundle analyses a small 4K mania chart', async () => {
  const { runMixedEstimatorFromText } = await import('../src/vendor/mania-analyser/estimator/mixedEstimator.js')
  const rows = Array.from(
    { length: 120 },
    (_, index) => `${64 + (index % 4) * 128},192,${index * 100},1,0,0:0:0:0:`,
  )
  const osuText = [
    'osu file format v14',
    '',
    '[General]',
    'Mode: 3',
    '',
    '[Difficulty]',
    'CircleSize: 4',
    'OverallDifficulty: 8',
    '',
    '[TimingPoints]',
    '0,500,4,2,1,100,1,0',
    '',
    '[HitObjects]',
    ...rows,
  ].join('\n')

  const result = runMixedEstimatorFromText(osuText, {
    estimatorAlgorithm: 'Mixed',
    speedRate: 1,
    cvtFlag: '',
    withGraph: false,
  })

  assert.equal(result.columnCount, 4)
  assert.equal(result.lnRatio, 0)
  assert.match(String(result.estDiff), /Reform|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa/)
  assert.equal(Number.isFinite(Number(result.numericDifficulty)), true)
})
