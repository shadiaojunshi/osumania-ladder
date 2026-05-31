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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const { tournamentId, roundId, slot, nsv } = await request.json() as {
    tournamentId: string
    roundId: string
    slot: string
    nsv?: boolean
  }

  if (!tournamentId || !roundId || !slot) {
    return jsonResponse({ error: 'Missing required fields' }, 400)
  }

  const suffix = nsv ? '.nsv.osz' : '.osz'
  const key = `maps/${tournamentId}/${roundId}/${slot}${suffix}`
  await env.R2_BUCKET.delete(key)

  return jsonResponse({ success: true })
}
