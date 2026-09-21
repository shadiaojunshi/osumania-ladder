import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { QuotaCoordinator } = await import('../workers/feedback/src/QuotaCoordinator.ts')
const { handleSubmit } = await import('../workers/feedback/src/index.ts')

// A transactional store double exercises the real coordinator and adapter, not
// the old reserve() mock. Real Cloudflare R2/DO behavior still needs deployment QA.
function state() {
  const records = new Map()
  let queue = Promise.resolve()
  const storage = {
    async get(key) { return structuredClone(records.get(key)) },
    async put(key, value) { records.set(key, structuredClone(value)) },
    async getAlarm() { return 1 },
    async setAlarm() {},
    transaction(callback) {
      const result = queue.then(() => callback(storage))
      queue = result.catch(() => {})
      return result
    },
  }
  return { storage, records }
}
const input = (requestId = crypto.randomUUID(), payloadHash = 'b'.repeat(64), ipHash = 'a'.repeat(32)) => ({ kind: 'acceptance', requestId, payloadHash, ipHash })

test('real coordinator: concurrent same UUID accepts once; different payload conflicts', async () => {
  const s = state(), coordinator = new QuotaCoordinator(s), request = input()
  const results = await Promise.all(Array.from({ length: 10 }, () => coordinator.reserve(request)))
  assert.ok(results.every(r => r.allow))
  assert.ok(results.every(r => r.reservation.receivedAt === results[0].reservation.receivedAt))
  const counters = [...s.records.entries()].find(([key]) => key.startsWith('day:'))[1]
  assert.equal(counters.accepted, 1)
  const conflict = await coordinator.reserve({ ...request, payloadHash: 'c'.repeat(64) })
  assert.equal(conflict.code, 'DUPLICATE_CONFLICT')
})

test('real coordinator: restart, next UTC day and changed IP keep first receipt', async () => {
  const s = state(), first = new QuotaCoordinator(s), request = input()
  const before = await first.reserve(request, Date.parse('2026-09-20T23:59:59Z'))
  const after = await new QuotaCoordinator(s).reserve({ ...request, ipHash: 'd'.repeat(32) }, Date.parse('2026-09-21T00:00:01Z'))
  assert.deepEqual(after, before)
  assert.equal(s.records.has('day:2026-09-21'), false)
})

test('real coordinator: global daily acceptance cap is shared across IPs', async () => {
  const s = state(), coordinator = new QuotaCoordinator(s), now = Date.parse('2026-09-20T10:00:00Z')
  for (let i = 0; i < 300; i++) assert.equal((await coordinator.reserve(input(crypto.randomUUID(), 'b'.repeat(64), i.toString(16).padStart(32, '0')), now)).allow, true)
  assert.equal((await coordinator.reserve(input(), now)).code, 'BUDGET_EXHAUSTED')
})

test('real coordinator: ten-minute acceptance limit uses sliding timestamps', async () => {
  const coordinator = new QuotaCoordinator(state()), now = Date.parse('2026-09-20T10:09:59Z')
  for (let i = 0; i < 5; i++) assert.equal((await coordinator.reserve(input(), now)).allow, true)
  assert.equal((await coordinator.reserve(input(), now + 2000)).code, 'RATE_LIMITED')
  assert.equal((await coordinator.reserve(input(), now + 600001)).allow, true)
})

test('disabled Worker still supports preflight and readable CORS; unrelated paths are closed', async () => {
  const env = { ALLOWED_ORIGINS: 'https://site.example' }
  const headers = { Origin: 'https://site.example' }
  const preflight = await handleSubmit(new Request('https://worker.example/v1/suggestions', { method: 'OPTIONS', headers }), env)
  assert.equal(preflight.status, 204)
  const closed = await handleSubmit(new Request('https://worker.example/v1/suggestions', { method: 'POST', headers }), env)
  assert.equal(closed.status, 503)
  assert.equal(closed.headers.get('Access-Control-Allow-Origin'), headers.Origin)
  assert.equal(closed.headers.get('Access-Control-Expose-Headers'), 'Retry-After')
  assert.equal((await handleSubmit(new Request('https://worker.example/admin'), env)).status, 404)
})
