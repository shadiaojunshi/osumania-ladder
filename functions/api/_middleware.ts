// Central auth gate for ALL /api/* requests.
//
// Cloudflare Pages runs this _middleware before any function under /api/.
// Responsibilities:
//   1. Answer CORS preflight (OPTIONS) uniformly.
//   2. Let the public auth endpoints through (login/callback/logout/me handle
//      their own session logic).
//   3. Require a valid session for everything else; 401 otherwise.
//   4. Attach the resolved user to context.data.user so downstream handlers
//      can do role checks without re-parsing the cookie.
//
// Role enforcement (contributor vs admin vs owner) happens IN each endpoint,
// because the required role differs per operation (e.g. delete needs admin,
// create needs contributor). The middleware only guarantees "is logged in".

import { jsonResponse, noContent } from './_lib/cors'
import { getSessionUser, type AuthEnv, type SessionUser } from './_lib/auth'

// Paths that must remain reachable without an existing session.
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/auth/me',
])

export const onRequest: PagesFunction<AuthEnv> = async (context) => {
  const { request, next, env } = context
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return noContent()
  }

  if (PUBLIC_PATHS.has(url.pathname)) {
    return next()
  }

  const user = await getSessionUser(request, env)
  if (!user) {
    return jsonResponse({ error: '未登录或会话已过期', code: 'NO_SESSION' }, 401)
  }

  // Make the user available to downstream handlers.
  ;(context.data as { user?: SessionUser }).user = user
  return next()
}
