import { isValidTournamentId } from '../_lib/tournamentId'
import { mapObjectPrefix, parseMapObjectKey } from '../_lib/mapKeys'

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
  // R04:键规则对齐 —— id 与键解析都走共享实现,不再各拼一份字符串。
  if (!isValidTournamentId(tournamentId)) {
    return jsonResponse({ error: 'invalid tournamentId' }, 400)
  }

  const prefix = mapObjectPrefix(tournamentId)
  const listed = await env.R2_BUCKET.list({ prefix })

  const uploaded: string[] = []
  const uploadedNsv: string[] = []
  for (const obj of listed.objects) {
    const parsed = parseMapObjectKey(tournamentId, obj.key)
    if (!parsed) continue
    if (parsed.nsv) uploadedNsv.push(parsed.relative)
    else uploaded.push(parsed.relative)
  }

  return jsonResponse({ uploaded, uploadedNsv })
}
