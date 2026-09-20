// 反馈提交 Worker 的入口与编排。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 3、4、6 节。这是全站**唯一的公开写入口**，
// 所以每一道闸门的顺序都是有意的：
//
//   开关 → 配置完整性 → 方法/类型/Origin → 限长读体 → JSON → 白名单校验
//   → 验证闸门（全局验证预算 + IP 每分钟尝试）→ Turnstile → 接纳闸门（全局条数 + IP 窗口/日）
//   → 幂等 → 写 R2 → 201
//
// 几处刻意的安排：
//  ① **验证闸门放在 Turnstile 之前**：被刷的请求连一次 siteverify 都不花。
//  ② **接纳闸门放在写之前**：验证通过但额度见底时也不落盘（第 4 节第 5 条"停写"）。
//  ③ **开关与配置都 fail-closed**：没显式开启、或配置缺项、或没有额度协调器 → 一律 503，
//     不"半开着跑"。半配置状态最容易发生的不是功能不可用，而是某道闸门被静默跳过。
//  ④ 这个 handler **不碰 GitHub**（第 6 节："公开提交不调用 GitHub"），
//     也没有任何列表/删除/任意 key 读写路由。

import { stripToken, validateSubmission } from '../../../src/lib/suggestions/validation.ts'
import { dailySalt, readConfig, writesEnabled, type Env } from './env.ts'
import { clientIp, hashIp, verifyTurnstile, type RateDecision } from './policy.ts'
import { checkRequestShape, parseJsonBody, readBoundedBody } from './request.ts'
import { checkIdempotency, payloadHashOf, r2ObjectStore, storeSuggestion, suggestionKey } from './store.ts'

/** 可注入的依赖，便于在不启动 worker 运行时的情况下单测整个编排。 */
export interface Deps {
  now?: () => Date
  fetchImpl?: typeof fetch
}

type RejectionCode =
  | 'BAD_REQUEST'
  | 'TOO_LARGE'
  | 'TURNSTILE_FAILED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXHAUSTED'
  | 'DUPLICATE_CONFLICT'
  | 'INTERNAL'
  | 'DISABLED'

interface FieldError {
  field: string
  code: string
  message: string
}

/**
 * 只对**白名单内的** Origin 回 CORS 头。
 *
 * 这里刻意不用 `*`：一旦回通配，浏览器就能从任何站点发起跨域请求，
 * Origin 白名单那道检查也就白设了（第 4 节第 2 条）。
 */
