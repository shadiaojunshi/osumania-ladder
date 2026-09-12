import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { onRequestGet as handler } from '../functions/api/osu/raw.ts'

const onRequestGet = (context) => handler({ ...context, data: { user: { uid: 'test', username: 'test', role: 'contributor' } } })

const chart = (id = 123, spacing = 100) => [
  'osu file format v14', '[General]', 'Mode: 3', '[Metadata]', `BeatmapID:${id}`,
  '[Difficulty]', 'CircleSize:4', 'OverallDifficulty:8', '[TimingPoints]',
  '0,500,4,2,1,100,1,0', '[HitObjects]',
  ...Array.from({ length: 120 }, (_, i) => `${64 + i % 4 * 128},192,${i * spacing},1,0,0:0:0:0:`),
].join('\n')

async function archive(text = chart(), compression = 'DEFLATE') {
  const zip = new JSZip()
  zip.file('map.osu', text)
  zip.file('audio.mp3', new Uint8Array(1_000_000), { compression: 'STORE' })
  return zip.generateAsync({ type: 'uint8array', compression })
}

// slot 的主文件是 `<slot>.osz`;SV/SPECIAL 类会存成 `<slot>.nsv.osz`,
// 读端两种都要探一遍(见 functions/api/osu/raw.ts)。
const MAIN_KEY = 'maps/test-cup/round-1/RC1.osz'
const NSV_KEY = 'maps/test-cup/round-1/RC1.nsv.osz'

function bucket(bytes, etag = 'version-1', storedKey = MAIN_KEY) {
  const reads = []
  const heads = []
  return {
    reads,
    heads,
    async head(key) {
      assert.ok(key === MAIN_KEY || key === NSV_KEY, `unexpected R2 head key: ${key}`)
      heads.push(key)
      if (key !== storedKey) return null
      return bytes ? { size: bytes.length, etag } : null
    },
    async get(key, options) {
      assert.equal(key, storedKey)
      assert.ok(options.range, 'must never download the whole archive')
      reads.push(options.range)
      const { offset, length } = options.range
      const data = bytes.slice(offset, offset + length)
      return { body: new Blob([data]).stream(), arrayBuffer: async () => data.buffer, etag }
    },
  }
}

const scoped = '?tournamentId=test-cup&roundId=round-1&slot=RC1'
const request = (query, headers) => new Request(`https://ladder.test/api/osu/raw${query}`, { headers })

test('R2 supplies the actual uploaded chart even when osu is rate limited', async (t) => {
  let upstreamCalls = 0
  t.mock.method(globalThis, 'fetch', async () => { upstreamCalls++; return new Response('', { status: 429 }) })
  const r2 = bucket(await archive())
  const response = await onRequestGet({ request: request(`${scoped}&id=123`), env: { R2_BUCKET: r2 } })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), chart())
  assert.equal(response.headers.get('X-Beatmap-Source'), 'r2')
  assert.equal(upstreamCalls, 0)
  assert.ok(r2.reads.reduce((sum, r) => sum + r.length, 0) < 100_000)
})

test('an uploaded unsubmitted chart needs no BID and accepts stored ZIP entries', async () => {
  const response = await onRequestGet({ request: request(scoped), env: { R2_BUCKET: bucket(await archive(chart(-1), 'STORE')) } })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), chart(-1))
})

test('only an absent R2 object falls back to the authenticated osu proxy', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://proxy.test/osu/123')
    assert.equal(options.headers['X-Proxy-Secret'], 'test-secret')
    return new Response(chart())
  })
  const response = await onRequestGet({ request: request(`${scoped}&id=123`), env: {
    R2_BUCKET: bucket(null), OSU_PROXY_URL: 'https://proxy.test/', OSU_PROXY_SECRET: 'test-secret',
  } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('X-Beatmap-Source'), 'proxy')
})

test('a corrupt or mismatched uploaded chart is reported without substituting the online chart', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(chart()) })
  for (const bytes of [new Uint8Array(50), await archive(chart(456))]) {
    const response = await onRequestGet({ request: request(`${scoped}&id=123`), env: { R2_BUCKET: bucket(bytes) } })
    assert.equal(response.status, 422)
  }
  assert.equal(calls, 0)
})

