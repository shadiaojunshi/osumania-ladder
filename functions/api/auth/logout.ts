// POST /api/auth/logout
// Clears the session cookie. No body needed.

import { jsonResponse } from '../_lib/cors'
import { buildClearCookie } from '../_lib/auth'

export const onRequestPost: PagesFunction = async () => {
  return jsonResponse({ success: true }, 200, { 'Set-Cookie': buildClearCookie() })
}
