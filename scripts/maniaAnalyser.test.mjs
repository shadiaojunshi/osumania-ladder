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
