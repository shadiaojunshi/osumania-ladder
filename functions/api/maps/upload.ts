interface Env {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const MAX_SIZE = 25 * 1024 * 1024

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse({ error: 'Expected multipart/form-data' }, 400)
  }

  const formData = await request.formData()
  const tournamentId = formData.get('tournamentId') as string
  const roundId = formData.get('roundId') as string
  const slot = formData.get('slot') as string
  const file = formData.get('file') as File | null

  if (!tournamentId || !roundId || !slot || !file) {
    return jsonResponse({ error: 'Missing required fields: tournamentId, roundId, slot, file' }, 400)
  }

  if (file.size > MAX_SIZE) {
    return jsonResponse({ error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` }, 413)
  }

  const key = `maps/${tournamentId}/${roundId}/${slot}.osz`
  await env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { originalName: file.name },
  })

  return jsonResponse({ success: true, key })
}
