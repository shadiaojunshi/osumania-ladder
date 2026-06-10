/**
 * 审计日志：记录所有写操作（谁、何时、做了什么）。
 * 存在 KV 中，key 形如 `audit:{inverseTs}:{rand}`，带 TTL 自动过期。
 * 读取时按 key 前缀 list + 倒序，最新的在前。
 *
 * 性能：完整 entry 同时写到 KV value 与 list metadata。
 *   - listAudit 只调用 kv.list()，metadata 一次回传，避免 N+1 的 get 循环。
 *   - 旧数据没 metadata，按 key 兜底 get（向后兼容）。
 *   - metadata 上限 1024 字节；本结构远小于此（actorName/target/detail 短字符串）。
 */

export interface AuditEntry {
  ts: number
  actorUid: string
  actorName: string
  action: string
  target: string
  detail?: string
  ip?: string
}

const AUDIT_PREFIX = 'audit:'
// 审计日志保留 180 天（KV TTL，到期自动清理）
const AUDIT_TTL_SECONDS = 180 * 24 * 60 * 60

/**
 * 写一条审计日志。失败不抛错（审计不能阻塞主流程）。
 */
export async function writeAudit(
  kv: KVNamespace,
  entry: Omit<AuditEntry, 'ts'>,
): Promise<void> {
  try {
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    // key 用「最大时间戳 - 当前」让 list 默认升序时最新的排在前面
    const inverseTs = (9_999_999_999_999 - ts).toString().padStart(13, '0')
    const key = `${AUDIT_PREFIX}${inverseTs}:${rand}`
    const full: AuditEntry = { ts, ...entry }
    // detail 可能很长（编辑摘要等），裁掉以确保 metadata 总长 < 1024
    const meta: AuditEntry = full.detail && full.detail.length > 200
      ? { ...full, detail: full.detail.slice(0, 200) + '…' }
      : full
    await kv.put(key, JSON.stringify(full), {
      expirationTtl: AUDIT_TTL_SECONDS,
      metadata: meta,
    })
  } catch {
    // 审计失败不影响主操作
  }
}

/**
 * 读取最近的审计日志（最新在前）。
 * 优先用 list metadata；旧 key 没 metadata 时降级到 get。
 */
export async function listAudit(
  kv: KVNamespace,
  limit = 100,
): Promise<AuditEntry[]> {
  const listed = await kv.list<AuditEntry>({ prefix: AUDIT_PREFIX, limit })
  const entries: AuditEntry[] = []
  const fallbacks: string[] = []
  for (const k of listed.keys) {
    if (k.metadata) {
      entries.push(k.metadata)
    } else {
      fallbacks.push(k.name)
    }
  }
  if (fallbacks.length) {
    const fetched = await Promise.all(
      fallbacks.map((name) => kv.get(name, 'json') as Promise<AuditEntry | null>),
    )
    for (const v of fetched) if (v) entries.push(v)
    // 维持时间倒序（list 已按 key 升序，inverseTs 即时间倒序，但 fallback 拼回去后顺序错了）
    entries.sort((a, b) => b.ts - a.ts)
  }
  return entries
}
