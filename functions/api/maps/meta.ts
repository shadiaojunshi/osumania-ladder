import { jsonResponse, noContent } from '../_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from '../_lib/auth'
import { isValidTournamentId } from '../_lib/tournamentId'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  R2_BUCKET: R2Bucket
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 读取谱面 .osz 内 .osu 的 [Metadata]，用于回填 tournament JSON 的 name/beatmapId。
// 只读 zip 的中央目录 + 目标 .osu 的压缩数据（R2 range 读），不拉整个 .osz。
// 返回 per-slot 结果；R2 无文件 / 无 .osu / BeatmapID<=0 的 slot 标记 status，由前端决定怎么处理。

interface ZipEntry {
  method: number
  compressedSize: number
  localHeaderOffset: number
}

interface OszMeta {
  artist?: string
  title?: string
  version?: string
  beatmapId?: number
  beatmapsetId?: number
}

function u16LE(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8)
}
function u32LE(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

// 解析 zip 中央目录（尾部 EOCD 定位），返回 name -> entry。
// 兼容 zip64 的一小部分（EOCD locator），超大 .osz 足够用。
async function readZipCentralDirectory(
  getRange: (start: number, end: number) => Promise<Uint8Array>,
  fileSize: number,
): Promise<Map<string, ZipEntry>> {
  const tailSize = Math.min(66_000, fileSize)
  const tail = await getRange(fileSize - tailSize, fileSize)

  // 从尾部向前找 EOCD 签名 0x06054b50。
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32LE(tail, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip: EOCD not found')

  let entryCount = u16LE(tail, eocd + 10)
  let cdSize = u32LE(tail, eocd + 12)
  let cdOffset = u32LE(tail, eocd + 16)

  // zip64: EOCD locator 在 EOCD 前 20 字节，签名 0x07064b50。
  if ((cdOffset === 0xffffffff || entryCount === 0xffff) && eocd >= 20) {
    const loc = eocd - 20
    if (u32LE(tail, loc) === 0x07064b50) {
      const z64Offset = Number(u64LE(tail, loc + 8))
      const z64 = await getRange(z64Offset, Math.min(z64Offset + 56, fileSize))
      if (u32LE(z64, 0) === 0x06064b50) {
        entryCount = Number(u64LE(z64, 32))
        cdSize = Number(u64LE(z64, 40))
        cdOffset = Number(u64LE(z64, 48))
      }
    }
  }

  // CD 一律单独 range 读:它在 EOCD 之前,不落在刚读的 tail 窗口里,多一次小读换正确性。
  const cd = await getRange(cdOffset, Math.min(cdOffset + cdSize, fileSize))

  const entries = new Map<string, ZipEntry>()
  let p = 0
  for (let i = 0; i < entryCount && p + 46 <= cd.length; i++) {
    if (u32LE(cd, p) !== 0x02014b50) break
    const method = u16LE(cd, p + 10)
    let compressedSize = u32LE(cd, p + 20)
    const nameLen = u16LE(cd, p + 28)
    const extraLen = u16LE(cd, p + 30)
    const commentLen = u16LE(cd, p + 32)
    let localHeaderOffset = u32LE(cd, p + 42)
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen))

    // zip64 extra field (header id 0x0001) 覆盖 32 位字段。
    if (compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      let ep = p + 46 + nameLen
      const extraEnd = ep + extraLen
      while (ep + 4 <= extraEnd) {
        const id = u16LE(cd, ep)
        const size = u16LE(cd, ep + 2)
        if (id === 0x0001) {
          let fp = ep + 4
          if (localHeaderOffset === 0xffffffff && fp + 8 <= extraEnd) {
            localHeaderOffset = Number(u64LE(cd, fp)); fp += 8
          }
          if (compressedSize === 0xffffffff && fp + 8 <= extraEnd) {
            compressedSize = Number(u64LE(cd, fp))
          }
          break
        }
        ep += 4 + size
      }
    }

    entries.set(name, { method, compressedSize, localHeaderOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function u64LE(b: Uint8Array, off: number): bigint {
  let v = 0n
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[off + i])
  return v
}

// 从 .osu 文本提取 [Metadata]。手动上传 / 未上传谱的 BeatmapID 可能是 0 或 -1，原样返回。
function parseOsuMetadata(content: string): OszMeta {
  const meta: OszMeta = {}
  let section = ''
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1); continue }
    if (section !== 'Metadata') continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (!value) continue
    if (key === 'Artist' && !meta.artist) meta.artist = value
    if (key === 'Title' && !meta.title) meta.title = value
    if (key === 'Version' && !meta.version) meta.version = value
    if (key === 'BeatmapID' && meta.beatmapId === undefined) meta.beatmapId = parseInt(value, 10)
    if (key === 'BeatmapSetID' && meta.beatmapsetId === undefined) meta.beatmapsetId = parseInt(value, 10)
  }
  return meta
}

async function extractMetaFromOsz(
  key: string,
  fileSize: number,
  getRange: (start: number, end: number) => Promise<Uint8Array>,
): Promise<OszMeta & { osuName: string }> {
  const entries = await readZipCentralDirectory(getRange, fileSize)
  // 只认第一个 .osu —— 上传流程保证每个 .osz 只装一个难度。
  let osuName = ''
  for (const [name, e] of entries) {
    if (!name.toLowerCase().endsWith('.osu') || e.method !== 8) continue
    osuName = name
    break
  }
  // 兜底：store（未压缩）也接受，直接原样读。
  if (!osuName) {
    for (const [name] of entries) {
      if (name.toLowerCase().endsWith('.osu')) { osuName = name; break }
    }
  }
  if (!osuName) throw new Error('no .osu in .osz')

  const entry = entries.get(osuName)!
  // local header: 固定 30 字节 + 文件名长 + extra 字段长（extra 长度要从 local header 读，可能与 CD 不同）。
  const lh = await getRange(entry.localHeaderOffset, Math.min(entry.localHeaderOffset + 30, fileSize))
  if (lh.length < 30 || u32LE(lh, 0) !== 0x04034b50) throw new Error('zip: bad local header')
  const lhNameLen = u16LE(lh, 26)
  const lhExtraLen = u16LE(lh, 28)
  const dataStart = entry.localHeaderOffset + 30 + lhNameLen + lhExtraLen
  const raw = await getRange(dataStart, Math.min(dataStart + entry.compressedSize, fileSize))

  let content: string
  if (entry.method === 8) {
    content = new TextDecoder().decode(await inflateRaw(raw))
  } else {
    content = new TextDecoder().decode(raw)
  }
  return { ...parseOsuMetadata(content), osuName }
}

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
    const ck = `${roundId}:${slot}`
    if (seen.has(ck)) continue
    seen.add(ck)
    wanted.push({ roundId, slot })
  }
  if (wanted.length === 0) return jsonResponse({ error: 'no rounds specified' }, 400)
  if (wanted.length > 500) return jsonResponse({ error: 'too many slots (max 500)' }, 400)

  const suffix = `${tournamentId}/`
  // 第一轮分页 list 拿到已有 key 集合，避免为每个 slot 打一次 R2。
  const existing = new Map<string, number>() // key -> size
  let cursor: string | undefined
  do {
    const page = await env.R2_BUCKET.list({ prefix: `maps/${suffix}`, cursor, limit: 1000 })
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
      const key = `maps/${tournamentId}/${roundId}/${slot}.osz`
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
        const meta = await extractMetaFromOsz(key, fileSize, getRange)
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
