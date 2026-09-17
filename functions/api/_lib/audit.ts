/**
 * 审计日志：记录所有写操作（谁、何时、做了什么）。
 * 存在 KV 中，key 形如 `audit:{inverseTs}:{rand}`，带 TTL 自动过期。
 * 读取时按 key 前缀 list + 倒序，最新的在前。
 *
 * 性能：完整 entry 写到 KV value；list 用的**摘要**写到 metadata。
 *   - listAudit 只调用 kv.list()，metadata 一次回传，避免 N+1 的 get 循环。
 *   - 旧数据没 metadata，按 key 兜底 get（向后兼容）。
 *
 * R16:metadata 上限 1024 字节（KV 是**按 UTF-8 字节**算的，中文字符 3 字节、
 *   字符数 ≠ 字节数）。以前只按 `.length > 200` 截 detail，`target` 完全不设限 ——
 *   批量保存把 `ids.join(',')` 当 target，比赛 id 一多 metadata 就超限，KV 直接拒写，
 *   而 writeAudit 又是静默 catch，于是**审计整条丢失且没人知道**。
 *   现在：metadata 由 buildAuditMetadata 按字节收缩；超限时附 `truncated` 标记，
 *   完整正文仍在 value 里（前端可按 key 取回）。
 */

export interface AuditEntry {
  ts: number
  actorUid: string
  actorName: string
  action: string
  target: string
  detail?: string
  ip?: string
  /** metadata 版被收缩过 → 完整正文在 value 里（用条目 key 取）。不进 metadata 本身。 */
  truncated?: boolean
}

/** list 返回的条目：带上 KV key，便于按需取完整正文。 */
export interface AuditListEntry extends AuditEntry {
  key: string
}

const AUDIT_PREFIX = 'audit:'
// 审计日志保留 180 天（KV TTL，到期自动清理）
const AUDIT_TTL_SECONDS = 180 * 24 * 60 * 60

// KV metadata 硬上限 1024 字节；留 ~20% 余量给平台自身可能追加的字段。
const META_LIMIT_BYTES = 1024
const META_SAFE_BYTES = 820
// 单字段先做的粗截断（字符数），再按字节细收。
const DETAIL_CHARS = 200
const TARGET_CHARS = 300

const encoder = new TextEncoder()

export function utf8Bytes(value: string): number {
  return encoder.encode(value).length
}

/**
 * 把完整 entry 收缩成"能安全写进 KV metadata"的摘要。
 * 收缩顺序：detail → target → actorName → ip（越靠后越不该丢）。
 * 任何字段被裁都会打上 `truncated: true`。
 */
export function buildAuditMetadata(full: AuditEntry): AuditEntry {
  const meta: AuditEntry = { ...full }
  let cut = false

  if (meta.detail && meta.detail.length > DETAIL_CHARS) {
    meta.detail = meta.detail.slice(0, DETAIL_CHARS) + '…'
    cut = true
  }
  if (meta.target && meta.target.length > TARGET_CHARS) {
    meta.target = meta.target.slice(0, TARGET_CHARS) + '…'
    cut = true
  }

  const shrinkOrder: (keyof AuditEntry)[] = ['detail', 'target', 'actorName', 'ip']
  for (const field of shrinkOrder) {
    let guard = 0
    while (utf8Bytes(JSON.stringify(cut ? { ...meta, truncated: true } : meta)) > META_SAFE_BYTES && guard++ < 12) {
      const value = meta[field]
      if (typeof value !== 'string' || value.length === 0) break
      const next = Math.floor(value.length / 2)
      ;(meta as unknown as Record<string, unknown>)[field] = next > 0 ? value.slice(0, next) + '…' : ''
      cut = true
    }
  }

  if (cut) meta.truncated = true
  return meta
}

/**
 * 写一条审计日志。失败不抛错（审计不能阻塞主流程），但必须留下可观察的痕迹 ——
 * R16 之前是完全静默的 catch，KV 拒写时审计整条消失且无人知晓。
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
    const meta = buildAuditMetadata(full)
    await kv.put(key, JSON.stringify(full), {
      expirationTtl: AUDIT_TTL_SECONDS,
      metadata: meta,
    })
  } catch (e) {
    // 只记录与排查有关的信息:动作、字段长度、错误消息 —— **不含 token / 请求头**。
    console.error('[audit] AUDIT_WRITE_FAILED', {
      action: entry.action,
      targetChars: entry.target?.length ?? 0,
      detailChars: entry.detail?.length ?? 0,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * 读取最近的审计日志（最新在前）。
 * 优先用 list metadata；旧 key 没 metadata 时降级到 get。
 *
 * 加 5s isolate 内存缓存:防失控请求把 KV list 配额打爆。
 * 缓存按 limit 分键(不同 limit 不复用同一份)。
 * writeAudit 写后让缓存自然过期(日志列表延迟 5s 可接受)。
 */
let auditCache: { value: AuditListEntry[]; limit: number; expiresAt: number } | null = null
const AUDIT_LIST_TTL_MS = 5_000

/** 按 key 取完整审计正文（列表里 metadata 被收缩过的条目靠它拿全文）。 */
export async function getAuditEntry(kv: KVNamespace, key: string): Promise<AuditEntry | null> {
  // 只允许读审计前缀下的 key —— 这个端点是 admin 可调的,不能变成"任意 KV 读取器"。
  if (!key.startsWith(AUDIT_PREFIX) || key.length > 200) return null
  const value = (await kv.get(key, 'json')) as AuditEntry | null
  return value ?? null
}

export async function listAudit(
  kv: KVNamespace,
  limit = 100,
): Promise<AuditListEntry[]> {
  const now = Date.now()
  if (auditCache && auditCache.limit === limit && auditCache.expiresAt > now) {
    return auditCache.value
  }
  const listed = await kv.list<AuditEntry>({ prefix: AUDIT_PREFIX, limit })
  const entries: AuditListEntry[] = []
  const fallbacks: string[] = []
  for (const k of listed.keys) {
    if (k.metadata) {
      entries.push({ ...(k.metadata as AuditEntry), key: k.name })
    } else {
      fallbacks.push(k.name)
    }
  }
  if (fallbacks.length) {
    const fetched = await Promise.all(
      fallbacks.map(async (name) => {
        const value = (await kv.get(name, 'json')) as AuditEntry | null
        return value ? { ...value, key: name } : null
      }),
    )
    for (const v of fetched) if (v) entries.push(v)
    // 维持时间倒序（list 已按 key 升序，inverseTs 即时间倒序，但 fallback 拼回去后顺序错了）
    entries.sort((a, b) => b.ts - a.ts)
  }
  auditCache = { value: entries, limit, expiresAt: now + AUDIT_LIST_TTL_MS }
  return entries
}
