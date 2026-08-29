interface Env {}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function textResponse(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders() },
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
    const upstream = await fetch(`https://osu.ppy.sh/osu/${id}`, {
      headers: {
        Accept: 'text/plain,*/*',
        'User-Agent': 'osumania-ladder/1.0 (+https://osumania-ladder.pages.dev)',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!upstream.ok) return textResponse(`osu beatmap download failed: HTTP ${upstream.status}`, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
    const body = await upstream.text()
    if (!body.includes('[HitObjects]')) return textResponse('downloaded file is not a valid osu beatmap', 502)
    return textResponse(body)
  } catch (error) {
    return textResponse(`osu beatmap download failed: ${error instanceof Error ? error.message : String(error)}`, 502)
  }
}
