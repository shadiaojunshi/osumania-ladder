import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { extractOsuFromOsz } from '../functions/api/_lib/osuArchive.ts'
import { usableBeatmapId, usableBeatmapsetId } from '../src/lib/beatmapIds.ts'
import identity from './mapIdentity.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Names follow the supplied Seekman CSV. Unavailable values are empty, never 0.
// Do not claim Seekman's own export version, star ratings, ranked status or MD5:
// R2 contains local edits and the range reader returns decoded text, not bytes.
export const COLUMNS = [
  'exported_at', 'playlist_title', 'playlist_author', 'playlist_description', 'source_collection',
  'beatmapset_id', 'beatmap_id', 'artist', 'artist_unicode', 'title', 'title_unicode', 'creator',
  'version', 'mode', 'osu_file_name', 'audio_file_name', 'hitcircles', 'sliders', 'spinners',
  'ar', 'cs', 'hp', 'od', 'slider_velocity', 'total_time', 'preview_time', 'bpm', 'bpm_min', 'bpm_max',
  'source', 'tags', 'real_type', 'pack_part', 'variant', 'content_key',
]

export function csvCell(value) {
  let text = value == null ? '' : String(value)
  // Quoting alone does not stop spreadsheet formulas. Numeric values stay numeric.
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(text)) text = "'" + text
  if (/[",\r\n]/.test(text)) text = '"' + text.replaceAll('"', '""') + '"'
  return text
}

export function makeCsv(rows) {
  return '\uFEFF' + [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n'
}

export function parseChart(content, osuName) {
  const sections = Object.create(null)
  let section = ''
  const objects = [], timings = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1); continue }
    if (section === 'HitObjects') { objects.push(line.split(',')); continue }
    if (section === 'TimingPoints') { timings.push(line.split(',')); continue }
    const colon = line.indexOf(':')
    if (colon < 0) continue
    sections[section] ??= Object.create(null)
    sections[section][line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  const m = sections.Metadata || {}, g = sections.General || {}, d = sections.Difficulty || {}
  const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : ''
  let end = 0, circles = 0, sliders = 0, spinners = 0
  for (const o of objects) {
    const type = Number(o[3]), time = Number(o[2])
    if (!Number.isFinite(time)) throw new Error('Invalid hit object time')
    end = Math.max(end, time)
    if (type & 1) circles++
    if (type & 2 || type & 128) sliders++
    if (type & 8) spinners++
    if (type & 128 || type & 8) {
      const tail = Number(o[5]?.split(':')[0])
      if (!Number.isFinite(tail)) throw new Error('Invalid hold/spinner end time')
      end = Math.max(end, tail)
    }
  }
  const red = timings.filter(p => Number(p[1]) > 0 && Number.isFinite(Number(p[0])) && (p[6] === '1' || p[6] === undefined))
    .map(p => ({ time: Number(p[0]), bpm: Number((60000 / Number(p[1])).toFixed(3)) })).sort((a, b) => a.time - b.time)
  const durations = new Map()
  for (let i = 0; i < red.length; i++) {
    const duration = Math.max(0, Math.min(end, red[i + 1]?.time ?? end) - Math.max(0, red[i].time))
    durations.set(red[i].bpm, (durations.get(red[i].bpm) || 0) + duration)
  }
  const bpm = [...durations].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  return {
    beatmapset_id: usableBeatmapsetId(Number(m.BeatmapSetID)) ?? '',
    beatmap_id: usableBeatmapId(Number(m.BeatmapID)) ?? '',
    artist: m.Artist, artist_unicode: m.ArtistUnicode, title: m.Title, title_unicode: m.TitleUnicode,
    creator: m.Creator, version: m.Version, mode: ['osu', 'taiko', 'fruits', 'mania'][Number(g.Mode ?? 0)] ?? '',
    osu_file_name: osuName, audio_file_name: g.AudioFilename,
    hitcircles: circles, sliders, spinners,
    ar: number(d.ApproachRate), cs: number(d.CircleSize), hp: number(d.HPDrainRate), od: number(d.OverallDifficulty),
    slider_velocity: number(d.SliderMultiplier), total_time: Number(g.Mode) === 3 ? end : '',
    preview_time: number(g.PreviewTime), bpm,
    bpm_min: red.length ? Math.min(...red.map(p => p.bpm)) : '',
    bpm_max: red.length ? Math.max(...red.map(p => p.bpm)) : '', source: m.Source, tags: m.Tags,
  }
}

export function planCollections(manifest, targetType) {
  if (!Array.isArray(manifest.packs) || !manifest.packs.length) throw new Error('No published packs')
  const groups = new Map()
  for (const pack of manifest.packs) {
    if (targetType && pack.realType !== targetType) continue
    if (!/^[A-Za-z0-9]+$/.test(pack.realType)) throw new Error('Invalid pack type')
    if (!Array.isArray(pack.contentEntries) || !pack.contentEntries.length || !pack.objectKey) {
      throw new Error(`${pack.realType}: 缺少已发布内容记录，请先重新合包`)
    }
    if (!groups.has(pack.realType)) groups.set(pack.realType, [])
    groups.get(pack.realType).push(pack)
    for (const entry of pack.contentEntries) {
      if (!/^[a-f0-9]{16}$/.test(entry.contentKey) || !Array.isArray(entry.paths) || !entry.paths.length
        || entry.paths.some(p => typeof p !== 'string' || !p.startsWith('maps/') || !p.endsWith('.osz') || p.split('/').includes('..'))) {
        throw new Error(`${pack.realType}: Invalid published content entry`)
      }
    }
  }
  if (!groups.size) throw new Error(`No published packs for ${targetType || 'export'}`)
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([realType, packs]) => ({
    realType, packs: packs.sort((a, b) => a.part - b.part),
  }))
}

