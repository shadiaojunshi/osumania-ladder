import { jsonResponse, noContent } from '../_lib/cors'
import {
  hasRole,
  getAdminMap,
  putAdminMap,
  ROLE_RANK,
  type AuthEnv,
  type SessionUser,
  type Role,
  type AdminRecord,
} from '../_lib/auth'
import { writeAudit } from '../_lib/audit'

type Env = AuthEnv

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 列出管理员名单：admin 及以上可查看。
// 返回数组，bootstrap owner 永远以 owner 身份出现在最前（即便不在 KV 里）。
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const map = await getAdminMap(env)
  const list: Array<{ uid: string; role: Role; username: string; addedBy?: string; addedAt?: string; bootstrap?: boolean }> = []

  // bootstrap owner 始终在列表里且不可被改动
  const bootUid = env.BOOTSTRAP_OWNER_UID
  if (bootUid) {
    list.push({
      uid: bootUid,
      role: 'owner',
      username: map[bootUid]?.username ?? '(站长)',
      bootstrap: true,
    })
  }
  for (const [uid, rec] of Object.entries(map)) {
    if (uid === bootUid) continue
    list.push({ uid, role: rec.role, username: rec.username, addedBy: rec.addedBy, addedAt: rec.addedAt })
  }

  return jsonResponse({ admins: list, self: { uid: user!.uid, role: user!.role } })
}

// 校验「caller 能否把 target 设为 newRole / 移除 target」。
// 规则（四级）：
//   - owner：可设任意角色（含 owner/admin），可移除任何人——除 bootstrap owner 不可动。
//   - admin：只能管理 contributor（在 readonly/contributor 间调整），
//            不能创建/改动 admin 或 owner，也不能改动当前已是 admin/owner 的目标。
//   - 任何人都不能改动自己（防误锁）。
function canManage(
  caller: SessionUser,
  targetUid: string,
  targetCurrentRole: Role,
  newRole: Role | 'remove',
  bootUid: string,
): { ok: boolean; reason?: string } {
  if (targetUid === bootUid) {
    return { ok: false, reason: '站长账号不可被修改或移除' }
  }
  if (targetUid === caller.uid) {
    return { ok: false, reason: '不能修改自己的权限' }
  }

  const involvesAdminTier =
    targetCurrentRole === 'owner' ||
    targetCurrentRole === 'admin' ||
    newRole === 'owner' ||
    newRole === 'admin'

  if (involvesAdminTier) {
    if (caller.role !== 'owner') {
      return { ok: false, reason: '只有站长(owner)能管理 admin/owner 级别' }
    }
    return { ok: true }
  }

  // 到这里：目标当前是 readonly/contributor，且目标角色也是 readonly/contributor
  if (!hasRole(caller, 'admin')) {
    return { ok: false, reason: '需要 admin 及以上权限' }
  }
  return { ok: true }
}

// 新增/修改某用户角色：body = { uid, username, role }
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const caller = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(caller, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = (await request.json()) as { uid?: string; username?: string; role?: string }
  const uid = (body.uid ?? '').trim()
  const username = (body.username ?? '').trim()
  const role = body.role as Role | undefined

  if (!uid || !/^\d+$/.test(uid)) {
    return jsonResponse({ error: 'uid 必须是 osu 用户数字 ID' }, 400)
  }
  if (!role || !(role in ROLE_RANK)) {
    return jsonResponse({ error: 'role 无效' }, 400)
  }

  const map = await getAdminMap(env)
  const currentRole: Role = uid === env.BOOTSTRAP_OWNER_UID ? 'owner' : map[uid]?.role ?? 'readonly'

  const check = canManage(caller!, uid, currentRole, role, env.BOOTSTRAP_OWNER_UID)
  if (!check.ok) {
    return jsonResponse({ error: check.reason, code: 'FORBIDDEN' }, 403)
  }

  if (role === 'readonly') {
    // 设为 readonly = 从名单移除
    delete map[uid]
  } else {
    const existing = map[uid]
    const rec: AdminRecord = {
      role,
      username: username || existing?.username || uid,
      addedBy: existing?.addedBy || caller!.username,
      addedAt: existing?.addedAt || new Date().toISOString(),
    }
    map[uid] = rec
  }

  await putAdminMap(env, map)

  await writeAudit(env.LADDER_KV, {
    actorUid: caller!.uid,
    actorName: caller!.username,
    action: 'admin.setRole',
    target: uid,
    detail: `${currentRole} → ${role}`,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, uid, role })
}

// 移除某用户（= 设为 readonly）：body = { uid }
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, data }) => {
  const caller = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(caller, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = (await request.json()) as { uid?: string }
  const uid = (body.uid ?? '').trim()
  if (!uid) {
    return jsonResponse({ error: '缺少 uid' }, 400)
  }

  const map = await getAdminMap(env)
  const currentRole: Role = uid === env.BOOTSTRAP_OWNER_UID ? 'owner' : map[uid]?.role ?? 'readonly'

  const check = canManage(caller!, uid, currentRole, 'remove', env.BOOTSTRAP_OWNER_UID)
  if (!check.ok) {
    return jsonResponse({ error: check.reason, code: 'FORBIDDEN' }, 403)
  }

  if (map[uid]) {
    delete map[uid]
    await putAdminMap(env, map)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: caller!.uid,
    actorName: caller!.username,
    action: 'admin.remove',
    target: uid,
    detail: `was ${currentRole}`,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, uid })
}
