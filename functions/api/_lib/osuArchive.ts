// Extract only chart text via R2 ranges; audio/background assets stay in R2.
import { usableBeatmapId, usableBeatmapsetId } from './beatmapIds.ts'

type GetRange = (start: number, end: number) => Promise<Uint8Array>
type ZipEntry = { name: string; method: number; flags: number; size: number; compressedSize: number; offset: number }
const MAX_CHART_SIZE = 8 * 1024 * 1024
const decoder = new TextDecoder()
const u16 = (b: Uint8Array, p: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(p, true)
const u32 = (b: Uint8Array, p: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p, true)
function u64(b: Uint8Array, p: number) {
  const n = Number(new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(p, true))
  if (!Number.isSafeInteger(n)) throw new Error('zip: oversized offset')
  return n
}

export function parseOsuMetadata(content: string) {
  const meta: { artist?: string; title?: string; version?: string; beatmapId?: number; beatmapsetId?: number } = {}
  let section = ''
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1); continue }
    if (section !== 'Metadata') continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key === 'Artist') meta.artist ??= value
    if (key === 'Title') meta.title ??= value
    if (key === 'Version') meta.version ??= value
    // 占位 ID（0/1/负数）一律当"没有 ID" —— 见 _lib/beatmapIds.ts。
    // 这里必须挡，否则 `/api/maps/meta` 会把占位值回给前端，而「一键补全」拿它
    // **写回比赛 JSON** —— 清理脚本刚删掉的 setId=1 又被补上（MKTC 那 36 张）。
    if (key === 'BeatmapID') meta.beatmapId ??= usableBeatmapId(Number.parseInt(value, 10)) ?? undefined
    if (key === 'BeatmapSetID') meta.beatmapsetId ??= usableBeatmapsetId(Number.parseInt(value, 10)) ?? undefined
  }
  return meta
}

export async function extractOsuFromOsz(fileSize: number, getRange: GetRange, beatmapId?: number) {
  const read: GetRange = async (start, end) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > fileSize || end <= start) {
      throw new Error('zip: invalid range')
    }
    const bytes = await getRange(start, end)
    if (bytes.length !== end - start) throw new Error('zip: truncated range')
    return bytes
  }
  const tail = await read(Math.max(0, fileSize - 65_557), fileSize)
  let eocd = -1
  for (let p = tail.length - 22; p >= 0; p--) {
    if (u32(tail, p) === 0x06054b50 && p + 22 + u16(tail, p + 20) === tail.length) { eocd = p; break }
  }
  if (eocd < 0) throw new Error('zip: EOCD not found')
  if (u16(tail, eocd + 4) || u16(tail, eocd + 6)) throw new Error('zip: split archives unsupported')
  let count = u16(tail, eocd + 10)
  let cdSize = u32(tail, eocd + 12)
  let cdOffset = u32(tail, eocd + 16)
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    if (eocd < 20 || u32(tail, eocd - 20) !== 0x07064b50) throw new Error('zip: missing ZIP64 locator')
    const offset = u64(tail, eocd - 12)
    const record = await read(offset, offset + 56)
    if (u32(record, 0) !== 0x06064b50) throw new Error('zip: invalid ZIP64 record')
    count = u64(record, 32)
    cdSize = u64(record, 40)
    cdOffset = u64(record, 48)
  }
  if (count > 10_000 || cdSize > 4 * 1024 * 1024) throw new Error('zip: directory too large')
  const cd = await read(cdOffset, cdOffset + cdSize)
  const entries: ZipEntry[] = []
  let p = 0
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || u32(cd, p) !== 0x02014b50) throw new Error('zip: invalid directory')
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32)
    const end = p + 46 + nameLen + extraLen + commentLen
    if (end > cd.length) throw new Error('zip: truncated directory')
    const entry: ZipEntry = {
      name: decoder.decode(cd.subarray(p + 46, p + 46 + nameLen)),
      method: u16(cd, p + 10), flags: u16(cd, p + 8),
      size: u32(cd, p + 24), compressedSize: u32(cd, p + 20), offset: u32(cd, p + 42),
    }
    if ([entry.size, entry.compressedSize, entry.offset].includes(0xffffffff)) {
      const extraEnd = p + 46 + nameLen + extraLen
      for (let e = p + 46 + nameLen; e + 4 <= extraEnd;) {
        const id = u16(cd, e), length = u16(cd, e + 2)
        if (e + 4 + length > extraEnd) throw new Error('zip: invalid extra field')
        if (id === 1) {
          let valueOffset = e + 4
          // ZIP64 values occur in this order, only for sentinel fields.
          for (const key of ['size', 'compressedSize', 'offset'] as const) {
            if (entry[key] !== 0xffffffff) continue
            if (valueOffset + 8 > e + 4 + length) throw new Error('zip: truncated ZIP64 field')
            entry[key] = u64(cd, valueOffset)
            valueOffset += 8
          }
          break
        }
        e += 4 + length
      }
    }
    if (entry.name.toLowerCase().endsWith('.osu')) entries.push(entry)
    p = end
  }
  if (!entries.length) throw new Error('no .osu in .osz')
  if (entries.length > 1 && !beatmapId) throw new Error('multiple .osu files; select one difficulty before uploading')
  if (entries.length > 32) throw new Error('too many .osu files')
  const matches: { content: string; osuName: string }[] = []
  for (const entry of entries) {
    if (entry.flags & 1 || ![0, 8].includes(entry.method)) throw new Error('zip: unsupported compression or encryption')
    if (entry.size > MAX_CHART_SIZE || entry.compressedSize > MAX_CHART_SIZE) throw new Error('chart too large')
    const lh = await read(entry.offset, entry.offset + 30)
    if (u32(lh, 0) !== 0x04034b50) throw new Error('zip: bad local header')
    const start = entry.offset + 30 + u16(lh, 26) + u16(lh, 28)
    const raw = await read(start, start + entry.compressedSize)
    let bytes = raw
    if (entry.method === 8) {
      const reader = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
      const chunks: Uint8Array[] = []
      let length = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          length += part.value.length
          if (length > MAX_CHART_SIZE) throw new Error('chart too large')
          chunks.push(part.value)
        }
      } finally { await reader.cancel() }
      bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    }
    if (bytes.length !== entry.size) throw new Error('zip: invalid chart size')
    const content = decoder.decode(bytes)
    if (!content.trimStart().startsWith('osu file format') || !content.includes('[HitObjects]')) throw new Error('invalid osu beatmap')
    const uploadedId = parseOsuMetadata(content).beatmapId
    if (entries.length === 1) {
      // uploadedId 已经是"过了占位判读"的值（parseOsuMetadata 里归一化过），
      // 这里不再自己判 `> 0` —— 两处口径必须一致，否则占位 ID 会在这里被放行。
      if (beatmapId && uploadedId && uploadedId !== beatmapId) throw new Error('uploaded BID differs from the selected BID')
      return { content, osuName: entry.name }
    }
    if (uploadedId === beatmapId) matches.push({ content, osuName: entry.name })
  }
  if (matches.length !== 1) throw new Error('cannot uniquely identify the requested difficulty in .osz')
  return matches[0]
}
