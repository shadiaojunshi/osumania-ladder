import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// 反馈 Worker：决策层 / 请求层 / 存储层 / 端到端编排。
//
// 为什么测这么细：这个 Worker **没法在本地端到端跑**（要 Cloudflare 账号、Turnstile key、
// R2 桶、Durable Object）。所以方案第 9 节验收清单里凡是不依赖真实平台的条目，
// 都在这里用假 env + 真 Request/Response 钉住。
//
// 重点盯四件事：
//   ① **fail-closed**：开关没开、配置缺项、没有额度协调器 → 一律 503，不"半开着跑"；
//   ② **闸门顺序**：验证闸门必须在 Turnstile 之前（省 siteverify 额度），
//      接纳闸门必须在写之前（额度见底不落盘）；
//   ③ **限长是实读**：Content-Length 撒谎时也得靠累计字节数拦住；
//   ④ **幂等不靠 LIST**：同 requestId 同内容 → 同一收据；换内容 → 409，且不写第二条。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const policy = await import('../workers/feedback/src/policy.ts')
const request_ = await import('../workers/feedback/src/request.ts')
const storeMod = await import('../workers/feedback/src/store.ts')
const envMod = await import('../workers/feedback/src/env.ts')
const { handleSubmit } = await import('../workers/feedback/src/index.ts')

const ORIGIN = 'https://example.pages.dev'
const HOSTNAME = 'example.pages.dev'
const REQUEST_ID = '3f1a6f0e-1c2b-4d3e-8f90-abcdef012345'
const FIXED_NOW = new Date('2026-09-20T09:30:00.000Z')

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function fakeR2(map = new Map()) {
  return {
    map,
    async get(key) {
      if (!map.has(key)) return null
      const text = map.get(key)
      return { async text() { return text } }
    },
    async put(key, body, options) {
      if (options?.onlyIf && map.has(key)) return null
      map.set(key, String(body))
      return { etag: "created" }
    },
  }
}

function fakeCoordinator(decisions = {}) {
  const calls = [], reservations = new Map()
  return {
    calls,
    idFromName: name => name,
    get() { return { async fetch(url, init) {
      const { ipHash, kind, requestId, payloadHash } = JSON.parse(init.body)
      calls.push({ ipHash, kind })
      if (decisions[kind]) return Response.json(decisions[kind])
      if (kind === 'verification') return Response.json({ allow: true })
      const existing = reservations.get(requestId)
      if (existing && existing.payloadHash !== payloadHash) return Response.json({ allow: false, status: 409, code: 'DUPLICATE_CONFLICT' })
      const reservation = existing ?? { id: requestId, receivedAt: FIXED_NOW.toISOString(), payloadHash }
      reservations.set(requestId, reservation)
      return Response.json({ allow: true, reservation })
    } } },
  }
}

function makeEnv(overrides = {}) {
  const bucket = fakeR2()
  return {
    FEEDBACK_WRITES_ENABLED: 'true',
    TURNSTILE_SECRET: 'turnstile-secret',
    TURNSTILE_HOSTNAME: HOSTNAME,
    ALLOWED_ORIGINS: ORIGIN,
    IP_HASH_SALT: 'base-salt',
    QUOTA: fakeCoordinator(),
    SUGGESTIONS: bucket,
    __bucket: bucket,
    ...overrides,
  }
}

function body(overrides = {}) {
  return {
    schemaVersion: 1,
    clientRequestId: REQUEST_ID,
    datasetVersion: 'build-2026-09-20',
    baseFingerprint: 'fp-1',
    proposal: {
      kind: 'slot.realType',
      target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
      value: 'HB3',
    },
    turnstileToken: 'token-abc',
    reason: '这里是 HB1，不是 SS',
    ...overrides,
  }
}

