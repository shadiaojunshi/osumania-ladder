/**
 * 审计日志：记录所有写操作（谁、何时、做了什么）。
 * 存在 KV 中，key 形如 `audit:{timestamp}:{random}`，带 TTL 自动过期。
 * 读取时按 key 前缀 list + 倒序，最新的在前。
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
    await kv.put(key, JSON.stringify(full), { expirationTtl: AUDIT_TTL_SECONDS })
  } catch {
    // 审计失败不影响主操作
  }
}

/**
 * 读取最近的审计日志（最新在前）。
 */
export async function listAudit(
  kv: KVNamespace,
  limit = 100,
): Promise<AuditEntry[]> {
  const listed = await kv.list({ prefix: AUDIT_PREFIX, limit })
  const entries: AuditEntry[] = []
  for (const k of listed.keys) {
    const val = (await kv.get(k.name, 'json')) as AuditEntry | null
    if (val) entries.push(val)
  }
  return entries
}
