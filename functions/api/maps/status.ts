import { isValidTournamentId } from '../_lib/tournamentId'
import { mapObjectPrefix, parseMapObjectKey, splitMapRelative } from '../_lib/mapKeys'

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

  // R13:R2 list 单页最多 1000 个对象且默认不分页 —— 比赛谱面超过 1000 个之后,
  // 后面的对象会被静默漏掉,前端就把"其实已上传"的槽位显示成未上传。
  // 这里按 cursor 循环累计;中途任何一页失败都**返回错误**而不是部分清单
  // (部分清单会被前端当成权威状态,把它当作"这些都没传"进而清掉勾选)。
  const uploaded: string[] = []
  const uploadedNsv: string[] = []
  let cursor: string | undefined
  do {
    let listed: R2Objects
    try {
      listed = await env.R2_BUCKET.list({ prefix, cursor, limit: 1000 })
    } catch {
      return jsonResponse({ error: 'R2 list failed, please retry', code: 'R2_LIST_FAILED' }, 502)
    }
    for (const obj of listed.objects) {
      const parsed = parseMapObjectKey(tournamentId, obj.key)
      if (!parsed) continue
      // 历史垃圾键(空槽位段、含 . / ..)在比赛 JSON 里不可能对应槽位 —— 滤掉,
      // 别让它们混进界面状态。判断复用键规则(validateRoundId/validateSlot)。
      if (!splitMapRelative(parsed.relative)) continue
      if (parsed.nsv) uploadedNsv.push(parsed.relative)
      else uploaded.push(parsed.relative)
    }
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)

  return jsonResponse({ uploaded, uploadedNsv })
}
