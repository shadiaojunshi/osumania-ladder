// 参考难度标尺 API。结构跟 ref-tournaments 平行:GitHub Contents API + sha 乐观锁。
// 数据落地在 data/ref-ladder.json,内容是 { entries: { tournamentId, roundId }[] }。
// entries 是一条「易 → 难」的有序链,跨比赛。picker 锚点 + prev/next 都从这条链取。
// 读权限:已登录(中间件保证);写权限:contributor 及以上。

import { jsonResponse, noContent } from './_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from './_lib/auth'
import { writeAudit } from './_lib/audit'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

interface LadderEntry {
  tournamentId: string
  roundId: string
}

const GITHUB_API = 'https://api.github.com'
const FILE_PATH = '/contents/data/ref-ladder.json'

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
    return jsonResponse({ data: { entries: [] }, sha: null })
  }
  const file = (await res.json()) as { content: string; sha: string }
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const data = JSON.parse(decoded) as { entries?: LadderEntry[] }
  return jsonResponse({
    data: { entries: data.entries || [] },
    sha: file.sha,
  })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = (await request.json()) as { entries: unknown; sha: string | null }
  if (!Array.isArray(body.entries)) {
    return jsonResponse({ error: 'entries 必须是数组' }, 400)
  }
  const entries: LadderEntry[] = []
  for (const e of body.entries) {
    if (
      e &&
      typeof e === 'object' &&
      typeof (e as LadderEntry).tournamentId === 'string' &&
      typeof (e as LadderEntry).roundId === 'string'
    ) {
      entries.push({
        tournamentId: (e as LadderEntry).tournamentId,
        roundId: (e as LadderEntry).roundId,
      })
    }
    if (entries.length >= 500) break
  }

  const payload = { entries }
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2) + '\n')))

  const ghBody: Record<string, unknown> = {
    message: 'Update reference difficulty ladder',
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
    action: 'refLadder.update',
    target: 'ref-ladder.json',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true })
}
