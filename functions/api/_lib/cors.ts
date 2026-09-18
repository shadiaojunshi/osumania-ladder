// Shared CORS + JSON response helpers for all /api functions.
// The admin SPA is served from the same origin as these functions, so CORS is
// not strictly required, but we keep permissive headers for tooling/curl.
//
// R21：所有走这两个 helper 的响应一律带 `Cache-Control: private, no-store`。
// 后台 API 的响应里含会话状态与比赛数据，不许被共享缓存/边缘缓存留存。
// 需要不同缓存语义的端点自己构造 Response（例如 `/api/osu/raw` 的谱面文本是
// `private, no-cache` + ETag/304，`/api/osu/download` 是附件流）—— 那些差异是刻意的，
// 别顺手收拢。
//
// Access-Control-Allow-Origin 保持 `*`：响应不带 credentials，跨站页面读不到
// 认证数据（安全文档 P2 已澄清，不要把 `*` 误报成已确认泄漏）。写请求的跨站
// 防护在 `_middleware.ts` 里用 Origin 校验做，不靠这个头。
const NO_STORE = 'private, no-store'

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': NO_STORE,
      ...corsHeaders(),
      // 放在最后：调用方可以覆盖（例如某个端点确实要不同的缓存语义）。
      ...extraHeaders,
    },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': NO_STORE, ...corsHeaders() } })
}