function post(payload = body(), headers = {}) {
  return new Request('https://feedback.example.workers.dev/v1/suggestions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

/** siteverify 的成功响应（三个字段都要对）。 */
const turnstileOk = async () =>
  new Response(JSON.stringify({ success: true, hostname: HOSTNAME, action: 'feedback_submit' }), {
    headers: { 'Content-Type': 'application/json' },
  })

const deps = (fetchImpl = turnstileOk) => ({ now: () => FIXED_NOW, fetchImpl })

async function run(req, env, fetchImpl) {
  const res = await handleSubmit(req, env, deps(fetchImpl))
  let json = null
  try {
    json = await res.clone().json()
  } catch {
    json = null
  }
  return { res, json }
}

/**
 * 捕获一段代码里的 `console.error`。这个 Worker 没法在本地端到端跑，
 * 线上唯一能看出"到底是 R2 没绑、DO 挂了还是配置串了"的就是日志 ——
 * 所以"失败必须留一条日志"要和响应码一样被钉住。
 */
async function capturingErrors(fn) {
  const original = console.error, calls = []
  console.error = (...args) => calls.push(args)
  try {
    return { result: await fn(), calls }
  } finally {
    console.error = original
  }
}

// ---------------------------------------------------------------------------
// 决策层：频率与预算
// ---------------------------------------------------------------------------

const ZERO = {
  ipWindow: 0,
  ipDaily: 0,
  ipAttemptsThisMinute: 0,
  globalAcceptedToday: 0,
  globalVerificationsToday: 0,
}

test('预算：全局验证次数用尽 → 503（整体停写，不是 429）', () => {
  const d = policy.decideVerificationGate(
    { ...ZERO, globalVerificationsToday: policy.DEFAULT_LIMITS.globalDailyVerifications },
    { now: FIXED_NOW },
  )
  assert.equal(d.allow, false)
  assert.equal(d.status, 503)
  assert.equal(d.code, 'BUDGET_EXHAUSTED')
  assert.equal(d.scope, 'global-verifications')
})

test('预算：同 IP 每分钟尝试超限 → 429 + Retry-After（到下一分钟）', () => {
  // 用一个秒数非 0 的时刻，才能验出它真的在算"距下一分钟还有多久"。
  const at = new Date('2026-09-20T09:30:30.000Z')
  const d = policy.decideVerificationGate({ ...ZERO, ipAttemptsThisMinute: 10 }, { now: at })
  assert.equal(d.allow, false)
  assert.equal(d.status, 429)
  assert.equal(d.scope, 'ip-attempts')
  assert.equal(d.retryAfterSeconds, 30, '09:30:30 → 距下一分钟 30 秒')
  // 整分钟边界上不能给 0（那样客户端会立刻重试）。
  const onMinute = policy.decideVerificationGate({ ...ZERO, ipAttemptsThisMinute: 10 }, { now: FIXED_NOW })
  assert.equal(onMinute.retryAfterSeconds, 60)
})

test('预算：全局接纳条数用尽 → 503', () => {
  const d = policy.decideAcceptanceGate({ ...ZERO, globalAcceptedToday: 300 }, { now: FIXED_NOW })
  assert.equal(d.allow, false)
  assert.equal(d.status, 503)
  assert.equal(d.scope, 'global-accepted')
})

test('预算：IP 窗口超限 → 429；窗口按分钟数换算 Retry-After', () => {
  const d = policy.decideAcceptanceGate({ ...ZERO, ipWindow: 5 }, { now: FIXED_NOW })
  assert.equal(d.status, 429)
  assert.equal(d.scope, 'ip-window')
  assert.equal(d.retryAfterSeconds, 600, '10 分钟窗口')
})

test('预算：IP 日额度超限 → 429', () => {
  const d = policy.decideAcceptanceGate({ ...ZERO, ipDaily: 10 }, { now: FIXED_NOW })
  assert.equal(d.status, 429)
  assert.equal(d.scope, 'ip-daily')
})

test('预算：都在额度内 → 放行', () => {
  assert.deepEqual(policy.decideVerificationGate({ ...ZERO, ipAttemptsThisMinute: 9 }), { allow: true })
  assert.deepEqual(policy.decideAcceptanceGate({ ...ZERO, ipWindow: 4, ipDaily: 9 }), { allow: true })
})

// ---------------------------------------------------------------------------
// IP 处理
// ---------------------------------------------------------------------------

test('IP：只信 CF-Connecting-IP，忽略客户端可伪造的 X-Forwarded-For', () => {
  const req = new Request('https://x/', {
    headers: { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '1.2.3.4' },
  })
  assert.equal(policy.clientIp(req), '203.0.113.7')
  assert.equal(policy.clientIp(new Request('https://x/', { headers: { 'X-Forwarded-For': '1.2.3.4' } })), '')
})

test('IP 哈希：同盐同 IP 稳定、换盐就变、且不含原文', async () => {
  const a = await policy.hashIp('203.0.113.7', 'salt-1')
  const b = await policy.hashIp('203.0.113.7', 'salt-1')
  const c = await policy.hashIp('203.0.113.7', 'salt-2')
  assert.equal(a, b)
  assert.notEqual(a, c, '换盐之后跨天无法关联')
  assert.match(a, /^[0-9a-f]{32}$/, '定长 hex')
  assert.notEqual(a, '203.0.113.7', '不能是原文本身')
  assert.equal(a.includes('.'), false, 'hex 里不该出现点分十进制的痕迹')
})

test('按天轮换盐：同一天稳定，跨天不同', () => {
  const d1 = envMod.dailySalt('base', new Date('2026-09-20T00:00:00Z'))
  const d1b = envMod.dailySalt('base', new Date('2026-09-20T23:59:59Z'))
  const d2 = envMod.dailySalt('base', new Date('2026-09-21T00:00:00Z'))
  assert.equal(d1, d1b)
  assert.notEqual(d1, d2)
})

// ---------------------------------------------------------------------------
// Turnstile
// ---------------------------------------------------------------------------

test('Turnstile：三个字段都对才放行', () => {
  assert.deepEqual(
    policy.evaluateTurnstileResponse(
      { success: true, hostname: HOSTNAME, action: 'feedback_submit' },
      { expectedHostname: HOSTNAME },
    ),
    { ok: true },
  )
})

test('Turnstile：success=false → 拒绝', () => {
  const r = policy.evaluateTurnstileResponse({ success: false, 'error-codes': ['invalid-input-response'] }, { expectedHostname: HOSTNAME })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'rejected')
})

test('Turnstile：hostname 不符 → 拒绝（别的站点签发的 token 不能用）', () => {
  const r = policy.evaluateTurnstileResponse(
    { success: true, hostname: 'evil.example', action: 'feedback_submit' },
    { expectedHostname: HOSTNAME },
  )
  assert.equal(r.code, 'bad-hostname')
})

test('Turnstile：hostname 缺失也拒 —— 不能"跳过这项检查"', () => {
  const r = policy.evaluateTurnstileResponse({ success: true, action: 'feedback_submit' }, { expectedHostname: HOSTNAME })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'bad-hostname')
})

