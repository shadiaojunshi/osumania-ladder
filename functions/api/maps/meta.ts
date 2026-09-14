import { extractOsuFromOsz, parseOsuMetadata } from '../_lib/osuArchive.ts'
import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { isValidTournamentId } from '../_lib/tournamentId'
import { mapObjectKey, mapObjectPrefix, validateRoundId, validateSlot } from '../_lib/mapKeys'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 读取谱面 .osz 内 .osu 的 [Metadata]，用于回填 tournament JSON 的 name/beatmapId。
// 只读 zip 的中央目录 + 目标 .osu 的压缩数据（R2 range 读），不拉整个 .osz。
// 返回 per-slot 结果；R2 无文件 / 无 .osu / BeatmapID<=0 的 slot 标记 status，由前端决定怎么处理。

export const onRequestGet: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const url = new URL(request.url)
  const tournamentId = url.searchParams.get('tournamentId') || ''
  const roundsParam = url.searchParams.get('rounds') || ''
  if (!isValidTournamentId(tournamentId)) {
    return jsonResponse({ error: 'invalid tournamentId' }, 400)
  }

  // rounds=rid1:slot1&rid2:slot2 —— 前端从 JSON 里挑出缺 name/BID 的才发过来。
  // slot 里假定不含冒号(现有 slot 命名 RC1/LN2/TB 等);roundId 先取到第一个冒号。
  const wanted: { roundId: string; slot: string }[] = []
  const seen = new Set<string>()
  for (const group of roundsParam.split('&')) {
    const ci = group.indexOf(':')
    if (ci <= 0 || ci === group.length - 1) continue
    const roundId = group.slice(0, ci)
    const slot = group.slice(ci + 1)
    // R04:分隔出来的两段也走共享键段校验 —— 坏段直接 400,不静默跳过。
    const roundCheck = validateRoundId(roundId)
    if (!roundCheck.ok) return jsonResponse({ error: roundCheck.error, code: 'INVALID_ROUND_ID' }, 400)
    const slotCheck = validateSlot(slot)
    if (!slotCheck.ok) return jsonResponse({ error: slotCheck.error, code: 'INVALID_SLOT' }, 400)
    const ck = `${roundId}:${slot}`
    if (seen.has(ck)) continue
    seen.add(ck)
    wanted.push({ roundId, slot })
  }
  if (wanted.length === 0) return jsonResponse({ error: 'no rounds specified' }, 400)
  if (wanted.length > 500) return jsonResponse({ error: 'too many slots (max 500)' }, 400)

  // R04:键统一由 _lib/mapKeys 构造,和上传/删除/状态端同一套规则。
  const listPrefix = mapObjectPrefix(tournamentId)
  // 第一轮分页 list 拿到已有 key 集合，避免为每个 slot 打一次 R2。
  const existing = new Map<string, number>() // key -> size
  let cursor: string | undefined
  do {
    const page = await env.R2_BUCKET.list({ prefix: listPrefix, cursor, limit: 1000 })
    for (const o of page.objects) existing.set(o.key, o.size)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  const results: Record<string, unknown> = {}
  const CONCURRENCY = 4
  let idx = 0
  async function worker() {
    while (idx < wanted.length) {
      const i = idx++
      const { roundId, slot } = wanted[i]
      const ck = `${roundId}:${slot}`
      const key = mapObjectKey(tournamentId, roundId, slot, false)
      if (!existing.has(key)) {
        results[ck] = { status: 'no-file' }
        continue
      }
      try {
        const fileSize = existing.get(key)!
        const getRange = async (start: number, end: number): Promise<Uint8Array> => {
          const res = await env.R2_BUCKET.get(key, { range: { offset: start, length: end - start } })
          if (!res) throw new Error('R2 object vanished')
          const ab = await res.arrayBuffer()
          return new Uint8Array(ab)
        }
        const { content, osuName } = await extractOsuFromOsz(fileSize, getRange)
        const meta = { ...parseOsuMetadata(content), osuName }
        results[ck] = {
          status: 'ok',
          ...meta,
          beatmapId: meta.beatmapId && meta.beatmapId > 0 ? meta.beatmapId : undefined,
          beatmapsetId: meta.beatmapsetId && meta.beatmapsetId > 0 ? meta.beatmapsetId : undefined,
          unsubmitted: !meta.beatmapId || meta.beatmapId <= 0,
        }
      } catch (err) {
        results[ck] = { status: 'error', error: err instanceof Error ? err.message : String(err) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, worker))

  return jsonResponse({ results })
}
