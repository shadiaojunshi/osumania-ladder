import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { listTrash, getTrash, removeTrash } from '../_lib/trash'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
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

// 列出回收站：admin 及以上可查看。
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  // listTrash 已只返回展示用 slim（id/kind/label/deletedAt/deletedByName），
  // tournament 的 payload 不会回传，恢复路径再按 id 取。
  const items = await listTrash(env.LADDER_KV)
  return jsonResponse({ items })
}

// 恢复：admin 及以上。body = { id }
// tournament -> 把 payload 写回 GitHub；map -> R2 内从 restoreKey 复制回 originalKey。
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const { id } = (await request.json()) as { id?: string }
  if (!id) return jsonResponse({ error: '缺少 id' }, 400)

  const entry = await getTrash(env.LADDER_KV, id)
  if (!entry) {
    return jsonResponse({ error: '回收站条目不存在或已过期' }, 404)
  }

  if (entry.kind === 'tournament') {
    if (!entry.payload) {
      return jsonResponse({ error: '回收站条目缺少数据，无法恢复' }, 500)
    }
    const tid = entry.label
    const path = `/contents/data/tournaments/${tid}.json`

    // 若已存在同名文件，需带上 sha 才能覆盖。
    let sha: string | undefined
    const head = await githubFetch(path, env)
    if (head.ok) {
      const f = (await head.json()) as { sha: string }
      sha = f.sha
    }

    const content = btoa(unescape(encodeURIComponent(entry.payload)))
    const res = await githubFetch(path, env, {
      method: 'PUT',
      body: JSON.stringify({ message: `Restore tournament: ${tid}`, content, ...(sha ? { sha } : {}) }),
    })
    if (!res.ok) {
      const err = await res.json()
      return jsonResponse({ error: '恢复失败', details: err }, res.status)
    }
  } else {
    // map：从 restoreKey 复制回 originalKey
    if (!entry.restoreKey || !entry.originalKey) {
      return jsonResponse({ error: '回收站条目缺少 R2 key，无法恢复' }, 500)
    }
    const obj = await env.R2_BUCKET.get(entry.restoreKey)
    if (!obj) {
      return jsonResponse({ error: 'R2 中的备份文件已不存在（可能已过期清理）' }, 404)
    }
    await env.R2_BUCKET.put(entry.originalKey, obj.body, {
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
    })
    await env.R2_BUCKET.delete(entry.restoreKey)
  }

  await removeTrash(env.LADDER_KV, id)

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: entry.kind === 'tournament' ? 'tournament.restore' : 'map.restore',
    target: entry.label,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, kind: entry.kind, label: entry.label })
}
