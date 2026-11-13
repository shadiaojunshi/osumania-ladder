import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./_analyser-loader.mjs', import.meta.url))

const sampleChart = (holdPercent = 0, keyCount = 4) => [
  'osu file format v14', '[General]', 'Mode:3', '[Difficulty]',
  `CircleSize:${keyCount}`, 'OverallDifficulty:8', '[TimingPoints]',
  '0,500,4,2,1,100,1,0', '[HitObjects]',
  ...Array.from({ length: 240 }, (_, index) => {
    const time = index * 125
    const x = Math.floor((index % keyCount + 0.5) * 512 / keyCount)
    return index % 10 < holdPercent * 10
      ? `${x},192,${time},128,0,${time + 375}:0:0:0:0:`
      : `${x},192,${time},1,0,0:0:0:0:`
  }),
].join('\n')

test('RC estimates retain Mixed output without loading the optional model', async () => {
  const { runDefaultEstimatorFromText } = await import('../public/mania-analyser/2026-11-13/estimate.js')
  const { runMixedEstimatorFromText } = await import('../public/mania-analyser/2026-11-13/estimator/mixedEstimator.js')
  const text = sampleChart()
  const expected = runMixedEstimatorFromText(text)
  const result = await runDefaultEstimatorFromText(text, {}, {
    loadCompanella: () => assert.fail('RC must not load the neural model'),
  })
  assert.equal(result.estDiff, expected.estDiff)
  assert.equal(result.numericDifficulty, expected.numericDifficulty)
  assert.equal(result.lnStar, 0)
})

test('HB and LN finish the deferred model stage and preserve the SunnyWindow LN label', async () => {
  const { runDefaultEstimatorFromText } = await import('../public/mania-analyser/2026-11-13/estimate.js')
  const { runSunnyWindowEstimatorFromText } = await import('../public/mania-analyser/2026-11-13/estimator/sunnyWindowEstimator.js')
  for (const ratio of [0.3, 0.7, 1]) {
    const text = sampleChart(ratio)
    const window = runSunnyWindowEstimatorFromText(text)
    let calls = 0
    const result = await runDefaultEstimatorFromText(text, {}, {
      loadCompanella: async () => ({
        estimateCompanella: async (input, sunnyStar) => {
          assert.equal(input, text)
          assert.ok(Number.isFinite(sunnyStar) && sunnyStar < 9)
          calls++
          return { estDiff: 'Reform 7 mid', numericDifficulty: 7, numericDifficultyHint: null }
        },
      }),
    })
    assert.equal(calls, 1)
    assert.equal(result.estDiff, `Reform 7 mid || ${window.estDiff.split('||')[1].trim()}`)
    assert.equal(result.numericDifficulty, 7)
    assert.equal(result.lnStar, window.lnStar)
    assert.equal(result.mixedCompanellaPlan, null)
  }
})

test('a failed optional stage is reported and can be retried without returning a partial estimate', async () => {
  const { runDefaultEstimatorFromText } = await import('../public/mania-analyser/2026-11-13/estimate.js')
  let calls = 0
  const dependencies = { loadCompanella: async () => ({ estimateCompanella: async () => {
    if (++calls === 1) throw new Error('model download failed')
    return { estDiff: 'Reform 6 mid', numericDifficulty: 6 }
  } }) }
  await assert.rejects(runDefaultEstimatorFromText(sampleChart(0.7), {}, dependencies), /model download failed/)
  const recovered = await runDefaultEstimatorFromText(sampleChart(0.7), {}, dependencies)
  assert.equal(recovered.numericDifficulty, 6)
  assert.equal(calls, 2)
})

test('the browser worker recovers after failure, reuses successful workers, and removes request listeners', async (t) => {
  const previousWorker = globalThis.Worker
  t.after(() => {
    if (previousWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = previousWorker
  })
  const workers = []
  class TestWorker extends EventTarget {
    terminated = false
    constructor() { super(); workers.push(this) }
    terminate() { this.terminated = true }
    postMessage({ id }) {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
        data: workers.length === 1
          ? { id, error: 'model download failed' }
          : { id, result: { estDiff: 'Reform 7 mid', numericDifficulty: 7 } },
      })))
    }
  }
  globalThis.Worker = TestWorker
  const { getEventListeners } = await import('node:events')
  const { runManiaEstimator } = await import('../src/lib/maniaEstimator.ts')
  await assert.rejects(runManiaEstimator(sampleChart(0.7)), /model download failed/)
  assert.equal(workers[0].terminated, true)
  assert.equal((await runManiaEstimator(sampleChart(0.7))).numericDifficulty, 7)
  assert.equal((await runManiaEstimator(sampleChart(1))).numericDifficulty, 7)
  assert.equal(workers.length, 2)
  for (const worker of workers) for (const event of ['message', 'error', 'messageerror']) {
    assert.equal(getEventListeners(worker, event).length, 0)
  }
})

test('browser Mixed estimator bundle analyses a small 4K mania chart', async () => {
  const { runDefaultEstimatorFromText } = await import('../public/mania-analyser/2026-11-13/estimate.js')
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

  const result = await runDefaultEstimatorFromText(osuText, {
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

test('a rate-limited map does not poison later queued estimates', async () => {
  globalThis.window = { setTimeout, clearTimeout }
  const validMap = [
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
    ...Array.from({ length: 40 }, (_, index) => `${64 + (index % 4) * 128},192,${index * 100},1,0,0:0:0:0:`),
  ].join('\n')

  const calls = []
  globalThis.fetch = async (url) => {
    const id = Number(new URL(url, 'https://example.test').searchParams.get('id'))
    calls.push(id)
    if (id === 990001) return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } })
    return new Response(validMap, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  const { estimateBeatmapDifficulty } = await import('../src/lib/maniaAnalyserClient.ts')
  const failed = estimateBeatmapDifficulty(990001)
  const later = estimateBeatmapDifficulty(990002)
  await assert.rejects(failed, /HTTP 429|unavailable/i)
  const result = await later

  assert.equal(result.beatmapId, 990002)
  assert.equal(result.columnCount, 4)
  assert.equal(calls.filter((id) => id === 990001).length, 3)
  assert.ok(calls.includes(990002), `later BID was never requested: ${calls.join(',')}`)
})

test('an invalid BID does not block the next queued estimate', async () => {
  globalThis.window = { setTimeout, clearTimeout }
  const validMap = [
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
    ...Array.from({ length: 40 }, (_, index) => `${64 + (index % 4) * 128},192,${index * 100},1,0,0:0:0:0:`),
  ].join('\n')

  const calls = []
  globalThis.fetch = async (url) => {
    const id = Number(new URL(url, 'https://example.test').searchParams.get('id'))
    calls.push(id)
    if (id === 990003) return new Response('not found', { status: 404 })
    return new Response(validMap, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  const { estimateBeatmapDifficulty } = await import('../src/lib/maniaAnalyserClient.ts')
  const invalid = estimateBeatmapDifficulty(990003)
  const later = estimateBeatmapDifficulty(990004)
  await assert.rejects(invalid, /HTTP 404/i)
  const result = await later

  assert.equal(result.beatmapId, 990004)
  assert.equal(calls.filter((id) => id === 990003).length, 1)
  assert.ok(calls.includes(990004), `later BID was never requested: ${calls.join(',')}`)
})
