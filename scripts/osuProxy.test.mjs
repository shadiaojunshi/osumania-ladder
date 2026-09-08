import test from 'node:test'
import assert from 'node:assert/strict'

let handle
const previousDeno = globalThis.Deno
globalThis.Deno = {
  env: { get: () => 'test-secret' },
  serve: (handler) => { handle = handler },
}
try { await import('../osu-proxy/main.ts') }
finally {
  if (previousDeno === undefined) delete globalThis.Deno
  else globalThis.Deno = previousDeno
}

test('the chart proxy requires its existing shared secret', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('unauthorized network access'))
  const response = await handle(new Request('https://proxy.test/osu/123'))
  assert.equal(response.status, 401)
})

test('the chart proxy uses a fixed osu URL and preserves upstream rate limiting', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://osu.ppy.sh/osu/123')
    assert.equal(options.headers['X-Proxy-Secret'], undefined)
    assert.ok(options.signal)
    return new Response('rate limited', { status: 429, headers: { 'Retry-After': '7' } })
  })
  const response = await handle(new Request('https://proxy.test/osu/123', { headers: { 'X-Proxy-Secret': 'test-secret' } }))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '7')
  assert.equal(await response.text(), 'rate limited')
})

test('the proxy does not accept arbitrary URLs as beatmap IDs', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('unexpected upstream request'))
  const response = await handle(new Request('https://proxy.test/osu/https%3A%2F%2Fexample.com', { headers: { 'X-Proxy-Secret': 'test-secret' } }))
  assert.equal(response.status, 404)
})
