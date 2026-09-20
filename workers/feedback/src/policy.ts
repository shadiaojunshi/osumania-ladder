// 反馈提交的**决策层**：Turnstile 判定、频率/预算决策、IP 哈希。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 4 节。这里只有判定，没有存储 ——
// 计数怎么原子化（Durable Object / 别的协调器）是部署时的事，本模块只回答
// "给定当前计数，该不该放行"。
//
// 三个刻意的设计：
//  ① **验证预算与接纳预算分开**：失败的挑战也消耗一次验证请求，所以"每天验证 2000 次"
//     与"每天接纳 300 条"是两个不同的闸门，不能合并成一个计数。
//  ② **全局闸门先于 IP 闸门**：全局额度见底时返回 503（整个反馈端停写），
//     IP 超限才返回 429 + Retry-After。两者的语义不同，别混用状态码。
//  ③ **IP 只留加盐哈希**：原始 IP 既不落盘也不进日志（第 4 节第 4 条）。
//     `hashIp` 的盐按天轮换 —— 换盐之后昨天的哈希无法与今天关联。

export interface RateLimits {
  /** 同 IP 的滑动窗口长度（分钟）。 */
  ipWindowMinutes: number
  /** 窗口内最多成功提交几条。 */
  ipWindowMax: number
  /** 同 IP 每天最多成功提交几条。 */
  ipDailyMax: number
  /** 同 IP 每分钟最多**尝试**几次（含挑战失败的），防止刷验证请求。 */
  ipAttemptsPerMinute: number
  /** 全站每天最多接纳几条。 */
  globalDailyAccepted: number
  /** 全站每天最多调用几次 Turnstile siteverify。 */
  globalDailyVerifications: number
}

/**
 * 第 4 节的保守起点。**先观察再调**：这些数字不是平台保证，也不是已经生效的设置。
 * 上线前要在账号控制台核对当前套餐与实际用量（第 2 节），再决定是否沿用。
 */
export const DEFAULT_LIMITS: RateLimits = {
  ipWindowMinutes: 10,
  ipWindowMax: 5,
  ipDailyMax: 30,
  ipAttemptsPerMinute: 10,
  globalDailyAccepted: 300,
  globalDailyVerifications: 2000,
}

export interface RateCounters {
  /** 该 IP 在滑动窗口内的成功提交数。 */
  ipWindow: number
  /** 该 IP 今天（按协调器的日界）的成功提交数。 */
  ipDaily: number
  /** 该 IP 在本分钟内的尝试数（含失败的挑战）。 */
  ipAttemptsThisMinute: number
  /** 全站今天已接纳的条数。 */
  globalAcceptedToday: number
  /** 全站今天已调用的验证次数。 */
  globalVerificationsToday: number
}

export type RateScope =
  | 'global-verifications'
  | 'global-accepted'
  | 'ip-attempts'
  | 'ip-window'
  | 'ip-daily'

export type RateDecision =
  | { allow: true }
  | {
      allow: false
      /** 全局额度见底 → 503（反馈端整体停写）；按 IP 超限 → 429。 */
      status: 429 | 503
      code: 'RATE_LIMITED' | 'BUDGET_EXHAUSTED'
      scope: RateScope
      retryAfterSeconds: number
    }

/** 距下一个整分钟还有多少秒（至少 1，避免 Retry-After: 0）。 */
function secondsToNextMinute(now: Date): number {
  return Math.max(1, 60 - now.getUTCSeconds())
}

/**
 * 距协调器的日界还有多少秒。**按 UTC 算**：真正的重置时刻取决于套餐与协调器实现，
 * 部署前要在控制台核对（第 2 节要求逐项记录重置时区）。这里给的是一个保守上界。
 */
function secondsToNextUtcDay(now: Date): number {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.floor((end - now.getTime()) / 1000))
}

/**
 * 调 Turnstile **之前**的闸门：全局验证预算 + 该 IP 的尝试频率。
 * 放在前面是为了让被刷的请求连一次 siteverify 都不花。
 */
export function decideVerificationGate(
  counters: RateCounters,
  { now = new Date(), limits = DEFAULT_LIMITS }: { now?: Date; limits?: RateLimits } = {},
): RateDecision {
  if (counters.globalVerificationsToday >= limits.globalDailyVerifications) {
    return {
      allow: false,
      status: 503,
      code: 'BUDGET_EXHAUSTED',
      scope: 'global-verifications',
      retryAfterSeconds: secondsToNextUtcDay(now),
    }
  }
  if (counters.ipAttemptsThisMinute >= limits.ipAttemptsPerMinute) {
    return {
      allow: false,
      status: 429,
      code: 'RATE_LIMITED',
      scope: 'ip-attempts',
      retryAfterSeconds: secondsToNextMinute(now),
    }
  }
  return { allow: true }
}

/**
 * 写 R2 **之前**的闸门：全局接纳额度 + 该 IP 的窗口/日额度。
 * 与 `decideVerificationGate` 分开，是因为一次提交要各自过两道。
 */
