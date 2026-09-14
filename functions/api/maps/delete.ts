import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { addTrashIdempotent } from '../_lib/trash'
import { readJsonBody } from '../_lib/validation'
import { isValidTournamentId } from '../_lib/tournamentId'
import {
  deleteOperationId,
  mapObjectKey,
  objectVersionSignature,
  trashObjectKey,
  validateNsvFlag,
  validateRoundId,
  validateSlot,
} from '../_lib/mapKeys'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 删除谱面：admin 及以上。软删除 —— 把 R2 对象复制到 trash/ 前缀，再删原 key。
//
// R07 的顺序很关键:必须【副本 → 回收站记录 → 才删原对象】。
// 反过来的话,KV 写失败就会留下"原件已删、没有任何记录指向副本"的状态 ——
// 文件还在 R2 里,但 UI 上看不到、也恢复不了。按现在的顺序,任何一步失败都满足:
//   - 副本写失败:原对象完好(等于没删);
//   - 记录写失败:原对象完好,并把没记录的副本清掉;
//   - 原对象删失败:副本 + 记录都在,可以在回收站里恢复,重试也幂等。
//
// R04:键段与 nsv 标志先校验,键统一由 _lib/mapKeys 构造。这里刻意**不**要求槽位
// 存在于比赛 JSON:清理孤儿对象正是删除的用途。
//
// 尚未解决(见 R07 完成记录):"读原对象"与"删原对象"之间有窗口,期间若有重传,
// 删的可能是新版本。要根治需要按对象串行的协调层,本项不做。
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) return jsonResponse({ error: body.error, code: 'INVALID_BODY' }, 400)
  const raw = body.value
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return jsonResponse({ error: '请求体必须是 JSON 对象', code: 'INVALID_BODY' }, 400)
  }
  const fields = raw as Record<string, unknown>

  const tournamentId = typeof fields.tournamentId === 'string' ? fields.tournamentId : ''
  if (!isValidTournamentId(tournamentId)) {
    return jsonResponse({ error: '非法比赛 ID（只允许字母、数字、连字符）', code: 'INVALID_TOURNAMENT' }, 400)
  }

  const roundId = validateRoundId(fields.roundId)
  if (!roundId.ok) return jsonResponse({ error: roundId.error, code: 'INVALID_ROUND_ID' }, 400)

  const slot = validateSlot(fields.slot)
  if (!slot.ok) return jsonResponse({ error: slot.error, code: 'INVALID_SLOT' }, 400)

  const nsv = validateNsvFlag(fields.nsv)
  if (!nsv.ok) return jsonResponse({ error: nsv.error, code: 'INVALID_NSV' }, 400)

  const key = mapObjectKey(tournamentId, roundId.value, slot.value, nsv.value)
  const label = `${tournamentId}/${roundId.value}/${slot.value}${nsv.value ? ' (NSV)' : ''}`
  const clientIp = request.headers.get('CF-Connecting-IP') ?? undefined

  const audit = (detail: string) => writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'map.delete',
    target: key,
    detail,
    ip: clientIp,
  })

  const obj = await env.R2_BUCKET.get(key)
  if (!obj) {
    await audit('文件不存在')
    return jsonResponse({ success: true, trashed: false })
  }

  // 同一对象(同 key + 同版本)重试得到同一个 opId → 副本键与记录都幂等。
  const opId = deleteOperationId(key, objectVersionSignature(obj))
  const restoreKey = trashObjectKey(key, opId)

  // 1) 先落可恢复副本,原对象保持不动。
  try {
    await env.R2_BUCKET.put(restoreKey, obj.body, {
      httpMetadata: obj.httpMetadata,
      customMetadata: { ...obj.customMetadata, deletedBy: user!.username, originalKey: key, opId },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await audit(`副本写入失败，原文件保持不变: ${message}`)
    return jsonResponse({ error: `写入可恢复副本失败，原文件保持不变：${message}`, code: 'TRASH_COPY_FAILED' }, 502)
  }

  // 2) 再写回收站记录(带 TTL)。失败就把副本清掉 —— 原对象还在,不留孤儿副本。
  let trashId: string
  try {
    const created = await addTrashIdempotent(env.LADDER_KV, {
      kind: 'map',
      label,
      deletedByUid: user!.uid,
      deletedByName: user!.username,
      originalKey: key,
      restoreKey,
      originalEtag: typeof obj.etag === 'string' ? obj.etag : undefined,
    }, opId)
    trashId = created.entry.id
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await env.R2_BUCKET.delete(restoreKey)
    } catch {
      // 清不掉也无害:原对象完好,只是 trash/ 下多一份没有记录的副本。
    }
    await audit(`回收站记录写入失败，原文件保持不变: ${message}`)
    return jsonResponse({ error: `写入回收站记录失败，原文件保持不变：${message}`, code: 'TRASH_RECORD_FAILED' }, 502)
  }

  // 3) 最后删原对象。失败时副本 + 记录都在,可以从回收站恢复,重试幂等。
  try {
    await env.R2_BUCKET.delete(key)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await audit(`已进回收站(${trashId})，原对象删除失败: ${message}`)
    return jsonResponse({
      error: `文件已进入回收站（可恢复），但原对象删除失败，请重试：${message}`,
      code: 'DELETE_FAILED',
      trashed: true,
      trashId,
    }, 502)
  }

  await audit(`已移入回收站 ${trashId}`)
  return jsonResponse({ success: true, trashed: true, trashId })
}
