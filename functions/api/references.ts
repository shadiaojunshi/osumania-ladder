import { jsonResponse, noContent } from './_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from './_lib/auth'
import { writeAudit } from './_lib/audit'
import {
  githubFetch,
  classifyGithubFailure,
  isGenericUpstreamFailure,
  upstreamFailureResponse,
} from './_lib/github'
import { readJsonBody, validateReferences } from './_lib/validation'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 读取：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch('/contents/data/references.json', env)
  if (!res.ok) {
    // 过去把 GitHub 的状态码原样透传：401（token 失效）在前端看起来就是「你没登录」。
    return upstreamFailureResponse(await classifyGithubFailure(res, env))
  }
  const file = (await res.json()) as { content: string; sha: string }
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const data = JSON.parse(decoded)
  return jsonResponse({ references: data, sha: file.sha })
}

// 更新：contributor 及以上。
export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error, code: 'INVALID_REFERENCES' }, 400)
  }
  const parsed = body.value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse({ error: '请求体必须是 JSON 对象', code: 'INVALID_REFERENCES' }, 400)
  }
  const { references, sha } = parsed as { references?: unknown; sha?: unknown }
  if (typeof sha !== 'string' || sha.trim() === '') {
    return jsonResponse({ error: '缺少编辑基准 sha', code: 'INVALID_REFERENCES' }, 400)
  }

  // 参考点会被难度标尺/拟合工具直接消费,坏形状过去能被原样写进构建数据。
  const validated = validateReferences(references)
  if (!validated.ok) {
    return jsonResponse({ error: validated.error, code: 'INVALID_REFERENCES' }, 400)
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(validated.value, null, 2) + '\n')))

  const res = await githubFetch('/contents/data/references.json', env, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Update references', content, sha }),
  })

  if (!res.ok) {
    // R14:写路径也不透传上游状态码(过去 GitHub 的 401 会变成前端的「你没登录」)。
    const failure = await classifyGithubFailure(res, env)
    if (!isGenericUpstreamFailure(failure)) return upstreamFailureResponse(failure)
    // 分不出类别时保留 GitHub 原文(状态码仍是 502)。
    const err = await res.json().catch(() => ({}))
    return jsonResponse({ error: 'Failed to update', details: err }, failure.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'references.update',
    target: 'references.json',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true })
}