export function decideAcceptanceGate(
  counters: RateCounters,
  { now = new Date(), limits = DEFAULT_LIMITS }: { now?: Date; limits?: RateLimits } = {},
): RateDecision {
  if (counters.globalAcceptedToday >= limits.globalDailyAccepted) {
    return {
      allow: false,
      status: 503,
      code: 'BUDGET_EXHAUSTED',
      scope: 'global-accepted',
      retryAfterSeconds: secondsToNextUtcDay(now),
    }
  }
  if (counters.ipWindow >= limits.ipWindowMax) {
    return {
      allow: false,
      status: 429,
      code: 'RATE_LIMITED',
      scope: 'ip-window',
      retryAfterSeconds: limits.ipWindowMinutes * 60,
    }
  }
  if (counters.ipDaily >= limits.ipDailyMax) {
    return {
      allow: false,
      status: 429,
      code: 'RATE_LIMITED',
      scope: 'ip-daily',
      retryAfterSeconds: secondsToNextUtcDay(now),
    }
  }
  return { allow: true }
}

// ---------------------------------------------------------------------------
// IP 哈希
// ---------------------------------------------------------------------------

/**
 * 把 IP 变成加盐短哈希。**永不落原始 IP**。
 *
 * 用 HMAC 而不是裸 SHA-256：IPv4 只有 2^32 个可能值，裸哈希可以在几小时内全表反查。
 * 盐由调用方按天轮换 —— 这样跨天的记录无法用同一个盐关联起来。
 */
export async function hashIp(ip: string, salt: string, length = 32): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, length)
}

/**
 * 取来访 IP。**只信 Cloudflare 注入的 `CF-Connecting-IP`** —— 客户端可以随便写
 * `X-Forwarded-For`，拿它当身份等于让攻击者自己选一个 IP 绕限流（第 4 节末）。
 * 取不到时返回空串，调用方按"无 IP"处理（不能退化成"共用一个桶"，那样会误伤）。
 */
export function clientIp(request: Request): string {
  const direct = request.headers.get('CF-Connecting-IP')
  return (direct || '').trim()
}

// ---------------------------------------------------------------------------
// Turnstile
// ---------------------------------------------------------------------------

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
/** 本站在 Turnstile 上注册的 action（第 4 节第 3 条）。 */
export const TURNSTILE_ACTION = 'feedback_submit'

export type TurnstileFailure =
  | 'missing-token'
  | 'network'
  | 'timeout'
  | 'non-json'
  | 'rejected'
  | 'bad-hostname'
  | 'bad-action'

export type TurnstileOutcome =
  | { ok: true }
  | { ok: false; code: TurnstileFailure; detail?: string }

interface SiteverifyBody {
  success?: unknown
  hostname?: unknown
  action?: unknown
  'error-codes'?: unknown
}

/**
 * 判定 siteverify 的响应体。**纯函数**，便于把各种拒绝分支都测到。
 *
 * 第 4 节第 3 条要求同时核对 success、hostname 与 action：
 * 只看 `success` 会让别的站点签发的 token 也能用；不核对 action 会让同站点
 * 其他用途的 token 混进来。三者缺一不可。
 *
 * 注意：`hostname` / `action` 缺失时**拒绝**，不"跳过这项检查"。
 * 那两项是 Cloudflare 在验证成功时一定会回填的字段。
 */
export function evaluateTurnstileResponse(
  body: unknown,
  { expectedHostname, expectedAction = TURNSTILE_ACTION }: { expectedHostname: string; expectedAction?: string },
): TurnstileOutcome {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'non-json' }
  }
  const raw = body as SiteverifyBody
  if (raw.success !== true) {
    const codes = Array.isArray(raw['error-codes']) ? raw['error-codes'].join(',') : ''
    return { ok: false, code: 'rejected', detail: codes || undefined }
  }
  if (typeof raw.hostname !== 'string' || raw.hostname !== expectedHostname) {
    return { ok: false, code: 'bad-hostname', detail: String(raw.hostname ?? '(缺失)') }
  }
  if (typeof raw.action !== 'string' || raw.action !== expectedAction) {
    return { ok: false, code: 'bad-action', detail: String(raw.action ?? '(缺失)') }
  }
  return { ok: true }
}

/**
 * 调 siteverify。**超时或网络失败一律不写 R2**（第 4 节第 3 条）——
 * 宁可让用户重试，也不能让未经校验的提交落盘。
 */
export async function verifyTurnstile({
  token,
  secret,
  remoteIp,
  expectedHostname,
  expectedAction = TURNSTILE_ACTION,
  timeoutMs = 5_000,
  fetchImpl = fetch,
}: {
  token: string
  secret: string
  remoteIp?: string
  expectedHostname: string
  expectedAction?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<TurnstileOutcome> {
  if (!token) return { ok: false, code: 'missing-token' }
  if (!secret) return { ok: false, code: 'network', detail: '未配置 secret' }

  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (remoteIp) form.append('remoteip', remoteIp)

  let res: Response
  try {
    res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, code: /abort|timeout/i.test(message) ? 'timeout' : 'network', detail: message }
  }

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    return { ok: false, code: 'non-json', detail: `status ${res.status}` }
  }
  return evaluateTurnstileResponse(parsed, { expectedHostname, expectedAction })
}
