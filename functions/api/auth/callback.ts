// GET /api/auth/callback?code=...&state=...
// osu! redirects here after the user authorizes. We:
//   1. Verify `state` matches the cookie we set in /login (CSRF check).
//   2. Exchange `code` for an osu! access token.
//   3. Fetch the user's osu! identity (id + username).
//   4. Mint our own signed session cookie.
//   5. Bootstrap: if this is the configured owner and KV has no admins yet,
//      that's fine — resolveRole() always treats BOOTSTRAP_OWNER_UID as owner.
//   6. Redirect back to /admin.

import {
  exchangeCodeForToken,
  fetchOsuMe,
  type OsuOAuthEnv,
} from '../_lib/osu'
import {
  createSessionToken,
  buildSessionCookie,
  type AuthEnv,
} from '../_lib/auth'
import { writeAudit } from '../_lib/audit'

type Env = OsuOAuthEnv & AuthEnv

const STATE_COOKIE = 'ladder_oauth_state'

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

function clearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

function errorRedirect(reason: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/admin?login_error=${encodeURIComponent(reason)}` },
  })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = readCookie(request, STATE_COOKIE)

  if (!code || !state) {
    return errorRedirect('缺少授权参数')
  }
  if (!cookieState || cookieState !== state) {
    return errorRedirect('state 校验失败，请重试')
  }

  let osuUser
  try {
    const token = await exchangeCodeForToken(env, code)
    osuUser = await fetchOsuMe(token)
  } catch (e) {
    return errorRedirect(`osu 授权失败：${(e as Error).message}`)
  }

  const uid = String(osuUser.id)
  const sessionToken = await createSessionToken(uid, osuUser.username, env.SESSION_SECRET)

  await writeAudit(env.LADDER_KV, {
    actorUid: uid,
    actorName: osuUser.username,
    action: 'login',
    target: '-',
    ip: request.headers.get('CF-Connecting-IP') || undefined,
  })

  return new Response(null, {
    status: 302,
    headers: [
      ['Location', '/admin'],
      ['Set-Cookie', buildSessionCookie(sessionToken)],
      ['Set-Cookie', clearStateCookie()],
    ],
  })
}
