import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { addTrash } from '../_lib/trash'
import { findDuplicateRoundIds } from '../_lib/roundIds'
import {
  githubFetch,
  classifyGithubFailure,
  isGenericUpstreamFailure,
  upstreamFailureResponse,
} from '../_lib/github'
import { readJsonBody, validatePathId, validateTournament } from '../_lib/validation'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 读取单个比赛：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const idCheck = validatePathId(params.id)
  if (!idCheck.ok) {
    return jsonResponse({ error: idCheck.error, code: 'INVALID_ID' }, 400)
  }
  const id = idCheck.value
  const path = `/contents/data/tournaments/${id}.json`
  const res = await githubFetch(path, env)

  if (!res.ok) {
    // 过去所有失败都回 404「Tournament not found」：token 失效时站长会以为
    // 是那场比赛被删了，然后去回收站找。只有真 404 才是「不存在」。
    const failure = await classifyGithubFailure(res, env)
    if (failure.code === 'NOT_FOUND') {
      return jsonResponse({ error: 'Tournament not found', code: 'NOT_FOUND' }, 404)
    }
    return upstreamFailureResponse(failure)
  }

  const file = (await res.json()) as { content: string; sha: string }
  const content = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))))
  return jsonResponse({ tournament: content, sha: file.sha })
}

// 读一个文件当前「数据里写的 id」。只用于文件名与内部 id 不一致时做判定,
// 正常情况下不会发这个请求。
async function readStoredTournamentId(env: Env, id: string): Promise<string | null> {
  const res = await githubFetch(`/contents/data/tournaments/${id}.json`, env)
  if (!res.ok) return null
  try {
    const file = (await res.json()) as { content?: unknown }
    if (typeof file.content !== 'string') return null
    const decoded = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))))
    return typeof (decoded as { id?: unknown })?.id === 'string' ? (decoded as { id: string }).id : null
  } catch {
    return null
  }
}

