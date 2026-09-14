// 回收站：软删除的统一存储，backed by KV，带 TTL 到期自动清理。
//
// 两类可回收对象：
//   - tournament：比赛 JSON（删除时从 GitHub 移除，副本进回收站；恢复时写回 GitHub）
//   - map：谱面 .osz（删除时在 R2 内 move 到 trash/ 前缀；恢复时 move 回去）
//     注意：map 的实际文件体不在 KV，KV 只存「指向 R2 trash key 的元数据」。
//
// 设计要点：
//   - 保留期 RETENTION_DAYS，靠 KV expirationTtl 自动过期，无需手动清空。
//   - key 用「逆时间戳」让 list 默认升序时最新的排在最前。
//   - 列表展示用的 slim 元数据同时写到 KV value 与 list metadata；
//     listTrash 只 list 不 get，避免 N+1。tournament 的完整 payload 留在 value，
//     仅在 restore 时按 id get（payload 可达数百 KB，不适合放 metadata）。

export type TrashKind = 'tournament' | 'map'

export interface TrashEntry {
  id: string // 回收站条目自身的 id（= KV key 去掉前缀）
  kind: TrashKind
  // 展示用的人类可读标识，例如比赛 id 或谱面 slot 路径
  label: string
  deletedAt: number
  deletedByUid: string
  deletedByName: string
  // tournament: 完整 JSON 字符串；恢复时写回 GitHub
  // map: 不用（文件在 R2 trash/ 下，restoreKey 指向它）
  payload?: string
  // map 专用：R2 中原始 key 与 trash key
  originalKey?: string
  restoreKey?: string
  // map 专用：删除时的对象 etag。恢复时用来判断"目标已存在的那个东西是不是原来那份"
  // （内容一致 → 说明之前恢复过；不一致 → 是别人放进去的，必须报冲突）。
  originalEtag?: string
  // map 专用：删除操作 id（同一对象的同一版本重试会得到同一个 id，见 addTrashIdempotent）
  opId?: string
}

// 列表渲染只用得上这几个字段，写到 metadata 里。
// payload / originalKey / restoreKey 不进 metadata（payload 太大，restore 路径才需要）。
export type TrashListItem = Pick<
  TrashEntry,
  'id' | 'kind' | 'label' | 'deletedAt' | 'deletedByName'
>

const TRASH_PREFIX = 'trash:'
// 回收站保留 30 天，到期 KV 自动删除（map 的 R2 文件由每日清理 Action 处理）
const RETENTION_SECONDS = 30 * 24 * 60 * 60

function newTrashId(): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const inverseTs = (9_999_999_999_999 - ts).toString().padStart(13, '0')
  return `${inverseTs}-${rand}`
}

export async function addTrash(
  kv: KVNamespace,
  entry: Omit<TrashEntry, 'id' | 'deletedAt'>,
): Promise<TrashEntry> {
  const id = newTrashId()
  const full: TrashEntry = { id, deletedAt: Date.now(), ...entry }
  const meta: TrashListItem = {
    id: full.id,
    kind: full.kind,
    label: full.label,
    deletedAt: full.deletedAt,
    deletedByName: full.deletedByName,
  }
  await kv.put(`${TRASH_PREFIX}${id}`, JSON.stringify(full), {
    expirationTtl: RETENTION_SECONDS,
    metadata: meta,
  })
  return full
}

export async function getTrash(kv: KVNamespace, id: string): Promise<TrashEntry | null> {
  const raw = (await kv.get(`${TRASH_PREFIX}${id}`, 'json')) as TrashEntry | null
  return raw ?? null
}

// ---------- 幂等写入（R07） ----------
//
// 软删除的中间步骤可能失败(副本写好了但记录没写成、或原对象没删掉),
// 重试时不能又造一条新记录 / 一份新副本:
//   - 操作 id 由「对象 key + 版本签名」决定,同一对象的同一版本重试得到同一个 id;
//   - 副本键与回收站记录都用它派生,重试是覆盖而不是新增。
// marker 键 `trashop:{opId}` 记住"这个操作已经建过哪条记录",前缀与 `trash:` 不重叠,
// 因此不会混进回收站列表。

const OP_MARKER_PREFIX = 'trashop:'

function opMarkerKey(opId: string): string {
  return `${OP_MARKER_PREFIX}${opId}`
}

export async function findTrashIdByOp(kv: KVNamespace, opId: string): Promise<string | null> {
  const id = await kv.get(opMarkerKey(opId))
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * 建回收站记录,同一 opId 只建一次。
 * 已存在(重试)时返回原记录并标记 reused,调用方据此避免重复劳动。
 */
export async function addTrashIdempotent(
  kv: KVNamespace,
  entry: Omit<TrashEntry, 'id' | 'deletedAt'>,
  opId: string,
): Promise<{ entry: TrashEntry; reused: boolean }> {
  const existingId = await findTrashIdByOp(kv, opId)
  if (existingId) {
    const existing = await getTrash(kv, existingId)
    if (existing) return { entry: existing, reused: true }
  }
  const created = await addTrash(kv, { ...entry, opId })
  // marker 写失败只会让"下一次重试"多建一条记录(数据不丢),所以不阻塞主流程。
  await kv.put(opMarkerKey(opId), created.id, { expirationTtl: RETENTION_SECONDS })
  return { entry: created, reused: false }
}

export async function removeTrash(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(`${TRASH_PREFIX}${id}`)
}

/**
 * 列出回收站。只返回展示用的 slim 元数据（不含 payload）。
 * 优先用 list metadata；旧 key 没 metadata 时降级到 get。
 *
 * 加 5s isolate 内存缓存:防失控请求把 KV list 配额打爆。
 * addTrash / removeTrash 写后让缓存自然过期(回收站列表延迟 5s 可接受)。
 */
let trashListCache: { value: TrashListItem[]; limit: number; expiresAt: number } | null = null
const TRASH_LIST_TTL_MS = 5_000

export async function listTrash(kv: KVNamespace, limit = 200): Promise<TrashListItem[]> {
  const now = Date.now()
  if (trashListCache && trashListCache.limit === limit && trashListCache.expiresAt > now) {
    return trashListCache.value
  }
  const listed = await kv.list<TrashListItem>({ prefix: TRASH_PREFIX, limit })
  const out: TrashListItem[] = []
  const fallbacks: string[] = []
  for (const k of listed.keys) {
    if (k.metadata) {
      out.push(k.metadata)
    } else {
      fallbacks.push(k.name)
    }
  }
  if (fallbacks.length) {
    const fetched = await Promise.all(
      fallbacks.map((name) => kv.get(name, 'json') as Promise<TrashEntry | null>),
    )
    for (const v of fetched) {
      if (!v) continue
      out.push({
        id: v.id,
        kind: v.kind,
        label: v.label,
        deletedAt: v.deletedAt,
        deletedByName: v.deletedByName,
      })
    }
    out.sort((a, b) => b.deletedAt - a.deletedAt)
  }
  trashListCache = { value: out, limit, expiresAt: now + TRASH_LIST_TTL_MS }
  return out
}

export { RETENTION_SECONDS }
