import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'

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

// 列表：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch('/contents/data/tournaments', env)
  if (!res.ok) {
    return jsonResponse({ error: 'Failed to list tournaments' }, res.status)
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

  const tournament = (await request.json()) as { id: string; [key: string]: unknown }
  if (!tournament.id) {
    return jsonResponse({ error: 'Missing tournament id' }, 400)
  }

  const path = `/contents/data/tournaments/${tournament.id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(tournament, null, 2))))

  const res = await githubFetch(path, env, {
    method: 'PUT',
    body: JSON.stringify({ message: `Add tournament: ${tournament.id}`, content }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to create', details: err }, res.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'tournament.create',
    target: tournament.id,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, id: tournament.id })
}
