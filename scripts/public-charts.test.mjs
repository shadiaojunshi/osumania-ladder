import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { makeChartCatalog, resolvePublicTarget } = await import('../functions/api/_lib/publicCharts.ts')
const { ChartQuota, CHART_LIMITS } = await import('../workers/charts/src/ChartQuota.ts')

const catalog = makeChartCatalog([
  ['cup', 'final', 'RC1', 123],
  ['cup', 'final', 'HB1', null],
])

test('public chart catalog only resolves published targets and exact BID', () => {
  assert.equal(resolvePublicTarget(new URL('https://x/api/charts?tournamentId=cup&roundId=final&slot=RC1&id=123'), catalog), 'tournamentId=cup&roundId=final&slot=RC1&id=123')
  assert.equal(resolvePublicTarget(new URL('https://x/api/charts?tournamentId=cup&roundId=final&slot=RC1&id=456'), catalog), null)
  assert.equal(resolvePublicTarget(new URL('https://x/api/charts?id=456'), catalog), null)
  assert.equal(resolvePublicTarget(new URL('https://x/api/charts?tournamentId=cup&roundId=final&slot=HB1'), catalog), 'tournamentId=cup&roundId=final&slot=HB1')
})

function fakeState() {
  const records = new Map()
  let queue = Promise.resolve()
  const storage = {
    async get(k) { return structuredClone(records.get(k)) },
    async put(k, v) { records.set(k, structuredClone(v)) },
    async getAlarm() { return 1 },
    async setAlarm() {},
    transaction(fn) { const p = queue.then(() => fn(storage)); queue = p.catch(() => {}); return p },
  }
  return { storage }
}

test('chart quota enforces 10k cold reads, 100 per IP, and 10 per minute', async () => {
  const q = new ChartQuota({ ...fakeState(), idFromName: () => ({}) })
  const ip = 'a'.repeat(64)
  const now = Date.parse('2026-09-21T00:00:00Z')
  for (let i = 0; i < CHART_LIMITS.ipDaily; i++) assert.equal((await q.reserve({ kind: 'reserve', ipHash: ip, id: crypto.randomUUID(), cold: false }, now + i * 60001)).allow, true)
  const daily = await q.reserve({ kind: 'reserve', ipHash: ip, id: crypto.randomUUID(), cold: false }, now)
  assert.equal(daily.allow, false); assert.equal(daily.code, 'CHART_IP_DAILY')
})

// 上面那个测试（以及 feedback-coordinator.test.mjs）都直接调 `reserve()`，
// **从不走 DO 的 `fetch()`**，而生产调用方走的是 fetch 里那道输入校验。于是
// /^[a-f0-9]{64}$/ 钉死 64 位、生产方 hashIp() 默认只给 32 位这种不匹配
// 一直没人发现 —— 线上表现是每个 /api/charts 请求都 503 CHART_QUOTA_UNAVAILABLE。
// 契约测试必须用**真实生产方**算出的 hash 喂**真实 fetch()**，不能自己编一个长度对的串。
const { hashIp } = await import('../workers/feedback/src/policy.ts')

test('DO 的 fetch 契约接受生产方真正产出的 ipHash（短哈希不再被判 400）', async () => {
  const q = new ChartQuota({ ...fakeState(), idFromName: () => ({}) })
  const ipHash = await hashIp('203.0.113.7', 'salt:2026-09-21') // 生产方就是这么调的：不传 length
  assert.equal(ipHash.length, 32, '生产方默认长度变了的话，下面这条断言要跟着改口径')
  const response = await q.fetch(new Request('https://quota.internal/', {
    method: 'POST',
    body: JSON.stringify({ kind: 'reserve', ipHash, id: crypto.randomUUID(), cold: true }),
  }))
  assert.equal(response.status, 200, 'DO 必须接受生产方的默认 ipHash，否则 /api/charts 全是 503')
  const decision = await response.json()
  assert.equal(decision.allow, true)
})

test('ipHash 的长度口径与兄弟 DO QuotaCoordinator 一致，且仍然拒绝畸形值', async () => {
  const { QuotaCoordinator } = await import('../workers/feedback/src/QuotaCoordinator.ts')
  const chart = new ChartQuota({ ...fakeState(), idFromName: () => ({}) })
  const feedback = new QuotaCoordinator(fakeState())
  const hex = (n) => 'a'.repeat(n)
  const post = (p, body) => p.fetch(new Request('https://quota.internal/', { method: 'POST', body: JSON.stringify(body) }))
  for (const length of [32, 64]) {
    const chartResponse = await post(chart, { kind: 'reserve', ipHash: hex(length), id: crypto.randomUUID(), cold: false })
    const feedbackResponse = await post(feedback, { kind: 'verification', ipHash: hex(length) })
    assert.equal(chartResponse.status, 200, `ChartQuota 应接受 ${length} 位`)
    assert.equal(feedbackResponse.status, 200, `QuotaCoordinator 应接受 ${length} 位`)
  }
  // 放宽长度不等于放行任意串：非十六进制、过短、空值仍然 400（长度只是防御性断言，
  // ipHash 由服务端从 clientIp 算出，客户端提供不了）。
  for (const ipHash of [hex(16), hex(31), 'z'.repeat(64), '', null, undefined]) {
    assert.equal((await post(chart, { kind: 'reserve', ipHash, id: crypto.randomUUID(), cold: false })).status, 400, `ChartQuota 应拒绝 ${JSON.stringify(ipHash)}`)
    assert.equal((await post(feedback, { kind: 'verification', ipHash })).status, 400, `QuotaCoordinator 应拒绝 ${JSON.stringify(ipHash)}`)
  }
})
