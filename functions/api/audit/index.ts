import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { getAuditEntry, listAudit } from '../_lib/audit'

interface Env extends AuthEnv {}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 审计日志：admin 及以上可查看。最新在前。
// ?key=audit:... 时返回该条的**完整正文**（列表里的摘要可能被字节上限收缩过，见 R16）。
export const onRequestGet: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const url = new URL(request.url)

  const keyParam = url.searchParams.get('key')
  if (keyParam) {
    try {
      const entry = await getAuditEntry(env.LADDER_KV, keyParam)
      // 前缀不合法 / 不存在一律 404，不区分（避免探测 KV 里有哪些 key）。
      if (!entry) return jsonResponse({ error: '审计记录不存在', code: 'NOT_FOUND' }, 404)
      return jsonResponse({ entry })
    } catch (e) {
      return jsonResponse({ error: '读取审计记录失败', detail: (e as Error).message ?? String(e) }, 500)
    }
  }

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
