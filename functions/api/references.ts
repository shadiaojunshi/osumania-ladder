import { jsonResponse, noContent } from './_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from './_lib/auth'
import { writeAudit } from './_lib/audit'
import { readJsonBody, validateReferences } from './_lib/validation'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

const GITHUB_API = 'https://api.github.com'

async function githubFetch(path: string, env: Env, options: RequestInit = {}) {
  return fetch(`${GITHUB_API}/repos/${env.GITHUB_REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'osumania-ladder',
      ...((options.headers as Record<string, string>) || {}),
    },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 读取：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch('/contents/data/references.json', env)
  if (!res.ok) {
    return jsonResponse({ error: 'Failed to fetch references' }, res.status)
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
    const err = await res.json()
    return jsonResponse({ error: 'Failed to update', details: err }, res.status)
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
