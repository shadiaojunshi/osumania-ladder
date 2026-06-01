interface Env {
  OSU_API_KEY: string
}

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

  const apiUrl = `https://osu.ppy.sh/api/get_beatmaps?k=${env.OSU_API_KEY}&b=${id}`
  let upstream: Response | null = null
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(apiUrl, {
        headers: { 'User-Agent': 'osumania-ladder' },
        signal: AbortSignal.timeout(8000),
      })
      if (upstream.ok) break
      if (upstream.status >= 400 && upstream.status < 500) break
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
  }

  if (!upstream || !upstream.ok) {
    return jsonResponse(
      { error: 'upstream error', status: upstream?.status ?? null, message: String(lastErr ?? '') },
      502
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
