import { extractOsuFromOsz } from '../_lib/osuArchive.ts'
import { isValidTournamentId } from '../_lib/tournamentId.ts'
import { hasRole, type SessionUser } from '../_lib/auth.ts'

interface Env {
  R2_BUCKET?: R2Bucket
  OSU_PROXY_URL?: string
  OSU_PROXY_SECRET?: string
}

class StorageReadError extends Error {}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag, X-Beatmap-Source',
    'Cache-Control': 'private, no-cache',
  }
}

function textResponse(text: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(), ...extraHeaders },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, data }) => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const fields = ['tournamentId', 'roundId', 'slot'] as const
  const [tournamentId, roundId, slot] = fields.map((name) => url.searchParams.get(name) || '')
  const hasSlot = fields.some((name) => url.searchParams.has(name))
  const validSegment = (value: string) => value.length > 0 && value.length <= 200 && value !== '.' && value !== '..' && !/[\/\\\x00-\x1f\x7f]/.test(value)
  if (['id', ...fields].some((name) => url.searchParams.getAll(name).length > 1)
    || (id !== null && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))))
    || (hasSlot && (!isValidTournamentId(tournamentId) || !validSegment(roundId) || !validSegment(slot)))
    || (!hasSlot && !id)) return textResponse('invalid beatmap location or id', 400)

  if (hasSlot) {
    // Match the existing private R2 metadata endpoint's contributor access.
    const user = (data as { user?: SessionUser })?.user ?? null
    if (!hasRole(user, 'contributor')) return textResponse('contributor access required', 403)
    // Never substitute an online chart when an uploaded competition version is
    // unreadable or mismatched. Only a genuinely absent object may fall back.
    if (!env.R2_BUCKET) return textResponse('R2 storage is not configured', 503)
    try {
      const key = `maps/${tournamentId}/${roundId}/${slot}.osz`
      const object = await env.R2_BUCKET.head(key)
      if (object) {
        const headers = { ...corsHeaders(), ETag: `"r2-${object.etag}"`, 'X-Beatmap-Source': 'r2' }
        if (request.headers.get('If-None-Match') === headers.ETag) return new Response(null, { status: 304, headers })
        const getRange = async (start: number, end: number) => {
          try {
            const part = await env.R2_BUCKET!.get(key, {
              range: { offset: start, length: end - start },
              onlyIf: { etagMatches: object.etag },
            })
            if (!part || !('body' in part)) throw new Error('uploaded file changed while reading')
            return new Uint8Array(await part.arrayBuffer())
          } catch {
            throw new StorageReadError('uploaded file changed or storage is temporarily unavailable; retry')
          }
        }
        try {
          const { content } = await extractOsuFromOsz(object.size, getRange, id ? Number(id) : undefined)
          return textResponse(content, 200, headers)
        } catch (error) {
          if (error instanceof StorageReadError) return textResponse(error.message, 503)
          return textResponse(`uploaded beatmap cannot be read: ${error instanceof Error ? error.message : String(error)}`, 422)
        }
      }
    } catch {
      return textResponse('R2 storage is temporarily unavailable', 503)
    }
  }
  if (!id) return textResponse('no uploaded beatmap; upload a file or provide a BID', 404)

  try {
    const useProxy = Boolean(env.OSU_PROXY_URL && env.OSU_PROXY_SECRET)
    const source = useProxy ? 'proxy' : 'osu'
    const upstreamUrl = useProxy
      ? `${env.OSU_PROXY_URL!.replace(/\/$/, '')}/osu/${id}`
      : `https://osu.ppy.sh/osu/${id}`
    let upstream: Response | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await fetch(upstreamUrl, {
          headers: {
            Accept: 'text/plain,*/*',
            'User-Agent': 'osumania-ladder/1.0 (+https://osumania-ladder.pages.dev)',
            ...(useProxy ? { 'X-Proxy-Secret': env.OSU_PROXY_SECRET! } : {}),
          },
          signal: AbortSignal.timeout(8_000),
        })
        if (upstream.ok) break
        if (upstream.status !== 429 && upstream.status < 500) break
        if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (error) {
        lastError = error
        if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }

    if (!upstream || !upstream.ok) {
      const status = upstream?.status ?? 0
      const responseStatus = status >= 400 && status < 500 ? status : 502
      const retryAfter = upstream?.headers.get('Retry-After')
      return textResponse(
        `osu beatmap download failed: ${status ? `HTTP ${status}` : String(lastError ?? 'no response')}`,
        responseStatus,
        retryAfter ? { 'Retry-After': retryAfter } : {},
      )
    }

    const body = await upstream.text()
    if (!body.includes('[HitObjects]')) return textResponse('downloaded file is not a valid osu beatmap', 502)
    return textResponse(body, 200, { 'X-Beatmap-Source': source })
  } catch (error) {
    return textResponse(`osu beatmap download failed: ${error instanceof Error ? error.message : String(error)}`, 502)
  }
}
