interface Env {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

const GITHUB_API = 'https://api.github.com'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

async function githubFetch(path: string, env: Env, options: RequestInit = {}) {
  const res = await fetch(`${GITHUB_API}/repos/${env.GITHUB_REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'osumania-ladder',
      ...((options.headers as Record<string, string>) || {}),
    },
  })
  return res
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch('/contents/data/tournaments', env)
  if (!res.ok) {
    return jsonResponse({ error: 'Failed to list tournaments' }, res.status)
  }
  const files = await res.json() as { name: string; sha: string }[]
  const tournaments = files
    .filter((f) => f.name.endsWith('.json'))
    .map((f) => ({ id: f.name.replace('.json', ''), sha: f.sha }))
  return jsonResponse(tournaments)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const tournament = await request.json() as { id: string; [key: string]: unknown }
  if (!tournament.id) {
    return jsonResponse({ error: 'Missing tournament id' }, 400)
  }

  const path = `/contents/data/tournaments/${tournament.id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(tournament, null, 2))))

  const res = await githubFetch(path, env, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Add tournament: ${tournament.id}`,
      content,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to create', details: err }, res.status)
  }

  return jsonResponse({ success: true, id: tournament.id })
}
