// 存储层：对象键生成、幂等判定、写入编排。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 6 节。
//
// 四条刻意的设计：
//  ① 对象名**由服务端生成**，客户端传的任何 key / 状态 / 审核人 / commitSha 一律不认
//     （`types.ts` 的 `SuggestRecord` 就是服务端字段的边界，校验层已经把它们挡在外面）。
//  ② 幂等**不靠 LIST**：第 6 节明确写了"不得靠 R2 LIST 找重复"。这里用 `get(确定的 key)` ——
//     key 由 `clientRequestId` 派生，同一次提交重试必然落在同一个键上。
//  ③ **写失败不能返回"已收到"**：`put` 抛错就是把错误往上传，由 handler 映射成 5xx。
//  ④ IP **只存加盐哈希**，原始 IP 既不进对象也不进日志。
//
// 关于"服务端生成 id"：不引入 Durable Object 的前提下，最省的做法是让 id 与 key 都由
// `clientRequestId` 派生（它是 UUID，客户端重试时必须不变）。这样"先预留确定的 key、再写、
// 写成功才回执"天然成立，也不需要额外的映射存储。代价是收据 id 与请求 id 可关联 ——
// 若以后要求两者不可关联，就得加一个 DO 做映射（第 6 节提的那种协调器）。

/** 对象存储的最小接口。生产实现包 R2Bucket；测试注入假实现。 */
export interface ObjectStore {
  /** 读回对象正文；不存在返回 null。 */
  get(key: string): Promise<string | null>
  put(key: string, body: string, contentType?: string): Promise<void>
}

export const SUGGESTION_PREFIX = 'suggest'

/**
 * `suggest/items/YYYY/MM/DD/<id>.json`
 *
 * ⚠️ 前缀只是**组织方式，不是安全边界**。第 3 节原话：R2 普通前缀不是 IAM 边界，
 * 同一绑定通常能访问整个桶 —— 不能因为路径里有 `suggest/` 就以为碰不到其他数据。
 * 真正的隔离靠"这个 Worker 只绑定建议桶"。
 *
 * 按日期分层是为了让 lifecycle 规则和"按日期列举"都能直接落到前缀上（第 6 节）。
 */
export function suggestionKey(id: string, receivedAt: Date, prefix: string = SUGGESTION_PREFIX): string {
  const y = receivedAt.getUTCFullYear()
  const m = String(receivedAt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(receivedAt.getUTCDate()).padStart(2, '0')
  return `${prefix}/items/${y}/${m}/${d}/${id}.json`
}

/** 审核状态独立存放，便于"正文不可变、状态可 CAS 更新"（第 6 节）。 */
export function reviewKey(id: string, receivedAt: Date, prefix: string = SUGGESTION_PREFIX): string {
  const y = receivedAt.getUTCFullYear()
  const m = String(receivedAt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(receivedAt.getUTCDate()).padStart(2, '0')
  return `${prefix}/reviews/${y}/${m}/${d}/${id}.json`
}

export interface SuggestionReceipt {
  id: string
  receivedAt: string
}

/**
 * 落盘记录。字段与 `src/lib/suggestions/types.ts` 的 `SuggestRecord` 对应 ——
 * 但这里**不 import 那个类型**：Worker 只依赖纯逻辑模块，不把前端的类型体系拖进来。
 * 两边的形状由 `scripts/feedback-worker.test.mjs` 里的断言对齐。
 */
export interface StoredSuggestion {
  id: string
  receivedAt: string
  payloadHash: string
  ipHash: string
  status: 'pending'
  revision: number
  /** 已去掉 turnstileToken 的提交正文。 */
  submission: unknown
}

/**
 * 稳定序列化：键排序后递归输出。
 *
 * 为什么不能直接 `JSON.stringify`：`payloadHash` 的用途是"同一 requestId 的两次提交是不是
 * 同一份内容"。若键顺序会变（不同版本的前端、不同的 JSON 解析路径），同一份内容会算出两个
 * 哈希，于是本该"重试返回同一收据"的请求被误判成 409。
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** 正文摘要。用来判定"同一 requestId 的两次提交是不是同一份内容"。 */
export async function payloadHashOf(submission: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(submission))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type IdempotencyOutcome =
  /** 没写过 → 正常落盘。 */
  | { action: 'write' }
  /** 同一份内容重复提交 → 返回**同一个收据**，不再写。 */
  | { action: 'replay'; receipt: SuggestionReceipt }
  /** 同一个 requestId 换了内容 → 409，不做任何写入。 */
  | { action: 'conflict' }

/**
 * 幂等判定。
 *
 * `existing` 的形状不对（被别的东西占了同一个键、或手工改坏）时按 **conflict** 处理 ——
 * 宁可让这次提交失败，也不能把一份读不懂的数据当成"已收到"回执给用户。
 */
export function checkIdempotency(existingText: string | null, payloadHash: string): IdempotencyOutcome {
  if (existingText === null) return { action: 'write' }
  let parsed: unknown
  try {
    parsed = JSON.parse(existingText)
  } catch {
    return { action: 'conflict' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { action: 'conflict' }
  const record = parsed as Partial<StoredSuggestion>
  if (typeof record.payloadHash !== 'string' || record.payloadHash !== payloadHash) {
    return { action: 'conflict' }
  }
  if (typeof record.id !== 'string' || typeof record.receivedAt !== 'string') return { action: 'conflict' }
  return { action: 'replay', receipt: { id: record.id, receivedAt: record.receivedAt } }
}

/** 落盘时要写入的字段。`receivedAt` 在参数里是 `Date`，写进对象时才转成 ISO 字符串。 */
export interface StoreSuggestionInput {
  id: string
  receivedAt: Date
  payloadHash: string
  ipHash: string
  submission: unknown
}

/**
 * 落盘并回执。
 *
 * 顺序是**先写、成功后才回执**（第 6 节："对象写失败不得返回已收到"）。
 * 这里不做重试：写失败就是失败，让用户重试 —— 反正同一个 requestId 幂等，
 * 重试要么命中 `replay`、要么正常写入，不会产生第二条。
 */
export async function storeSuggestion(
  store: ObjectStore,
  { id, receivedAt, payloadHash, ipHash, submission }: StoreSuggestionInput,
): Promise<{ ok: true; receipt: SuggestionReceipt } | { ok: false; error: unknown }> {
  const key = suggestionKey(id, receivedAt)
  const record: StoredSuggestion = {
    id,
    receivedAt: receivedAt.toISOString(),
    payloadHash,
    ipHash,
    // 新提交一律 pending：正文不可变，状态迁移走 reviews/（第 6 节的状态机）。
    status: 'pending',
    revision: 1,
    submission,
  }
  try {
    await store.put(key, JSON.stringify(record), 'application/json')
  } catch (error) {
    return { ok: false, error }
  }
  return { ok: true, receipt: { id, receivedAt: record.receivedAt } }
}

/**
 * 把 R2 桶适配成 `ObjectStore`。
 *
 * 为什么要这一层：`R2Bucket.get` 返回的是 `R2ObjectBody`（要再调 `.text()`），
 * 而存储层只关心"给我正文或 null"。适配之后 `store.ts` 的其余部分**完全不依赖
 * Cloudflare 类型**，于是 `npm test` 能直接用 node 导入它做单测。
 */
export function r2ObjectStore(bucket: R2Bucket): ObjectStore {
  return {
    async get(key) {
      const object = await bucket.get(key)
      return object ? await object.text() : null
    },
    async put(key, body, contentType) {
      await bucket.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined)
    },
  }
}
