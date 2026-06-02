import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { addTrash } from '../_lib/trash'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 删除谱面：admin 及以上。软删除 —— 把 R2 对象移到 trash/ 前缀，
// 同时在 KV 记一条回收站条目（带 TTL，到期由每日清理 Action 删 R2 文件）。
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const { tournamentId, roundId, slot, nsv } = (await request.json()) as {
    tournamentId: string
    roundId: string
    slot: string
    nsv?: boolean
  }

  if (!tournamentId || !roundId || !slot) {
    return jsonResponse({ error: 'Missing required fields' }, 400)
  }

  const suffix = nsv ? '.nsv.osz' : '.osz'
  const key = `maps/${tournamentId}/${roundId}/${slot}${suffix}`

  // 读取原对象，复制到 trash/ 前缀，再删原 key（R2 无原生 move）。
  const obj = await env.R2_BUCKET.get(key)
  let trashKey: string | undefined
  if (obj) {
    trashKey = `trash/${key}.${Date.now()}`
    await env.R2_BUCKET.put(trashKey, obj.body, {
      httpMetadata: obj.httpMetadata,
      customMetadata: { ...obj.customMetadata, deletedBy: user!.username, originalKey: key },
    })
    await env.R2_BUCKET.delete(key)

    await addTrash(env.LADDER_KV, {
      kind: 'map',
      label: `${tournamentId}/${roundId}/${slot}${nsv ? ' (NSV)' : ''}`,
      deletedByUid: user!.uid,
      deletedByName: user!.username,
      originalKey: key,
      restoreKey: trashKey,
    })
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'map.delete',
    target: key,
    detail: obj ? '已移入回收站' : '文件不存在',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, trashed: !!obj })
}
