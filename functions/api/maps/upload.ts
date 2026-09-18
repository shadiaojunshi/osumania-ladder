// 上传谱面:contributor 及以上。
//
// R04:表单字段、键段、nsv 标志、.osz 有效性、以及"轮次/槽位在权威比赛数据里存在且唯一"
// 全部先校验,任一项不过就直接 400 且**不写任何对象**。
// 键的构造统一走 _lib/mapKeys.ts,和删除/状态/元数据端点共用同一套规则。

import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { classifyGithubFailure, githubFetch } from '../_lib/github'
import { isValidTournamentId } from '../_lib/tournamentId'
import {
  ARCHIVE_LIMITS,
  MAX_UPLOAD_BYTES,
  hasNsvSuffixAmbiguity,
  inspectOszTail,
  locateMapSlot,
  mapObjectKey,
  onlyIfAbsent,
  onlyIfEtagMatches,
  validateNsvFlag,
  validateRoundId,
  validateSlot,
  versionObjectKey,
} from '../_lib/mapKeys'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

function bad(error: string, code: string, status = 400) {
  return jsonResponse({ error, code }, status)
}

// 鸭子类型判断而不是 `instanceof File`:旧 compat date 的运行时不暴露 File 全局,
// 那时 instanceof 会直接抛 ReferenceError → 500。这里只要求"有 size/name/stream"。
function isUploadFile(value: unknown): value is File {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<File>
  return typeof candidate.size === 'number'
    && typeof candidate.name === 'string'
    && typeof candidate.stream === 'function'
}

type TournamentFetch =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code: string; status: number }