// 编辑：contributor 及以上。
export const onRequestPut: PagesFunction<Env> = async ({ params, request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const idCheck = validatePathId(params.id)
  if (!idCheck.ok) {
    return jsonResponse({ error: idCheck.error, code: 'INVALID_ID' }, 400)
  }
  const id = idCheck.value

  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error, code: 'INVALID_TOURNAMENT' }, 400)
  }
  const parsed = body.value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse({ error: '请求体必须是 JSON 对象', code: 'INVALID_TOURNAMENT' }, 400)
  }
  const { tournament, sha } = parsed as { tournament?: unknown; sha?: unknown }

  if (!tournament || typeof tournament !== 'object' || Array.isArray(tournament)) {
    return jsonResponse({ error: '缺少 tournament 对象', code: 'INVALID_TOURNAMENT' }, 400)
  }
  // 没有编辑基准就不该写:GitHub 会把不带 sha 的 PUT 当「新建或强制覆盖」。
  if (typeof sha !== 'string' || sha.trim() === '') {
    return jsonResponse({ error: '缺少编辑基准 sha,无法安全覆盖', code: 'INVALID_TOURNAMENT' }, 400)
  }

  // round id 必须唯一(R2 key 冲突,见 _lib/roundIds.ts)。
  // 这个检查放在 schema 校验之前:它给出更具体的中文提示,既有调用方依赖这条文案。
  const dupRounds = findDuplicateRoundIds(tournament as { rounds?: unknown })
  if (dupRounds.length > 0) {
    return jsonResponse({ error: `存在重复的 round id: ${dupRounds.map((d) => d.roundId).join(', ')}。请把每轮改成唯一 id 后再保存。` }, 400)
  }

  // 运行时结构校验:rounds 是字符串、slot 重复、难度是 NaN 之类的形状错误
  // 过去会被直接写进仓库,然后在下次静态构建里暴露。
  const validated = validateTournament(tournament)
  if (!validated.ok) {
    return jsonResponse({ error: validated.error, code: 'INVALID_TOURNAMENT' }, 400)
  }
  const payloadTournament = validated.value

  // 文件名必须与 body.id 一致,否则会出现「A 比赛的数据写进 B 比赛的文件」。
  // 判定方式是「body.id 与该文件当前数据里的 id 相同」:不允许制造新的不一致,
  // 但允许继续保存已经是这种状态的文件(否则一旦出现不一致,那场比赛就再也存不了了)。
  // 注意这个兜底只能「保持」不能「制造」不一致 —— 对不存在的文件 storedId 为 null,
  // 必然判冲突。历史数据里唯一的实例(osu-mania-chinese-natrion-… 文件名笔误)
  // 已于 2026-09-13 改名修正,这里留作防护网。
  const payloadId = payloadTournament.id
  if (payloadId !== id) {
    const storedId = await readStoredTournamentId(env, id)
    if (storedId !== payloadId) {
      return jsonResponse({
        error: `文件名与数据里的 id 不一致：路径是 ${id}，数据里是 ${payloadId}。请把数据里的 id 改成 ${id}，或保存到 ${payloadId} 对应的文件。`,
        code: 'ID_MISMATCH',
      }, 400)
    }
  }

  const path = `/contents/data/tournaments/${id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payloadTournament, null, 2))))

  const res = await githubFetch(path, env, {
    method: 'PUT',
    body: JSON.stringify({ message: `Update tournament: ${id}`, content, sha }),
  })

  if (!res.ok) {
    // 409 = 编辑基准过期:文件在编辑期间被别处(上传器回填、另一个标签页)更新过。
    // GitHub 只回一句 "sha does not match",照抄给前端等于没说,这里翻译成人话。
    // 前端据此给出「以最新版本为基准继续」的按钮(见 admin/page.tsx 的 handleRefreshBase)。
    // 注意:**body 只能在这里读一次** —— 下面的 classifyGithubFailure 会 clone 响应去
    // 看是不是我们自己合成的故障,先读过就会抛 "Body has already been consumed"(实测过)。
    if (res.status === 409) {
      const err = (await res.json().catch(() => ({}))) as { message?: string }
      return jsonResponse(
        {
          error: '这个文件在你编辑期间被更新过（编辑基准已过期），本次保存没有写入。',
          code: 'EDIT_CONFLICT',
          details: err,
        },
        409,
      )
    }
    // 其余失败交给共享分类(R14):上游凭据/限流/网络一类一律 **502 + code**。
    // 以前是 `res.status` 原样透传 —— token 失效时这里回的是 **401**,
    // 而 401 在本站的语义是「你没登录」,站长会去重新登录而不是换 token,
    // 真实原因反而查不到。
    const failure = await classifyGithubFailure(res, env)
    if (!isGenericUpstreamFailure(failure)) return upstreamFailureResponse(failure)
    // 分不出类别(5xx / 没见过的状态码):保留 GitHub 原文,别让前端只看到一句泛泛的
    // 「上游故障」(R02 复审的要求),但状态码仍统一成 502。
    const err = (await res.json().catch(() => ({}))) as { message?: string }
    return jsonResponse(
      {
        error: `保存失败：${err.message || failure.error}`,
        code: 'UPDATE_FAILED',
        details: err,
      },
      failure.status,
    )
  }

  // 把 GitHub 返回的新 blob sha 交给前端(R02):下一次保存必须用它,
  // 否则连续两次保存会一直拿第一次的 sha 去写,被服务端判成冲突。
  const updated = (await res.json().catch(() => ({}))) as { content?: { sha?: string } }
  const newSha = typeof updated.content?.sha === 'string' ? updated.content.sha : null

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'tournament.update',
    target: id,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, id, sha: newSha })
}

// 删除：admin 及以上。软删除——先把 JSON 副本存进回收站，再从 GitHub 移除。
export const onRequestDelete: PagesFunction<Env> = async ({ params, request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const idCheck = validatePathId(params.id)
  if (!idCheck.ok) {
    return jsonResponse({ error: idCheck.error, code: 'INVALID_ID' }, 400)
  }
  const id = idCheck.value

  // 删除只需要 path id + sha:不要求 body.id,也不因为文件里的 round 数据有问题
  // 就阻止删除(坏数据恰恰是最需要能删掉的)。
  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400)
  }
  const { sha } = (body.value ?? {}) as { sha?: unknown }
  if (typeof sha !== 'string' || sha.trim() === '') {
    return jsonResponse({ error: '缺少 sha,无法安全删除' }, 400)
  }
  const path = `/contents/data/tournaments/${id}.json`

  // 读取和备份必须成功，且副本必须对应请求删除的那个 blob。
  const getRes = await githubFetch(path, env)
  if (!getRes.ok) return upstreamFailureResponse(await classifyGithubFailure(getRes, env))
  let payload: string
  try {
    const file = (await getRes.json()) as { content?: string; sha?: string; encoding?: string }
    if (typeof file.sha !== 'string' || typeof file.content !== 'string' || !file.content || (file.encoding && file.encoding !== 'base64')) {
      throw new Error('Incomplete GitHub response')
    }
    if (file.sha !== sha) {
      return jsonResponse({ error: '比赛已被更新，请刷新后重新确认删除。', code: 'EDIT_CONFLICT' }, 409)
    }
    payload = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  } catch {
    return jsonResponse({ error: '无法读取完整比赛副本，本次未删除。', code: 'BACKUP_FAILED' }, 503)
  }

  let trashId: string
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
    return jsonResponse({ error: '回收站备份失败，本次未删除，请稍后重试。', code: 'BACKUP_FAILED' }, 503)
  }

  const res = await githubFetch(path, env, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Delete tournament: ${id}`, sha }),
  })

  if (!res.ok) {
    // 失败或超时也保留副本：不能确定上游是否已执行删除。
    if (res.status === 409) {
      return jsonResponse({ error: '比赛已被更新，本次未删除，请刷新后重新确认。', code: 'EDIT_CONFLICT', trashId }, 409)
    }
    // 同上:DELETE 也不再把 GitHub 的 401/403 透传给前端(R14)。
    const failure = await classifyGithubFailure(res, env)
    if (!isGenericUpstreamFailure(failure)) return upstreamFailureResponse(failure)
    const err = await res.json().catch(() => ({}))
    return jsonResponse({ error: 'Failed to delete', details: err }, failure.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'tournament.delete',
    target: id,
    detail: `trashId=${trashId}; blobSha=${sha}`,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, id, trashId })
}
