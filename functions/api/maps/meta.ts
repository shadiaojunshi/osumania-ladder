import { extractOsuFromOsz, parseOsuMetadata } from '../_lib/osuArchive.ts'
import { isUsableBeatmapId, usableBeatmapId, usableBeatmapsetId } from '../_lib/beatmapIds.ts'
import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { isValidTournamentId } from '../_lib/tournamentId'
import { decodeMetaRoundsParam, mapObjectKey, mapObjectPrefix } from '../_lib/mapKeys'

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
  // 两段都走**百分号编码**再拼(见 _lib/mapKeys 的 encode/decodeMetaRoundsParam):
  // 真实槽位里有含 `&` 的(japanese-mania-championship-2 的 `HB4(Wild&SV)`、
  // po-fang-cup-s4 的 `GM(FL&EZ)`),用字面 `&` 当分隔符会被切开 → 误报"R2 无文件"。
  const decoded = decodeMetaRoundsParam(roundsParam)
  if (!decoded.ok) {
    // R04:分隔出来的两段也走共享键段校验 —— 坏段直接 400,不静默跳过。
    return jsonResponse({ error: decoded.error, code: 'INVALID_ROUNDS_PARAM' }, 400)
  }
  const wanted = decoded.value
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
        // parseOsuMetadata 已按占位判读归一化过（见 _lib/beatmapIds.ts），这里直接判缺。
        // 过去这里自己写了一套 `> 0`，与前端 `src/lib/beatmapIds.ts` 的 `<= 1` 口径不一致 ——
        // 占位 `BeatmapSetID:1` 会被这个接口回给前端，然后「一键补全」把它写回比赛 JSON。
        results[ck] = {
          status: 'ok',
          ...meta,
          beatmapId: usableBeatmapId(meta.beatmapId) ?? undefined,
          beatmapsetId: usableBeatmapsetId(meta.beatmapsetId) ?? undefined,
          unsubmitted: !isUsableBeatmapId(meta.beatmapId),
        }
      } catch (err) {
        results[ck] = { status: 'error', error: err instanceof Error ? err.message : String(err) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, worker))

  return jsonResponse({ results })
}
