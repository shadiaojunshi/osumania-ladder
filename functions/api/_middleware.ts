// Central auth gate for ALL /api/* requests.
//
// Cloudflare Pages runs this _middleware before any function under /api/.
// Responsibilities:
//   1. Answer CORS preflight (OPTIONS) uniformly.
//   2. Reject cross-site WRITE requests (R21).
//   3. Let the public auth endpoints through (login/callback/logout/me handle
//      their own session logic).
//   4. Require a contributor session for remaining management endpoints.
//   5. Attach the resolved user to context.data.user so downstream handlers
//      can do role checks without re-parsing the cookie.
//
// Role enforcement (contributor vs admin vs owner) happens IN each endpoint,
// because the required role differs per operation (e.g. delete needs admin,
// create needs contributor). The middleware guarantees at least contributor.
//
// ── R21 的跨站写防护 ──
// 写方法（POST / PUT / PATCH / DELETE）必须来自本站，否则 403 `BAD_ORIGIN`：
//   - 判据是 **Origin 的完整 origin（协议 + host + 端口）与请求自身相同**。比较 host
//     是不够的：`http://本站` 会以"同 host"通过，那是一次跨 origin 的写。
//     用完整 origin 后，生产域名、预览域名、本地 `wrangler pages dev` 都自动放行，
//     不需要维护域名清单，也就不会因为漏配一个域名把正常保存挡掉。
//   - 要额外放行别的源时用环境变量 `WRITE_ORIGIN_ALLOWLIST`（逗号分隔）。
//   - **不带 Origin 的请求放行**：浏览器发起的跨站写一定会带 Origin，所以"没有 Origin"
//     只可能是 curl / 脚本这类非浏览器客户端 —— 拦它只会挡工具，拦不住攻击。
//   - `Origin: null`（沙箱 iframe、file:// 等）**拒绝**：它解析不出 origin，必然被挡。
//   - GET / HEAD / OPTIONS 不走这道闸门：读请求靠 CORS + 会话保护，而 OAuth 回调
//     是浏览器从 osu.ppy.sh 导航过来的 GET。
//   - 顺序刻意是"先 Origin、后会话"：跨站写请求直接 403，不浪费一次会话解析；
//     本站请求照旧"没登录 401 / 没权限 403"（未改动原有语义）。

import { jsonResponse, noContent } from './_lib/cors'
import { getSessionUser, hasRole, type AuthEnv, type SessionUser } from './_lib/auth'

export interface OriginEnv extends AuthEnv {
  /** 逗号分隔的额外允许写入的 origin（本站之外的域名才需要配）。 */
  WRITE_ORIGIN_ALLOWLIST?: string
}

// Paths that must remain reachable without an existing session.
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/auth/me',
  // Dedicated published-catalog reader: quota and cache checks live in the handler.
  '/api/charts',
])

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(String(method || '').toUpperCase())
}

/**
 * 允许这次写请求的 Origin 吗？纯函数（除了解析 URL），便于单测。
 * @param request 待判定的请求
 * @param allowlist 逗号分隔的额外允许 origin
 */
export function isAllowedWriteOrigin(request: Request, allowlist = ''): boolean {
  const origin = request.headers.get('Origin')
  // 非浏览器客户端（curl / 脚本）：浏览器跨站写一定带 Origin，所以这拦不住攻击。
  if (!origin) return true

  let normalized: string
  try {
    normalized = new URL(origin).origin
  } catch {
    // 解析不出 origin（例如 `Origin: null`）→ 不是本站的浏览器上下文。
    return false
  }
  if (normalized === new URL(request.url).origin) return true

  return String(allowlist || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        return new URL(entry).origin === normalized
      } catch {
        return false
      }
    })
}

export const onRequest: PagesFunction<OriginEnv> = async (context) => {
  const { request, next, env } = context
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return noContent()
  }

  if (isWriteMethod(request.method) && !isAllowedWriteOrigin(request, env.WRITE_ORIGIN_ALLOWLIST)) {
    return jsonResponse({ error: '跨站写入已被拒绝（请求来源与本站不一致）', code: 'BAD_ORIGIN' }, 403)
  }

  if (PUBLIC_PATHS.has(url.pathname)) {
    return next()
  }

  const user = await getSessionUser(request, env)
  if (!user) {
    return jsonResponse({ error: '未登录或会话已过期', code: 'NO_SESSION' }, 401)
  }
  // Public pages use static data or /api/charts. A normal osu! account does not
  // need live GitHub reads, R2 listings or the full archive download proxy.
  if (!hasRole(user, 'contributor')) return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)

  // Make the user available to downstream handlers.
  ;(context.data as { user?: SessionUser }).user = user
  return next()
}
