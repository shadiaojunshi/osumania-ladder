// 参考比赛白名单 API。结构跟 packs-manifest 完全平行:GitHub Contents API + sha 乐观锁。
// 数据落地在 data/ref-tournaments.json,内容是 { tournamentIds: string[] }。
// 读权限:已登录(中间件保证);写权限:contributor 及以上。

import { jsonResponse, noContent } from './_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from './_lib/auth'
import { writeAudit } from './_lib/audit'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

const GITHUB_API = 'https://api.github.com'
const FILE_PATH = '/contents/data/ref-tournaments.json'

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

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch(FILE_PATH, env)
  if (!res.ok) {
    return jsonResponse({ data: { tournamentIds: [] }, sha: null })
  }
  const file = (await res.json()) as { content: string; sha: string }
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const data = JSON.parse(decoded) as { tournamentIds?: string[] }
  return jsonResponse({
    data: { tournamentIds: data.tournamentIds || [] },
    sha: file.sha,
  })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = (await request.json()) as { tournamentIds: unknown; sha: string | null }
  if (!Array.isArray(body.tournamentIds)) {
    return jsonResponse({ error: 'tournamentIds 必须是数组' }, 400)
  }
  const ids = body.tournamentIds.filter((x): x is string => typeof x === 'string').slice(0, 200)

  const payload = { tournamentIds: ids }
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2) + '\n')))

  const ghBody: Record<string, unknown> = {
    message: 'Update reference tournaments whitelist',
    content,
  }
  if (body.sha) ghBody.sha = body.sha

  const res = await githubFetch(FILE_PATH, env, {
    method: 'PUT',
    body: JSON.stringify(ghBody),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to update', details: err }, res.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'refTournaments.update',
    target: 'ref-tournaments.json',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true })
}