test('Turnstile：action 不符或缺失都拒', () => {
  assert.equal(
    policy.evaluateTurnstileResponse({ success: true, hostname: HOSTNAME, action: 'other' }, { expectedHostname: HOSTNAME }).code,
    'bad-action',
  )
  assert.equal(
    policy.evaluateTurnstileResponse({ success: true, hostname: HOSTNAME }, { expectedHostname: HOSTNAME }).code,
    'bad-action',
  )
})

test('Turnstile：非对象响应 → non-json', () => {
  assert.equal(policy.evaluateTurnstileResponse('nope', { expectedHostname: HOSTNAME }).code, 'non-json')
})

test('Turnstile：缺 token 直接拒；超时/网络失败都归为可重试的失败', async () => {
  const missing = await policy.verifyTurnstile({ token: '', secret: 's', expectedHostname: HOSTNAME })
  assert.equal(missing.code, 'missing-token')

  const timeout = await policy.verifyTurnstile({
    token: 't', secret: 's', expectedHostname: HOSTNAME,
    fetchImpl: async () => { throw new Error('The operation was aborted due to timeout') },
  })
  assert.equal(timeout.code, 'timeout')

  const network = await policy.verifyTurnstile({
    token: 't', secret: 's', expectedHostname: HOSTNAME,
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED') },
  })
  assert.equal(network.code, 'network')

  const bad = await policy.verifyTurnstile({
    token: 't', secret: 's', expectedHostname: HOSTNAME,
    fetchImpl: async () => new Response('<html>502</html>', { status: 502 }),
  })
  assert.equal(bad.code, 'non-json', '上游返回非 JSON 时不能当成通过')
})