export async function exportCollections(manifest, { readChart, upload, publicUrl, exportedAt, targetType }) {
  const collections = []
  // Cache only text metadata, not ZIP/audio buffers. The IO adapter streams ranges.
  const cache = new Map()
  for (const { realType, packs } of planCollections(manifest, targetType)) {
    const rows = []
    for (const pack of packs) for (const entry of pack.contentEntries) {
      let chart, sourcePath, lastError
      for (const key of entry.paths) {
        try {
          if (!cache.has(key)) {
            const original = await readChart(key)
            cache.set(key, { signature: identity.contentSignature(original.content), metadata: parseChart(original.content, original.osuName) })
          }
          const candidate = cache.get(key)
          if (candidate.signature !== entry.contentKey) throw new Error('R2 谱面内容已变更，与已发布合集不一致')
          chart = candidate.metadata; sourcePath = key; break
        } catch (error) { lastError = error }
      }
      if (!chart) throw new Error(`${realType} Part ${pack.part}: ${entry.paths.join(', ')}: ${lastError?.message}`)
      const title = `osu!mania Ladder ${realType}`
      rows.push({ ...chart, exported_at: exportedAt, playlist_title: title, playlist_author: 'osu!mania Ladder Team',
        playlist_description: 'Published pattern collection; local edits and NSV may differ from online originals.',
        source_collection: title, real_type: realType, pack_part: pack.part,
        variant: sourcePath.endsWith('.nsv.osz') ? 'NSV' : 'main', content_key: entry.contentKey })
    }
    const body = Buffer.from(makeCsv(rows), 'utf8')
    const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)
    const objectKey = `csv/${realType}.${hash}.csv`
    await upload({ objectKey, body, realType })
    collections.push({ realType, url: `${publicUrl.replace(/\/+$/, '')}/${objectKey}`, objectKey,
      sourceObjectKeys: packs.map(p => p.objectKey).sort(), mapCount: rows.length,
      missingIdCount: rows.filter(r => !r.beatmapset_id && !r.beatmap_id).length,
      nsvCount: rows.filter(r => r.variant === 'NSV').length, exportedAt })
    console.log(`${realType}: ${rows.length} rows → ${objectKey}`)
  }
  return collections
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length && !/^--type=[A-Za-z0-9]+$/.test(args[0]))) throw new Error('Usage: export-pack-csv.mjs [--type=TB]')
  const targetType = args[0]?.slice(7)
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_PACKS_PUBLIC_URL']) {
    if (!process.env[name]) throw new Error(`Missing ${name}`)
  }
  const publicUrl = process.env.R2_PACKS_PUBLIC_URL.replace(/\/+$/, '')
  if (new URL(publicUrl).protocol !== 'https:') throw new Error('R2 public URL must use HTTPS')
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY }, maxAttempts: 3 })
  const mapsBucket = process.env.R2_BUCKET || 'osumania-ladder-maps'
  const packsBucket = process.env.R2_PACKS_BUCKET || 'osumania-ladder-packs'
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'data/packs-manifest.json'), 'utf8'))
  const indexPath = path.join(ROOT, 'data/pack-csv-manifest.json')
  const oldIndex = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const exportedAt = new Date().toISOString()
  const collections = await exportCollections(manifest, {
    targetType, publicUrl, exportedAt,
    readChart: async key => {
      const head = await s3.send(new HeadObjectCommand({ Bucket: mapsBucket, Key: key }))
      if (!head.ETag) throw new Error('Missing R2 ETag')
      return extractOsuFromOsz(head.ContentLength, async (start, end) => {
        const result = await s3.send(new GetObjectCommand({ Bucket: mapsBucket, Key: key,
          Range: `bytes=${start}-${end - 1}`, IfMatch: head.ETag }))
        return result.Body.transformToByteArray()
      })
    },
    upload: ({ objectKey, body, realType }) => s3.send(new PutObjectCommand({ Bucket: packsBucket,
      Key: objectKey, Body: body, ContentType: 'text/csv; charset=utf-8',
      ContentDisposition: `attachment; filename="osu-mania-ladder-${realType}.csv"`, CacheControl: 'public, max-age=31536000, immutable' })),
  })
  const result = targetType ? [...oldIndex.collections.filter(c => c.realType !== targetType), ...collections] : collections
  // Only switch download links after ALL requested collections succeeded.
  await fs.writeFile(indexPath, JSON.stringify({ collections: result.sort((a, b) => a.realType.localeCompare(b.realType)) }, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
