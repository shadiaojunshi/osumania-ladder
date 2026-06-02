import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

const MAX_SIZE = 100 * 1024 * 1024

// 上传谱面：contributor 及以上。
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse({ error: 'Expected multipart/form-data' }, 400)
  }

  const formData = await request.formData()
  const tournamentId = formData.get('tournamentId') as string
  const roundId = formData.get('roundId') as string
  const slot = formData.get('slot') as string
  const file = formData.get('file') as File | null
  const isNsv = formData.get('nsv') === '1'

  if (!tournamentId || !roundId || !slot || !file) {
    return jsonResponse({ error: 'Missing required fields: tournamentId, roundId, slot, file' }, 400)
  }

  if (file.size > MAX_SIZE) {
    return jsonResponse({ error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` }, 413)
  }

  const suffix = isNsv ? '.nsv.osz' : '.osz'
  const key = `maps/${tournamentId}/${roundId}/${slot}${suffix}`
  await env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { originalName: file.name },
  })

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'map.upload',
    target: key,
    detail: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, key })
}