// 读权威比赛 JSON(仓库里已提交的那份),用于确认 round/slot 真的存在。
async function fetchTournamentJson(env: Env, id: string): Promise<TournamentFetch> {
  // 走共享入口:_lib/github.ts 会把上游故障分类(401/限流/5xx/网络)。
  const res = await githubFetch(`/contents/data/tournaments/${id}.json`, env)

  if (!res.ok) {
    const failure = await classifyGithubFailure(res, env)
    // 只有「仓库可见、但没这个文件」才是「比赛不存在」。
    // GitHub 对**无权访问的私有仓库**回 404 而不是 403 —— 也就是说 token 失效
    // 与文件真的不存在状态码一样。过去这里直接按 404 报「比赛 X 不存在」,
    // 站长会以为数据被删了去重传,而真正的原因（凭据/权限）完全看不到。
    if (failure.code === 'NOT_FOUND') {
      return { ok: false, error: `比赛 ${id} 不存在`, code: 'TOURNAMENT_NOT_FOUND', status: 404 }
    }
    return { ok: false, error: failure.error, code: failure.code, status: failure.status }
  }

  try {
    const file = (await res.json()) as { content?: string }
    if (typeof file.content !== 'string') {
      return { ok: false, error: '比赛数据响应缺少 content', code: 'UPSTREAM_ERROR', status: 502 }
    }
    const text = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: '比赛数据不是合法 JSON', code: 'UPSTREAM_ERROR', status: 502 }
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return bad('Expected multipart/form-data', 'INVALID_CONTENT_TYPE')
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return bad('表单解析失败', 'INVALID_FORM')
  }

  // 不用 as 断言:formData.get() 可能返回 File,断言后拼进键会变成 "[object File]"。
  const tournamentIdRaw = formData.get('tournamentId')
  const tournamentId = typeof tournamentIdRaw === 'string' ? tournamentIdRaw : ''
  if (!isValidTournamentId(tournamentId)) {
    return bad('非法比赛 ID（只允许字母、数字、连字符）', 'INVALID_TOURNAMENT')
  }

  const roundId = validateRoundId(formData.get('roundId'))
  if (!roundId.ok) return bad(roundId.error, 'INVALID_ROUND_ID')

  const slot = validateSlot(formData.get('slot'))
  if (!slot.ok) return bad(slot.error, 'INVALID_SLOT')

  const nsv = validateNsvFlag(formData.get('nsv'))
  if (!nsv.ok) return bad(nsv.error, 'INVALID_NSV')

  const fileRaw = formData.get('file')
  if (!isUploadFile(fileRaw)) {
    return bad('file 字段必须是真的文件（当前不是 File）', 'INVALID_FILE')
  }
  if (fileRaw.size === 0) return bad('上传的文件是空的', 'EMPTY_FILE')
  if (fileRaw.size > MAX_UPLOAD_BYTES) {
    return bad(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`, 'FILE_TOO_LARGE', 413)
  }

  // 主图 slot 以 .nsv 结尾时,它的键会和「基础 slot 的 NSV」完全相同。
  if (hasNsvSuffixAmbiguity(slot.value, nsv.value)) {
    return bad(
      `槽位「${slot.value}」以 .nsv 结尾:普通谱面的键会和「${slot.value.slice(0, -'.nsv'.length)}」的 NSV 谱面撞成同一个键，请改用别的槽位名`,
      'SLOT_SUFFIX_CONFLICT',
    )
  }

  // .osz 有限成本检查:只读尾部窗口(默认 66KB),不解压任何内容。
  const tailStart = Math.max(0, fileRaw.size - ARCHIVE_LIMITS.tailBytes)
  const tail = new Uint8Array(await fileRaw.slice(tailStart).arrayBuffer())
  const archive = inspectOszTail(tail, fileRaw.size)
  if (!archive.ok) return bad(archive.error, 'INVALID_ARCHIVE')

  // 与权威比赛数据对齐:轮次/槽位必须存在且唯一(重复时要求先修数据,不靠数组下标糊过去)。
  const tournament = await fetchTournamentJson(env, tournamentId)
  if (!tournament.ok) return bad(tournament.error, tournament.code, tournament.status)
  const located = locateMapSlot(tournament.value, roundId.value, slot.value)
  if (!located.ok) return bad(located.error, 'UNKNOWN_SLOT')

  const key = mapObjectKey(tournamentId, roundId.value, slot.value, nsv.value)

  // R06:覆盖旧对象之前先把它(连同 metadata)归档到 versions/。
  // 归档失败就**不覆盖** —— 宁可这次上传失败,也不能把旧版本弄丢。
  // 每个槽位只留最近一版(归档键固定),所以重传是覆盖同一份,versions/ 不会越堆越多。
  const existing = await env.R2_BUCKET.head(key)
  let archivedKey: string | null = null
  if (existing) {
    archivedKey = versionObjectKey(key)
    try {
      const previous = await env.R2_BUCKET.get(key)
      if (!previous) throw new Error('旧对象读取失败')
      const archived = await env.R2_BUCKET.put(archivedKey, previous.body, {
        httpMetadata: previous.httpMetadata,
        customMetadata: { ...previous.customMetadata, archivedFrom: key, archivedBy: user!.username },
      })
      if (!archived) throw new Error('归档写入被条件拒绝')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await writeAudit(env.LADDER_KV, {
        actorUid: user!.uid,
        actorName: user!.username,
        action: 'map.upload',
        target: key,
        detail: `归档旧版本失败，本次未覆盖: ${message}`,
        ip: request.headers.get('CF-Connecting-IP') ?? undefined,
      })
      return bad(`归档旧版本失败，本次没有覆盖任何内容：${message}`, 'ARCHIVE_FAILED', 502)
    }
  }

  // 条件写:有旧对象就 CAS 到它读到的那个 etag,没有就要求"目标不存在"。
  // 条件不满足时 R2 返回 null 且不存对象 —— 并发重传只有一个能成功。
  const onlyIf: R2Conditional | Headers = existing
    ? onlyIfEtagMatches(existing.etag)
    : onlyIfAbsent()
  const written = await env.R2_BUCKET.put(key, fileRaw.stream(), {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { originalName: fileRaw.name },
    onlyIf,
  })
  if (!written) {
    return bad(
      existing
        ? '这个槽位在你上传期间被别人重传了，本次未写入（旧版本已归档到 versions/，刷新后可重试）'
        : '这个槽位在你上传期间被创建了，本次未写入（请刷新后重试）',
      'UPLOAD_CONFLICT',
      409,
    )
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'map.upload',
    target: key,
    detail: `${(fileRaw.size / 1024 / 1024).toFixed(1)}MB · ${archive.value.entries} entries${archivedKey ? ' · 已归档旧版本' : ''}`,
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true, key, archivedKey })
}
