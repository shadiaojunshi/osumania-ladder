// 批量写回多个 tournament JSON —— 打进「一次 commit」。
//
// 为什么单独一个端点而不是循环调 PUT /api/tournaments/{id}:
//   逐个 PUT 每个文件产生一次 GitHub commit，Cloudflare Pages 每次 commit 触发
//   一次构建。修一批键型冲突常涉及十几个文件 → 十几次构建，直接啃掉 500/月 额度。
//   这里用 GitHub Git Data API（blobs → tree → commit → 更新 ref）把所有改动合成
//   一个 commit = 只触发 1 次构建。
//
// 权限: admin 及以上（会触发重建，比单文件编辑更"重"）。

import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

const GITHUB_API = 'https://api.github.com'
const BRANCH = 'main'

async function gh(path: string, env: Env, options: RequestInit = {}) {
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const { changes, summary } = (await request.json()) as {
    changes: Record<string, unknown> // tournamentId -> 完整 tournament JSON
    summary?: string
  }

  const ids = Object.keys(changes || {})
  if (ids.length === 0) {
    return jsonResponse({ error: '没有要保存的改动' }, 400)
  }

  try {
    // 1. 取分支当前 HEAD commit sha
    const refRes = await gh(`/git/ref/heads/${BRANCH}`, env)
    if (!refRes.ok) throw new Error(`读取分支引用失败: ${refRes.status}`)
    const refJson = (await refRes.json()) as { object: { sha: string } }
    const baseCommitSha = refJson.object.sha

    // 2. 取 base commit 指向的 tree sha
    const commitRes = await gh(`/git/commits/${baseCommitSha}`, env)
    if (!commitRes.ok) throw new Error(`读取基准 commit 失败: ${commitRes.status}`)
    const commitJson = (await commitRes.json()) as { tree: { sha: string } }
    const baseTreeSha = commitJson.tree.sha

    // 3. 每个文件创建一个 blob
    const treeItems: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = []
    for (const id of ids) {
      const content = JSON.stringify(changes[id], null, 2) + '\n'
      const blobRes = await gh('/git/blobs', env, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      })
      if (!blobRes.ok) throw new Error(`创建 blob 失败 (${id}): ${blobRes.status}`)
      const blobJson = (await blobRes.json()) as { sha: string }
      treeItems.push({
        path: `data/tournaments/${id}.json`,
        mode: '100644',
        type: 'blob',
        sha: blobJson.sha,
      })
    }

    // 4. 基于 base tree 创建新 tree
    const treeRes = await gh('/git/trees', env, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    })
    if (!treeRes.ok) throw new Error(`创建 tree 失败: ${treeRes.status}`)
    const treeJson = (await treeRes.json()) as { sha: string }

    // 5. 创建 commit
    const message = summary || `Batch fix realType conflicts (${ids.length} files)`
    const newCommitRes = await gh('/git/commits', env, {
      method: 'POST',
      body: JSON.stringify({ message, tree: treeJson.sha, parents: [baseCommitSha] }),
    })
    if (!newCommitRes.ok) throw new Error(`创建 commit 失败: ${newCommitRes.status}`)
    const newCommitJson = (await newCommitRes.json()) as { sha: string }

    // 6. 更新分支 ref 指向新 commit
    const updateRes = await gh(`/git/refs/heads/${BRANCH}`, env, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitJson.sha, force: false }),
    })
    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}))
      throw new Error(`更新分支失败: ${updateRes.status} ${JSON.stringify(err)}`)
    }

    await writeAudit(env.LADDER_KV, {
      actorUid: user!.uid,
      actorName: user!.username,
      action: 'tournament.batchUpdate',
      target: ids.join(','),
      detail: message,
      ip: request.headers.get('CF-Connecting-IP') ?? undefined,
    })

    return jsonResponse({ success: true, count: ids.length, commit: newCommitJson.sha })
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500)
  }
}