// ---------------------------------------------------------------------------
// 请求层
// ---------------------------------------------------------------------------

test('形状：只收 application/json（可带 charset）', () => {
  assert.equal(request_.isJsonContentType('application/json'), true)
  assert.equal(request_.isJsonContentType('application/json; charset=utf-8'), true)
  assert.equal(request_.isJsonContentType('application/json-patch+json'), false)
  assert.equal(request_.isJsonContentType('text/plain'), false)
  assert.equal(request_.isJsonContentType(null), false)
})

test('形状：GET / 错类型 / 缺 Origin / 非白名单 Origin 各有各的状态码', async () => {
  const allowed = [ORIGIN]
  assert.equal(request_.checkRequestShape(new Request('https://x/', { method: 'GET' }), { allowedOrigins: allowed }).status, 405)
  assert.equal(
    request_.checkRequestShape(new Request('https://x/', { method: 'POST', headers: { Origin: ORIGIN } }), { allowedOrigins: allowed }).status,
    415,
  )
  assert.equal(
    request_.checkRequestShape(
      new Request('https://x/', { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      { allowedOrigins: allowed },
    ).status,
    403,
  )
  assert.equal(
    request_.checkRequestShape(
      new Request('https://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere' } }),
      { allowedOrigins: allowed },
    ).status,
    403,
  )
  assert.equal(
    request_.checkRequestShape(post(), { allowedOrigins: allowed }).ok,
    true,
  )
})

test('限长：声明的 Content-Length 超限 → 连流都不读', async () => {
  const req = post('{}', { 'Content-Length': String(64 * 1024) })
  const r = await request_.readBoundedBody(req)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'too-large')
})

test('限长：Content-Length 撒谎也拦得住（读的过程中累计）', async () => {
  // 声明 10 字节，实际塞远超上限的内容。
  const big = 'x'.repeat(request_.MAX_BODY_BYTES + 100)
  const req = new Request('https://x/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': '10' },
    body: JSON.stringify({ padding: big }),
  })
  const r = await request_.readBoundedBody(req)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'too-large')
})

test('限长：畸形 Content-Length → 拒（负数/非整数）', async () => {
  for (const value of ['-5', 'abc', '1.5']) {
    const req = post('{}', { 'Content-Length': value })
    const r = await request_.readBoundedBody(req)
    assert.equal(r.ok, false, value)
    assert.equal(r.code, 'bad-length-header')
  }
})

test('限长：正常正文能读全，且不截断 UTF-8', async () => {
  const text = JSON.stringify({ reason: '中文理由 · 测试' })
  const r = await request_.readBoundedBody(post(text))
  assert.equal(r.ok, true)
  assert.equal(JSON.parse(r.text).reason, '中文理由 · 测试')
})

test('JSON 解析：空 / 坏 JSON / 正常', () => {
  assert.equal(request_.parseJsonBody('').ok, false)
  assert.equal(request_.parseJsonBody('   ').ok, false)
  assert.equal(request_.parseJsonBody('{oops').ok, false)
  assert.equal(request_.parseJsonBody('{"a":1}').ok, true)
})

// ---------------------------------------------------------------------------
// 存储层
// ---------------------------------------------------------------------------

test('键：按 UTC 日期分层', () => {
  assert.equal(storeMod.suggestionKey('abc', new Date('2026-09-20T23:59:00Z')), 'suggest/items/2026/09/20/abc.json')
  assert.equal(storeMod.reviewKey('abc', new Date('2026-09-20T00:01:00Z')), 'suggest/reviews/2026/09/20/abc.json')
})

