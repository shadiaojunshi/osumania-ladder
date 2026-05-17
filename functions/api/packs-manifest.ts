interface Env {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

const GITHUB_API = 'https://api.github.com'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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
  const res = await githubFetch('/contents/data/packs-manifest.json', env)
  if (!res.ok) {
    return jsonResponse({ manifest: { packs: [], lastGenerated: '' }, sha: null })
  }
  const file = await res.json() as { content: string; sha: string }
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const manifest = JSON.parse(decoded)
  return jsonResponse({ manifest, sha: file.sha })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const { manifest, sha } = await request.json() as { manifest: unknown; sha: string }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2) + '\n')))

  const res = await githubFetch('/contents/data/packs-manifest.json', env, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Update packs manifest links',
      content,
      sha,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to update', details: err }, res.status)
  }

  return jsonResponse({ success: true })
}
