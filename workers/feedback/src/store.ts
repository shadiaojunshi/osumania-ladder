// 存储层：对象键生成、幂等判定、稳定序列化与内容哈希。
// （**落盘本身不在这里**，在 `index.ts` 的编排里 —— 见文件末尾的说明。）
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 6 节。
//
// 四条刻意的设计：
//  ① 对象名**由服务端生成**，客户端传的任何 key / 状态 / 审核人 / commitSha 一律不认
//     （`types.ts` 的 `SuggestRecord` 就是服务端字段的边界，校验层已经把它们挡在外面）。
//  ② 幂等**不靠 LIST**：第 6 节明确写了"不得靠 R2 LIST 找重复"。这里用 `get(确定的 key)` ——
//     key 由 `clientRequestId` 派生，同一次提交重试必然落在同一个键上。
//  ③ **写失败不能返回"已收到"**：落盘在 `index.ts` 的编排里，`put` 抛错就一路往上传，
//     由 handler 映射成 5xx。
//  ④ IP **只存加盐哈希**，原始 IP 既不进对象也不进日志。
//
// 关于"服务端生成 id"：不引入 Durable Object 的前提下，最省的做法是让 id 与 key 都由
// `clientRequestId` 派生（它是 UUID，客户端重试时必须不变）。这样"先预留确定的 key、再写、
// 写成功才回执"天然成立，也不需要额外的映射存储。代价是收据 id 与请求 id 可关联 ——
// 若以后要求两者不可关联，就得加一个 DO 做映射（第 6 节提的那种协调器）。

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

// 落盘与回执**不在这里**：`index.ts` 的编排直接对 `env.SUGGESTIONS` 做条件创建
// （`onlyIf: { etagDoesNotMatch: '*' }`），并在条件写失败时重读一次判定 replay ——
// 这段逻辑没法从桶里抽出来（它要用到 put 的返回值），所以留在了编排层。
//
// 这里曾经另有一个 `storeSuggestion` + `r2ObjectStore` + `ObjectStore` 的"通用写入"版本，
// 是更早的骨架：它**没有条件创建**（丢了并发双写保护），而且写 `revision: 1`，
// 与真正落盘的 `revision: 0` 不一致。它只被两条测试引用、生产从不执行 ——
// 那两条测试绿灯，却是在给一条不跑的路背书（"测的不是真路径"比不测更危险）。
// 两条测试里唯一有价值的断言（落盘记录 `status` 是 `pending`、不含 token）
// 已经移到 `scripts/feedback-worker.test.mjs` 的编排用例上，对着真路径断言。
