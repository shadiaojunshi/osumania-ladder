import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { addTrash } from '../_lib/trash'

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

// 读取单个比赛：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = params.id as string
  const path = `/contents/data/tournaments/${id}.json`
  const res = await githubFetch(path, env)

  if (!res.ok) {
    return jsonResponse({ error: 'Tournament not found' }, 404)
  }

  const file = (await res.json()) as { content: string; sha: string }
  const content = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))))
  return jsonResponse({ tournament: content, sha: file.sha })
}

// 编辑：contributor 及以上。
export const onRequestPut: PagesFunction<Env> = async ({ params, request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const id = params.id as string
  const { tournament, sha } = (await request.json()) as {
    tournament: { id: string; [key: string]: unknown }
    sha: string
  }

  const path = `/contents/data/tournaments/${id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(tournament, null, 2))))

  const res = await githubFetch(path, env, {
    method: 'PUT',
    body: JSON.stringify({ message: `Update tournament: ${id}`, content, sha }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to update', details: err }, res.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'tournament.update',
    target: id,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, id })
}

// 删除：admin 及以上。软删除——先把 JSON 副本存进回收站，再从 GitHub 移除。
export const onRequestDelete: PagesFunction<Env> = async ({ params, request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const id = params.id as string
  const { sha } = (await request.json()) as { sha: string }
  const path = `/contents/data/tournaments/${id}.json`

  // 删除前抓取完整 JSON，存进回收站以便恢复。
  let payload: string | undefined
  const getRes = await githubFetch(path, env)
  if (getRes.ok) {
    const file = (await getRes.json()) as { content: string }
    payload = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  }

  const res = await githubFetch(path, env, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Delete tournament: ${id}`, sha }),
  })

  if (!res.ok) {
    const err = await res.json()
    return jsonResponse({ error: 'Failed to delete', details: err }, res.status)
  }

  // 进回收站（带 TTL，到期自动清理）。即便此步失败也不回滚删除——
  // 因为 GitHub commit 历史本身就是兜底，随时可 revert。
  let trashId: string | undefined
  if (payload) {
    try {
      const entry = await addTrash(env.LADDER_KV, {
        kind: 'tournament',
        label: id,
        deletedByUid: user!.uid,
        deletedByName: user!.username,
        payload,
      })
      trashId = entry.id
    } catch {
      // 回收站写入失败不阻塞删除
    }
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'tournament.delete',
    target: id,
    detail: trashId ? `trashId=${trashId}` : '未存入回收站',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, id, trashId })
}
