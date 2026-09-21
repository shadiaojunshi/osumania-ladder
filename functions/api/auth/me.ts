// GET /api/auth/me
// Returns the current session user (uid, username, role) or null.
// The admin SPA calls this on load to decide what to render.
// 顺带返回 env binding 健康状态用于诊断(KV/R2 是否绑定到当前环境)。

import { jsonResponse } from '../_lib/cors'
import { getSessionIdentity, resolveRole, type AuthEnv } from '../_lib/auth'
import { buildPlayerProfileCookie } from '../../../src/lib/playerProfile'

interface DiagEnv extends AuthEnv {
  R2_BUCKET?: R2Bucket
}

export const onRequestGet: PagesFunction<DiagEnv> = async ({ request, env }) => {
  const bindings = {
    LADDER_KV: typeof env.LADDER_KV !== 'undefined',
    R2_BUCKET: typeof env.R2_BUCKET !== 'undefined',
    SESSION_SECRET: !!env.SESSION_SECRET,
    BOOTSTRAP_OWNER_UID: !!env.BOOTSTRAP_OWNER_UID,
  }
  const identity = await getSessionIdentity(request, env)
  if (!identity) {
    return jsonResponse({ user: null, bindings }, 200, { 'Set-Cookie': buildPlayerProfileCookie(null) })
  }
  const user = { uid: identity.uid, username: identity.username, role: await resolveRole(env, identity.uid) }
  // Also upgrades existing sessions. Keep the original expiry rather than extending it on refresh.
  return jsonResponse({ user, bindings }, 200, { 'Set-Cookie': buildPlayerProfileCookie(identity) })
}