function corsFor(origin: string | null, allowed: readonly string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 提交接口不该被任何中间层缓存。
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

export async function handleSubmit(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const now = deps.now ?? (() => new Date())
  const fetchImpl = deps.fetchImpl ?? fetch
  const send = (code: RejectionCode, status: number, errors: FieldError[] = [], headers: Record<string, string> = {}) =>
    json({ ok: false, code, errors }, status, headers)

  // ---- ① 总开关：默认关闭（第 9 节第 1 步）----
  if (!writesEnabled(env)) {
    return send('DISABLED', 503, [], { 'Retry-After': '3600' })
  }

  // ---- ② 配置完整性：缺一项就不开放，别半开着跑 ----
  const config = readConfig(env)
  if (!config.ok) {
    // 缺什么只进服务端日志，不回给客户端（那是在告诉攻击者哪里有洞）。
    console.error('[feedback] 配置不完整，未开放写入:', config.missing.join(', '))
    return send('DISABLED', 503, [], { 'Retry-After': '3600' })
  }
  const { turnstileSecret, turnstileHostname, allowedOrigins, ipSalt } = config.value

  const origin = request.headers.get('Origin')
  const cors = corsFor(origin, allowedOrigins)

  // 预检：只有白名单内的 Origin 才回 CORS 头（否则浏览器不会放行，等同于被拒）。
  if (request.method === 'OPTIONS') {
    return Object.keys(cors).length > 0
      ? new Response(null, { status: 204, headers: cors })
      : send('BAD_REQUEST', 403, [{ field: 'origin', code: 'origin-not-allowed', message: origin ?? '(缺失)' }])
  }

  // ---- ③ 方法 / 正文类型 / Origin ----
  const shape = checkRequestShape(request, { allowedOrigins })
  if (!shape.ok) {
    return send('BAD_REQUEST', shape.status, [{ field: 'request', code: shape.code, message: shape.detail ?? '' }], cors)
  }

  // ---- ④ 限长读体（超限即取消流）----
  const body = await readBoundedBody(request)
  if (!body.ok) {
    if (body.code === 'too-large') return send('TOO_LARGE', 413, [{ field: 'body', code: body.code, message: '' }], cors)
    return send('BAD_REQUEST', 400, [{ field: 'body', code: body.code, message: body.detail ?? '' }], cors)
  }

  // ---- ⑤ JSON ----
  const parsed = parseJsonBody(body.text)
  if (!parsed.ok) {
    return send('BAD_REQUEST', 400, [{ field: 'body', code: 'invalid-json', message: '' }], cors)
  }

  // ---- ⑥ 白名单校验：与后台共用同一份契约（第 5 节）----
  const validated = validateSubmission(parsed.value)
  if (!validated.ok) {
    return send('BAD_REQUEST', 400, validated.errors as FieldError[], cors)
  }

  // ---- ⑦ IP：只信 CF-Connecting-IP，取不到就不继续 ----
  const ip = clientIp(request)
  if (!ip) {
    // 拿不到 IP 时不能退化成"所有请求共用一个桶"（那会互相误伤），也不该直接放行。
    console.error('[feedback] 缺少 CF-Connecting-IP，拒绝提交')
    return send('INTERNAL', 503, [], cors)
  }
  const ipHash = await hashIp(ip, dailySalt(ipSalt, now()))

  // ---- ⑧ 验证闸门：被刷的请求不花 siteverify ----
  const coordinator = env.QUOTA
  if (!coordinator) {
    console.error('[feedback] 未配置额度协调器，拒绝提交')
    return send('DISABLED', 503, [], { ...cors, 'Retry-After': '3600' })
  }
  const verificationGate = await coordinator.reserve(ipHash, 'verification')
  if (!verificationGate.allow) return rateLimited(verificationGate, cors, send)

  // ---- ⑨ Turnstile：服务端验证，失败/超时一律不写 ----
  const turnstile = await verifyTurnstile({
    token: validated.value.turnstileToken,
    secret: turnstileSecret,
    remoteIp: ip,
    expectedHostname: turnstileHostname,
    fetchImpl,
  })
  if (!turnstile.ok) {
    // 只回笼统的失败码，不回 siteverify 的原始细节（那是给攻击者的信号）。
    return send('TURNSTILE_FAILED', 403, [{ field: 'turnstileToken', code: turnstile.code, message: '' }], cors)
  }

  // ---- ⑩ 接纳闸门：验证过了，但额度见底也不落盘 ----
  const acceptanceGate = await coordinator.reserve(ipHash, 'acceptance')
  if (!acceptanceGate.allow) return rateLimited(acceptanceGate, cors, send)

  // ---- ⑪ 幂等：同 requestId 重试 → 同一收据；换了内容 → 409 ----
  const submission = stripToken(validated.value)
  const receivedAt = now()
  const key = suggestionKey(submission.clientRequestId, receivedAt)
  const payloadHash = await payloadHashOf(submission)

  const store = r2ObjectStore(env.SUGGESTIONS)
  let existing: string | null = null
  try {
    existing = await store.get(key)
  } catch (err) {
    // 读失败不能当成"没写过" —— 那会在不确定的状态下继续写。
    console.error('[feedback] 读取已有对象失败:', err instanceof Error ? err.message : String(err))
    return send('INTERNAL', 500, [], cors)
  }

  const idempotency = checkIdempotency(existing, payloadHash)
  if (idempotency.action === 'conflict') {
    return send('DUPLICATE_CONFLICT', 409, [{ field: 'clientRequestId', code: 'payload-mismatch', message: '' }], cors)
  }
  if (idempotency.action === 'replay') {
    // 重试拿到同一个收据（第 6 节）。注意这里用 200 而不是 201：没有新建任何东西。
    return json({ ok: true, ...idempotency.receipt }, 200, cors)
  }

  // ---- ⑫ 落盘（先写成功，再回执）----
  const stored = await storeSuggestion(store, {
    id: submission.clientRequestId,
    receivedAt,
    payloadHash,
    ipHash,
    submission,
  })
  if (!stored.ok) {
    console.error('[feedback] 写入失败:', stored.error instanceof Error ? stored.error.message : String(stored.error))
    return send('INTERNAL', 500, [], cors)
  }

  // ---- ⑬ 201 ----
  return json({ ok: true, ...stored.receipt }, 201, cors)
}

/** 把策略层的拒绝决定映射成 HTTP 响应（429 按 IP / 503 全局停写）。 */
function rateLimited(
  decision: Extract<RateDecision, { allow: false }>,
  cors: Record<string, string>,
  send: (code: RejectionCode, status: number, errors?: FieldError[], headers?: Record<string, string>) => Response,
): Response {
  return send(
    decision.code,
    decision.status,
    [{ field: 'rate', code: decision.scope, message: '' }],
    { ...cors, 'Retry-After': String(decision.retryAfterSeconds) },
  )
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleSubmit(request, env)
  },
}