test('稳定序列化：键序不同也得到同一份文本（否则同内容会被误判成 409）', () => {
  const a = storeMod.stableStringify({ b: 1, a: { d: 2, c: 3 } })
  const b = storeMod.stableStringify({ a: { c: 3, d: 2 }, b: 1 })
  assert.equal(a, b)
})

test('payloadHash：同一份内容（键序不同）哈希一致', async () => {
  const h1 = await storeMod.payloadHashOf({ a: 1, b: [1, 2] })
  const h2 = await storeMod.payloadHashOf({ b: [1, 2], a: 1 })
  assert.equal(h1, h2)
  assert.notEqual(h1, await storeMod.payloadHashOf({ a: 1, b: [1, 3] }))
})

test('幂等：没写过 → write；同内容 → replay 同一收据；换内容 → conflict', () => {
  assert.deepEqual(storeMod.checkIdempotency(null, 'h1'), { action: 'write' })

  const stored = JSON.stringify({ id: 'x', receivedAt: '2026-09-20T09:30:00.000Z', payloadHash: 'h1' })
  const replay = storeMod.checkIdempotency(stored, 'h1')
  assert.equal(replay.action, 'replay')
  assert.deepEqual(replay.receipt, { id: 'x', receivedAt: '2026-09-20T09:30:00.000Z' })

  assert.deepEqual(storeMod.checkIdempotency(stored, 'h2'), { action: 'conflict' })
})

test('幂等：已存在的对象读不懂 → conflict（不能当"已收到"回执）', () => {
  assert.equal(storeMod.checkIdempotency('not json', 'h1').action, 'conflict')
  assert.equal(storeMod.checkIdempotency('"a string"', 'h1').action, 'conflict')
  assert.equal(storeMod.checkIdempotency('{}', 'h1').action, 'conflict')
})

// 这里以前还有两条 `storeSuggestion` 的用例（写失败 → 不假装成功、落盘不含 token 且
// `status: pending` / `revision: 1`）。那个函数是更早的骨架，**生产路径从不调用它** ——
// 真正的落盘是 `index.ts` 里的条件创建（`onlyIf` + 条件写失败时重读判定 replay），
// 而两份实现已经漂移：骨架写 `revision: 1`，真路径写 `revision: 0`。
// 两条用例绿灯却是在给一条不跑的路背书，所以删掉；其中有价值的断言（`status` 是 pending、
// 正文里没有 token）已并入下面的编排用例，对着真路径断言。

// ---------------------------------------------------------------------------
// 端到端编排（假 env + 真 Request/Response）
// ---------------------------------------------------------------------------

test('编排：开关没开 → 503，且不碰 Turnstile / R2', async () => {
  const env = makeEnv({ FEEDBACK_WRITES_ENABLED: 'false' })
  let fetched = false
  const { res, json } = await run(post(), env, async () => { fetched = true; return turnstileOk() })
  assert.equal(res.status, 503)
  assert.equal(json.code, 'DISABLED')
  assert.equal(fetched, false)
  assert.equal(env.__bucket.map.size, 0)
})

test('编排：开关**未设**也必须关闭 —— "默认关闭"指的是缺省，不是显式 false', async () => {
  for (const value of [undefined, '', 'false', 'FALSE', '1']) {
    const env = makeEnv({ FEEDBACK_WRITES_ENABLED: value })
    const { res, json } = await run(post(), env)
    assert.equal(res.status, 503, `FEEDBACK_WRITES_ENABLED=${JSON.stringify(value)} 时必须关闭`)
    assert.equal(json.code, 'DISABLED')
    assert.equal(env.__bucket.map.size, 0)
  }
  // 只有字面量 'true' 才开。
  const on = await run(post(), makeEnv({ FEEDBACK_WRITES_ENABLED: 'true' }))
  assert.equal(on.res.status, 201)
})

