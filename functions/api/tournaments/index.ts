import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { githubFetch, classifyGithubFailure, upstreamFailureResponse } from '../_lib/github'
import { readJsonBody, validatePathId, validateTournament } from '../_lib/validation'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 列表：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch('/contents/data/tournaments', env)
  if (!res.ok) {
    // 过去这里把 GitHub 的状态码原样透传：401（token 失效）回给前端就成了
    // 「你没登录」，站长会去重新登录而不是换 token。现在统一分类成 502 + code。
    return upstreamFailureResponse(await classifyGithubFailure(res, env))
  }
  const files = (await res.json()) as { name: string; sha: string }[]
  const tournaments = files
    .filter((f) => f.name.endsWith('.json'))
    .map((f) => ({ id: f.name.replace('.json', ''), sha: f.sha }))
  return jsonResponse(tournaments)
}

// 创建：contributor 及以上。
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error, code: 'INVALID_TOURNAMENT' }, 400)
  }
  if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) {
    return jsonResponse({ error: '请求体必须是 JSON 对象', code: 'INVALID_TOURNAMENT' }, 400)
  }
  const parsed = body.value as { id?: unknown }

  // 保留原文案:既有客户端与测试都依赖它。
  if (!parsed.id) {
    return jsonResponse({ error: 'Missing tournament id' }, 400)
  }

  // 先限制 ID 再拼路径。否则 `../outside` 会被 fetch 规范化到
  // data/outside.json,写到 tournaments 目录之外。
  const idCheck = validatePathId(parsed.id)
  if (!idCheck.ok) {
    return jsonResponse({ error: idCheck.error, code: 'INVALID_TOURNAMENT' }, 400)
  }

  // create 过去只检查 id 是否存在,rounds 是字符串、slot 重复、难度是 NaN 都能写进仓库。
  const validated = validateTournament(parsed)
  if (!validated.ok) {
    return jsonResponse({ error: validated.error, code: 'INVALID_TOURNAMENT' }, 400)
  }
  const tournament = validated.value
  const id = idCheck.value

  const path = `/contents/data/tournaments/${id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(tournament, null, 2))))

  const res = await githubFetch(path, env, {
    method: 'PUT',
    body: JSON.stringify({ message: `Add tournament: ${id}`, content }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to create', details: err }, res.status)
  }

  // 新建成功后把 blob sha 一并返回(R02):前端据此进入编辑模式,
  // 后续保存走 PUT 而不是再 POST(否则撞名失败)。
  const created = (await res.json().catch(() => ({}))) as { content?: { sha?: string } }
  const newSha = typeof created.content?.sha === 'string' ? created.content.sha : null

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'tournament.create',
    target: id,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, id, sha: newSha })
}
