interface Env {
  OSU_API_KEY: string
  OSU_PROXY_URL?: string
  OSU_PROXY_SECRET?: string
}

const OSU_USER_AGENT = 'osumania-ladder/1.0 (+https://osumania-ladder.pages.dev)'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) return jsonResponse({ error: 'invalid id' }, 400)
  if (!env.OSU_API_KEY) return jsonResponse({ error: 'OSU_API_KEY not configured' }, 500)

  // 走 Deno 代理（与 OAuth 同一原因：Cloudflare Workers 共享出口 IP 被 osu 边缘整池限流，
  // 直连 osu v1 API 也会恒 429）。两者都配了才启用代理；否则直连（仅本地开发）。
  const useProxy = Boolean(env.OSU_PROXY_URL && env.OSU_PROXY_SECRET)
  const apiUrl = useProxy
    ? `${env.OSU_PROXY_URL!.replace(/\/$/, '')}/v1/get_beatmaps?k=${encodeURIComponent(env.OSU_API_KEY)}&b=${id}`
    : `https://osu.ppy.sh/api/get_beatmaps?k=${encodeURIComponent(env.OSU_API_KEY)}&b=${id}`

  const headers: Record<string, string> = {
    'User-Agent': OSU_USER_AGENT,
    Accept: 'application/json',
  }
  if (useProxy) headers['X-Proxy-Secret'] = env.OSU_PROXY_SECRET!

  let upstream: Response | null = null
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      upstream = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(8000) })
      if (upstream.ok) break
      if (upstream.status === 429) {
        if (attempt < 1) await new Promise((r) => setTimeout(r, 800))
        continue
      }
      if (upstream.status >= 400 && upstream.status < 500) break
    } catch (err) {
      lastErr = err
    }
    if (attempt < 1) await new Promise((r) => setTimeout(r, 300))
  }

  if (!upstream || !upstream.ok) {
    const status = upstream?.status ?? 0
    const diag = upstream
      ? `via=${useProxy ? 'proxy' : 'direct'} server=${upstream.headers.get('server') ?? '-'} cf-ray=${upstream.headers.get('cf-ray') ?? '-'}`
      : 'no-response'
    return jsonResponse(
      { error: 'upstream error', status, diag, message: String(lastErr ?? '') },
      status === 429 ? 429 : 502,
    )
  }

  const data = await upstream.json() as Array<Record<string, string>>
  if (!Array.isArray(data) || data.length === 0) return jsonResponse({ error: 'not found' }, 404)

  const m = data[0]
  return jsonResponse({
    beatmapId: m.beatmap_id,
    beatmapsetId: m.beatmapset_id,
    artist: m.artist,
    title: m.title,
    version: m.version,
    creator: m.creator,
    mode: m.mode,
    bpm: m.bpm ? Number(m.bpm) : null,
    length: m.hit_length ? Number(m.hit_length) : null,
    cs: m.diff_size ? Number(m.diff_size) : null,
    od: m.diff_overall ? Number(m.diff_overall) : null,
    hp: m.diff_drain ? Number(m.diff_drain) : null,
    sr: m.difficultyrating ? Number(m.difficultyrating) : null,
  })
}
