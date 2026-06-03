/**
 * osu! OAuth2 授权码模式辅助函数。
 * 文档：https://osu.ppy.sh/docs/index.html#authorization-code-grant
 */

const OSU_AUTHORIZE_URL = 'https://osu.ppy.sh/oauth/authorize'
const OSU_TOKEN_URL = 'https://osu.ppy.sh/oauth/token'
const OSU_ME_URL = 'https://osu.ppy.sh/api/v2/me'

const OSU_USER_AGENT = 'osumania-ladder/1.0 (+https://osumania-ladder.pages.dev)'

export interface OsuOAuthEnv {
  OSU_CLIENT_ID: string
  OSU_CLIENT_SECRET: string
  // 站点根地址，例如 https://osumania-ladder.pages.dev（结尾不带斜杠）。
  // 回调地址由它派生：SITE_URL + /api/auth/callback。
  SITE_URL: string
  // 中转代理：绕过「Cloudflare Workers 共享出口 IP 被 osu 的 Cloudflare 边缘
  // 按 IP 限流（429 server=cloudflare）」的问题。代理部署在非 Cloudflare 平台
  // （Deno Deploy）。两者都配了才启用；否则直连 osu（本地开发用）。
  OSU_PROXY_URL?: string
  OSU_PROXY_SECRET?: string
}

export interface OsuUser {
  id: number
  username: string
  avatar_url?: string
}

function proxyEnabled(env: OsuOAuthEnv): boolean {
  return Boolean(env.OSU_PROXY_URL && env.OSU_PROXY_SECRET)
}

/**
 * 由 SITE_URL 派生 OAuth 回调地址，须与 osu! 应用里登记的回调完全一致。
 */
export function buildRedirectUri(env: OsuOAuthEnv): string {
  return `${env.SITE_URL.replace(/\/$/, '')}/api/auth/callback`
}

/**
 * 构造 osu 授权页 URL。state 用于防 CSRF，回调时校验。
 * 注意：这是浏览器直接跳转的地址，不走代理。
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
 * 配了代理就 POST 到 `${OSU_PROXY_URL}/token`（代理在非 Cloudflare IP 上转给 osu）；
 * 否则直连 osu。
 */
export async function exchangeCodeForToken(
  env: OsuOAuthEnv,
  code: string,
): Promise<string> {
  // osu! 的 token 端点是 Laravel Passport，用 application/x-www-form-urlencoded。
  const form = new URLSearchParams({
    client_id: env.OSU_CLIENT_ID,
    client_secret: env.OSU_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: buildRedirectUri(env),
  })

  const useProxy = proxyEnabled(env)
  const tokenUrl = useProxy
    ? `${env.OSU_PROXY_URL!.replace(/\/$/, '')}/token`
    : OSU_TOKEN_URL
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    'User-Agent': OSU_USER_AGENT,
  }
  if (useProxy) headers['X-Proxy-Secret'] = env.OSU_PROXY_SECRET!

  // 429 时退避重试：换个时机/出口连接，往往就过了。code 在失败时未被消费，重试安全。
  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: form.toString(),
    })
    if (res.status !== 429) break
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }

  if (!res || !res.ok) {
    // 带出诊断信息：server=cloudflare 且 cf-mitigated 空 → osu 边缘按 IP 限流，
    // 说明代理没生效或代理本身也被限；retry-after / ratelimit → 限流窗口。
    const status = res?.status ?? 0
    const body = res ? (await res.text().catch(() => '')).slice(0, 200) : ''
    const diag = res
      ? [
          `via=${useProxy ? 'proxy' : 'direct'}`,
          `server=${res.headers.get('server') ?? '-'}`,
          `cf-ray=${res.headers.get('cf-ray') ?? '-'}`,
          `cf-mitigated=${res.headers.get('cf-mitigated') ?? '-'}`,
          `retry-after=${res.headers.get('retry-after') ?? '-'}`,
        ].join(' ')
      : 'no-response'
    throw new Error(`osu token exchange failed: ${status} [${diag}] ${body}`)
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error('osu token exchange: no access_token in response')
  }
  return data.access_token
}

/**
 * 用 access token 拉取当前用户信息。
 * 配了代理就走 `${OSU_PROXY_URL}/me`；否则直连 osu。
 */
export async function fetchOsuMe(
  env: OsuOAuthEnv,
  accessToken: string,
): Promise<OsuUser> {
  const useProxy = proxyEnabled(env)
  const meUrl = useProxy
    ? `${env.OSU_PROXY_URL!.replace(/\/$/, '')}/me`
    : OSU_ME_URL
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'User-Agent': OSU_USER_AGENT,
  }
  if (useProxy) headers['X-Proxy-Secret'] = env.OSU_PROXY_SECRET!

  const res = await fetch(meUrl, { headers })

  if (!res.ok) {
    const diag = `via=${useProxy ? 'proxy' : 'direct'} server=${res.headers.get('server') ?? '-'}`
    throw new Error(`osu /me failed: ${res.status} [${diag}]`)
  }

  const data = (await res.json()) as OsuUser
  return { id: data.id, username: data.username, avatar_url: data.avatar_url }
}