test('编排：配置缺项 → 503（fail-closed，不半开着跑）', async () => {
  for (const key of ['TURNSTILE_SECRET', 'TURNSTILE_HOSTNAME', 'ALLOWED_ORIGINS', 'IP_HASH_SALT', 'QUOTA']) {
    const env = makeEnv({ [key]: undefined })
    const { res } = await run(post(), env)
    assert.equal(res.status, 503, `缺 ${key} 时必须 503`)
  }
})

test('编排：方法不对 → 405；Origin 不在白名单 → 403 且**不回 CORS 头**', async () => {
  const env = makeEnv()
  const getRes = await handleSubmit(new Request('https://x/v1/suggestions', { method: 'GET' }), env, deps())
  assert.equal(getRes.status, 405)

  const { res } = await run(post(body(), { Origin: 'https://evil.example' }), env)
  assert.equal(res.status, 403)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null, '不能给非白名单来源发 CORS 头')
})

test('编排：白名单内的预检 → 204 + CORS 头回显该 Origin', async () => {
  const env = makeEnv()
  const res = await handleSubmit(
    new Request('https://x/v1/suggestions', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    env,
    deps(),
  )
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN)
})

test('编排：正文超限 → 413，且没调 Turnstile', async () => {
  const env = makeEnv()
  let fetched = false
  const { res, json } = await run(
    post('x'.repeat(request_.MAX_BODY_BYTES + 10)),
    env,
    async () => { fetched = true; return turnstileOk() },
  )
  assert.equal(res.status, 413)
  assert.equal(json.code, 'TOO_LARGE')
  assert.equal(fetched, false)
})

test('编排：伪造字段（id/status）被共享校验层挡下 → 400', async () => {
  const env = makeEnv()
  const { res, json } = await run(post({ ...body(), id: 'sneaky', status: 'applied' }), env)
  assert.equal(res.status, 400)
  assert.equal(json.code, 'BAD_REQUEST')
  assert.equal(json.errors[0].field, 'body')
  assert.match(json.errors[0].message, /未知字段/, '要点出被拒的字段')
  assert.match(json.errors[0].message, /id/)
})

test('编排：验证闸门拒 → 429，且**没调 Turnstile**（省 siteverify 额度）', async () => {
  const env = makeEnv({
    QUOTA: fakeCoordinator({ verification: { allow: false, status: 429, code: 'RATE_LIMITED', scope: 'ip-attempts', retryAfterSeconds: 30 } }),
  })
  let fetched = false
  const { res, json } = await run(post(), env, async () => { fetched = true; return turnstileOk() })
  assert.equal(res.status, 429)
  assert.equal(json.code, 'RATE_LIMITED')
  assert.equal(res.headers.get('Retry-After'), '30')
  assert.equal(fetched, false, '闸门在 Turnstile 之前')
  assert.equal(env.__bucket.map.size, 0)
})

