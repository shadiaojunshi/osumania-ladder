// osu! OAuth 中转代理 —— 部署在 Deno Deploy（非 Cloudflare 出口 IP）。
//
// 为什么需要它：
//   osumania-ladder 的后端跑在 Cloudflare Pages Functions 上，出口走 Cloudflare
//   Workers 的共享 IP。osu.ppy.sh 也在 Cloudflare 后面，其边缘会按来源 IP 限流，
//   于是我们的 token 交换请求被同一 IP 池里别的流量连累，恒返回
//   429 (server=cloudflare)，怎么等都不退。
//
//   这个代理跑在 Deno Deploy（Google 的 IP，不是 Cloudflare），把 osu 的两个
//   请求（换 token、拉用户信息）原样转发出去，绕开限流。
//
// 安全：
//   - 仅放行带正确 X-Proxy-Secret 头的请求（与 Cloudflare 端共享的密钥）。
//   - 代理不持有任何 osu 凭据：client_secret 由 Cloudflare 端放进请求体，
//     access_token 由 Cloudflare 端放进 Authorization 头，代理只透传。
//   - 只允许两个固定的 osu 端点，杜绝被当成开放代理滥用。
//
// 部署：
//   1. 把这个 osu-proxy 目录推到一个 GitHub 仓库（或单独的仓库）。
//   2. 在 https://dash.deno.com 新建项目，关联该仓库，入口选 main.ts。
//   3. 在项目 Settings → Environment Variables 设 PROXY_SECRET（随机长串）。
//   4. 部署后拿到 https://<project>.deno.dev，连同同一个 PROXY_SECRET
//      填到 Cloudflare 的 OSU_PROXY_URL / OSU_PROXY_SECRET。

const OSU_TOKEN_URL = 'https://osu.ppy.sh/oauth/token'
const OSU_ME_URL = 'https://osu.ppy.sh/api/v2/me'
const OSU_V1_GET_BEATMAPS_URL = 'https://osu.ppy.sh/api/get_beatmaps'
const USER_AGENT = 'osumania-ladder-proxy/1.0 (+https://osumania-ladder.pages.dev)'

const PROXY_SECRET = Deno.env.get('PROXY_SECRET') ?? ''

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Proxy-Secret',
    ...extra,
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

function authorized(req: Request): boolean {
  // 没配密钥时直接拒绝，避免裸奔成开放代理。
  if (!PROXY_SECRET) return false
  return req.headers.get('X-Proxy-Secret') === PROXY_SECRET
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() })
  }

  // 健康检查（不需要密钥），方便确认服务活着。
  if (url.pathname === '/' || url.pathname === '/health') {
    return json({ ok: true, service: 'osu-proxy', secretConfigured: Boolean(PROXY_SECRET) })
  }

  if (!authorized(req)) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    // POST /token —— 转发换 token 请求（form-encoded）。
    if (url.pathname === '/token' && req.method === 'POST') {
      const body = await req.text()
      const upstream = await fetch(OSU_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body,
      })
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          ...cors(),
        },
      })
    }

    // GET /me —— 转发拉用户信息请求（带上游 Authorization 头）。
    if (url.pathname === '/me' && req.method === 'GET') {
      const auth = req.headers.get('Authorization') ?? ''
      const upstream = await fetch(OSU_ME_URL, {
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      })
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          ...cors(),
        },
      })
    }

    // GET /v1/get_beatmaps —— 转发 osu! v1 API 查谱面元数据。
    // 上游用 query string 鉴权（?k=API_KEY&b=BEATMAP_ID），代理本身不持有 key，
    // 由 Cloudflare 端在 query 里带过来,代理透传。
    if (url.pathname === '/v1/get_beatmaps' && req.method === 'GET') {
      const upstreamUrl = `${OSU_V1_GET_BEATMAPS_URL}?${url.searchParams.toString()}`
      const upstream = await fetch(upstreamUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      })
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          ...cors(),
        },
      })
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    return json({ error: `proxy error: ${(e as Error).message}` }, 502)
  }
})
