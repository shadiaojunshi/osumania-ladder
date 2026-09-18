import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { writeAudit } from '../_lib/audit'
import { listTrash, getTrash, removeTrash } from '../_lib/trash'
import { onlyIfAbsent } from '../_lib/mapKeys'
import { githubFetch } from '../_lib/github'
import { validatePathId, validateTournament, readJsonBody } from '../_lib/validation'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 列出回收站：admin 及以上可查看。
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  try {
    // listTrash 已只返回展示用 slim（id/kind/label/deletedAt/deletedByName），
    // tournament 的 payload 不会回传，恢复路径再按 id 取。
    const items = await listTrash(env.LADDER_KV)
    return jsonResponse({ items })
  } catch (e) {
    return jsonResponse({
      error: '读取回收站失败',
      detail: (e as Error).message ?? String(e),
      kvBound: typeof env.LADDER_KV !== 'undefined',
    }, 500)
  }
}

// 恢复：admin 及以上。body = { id }
// tournament -> 把 payload 写回 GitHub；map -> R2 内从 restoreKey 复制回 originalKey。
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'admin')) {
    return jsonResponse({ error: '需要 admin 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400)
  }
  const { id } = (body.value ?? {}) as { id?: unknown }
  if (typeof id !== 'string' || id.trim() === '') return jsonResponse({ error: '缺少 id' }, 400)

  const entry = await getTrash(env.LADDER_KV, id)
  if (!entry) {
    return jsonResponse({ error: '回收站条目不存在或已过期' }, 404)
  }

  if (entry.kind === 'tournament') {
    if (!entry.payload) {
      return jsonResponse({ error: '回收站条目缺少数据，无法恢复' }, 500)
    }
    // 旧档案恢复同样要过 validator:回收站里的 payload 可能是很早以前存的,
    // 直接写回仓库等于让任意对象进入下次静态构建。
    const tidCheck = validatePathId(entry.label)
    if (!tidCheck.ok) {
      return jsonResponse({ error: `回收站条目的比赛 ID 非法：${entry.label}`, code: 'INVALID_ID' }, 400)
    }
    const tid = tidCheck.value
    let parsedPayload: unknown
    try {
      parsedPayload = JSON.parse(entry.payload)
    } catch {
      return jsonResponse({ error: '回收站条目里的数据不是合法 JSON，无法恢复' }, 400)
    }
    const validated = validateTournament(parsedPayload)
    if (!validated.ok) {
      return jsonResponse({ error: `回收站条目数据未通过校验，未恢复：${validated.error}`, code: 'INVALID_TOURNAMENT' }, 400)
    }

    const path = `/contents/data/tournaments/${tid}.json`

    // R06:恢复默认只允许"目标不存在"。以前是自动取当前 sha 覆盖同名 JSON ——
    // 等于把别人在这期间新写的版本直接盖掉。现在不带 sha 创建,GitHub 对已存在的
    // 文件返回 422,我们把它翻成 409 RESTORE_CONFLICT 并保留回收站条目。
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(validated.value, null, 2) + '\n')))
    const res = await githubFetch(path, env, {
      method: 'PUT',
      body: JSON.stringify({ message: `Restore tournament: ${tid}`, content }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const alreadyExists = res.status === 422 || res.status === 409
      return jsonResponse({
        error: alreadyExists
          ? `比赛 ${tid} 已经存在（可能已被重建或已经恢复过），本次没有覆盖。确认现有版本后再决定怎么处理。`
          : '恢复失败',
        code: alreadyExists ? 'RESTORE_CONFLICT' : 'RESTORE_FAILED',
        details: err,
      }, alreadyExists ? 409 : res.status)
    }
  } else {
    // map：从 restoreKey 复制回 originalKey
    if (!entry.restoreKey || !entry.originalKey) {
      return jsonResponse({ error: '回收站条目缺少 R2 key，无法恢复' }, 500)
    }

    // R06:目标已存在就冲突,默认不覆盖。
    const occupant = await env.R2_BUCKET.head(entry.originalKey)
    if (occupant) {
      // 副本已经不在 → 上一次恢复很可能其实成功了(只是记录没清干净)。
      // 再用 etag 确认"现在占着这个位置的确实是原来那份",避免把别人的重传误判成已恢复。
      // 老记录没有 originalEtag,只能保守地按"已恢复"处理 —— 否则用户会卡在一个
      // UI 上无法解决的 409(回收站没有单条删除入口)。
      const backup = await env.R2_BUCKET.head(entry.restoreKey)
      const sameContent = !entry.originalEtag || entry.originalEtag === occupant.etag
      if (!backup && sameContent) {
        await removeTrash(env.LADDER_KV, id)
        await writeAudit(env.LADDER_KV, {
          actorUid: user!.uid,
          actorName: user!.username,
          action: 'map.restore',
          target: entry.label,
          detail: '目标已存在且内容一致、回收站副本已清理，视为已恢复',
          ip: request.headers.get('CF-Connecting-IP') ?? undefined,
        })
        return jsonResponse({ success: true, kind: entry.kind, label: entry.label, alreadyRestored: true })
      }
      return jsonResponse({
        error: `${entry.label} 已经存在${sameContent ? '' : '（这个位置上的内容与回收站副本不同）'}，本次没有覆盖。回收站条目保留，可先确认现有版本再处理。`,
        code: 'RESTORE_CONFLICT',
      }, 409)
    }

    const obj = await env.R2_BUCKET.get(entry.restoreKey)
    if (!obj) {
      return jsonResponse({
        error: 'R2 中的备份文件已不存在（可能已过期清理），无法恢复',
        code: 'RESTORE_SOURCE_MISSING',
      }, 404)
    }

    // 条件写:只在目标仍然不存在时才写入 —— 与上面的 head 之间有人抢先创建也不会被覆盖。
    const written = await env.R2_BUCKET.put(entry.originalKey, obj.body, {
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
      onlyIf: onlyIfAbsent(),
    })
    if (!written) {
      return jsonResponse({
        error: `${entry.label} 在恢复过程中被创建了，本次没有覆盖。回收站条目保留。`,
        code: 'RESTORE_CONFLICT',
      }, 409)
    }

    // 先清 KV 记录、再删 trash 副本:反过来的话,删掉副本后 KV 写失败,就会留下
    // 一条指向已删除 restoreKey 的唯一恢复记录(UI 上看着能恢复,点下去必然失败)。
    await removeTrash(env.LADDER_KV, id)
    try {
      await env.R2_BUCKET.delete(entry.restoreKey)
    } catch {
      // 副本删不掉无关紧要:文件已经恢复,残留的 trash/ 副本由保留期清理兜底。
    }
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
