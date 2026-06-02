// GET /api/auth/login
// Starts the osu! OAuth flow:
//   1. Generate a random `state` (CSRF protection).
//   2. Stash it in a short-lived HttpOnly cookie.
//   3. Redirect the browser to osu!'s authorize page.
// osu! will send the user back to /api/auth/callback with `code` + `state`.

import { buildAuthorizeUrl, type OsuOAuthEnv } from '../_lib/osu'

const STATE_COOKIE = 'ladder_oauth_state'

function buildStateCookie(state: string): string {
  return [
    `${STATE_COOKIE}=${state}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=600', // 10 minutes to complete login
  ].join('; ')
}

export const onRequestGet: PagesFunction<OsuOAuthEnv> = async ({ env }) => {
  // 32 random bytes -> hex
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

  const authorizeUrl = buildAuthorizeUrl(env, state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      'Set-Cookie': buildStateCookie(state),
    },
  })
}