test('编排：Turnstile 失败 → 403，且**不写 R2**', async () => {
  const env = makeEnv()
  const { res, json } = await run(
    post(),
    env,
    async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  assert.equal(res.status, 403)
  assert.equal(json.code, 'TURNSTILE_FAILED')
  assert.equal(env.__bucket.map.size, 0)
  assert.equal(env.QUOTA.calls.some((c) => c.kind === 'acceptance'), false, '验证没过不该占接纳额度')
})

test('编排：接纳闸门拒 → 503，且不写 R2', async () => {
  const env = makeEnv({
    QUOTA: fakeCoordinator({ acceptance: { allow: false, status: 503, code: 'BUDGET_EXHAUSTED', scope: 'global-accepted', retryAfterSeconds: 3600 } }),
  })
  const { res, json } = await run(post(), env)
  assert.equal(res.status, 503)
  assert.equal(json.code, 'BUDGET_EXHAUSTED')
  assert.equal(env.__bucket.map.size, 0)
})

test('编排：成功 → 201 + 收据，对象落在按日期分层的键上且不带 token', async () => {
  const env = makeEnv()
  const { res, json } = await run(post(), env)
  assert.equal(res.status, 201)
  assert.equal(json.ok, true)
  assert.equal(json.id, REQUEST_ID)
  assert.equal(json.receivedAt, FIXED_NOW.toISOString())

  const key = `suggest/items/2026/09/20/${REQUEST_ID}.json`
  assert.ok(env.__bucket.map.has(key), `期望写入 ${key}`)
  const stored = JSON.parse(env.__bucket.map.get(key))
  assert.equal(stored.payloadHash.length, 64)
  assert.equal(stored.ipHash.length, 32)
  // 落盘记录的形状：新提交一律 pending（正文不可变，状态迁移走 reviews/）。
  assert.equal(stored.status, 'pending')
  assert.equal(stored.revision, 0, '审核状态 CAS 的基准是 0')
  assert.equal(JSON.stringify(stored).includes('token-abc'), false, 'turnstileToken 不落盘')
  // 两次闸门各走一次。
  assert.deepEqual(env.QUOTA.calls.map((c) => c.kind), ['verification', 'acceptance'])
})

test('编排：同 requestId 同内容重试 → 200 且**不产生第二条**', async () => {
  const env = makeEnv()
  const first = await run(post(), env)
  assert.equal(first.res.status, 201)

  const second = await run(post(), env)
  assert.equal(second.res.status, 200, '重试不该再回 201（没有新建）')
  assert.deepEqual(second.json, first.json, '必须是同一个收据')
  assert.equal(env.__bucket.map.size, 1, '只应有一条对象')
})

test('编排：同 requestId 换了内容 → 409，且不覆盖已写的那条', async () => {
  const env = makeEnv()
  await run(post(), env)
  const before = env.__bucket.map.get(`suggest/items/2026/09/20/${REQUEST_ID}.json`)

  const { res, json } = await run(post(body({ reason: '换了理由' })), env)
  assert.equal(res.status, 409)
  assert.equal(json.code, 'DUPLICATE_CONFLICT')
  assert.equal(env.__bucket.map.size, 1)
  assert.equal(env.__bucket.map.get(`suggest/items/2026/09/20/${REQUEST_ID}.json`), before, '原记录不能被改动')
})

test('编排：读 R2 失败 → 503，不冒险继续写', async () => {
  const env = makeEnv({
    SUGGESTIONS: {
      async get() { throw new Error('R2 read down') },
      async put() { throw new Error('should not write') },
    },
  })
  const { res, json } = await run(post(), env)
  assert.equal(res.status, 503)
  assert.equal(json.code, 'INTERNAL')
})

test('编排：写 R2 失败 → 503（不能返回"已收到"），且内部原因只进日志', async () => {
  const env = makeEnv({
    SUGGESTIONS: {
      async get() { return null },
      async put() { throw new Error('R2 write down') },
    },
  })
  const { result: { res, json }, calls } = await capturingErrors(() => run(post(), env))
  assert.equal(res.status, 503)
  assert.equal(json.code, 'INTERNAL')
  // 响应体保持笼统：内部结构不回给客户端。但线上"提交永远 503"必须留下可查的痕迹，
  // 否则只能靠猜是 R2 没绑、DO 挂了还是配置串了。
  assert.equal(JSON.stringify(json).includes('R2 write down'), false, '内部错误原文不许出现在响应里')
  assert.equal(calls.length, 1, '失败必须恰好留一条日志')
  assert.equal(calls[0][0], '[feedback] SUBMIT_FAILED')
  assert.equal(calls[0][1].message, 'R2 write down')
  assert.equal(calls[0][1].requestId, REQUEST_ID, '要靠编号才能把用户反馈和日志对上')
  assert.equal('ipHash' in calls[0][1], false, '日志里不许有 IP 哈希（那按设计就不该留存）')
})

test('编排：缺 CF-Connecting-IP → 503（不能退化成共用一个限流桶）', async () => {
  const env = makeEnv()
  const req = post(body())
  req.headers.delete('CF-Connecting-IP')
  const { result: { res }, calls } = await capturingErrors(() => run(req, env))
  assert.equal(res.status, 503)
  assert.equal(env.__bucket.map.size, 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '[feedback] MISSING_CLIENT_IP')
})
