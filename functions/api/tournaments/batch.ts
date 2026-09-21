// 批量写回多个 tournament JSON —— 打进「一次 commit」。
//
// 为什么单独一个端点而不是循环调 PUT /api/tournaments/{id}:
//   逐个 PUT 每个文件产生一次 GitHub commit，Cloudflare Pages 每次 commit 触发
//   一次构建。修一批键型冲突常涉及十几个文件 → 十几次构建，直接啃掉 500/月 额度。
//   这里用 GitHub Git Data API（blobs → tree → commit → 更新 ref）把所有改动合成
//   一个 commit = 只触发 1 次构建。
//
// 权限: contributor 及以上。该角色本来就能逐场增改；批量接口只把多次
// commit 合成一次，减少 Pages 构建次数，不扩大可修改的数据范围。
//
// 编辑基准(R01):每项必须带 baseSha —— 读取该文件时的 blob sha;新建显式传 null。
// 服务器读取**固定 HEAD** 的树,逐文件比对 blob sha,全部通过才建 commit;
// 任一冲突返回 409 EDIT_CONFLICT + conflicts 列表,整批一个文件都不写。
// 这样"A 从旧草稿提交、覆盖 B 已保存的改动"就不再可能。

import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { beginSuggestionBatch, cancelSuggestionBatch, recordCandidate, recoverCandidate, finishSuggestionBatch, type BatchLease } from '../_lib/suggestionBatch'
import { ReviewError, reviewFailure, type SuggestionsEnv } from '../_lib/suggestions'
import {
  classifyGithubFailure,
  githubFetch,
  upstreamFailureResponse,
  type UpstreamFailure,
} from '../_lib/github'
import { isMatchingTournamentId } from '../_lib/tournamentId'
import { findDuplicateRoundIds } from '../_lib/roundIds'
import { LIMITS, readJsonBody, validateTournament } from '../_lib/validation'
import {
  evaluateBatchConflicts,
  headMovedConflicts,
  parseBatchItems,
  tournamentPath,
  treeToShaMap,
  type TreeEntry,
} from '../_lib/batchConflicts'

interface Env extends AuthEnv, SuggestionsEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

const BRANCH = 'main'

// R14:上游分类错误。批处理链条很长(读 ref → 读 commit → 读树 → 建 blob/tree/commit →
// 推 ref),任何一步的上游故障过去都只有一个「HTTP xxx」的 500 —— 站长看不出
// 到底是凭据失效还是限流。现在带上分类结果,由外层 catch 翻成 502 + code。
interface UpstreamError extends Error {
  upstream: UpstreamFailure
}

function upstreamError(failure: UpstreamFailure): Error {
  const err = new Error(failure.error) as UpstreamError
  err.upstream = failure
  return err
}

function isUpstreamError(e: unknown): e is UpstreamError {
  return typeof e === 'object' && e !== null && 'upstream' in e
}

/** 分类并把上游故障抛出去(调用点不用自己拆状态码)。 */
async function failUpstream(res: Response, env: Env): Promise<never> {
  throw upstreamError(await classifyGithubFailure(res, env))
}

// R14:统一走 _lib/github.ts —— 不再自己拼 URL/头,网络中断也不抛异常
// (归到 UPSTREAM_UNREACHABLE),调用点只判 `!res.ok` 就够。
async function gh(path: string, env: Env, options: RequestInit = {}) {
  return githubFetch(path, env, options)
}

