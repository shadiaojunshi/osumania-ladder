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

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = params.id as string
  const path = `/contents/data/tournaments/${id}.json`
  const res = await githubFetch(path, env)

  if (!res.ok) {
    return jsonResponse({ error: 'Tournament not found' }, 404)
  }

  const file = await res.json() as { content: string; sha: string }
  const content = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))))
  return jsonResponse({ tournament: content, sha: file.sha })
}

export const onRequestPut: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const { tournament, sha } = await request.json() as { tournament: { id: string; [key: string]: unknown }; sha: string }

  const path = `/contents/data/tournaments/${id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(tournament, null, 2))))

  const res = await githubFetch(path, env, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Update tournament: ${id}`,
      content,
      sha,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to update', details: err }, res.status)
  }

  return jsonResponse({ success: true, id })
}

export const onRequestDelete: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const { sha } = await request.json() as { sha: string }

  const path = `/contents/data/tournaments/${id}.json`

  const res = await githubFetch(path, env, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `Delete tournament: ${id}`,
      sha,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to delete', details: err }, res.status)
  }

  return jsonResponse({ success: true, id })
}
