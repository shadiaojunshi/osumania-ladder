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
}

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
  await kv.put(`${TRASH_PREFIX}${id}`, JSON.stringify(full), {
    expirationTtl: RETENTION_SECONDS,
  })
  return full
}

export async function getTrash(kv: KVNamespace, id: string): Promise<TrashEntry | null> {
  const raw = (await kv.get(`${TRASH_PREFIX}${id}`, 'json')) as TrashEntry | null
  return raw ?? null
}

export async function removeTrash(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(`${TRASH_PREFIX}${id}`)
}

export async function listTrash(kv: KVNamespace, limit = 200): Promise<TrashEntry[]> {
  const listed = await kv.list({ prefix: TRASH_PREFIX, limit })
  const out: TrashEntry[] = []
  for (const k of listed.keys) {
    const val = (await kv.get(k.name, 'json')) as TrashEntry | null
    if (val) out.push(val)
  }
  return out
}

export { RETENTION_SECONDS }
