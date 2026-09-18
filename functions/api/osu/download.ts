interface Env {}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function errorResponse(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    // R21：错误响应更不该被缓存（否则一次抖动会被留着）。
    // 注意下面的 200 附件流是刻意保留差异的：它有自己的 Content-Disposition，
    // 不加 no-store。
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...corsHeaders() },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

const MIRRORS = [
  (id: string) => `https://catboy.best/d/${id}`,
  (id: string) => `https://api.nerinyan.moe/d/${id}?nv=1`,
]

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url)
  const setId = url.searchParams.get('setId')
  if (!setId || !/^\d+$/.test(setId)) return errorResponse('invalid setId', 400)

  let lastErr: unknown = null
  for (const buildUrl of MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const upstream = await fetch(buildUrl(setId), {
          headers: { 'User-Agent': 'osumania-ladder' },
          redirect: 'follow',
          signal: AbortSignal.timeout(60_000),
        })
        if (!upstream.ok) {
          lastErr = `mirror ${buildUrl(setId)} -> ${upstream.status}`
          if (upstream.status >= 400 && upstream.status < 500) break
          await new Promise((r) => setTimeout(r, 500))
          continue
        }
        if (!upstream.body) {
          lastErr = 'empty body'
          continue
        }
        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${setId}.osz"`,
            ...corsHeaders(),
          },
        })
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  return errorResponse(`all mirrors failed: ${String(lastErr ?? '')}`, 502)
}
