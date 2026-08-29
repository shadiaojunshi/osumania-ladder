interface Env {}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function textResponse(text: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(), ...extraHeaders },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) return textResponse('invalid beatmap id', 400)

  try {
    let upstream: Response | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await fetch(`https://osu.ppy.sh/osu/${id}`, {
          headers: {
            Accept: 'text/plain,*/*',
            'User-Agent': 'osumania-ladder/1.0 (+https://osumania-ladder.pages.dev)',
          },
          signal: AbortSignal.timeout(8_000),
        })
        if (upstream.ok) break
        if (upstream.status !== 429 && upstream.status < 500) break
        if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (error) {
        lastError = error
        if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }

    if (!upstream || !upstream.ok) {
      const status = upstream?.status ?? 0
      const responseStatus = status >= 400 && status < 500 ? status : 502
      const retryAfter = upstream?.headers.get('Retry-After')
      return textResponse(
        `osu beatmap download failed: ${status ? `HTTP ${status}` : String(lastError ?? 'no response')}`,
        responseStatus,
        retryAfter ? { 'Retry-After': retryAfter } : {},
      )
    }

    const body = await upstream.text()
    if (!body.includes('[HitObjects]')) return textResponse('downloaded file is not a valid osu beatmap', 502)
    return textResponse(body)
  } catch (error) {
    return textResponse(`osu beatmap download failed: ${error instanceof Error ? error.message : String(error)}`, 502)
  }
}
