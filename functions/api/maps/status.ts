interface Env {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
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
  const tournamentId = url.searchParams.get('tournamentId')

  if (!tournamentId) {
    return jsonResponse({ error: 'Missing tournamentId parameter' }, 400)
  }

  const prefix = `maps/${tournamentId}/`
  const listed = await env.R2_BUCKET.list({ prefix })

  const uploaded = listed.objects.map((obj) => {
    const relative = obj.key.replace(prefix, '').replace('.osz', '')
    return relative
  })

  return jsonResponse({ uploaded })
}
