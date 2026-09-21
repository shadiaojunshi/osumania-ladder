// POST /api/auth/logout
// Clears the session cookie. No body needed.

import { jsonResponse } from '../_lib/cors'
import { buildClearCookie } from '../_lib/auth'
import { buildPlayerProfileCookie } from '../../../src/lib/playerProfile'

export const onRequestPost: PagesFunction = async () => {
  const response = jsonResponse({ success: true }, 200, { 'Set-Cookie': buildClearCookie() })
  response.headers.append('Set-Cookie', buildPlayerProfileCookie(null))
  return response
}
