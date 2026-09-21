// 请求层的三道闸门：形状（方法/类型/来源）、**限长读体**、JSON 解析。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 4 节第 2 条。
//
// 关键的一条：**不先 `request.json()` 再检查大小**。那样等于让攻击者先塞一个
// 100MB 的 body 进来、我们全读进内存才发现超限。正确做法是边读边数，一超限就
// `cancel()` 掉这个流（第 2 节原话："超出即取消流"）。

/** Includes up to 1000 Chinese characters, evidence URLs and the Turnstile token. */
export const MAX_BODY_BYTES = 16 * 1024

export type RequestShapeFailure =
  | 'method-not-allowed'
  | 'unsupported-media-type'
  | 'origin-missing'
  | 'origin-not-allowed'

export type RequestShapeResult =
  | { ok: true }
  | { ok: false; status: number; code: RequestShapeFailure; detail?: string }

/** 允许的正文类型：`application/json`，可带 charset。 */
export function isJsonContentType(value: string | null): boolean {
  if (!value) return false
  const mime = value.split(';', 1)[0].trim().toLowerCase()
  return mime === 'application/json'
}

/**
 * 方法 / 正文类型 / Origin 白名单。
 *
 * ⚠️ **Origin 不是鉴权**，只能阻止浏览器从别的站点直接发起跨站请求 ——
 * 脚本可以随便伪造这个头。真正的门槛是 Turnstile 服务端验证（见 policy.ts）。
 * 这里要求**必须带 Origin** 且精确匹配：合法调用都来自我们自己的页面，
 * 而"缺 Origin"正是最简单的脚本请求特征。
 */
export function checkRequestShape(
  request: Request,
  { allowedOrigins }: { allowedOrigins: readonly string[] },
): RequestShapeResult {
  if (request.method !== 'POST') {
    return { ok: false, status: 405, code: 'method-not-allowed', detail: request.method }
  }
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return {
      ok: false,
      status: 415,
      code: 'unsupported-media-type',
      detail: request.headers.get('Content-Type') ?? '(缺失)',
    }
  }
  const origin = request.headers.get('Origin')
  if (!origin) {
    return { ok: false, status: 403, code: 'origin-missing' }
  }
  if (!allowedOrigins.includes(origin)) {
    return { ok: false, status: 403, code: 'origin-not-allowed', detail: origin }
  }
  return { ok: true }
}

export type BodyFailure = 'too-large' | 'bad-length-header' | 'read-error'

export type ReadBodyResult = { ok: true; text: string } | { ok: false; code: BodyFailure; detail?: string }

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * 限长读取请求体（UTF-8 文本）。
 *
 * 两道检查：
 *  ① `Content-Length` 声明的值超限 → 直接拒，连流都不读；
 *  ② 声明值不可信（可以少写），所以**读的过程中持续累计**，一旦超限立刻 `cancel()`。
 *
 * `Content-Length` 不是数字或为负 → 拒绝。方案第 2 节把"缺长度头"列为要拦的输入；
 * 这里对**畸形**的长度头更严，因为那是明确异常的客户端行为。
 */
export async function readBoundedBody(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<ReadBodyResult> {
  const declared = request.headers.get('Content-Length')
  if (declared !== null) {
    const size = Number(declared)
    if (!Number.isInteger(size) || size < 0) {
      return { ok: false, code: 'bad-length-header', detail: declared }
    }
    if (size > maxBytes) {
      return { ok: false, code: 'too-large', detail: `声明 ${size} 字节` }
    }
  }

  const body = request.body
  if (!body) return { ok: true, text: '' }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        // 超出即取消：不再把剩下的读完（第 2 节原话）。
        await reader.cancel('body too large').catch(() => {})
        return { ok: false, code: 'too-large', detail: `实读超过 ${maxBytes} 字节` }
      }
      chunks.push(value)
    }
  } catch (err) {
    return { ok: false, code: 'read-error', detail: err instanceof Error ? err.message : String(err) }
  }

  return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(concatChunks(chunks, total)) }
}

/**
 * 解析 JSON。**不抛异常**：坏 JSON 只是一次普通的拒绝。
 * 解析完的那份交给 `src/lib/suggestions/validation.ts` 做白名单校验 ——
 * Worker 与后台共用同一份契约，不在这一层重复判定字段。
 */
export function parseJsonBody(text: string): { ok: true; value: unknown } | { ok: false } {
  if (!text.trim()) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}