// 取「固定 commit 的树」里的 path -> blob sha。
// 递归树被 GitHub 截断(仓库变大时)或读取失败时,退回逐文件查 contents API:
// 保证「查不到」只代表确实不存在,绝不把读取失败当成"文件不存在"
// (否则新建会覆盖已有文件)。
async function resolveTreeShas(
  env: Env,
  baseCommitSha: string,
  baseTreeSha: string,
  ids: string[],
): Promise<Map<string, string>> {
  const treeRes = await gh(`/git/trees/${baseTreeSha}?recursive=1`, env)
  if (treeRes.ok) {
    const treeJson = (await treeRes.json()) as { tree?: TreeEntry[]; truncated?: boolean }
    if (!treeJson.truncated) return treeToShaMap(treeJson.tree)
  }

  const map = new Map<string, string>()
  for (const id of ids) {
    const res = await gh(`/contents/${tournamentPath(id)}?ref=${baseCommitSha}`, env)
    if (!res.ok) {
      // 非 404 = 上游故障(限流/5xx/网络),必须报错,不能当成"文件不存在"。
      // 404 这里**不做仓库探测**:能走到这一步说明前面的 `/git/ref/heads/main`
      // 读成功了 —— token 对仓库是有权限的,所以这个 404 确实就是"这个 commit 里没有该文件"。
      // （若凭据失效,第一步的 ref 读取就会 404 并被分类成 UPSTREAM_AUTH 拦下。）
      if (res.status !== 404) await failUpstream(res, env)
      continue
    }
    const file = (await res.json()) as { sha?: unknown }
    if (typeof file.sha === 'string') map.set(tournamentPath(id), file.sha)
  }
  return map
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) return jsonResponse({ error: body.error, code: 'INVALID_BATCH' }, 400)
  const payload = body.value

  const parsed = parseBatchItems(payload)
  if (!parsed.items) {
    return jsonResponse({ error: parsed.error, code: 'INVALID_BATCH' }, 400)
  }
  const items = parsed.items
  const ids = items.map((item) => item.id)
  const summary = typeof (payload as { summary?: unknown }).summary === 'string'
    ? (payload as { summary: string }).summary
    : undefined

  if (items.length > LIMITS.maxBatchItems) {
    return jsonResponse({ error: `一次最多提交 ${LIMITS.maxBatchItems} 个文件（当前 ${items.length}）`, code: 'INVALID_BATCH' }, 400)
  }
  if (summary !== undefined && summary.length > LIMITS.maxSummaryLength) {
    return jsonResponse({ error: `summary 最多 ${LIMITS.maxSummaryLength} 字符（当前 ${summary.length}）`, code: 'INVALID_BATCH' }, 400)
  }

  const invalidId = items.find((item) => !isMatchingTournamentId(item.id, item.tournament))
  if (invalidId) {
    return jsonResponse({ error: `无效的比赛 ID 或数据不匹配: ${invalidId.id}`, code: 'INVALID_BATCH' }, 400)
  }

  // round id 必须在比赛内唯一:R2 key 是 maps/{tid}/{rid}/{slot}.osz,重复 id
  // 会让上传互相覆盖、补丁定位写串(SSR SF/F 事故)。
  // 先跑这个检查是为了保留更具体的中文文案(既有调用方依赖它)。
  const dup = items.find((item) => findDuplicateRoundIds(item.tournament as { rounds?: unknown[] }).length > 0)
  if (dup) {
    const dups = findDuplicateRoundIds(dup.tournament as { rounds?: unknown[] })
    return jsonResponse({ error: `${dup.id} 存在重复的 round id: ${dups.map((d) => d.roundId).join(', ')}。请把每轮改成唯一 id 后再保存。`, code: 'INVALID_BATCH' }, 400)
  }

  // 运行时结构校验:batch 过去不是完整的 schema 校验(rounds 传字符串也能过),
  // 于是坏形状会被一次性写进多个文件。
  for (const item of items) {
    const validated = validateTournament(item.tournament)
    if (!validated.ok) {
      return jsonResponse({ error: `${item.id}: ${validated.error}`, code: 'INVALID_BATCH' }, 400)
    }
    item.tournament = validated.value
  }

  let suggestionLease: BatchLease | undefined
  try {
    const suggestionBatch = (payload as { suggestionBatch?: unknown }).suggestionBatch
    if (suggestionBatch !== undefined) {
      suggestionLease = await beginSuggestionBatch(env, user!, suggestionBatch, items)
      if (suggestionLease.journal.commit) return jsonResponse(await recoverCandidate(env, user!, suggestionLease))
    }
    // 1. 取分支当前 HEAD commit sha（整批共用同一个基准）
    const refRes = await gh(`/git/ref/heads/${BRANCH}`, env)
    // 这是整条链的"门":凭据失效/失去仓库权限时 GitHub 对所有端点都回 404,
    // 在这里就分类成 UPSTREAM_AUTH,不会让后面的读文件把 404 当成"文件不存在"。
    if (!refRes.ok) await failUpstream(refRes, env)
    const refJson = (await refRes.json()) as { object: { sha: string } }
    const baseCommitSha = refJson.object.sha

    // 2. 取 base commit 指向的 tree sha
    const commitRes = await gh(`/git/commits/${baseCommitSha}`, env)
    if (!commitRes.ok) await failUpstream(commitRes, env)
    const commitJson = (await commitRes.json()) as { tree: { sha: string } }
    const baseTreeSha = commitJson.tree.sha

    // 3. 对照这棵固定树校验编辑基准。任一冲突 → 整批不写。
    const currentTree = await resolveTreeShas(env, baseCommitSha, baseTreeSha, ids)
    const conflicts = evaluateBatchConflicts(items, currentTree)
    if (conflicts.length > 0) {
      if (suggestionLease) await cancelSuggestionBatch(env, suggestionLease)
      return jsonResponse({
        error: '有文件在你编辑期间被他人改动，本次未保存任何文件。请载入最新版本后重新应用你的改动。',
        code: 'EDIT_CONFLICT',
        conflicts,
      }, 409)
    }

    // 4. 每个文件创建一个 blob,并记录新 blob sha 返回给前端
    const files: { id: string; sha: string }[] = []
    const treeItems: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = []
    for (const item of items) {
      const content = JSON.stringify(item.tournament, null, 2) + '\n'
      const blobRes = await gh('/git/blobs', env, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      })
      if (!blobRes.ok) await failUpstream(blobRes, env)
      const blobJson = (await blobRes.json()) as { sha: string }
      files.push({ id: item.id, sha: blobJson.sha })
      treeItems.push({
        path: tournamentPath(item.id),
        mode: '100644',
        type: 'blob',
        sha: blobJson.sha,
      })
    }

    // 5. 基于 base tree 创建新 tree
    const treeRes = await gh('/git/trees', env, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    })
    if (!treeRes.ok) await failUpstream(treeRes, env)
    const treeJson = (await treeRes.json()) as { sha: string }

    // 6. 创建 commit
    const message = (summary || `Batch update tournaments (${ids.length} files)`) + (suggestionLease ? `\n\nSuggestion-Batch: ${suggestionLease.journal.id}` : '')
    const newCommitRes = await gh('/git/commits', env, {
      method: 'POST',
      body: JSON.stringify({ message, tree: treeJson.sha, parents: [baseCommitSha] }),
    })
    if (!newCommitRes.ok) await failUpstream(newCommitRes, env)
    const newCommitJson = (await newCommitRes.json()) as { sha: string }
    if (suggestionLease) await recordCandidate(env, suggestionLease, newCommitJson.sha, baseCommitSha, files)

    // 7. 更新分支 ref 指向新 commit（非强制更新）
    const updateRes = await gh(`/git/refs/heads/${BRANCH}`, env, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitJson.sha, force: false }),
    })
    if (!updateRes.ok) {
      // 在比对之后、更新之前有人推进了 HEAD。返回冲突,绝不"拿旧数据换新 SHA 重试"。
      if (updateRes.status === 409 || updateRes.status === 422) {
        if (suggestionLease) return reviewFailure(new ReviewError('发布分支已变化，请使用“恢复上次保存结果”确认并释放原批次。', 409, 'SUGGESTION_PENDING'))
        return jsonResponse({
          error: '分支在你保存期间被更新，本次未保存任何文件。请载入最新版本后重新应用你的改动。',
          code: 'EDIT_CONFLICT',
          conflicts: headMovedConflicts(items),
        }, 409)
      }
      await failUpstream(updateRes, env)
    }

    await writeAudit(env.LADDER_KV, {
      actorUid: user!.uid,
      actorName: user!.username,
      action: 'tournament.batchUpdate',
      target: ids.join(','),
      detail: message,
      ip: request.headers.get('CF-Connecting-IP') ?? undefined,
    })

    let pendingSuggestions: string[] = []
    if (suggestionLease) {
      pendingSuggestions = suggestionLease.journal.refs.map(ref => ref.id)
      try { pendingSuggestions = (await finishSuggestionBatch(env, user!, suggestionLease.journal.id)).pending } catch { /* retry without another data commit */ }
    }
    return jsonResponse({ success: true, count: ids.length, commit: newCommitJson.sha, files, pendingSuggestions })
  } catch (e) {
    if (suggestionLease && !suggestionLease.journal.commit) {
      try { await cancelSuggestionBatch(env, suggestionLease) } catch { /* preserve request for recovery */ }
    }
    if (e instanceof ReviewError) return reviewFailure(e)
    // 上游故障(R14):回 502 + 分类码,不再把 GitHub 的原始状态码裹进 500 文案里。
    if (isUpstreamError(e)) return upstreamFailureResponse(e.upstream)
    return jsonResponse({ error: (e as Error).message }, 500)
  }
}
