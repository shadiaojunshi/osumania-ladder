// GET /api/auth/me
// Returns the current session user (uid, username, role) or null.
// The admin SPA calls this on load to decide what to render.

import { jsonResponse } from '../_lib/cors'
import { getSessionUser, type AuthEnv } from '../_lib/auth'

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) {
    return jsonResponse({ user: null }, 200)
  }
  return jsonResponse({ user }, 200)
}
