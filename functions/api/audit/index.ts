import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { listAudit } from '../_lib/audit'

interface Env extends AuthEnv {}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 审计日志：admin 及以上可查看。最新在前。
export const onRequestGet: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100

  try {
    const entries = await listAudit(env.LADDER_KV, limit)
    return jsonResponse({ entries })
  } catch (e) {
    return jsonResponse({
      error: '读取审计日志失败',
      detail: (e as Error).message ?? String(e),
      kvBound: typeof env.LADDER_KV !== 'undefined',
    }, 500)
  }
}