test('R2 ETags revalidate cached results and change after upload replacement', async () => {
  const bytes = await archive()
  const oldBucket = bucket(bytes)
  const first = await onRequestGet({ request: request(scoped), env: { R2_BUCKET: oldBucket } })
  const etag = first.headers.get('ETag')
  assert.ok(etag)
  const reads = oldBucket.reads.length
  const cached = await onRequestGet({ request: request(scoped, { 'If-None-Match': etag }), env: { R2_BUCKET: oldBucket } })
  assert.equal(cached.status, 304)
  assert.equal(oldBucket.reads.length, reads)
  const replaced = await onRequestGet({ request: request(scoped, { 'If-None-Match': etag }), env: { R2_BUCKET: bucket(await archive(chart(123, 50)), 'version-2') } })
  assert.equal(replaced.status, 200)
  assert.notEqual(replaced.headers.get('ETag'), etag)
  assert.equal(await replaced.text(), chart(123, 50))
})

test('invalid R2 paths fail before any storage or upstream access', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('unexpected network request'))
  for (const query of ['?id=123&tournamentId=test-cup', `${scoped}&roundId=../other`, `${scoped}&slot=../LN1`]) {
    const response = await onRequestGet({ request: request(query), env: {} })
    assert.equal(response.status, 400)
  }
})

test('private uploaded charts retain the metadata endpoint contributor requirement', async () => {
  const response = await handler({ request: request(scoped), env: {}, data: { user: { role: 'readonly' } } })
  assert.equal(response.status, 403)
})

test('a replacement during range reads retries storage without downloading another version', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('must not replace the uploaded version'))
  const r2 = bucket(await archive())
  r2.get = async (_key, options) => {
    assert.equal(options.onlyIf.etagMatches, 'version-1')
    return { etag: 'version-2' } // R2 failed the conditional read; there is no body.
  }
  const response = await onRequestGet({ request: request(`${scoped}&id=123`), env: { R2_BUCKET: r2 } })
  assert.equal(response.status, 503)
})

test('a slot without either an uploaded file or BID returns a useful missing-file response', async () => {
  const r2 = bucket(null)
  const response = await onRequestGet({ request: request(scoped), env: { R2_BUCKET: r2 } })
  assert.equal(response.status, 404)
  // 主文件与 NSV 变体都探过,才算"确实没有上传版本"。
  assert.deepEqual(r2.heads, [MAIN_KEY, NSV_KEY])
})

test('an SV slot uploaded as <slot>.nsv.osz is served from R2 instead of falling back online', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('NSV upload must not fall back to the online chart'))
  const r2 = bucket(await archive(), 'nsv-1', NSV_KEY)
  const response = await onRequestGet({ request: request(`${scoped}&id=123`), env: { R2_BUCKET: r2 } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('X-Beatmap-Source'), 'r2')
  assert.equal(await response.text(), chart())
  assert.deepEqual(r2.heads, [MAIN_KEY, NSV_KEY])
  // 读取走的是真正存在的那个 key。
  assert.ok(r2.reads.length > 0)
})

test('the browser client revalidates each slot and recalculates after an upload replacement', async (t) => {
  globalThis.window = { setTimeout, clearTimeout }
  let currentBucket = bucket(await archive())
  let textResponses = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = await onRequestGet({
      request: new Request(new URL(url, 'https://ladder.test'), { headers: options.headers }),
      env: { R2_BUCKET: currentBucket },
    })
    if (response.status === 200) textResponses++
    return response
  })
  const { estimateBeatmapDifficulty } = await import('../src/lib/maniaAnalyserClient.ts')
  const target = { tournamentId: 'test-cup', roundId: 'round-1', slot: 'RC1' }
  const first = await estimateBeatmapDifficulty(target)
  assert.equal(first.columnCount, 4)
  assert.equal(first.source, 'r2')
  const unchanged = await estimateBeatmapDifficulty(target)
  assert.equal(unchanged, first)
  assert.equal(textResponses, 1)
  currentBucket = bucket(await archive(chart(123, 50)), 'version-2')
  const replaced = await estimateBeatmapDifficulty(target)
  assert.notEqual(replaced.rcNumeric, first.rcNumeric)
  assert.equal(textResponses, 2)
})

test('two uploaded versions with one BID never share an estimate', async (t) => {
  globalThis.window = { setTimeout, clearTimeout }
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    const slot = new URL(url, 'https://ladder.test').searchParams.get('slot')
    calls.push(slot)
    return new Response(chart(789, slot === 'RC1' ? 100 : 50), { headers: { ETag: `"${slot}"`, 'X-Beatmap-Source': 'r2' } })
  })
  const { estimateBeatmapDifficulty } = await import('../src/lib/maniaAnalyserClient.ts')
  const target = { beatmapId: 789, tournamentId: 'test-cup', roundId: 'round-2' }
  const first = await estimateBeatmapDifficulty({ ...target, slot: 'RC1' })
  const second = await estimateBeatmapDifficulty({ ...target, slot: 'RC2' })
  assert.notEqual(first.rcNumeric, second.rcNumeric)
  assert.deepEqual(calls, ['RC1', 'RC2'])
})
