/**
 * osu! OAuth2 授权码模式辅助函数。
 * 文档：https://osu.ppy.sh/docs/index.html#authorization-code-grant
 */

const OSU_AUTHORIZE_URL = 'https://osu.ppy.sh/oauth/authorize'
const OSU_TOKEN_URL = 'https://osu.ppy.sh/oauth/token'
const OSU_ME_URL = 'https://osu.ppy.sh/api/v2/me'

// Cloudflare Workers/Pages 的 fetch 默认不带可识别的 User-Agent，
// osu.ppy.sh 前置的 nginx/WAF 会把这类无标识请求当成爬虫，从共享出口 IP
// 直接返回 nginx 层的 429（HTML 页面，而非 osu 的 JSON 错误）。
// 带上明确的 User-Agent 即可通过。
const OSU_USER_AGENT = 'osumania-ladder/1.0 (+https://osumania-ladder.pages.dev)'

export interface OsuOAuthEnv {
  OSU_CLIENT_ID: string
  OSU_CLIENT_SECRET: string
  // 站点根地址，例如 https://osumania-ladder.pages.dev（结尾不带斜杠）。
  // 回调地址由它派生：SITE_URL + /api/auth/callback。
  SITE_URL: string
}

export interface OsuUser {
  id: number
  username: string
  avatar_url?: string
}

/**
 * 由 SITE_URL 派生 OAuth 回调地址，须与 osu! 应用里登记的回调完全一致。
 */
export function buildRedirectUri(env: OsuOAuthEnv): string {
  return `${env.SITE_URL.replace(/\/$/, '')}/api/auth/callback`
}

/**
 * 构造 osu 授权页 URL。state 用于防 CSRF，回调时校验。
 */
export function buildAuthorizeUrl(env: OsuOAuthEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.OSU_CLIENT_ID,
    redirect_uri: buildRedirectUri(env),
    response_type: 'code',
    scope: 'identify',
    state,
  })
  return `${OSU_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * 用授权码换 access token。
 */
export async function exchangeCodeForToken(
  env: OsuOAuthEnv,
  code: string,
): Promise<string> {
  // osu! 的 token 端点是 Laravel Passport。用 OAuth2 标准的
  // application/x-www-form-urlencoded，最稳妥（JSON 在某些配置下会被拒）。
  const form = new URLSearchParams({
    client_id: env.OSU_CLIENT_ID,
    client_secret: env.OSU_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: buildRedirectUri(env),
  })

  const res = await fetch(OSU_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': OSU_USER_AGENT,
    },
    body: form.toString(),
  })

  if (!res.ok) {
    // 把 osu 返回的真实错误体带出来，便于定位（截断防止过长）。
    const body = await res.text().catch(() => '')
    throw new Error(`osu token exchange failed: ${res.status} ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error('osu token exchange: no access_token in response')
  }
  return data.access_token
}

/**
 * 用 access token 拉取当前用户信息。
 */
export async function fetchOsuMe(accessToken: string): Promise<OsuUser> {
  const res = await fetch(OSU_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': OSU_USER_AGENT,
    },
  })

  if (!res.ok) {
    throw new Error(`osu /me failed: ${res.status}`)
  }

  const data = (await res.json()) as OsuUser
  return { id: data.id, username: data.username, avatar_url: data.avatar_url }
}
