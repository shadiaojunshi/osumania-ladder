import { jsonResponse, noContent } from './_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from './_lib/auth'
import { writeAudit } from './_lib/audit'
import { readJsonBody, validatePacksManifest } from './_lib/validation'

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
  const res = await githubFetch('/contents/data/packs-manifest.json', env)
  if (!res.ok) {
    return jsonResponse({ manifest: { packs: [], lastGenerated: '' }, sha: null })
  }
  const file = (await res.json()) as { content: string; sha: string }
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const manifest = JSON.parse(decoded)
  return jsonResponse({ manifest, sha: file.sha })
}

// 更新：contributor 及以上。
export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error, code: 'INVALID_MANIFEST' }, 400)
  }
  const parsed = body.value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse({ error: '请求体必须是 JSON 对象', code: 'INVALID_MANIFEST' }, 400)
  }
  const { manifest, sha } = parsed as { manifest?: unknown; sha?: unknown }
  if (typeof sha !== 'string' || sha.trim() === '') {
    return jsonResponse({ error: '缺少编辑基准 sha', code: 'INVALID_MANIFEST' }, 400)
  }

  // 清单里的链接会直接出现在下载页:允许任意对象写进来等于允许写坏线上链接。
  const validated = validatePacksManifest(manifest)
  if (!validated.ok) {
    return jsonResponse({ error: validated.error, code: 'INVALID_MANIFEST' }, 400)
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(validated.value, null, 2) + '\n')))

  const res = await githubFetch('/contents/data/packs-manifest.json', env, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Update packs manifest links', content, sha }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to update', details: err }, res.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'packs.update',
    target: 'packs-manifest.json',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true })
}
