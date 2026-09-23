import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { extractOsuFromOsz } from '../functions/api/_lib/osuArchive.ts'
import { usableBeatmapId, usableBeatmapsetId } from '../src/lib/beatmapIds.ts'
import identity from './mapIdentity.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 并发读上限。导出时间基本全花在"逐条 Range 读 + 解析"上，这是唯一不用改架构就能提速的旋钮。
 *
 * 与 `generate-pack.js` 的 `PACK_DOWNLOAD_CONCURRENCY` 同一套规矩：非法值回退默认值
 * （0 / 负数 / NaN / 空都不返回），上限 32 —— 再往上收益很小，更容易撞上游限流。
 */
export const DEFAULT_READ_CONCURRENCY = 8
export const MAX_READ_CONCURRENCY = 32
export function resolveReadConcurrency(raw = process.env.CSV_READ_CONCURRENCY) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_READ_CONCURRENCY
  return Math.min(Math.floor(n), MAX_READ_CONCURRENCY)
}

const READ_CONCURRENCY = resolveReadConcurrency()

/**
 * 把错误摊平成一行可读文本，**带上 name / code / HTTP 状态**。
 *
 * 起因：2026-09-22 那次导出挂在 `Error: DE Part 4: …: aborted`。只打 `message` 时
 * `name` / `code`（这里是 `ECONNRESET`）/ `$metadata.httpStatusCode` 全丢了，
 * 事后没法判断是一次网络抖动还是那个对象本身有问题 —— 只能靠重跑试探。
 * 诊断信息宁可多带。
 */
export function describeError(error) {
  if (!error) return 'unknown error'
  const parts = [error.message || String(error)]
  if (error.name && error.name !== 'Error') parts.push(`[${error.name}]`)
  if (error.code) parts.push(`[${error.code}]`)
  const status = error.$metadata?.httpStatusCode
  if (status) parts.push(`[HTTP ${status}]`)
  return parts.join(' ')
}

/**
 * 重试 `fn`：专治 R2 偶发的传输中断。
 *
 * 为什么必须自己做：AWS SDK 的 `maxAttempts` 只在"响应体还没开始读"时重试；
 * 读到一半连接被重置它不重试 —— 一次抖动就能毁掉整趟（索引最后才写，前面全白跑）。
 *
 * **不按错误类型分类**：分类要维护一张永远填不全的表，而多花的两次尝试只发生在
 * 已经失败的路径上，代价可以忽略；确定性错误重试满 3 次后抛的还是同一个错。
 */
export async function withRetry(label, fn, { attempts = 3, delayMs = 1000 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await fn() } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const wait = delayMs * 2 ** (attempt - 1)
      console.warn(`  ${label} 第 ${attempt}/${attempts} 次失败，${wait}ms 后重试：${describeError(error)}`)
      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }
  throw lastError
}

// 并发执行 fn(item) 但限制同时只跑 limit 个，结果按 items 原顺序返回。
// 与 `generate-pack.js` / `backfill-bid.mjs` 里的同名函数一致（本仓库的既有做法是各脚本自带一份）。
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

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

/** `targetTypes` 留空导出全部；给数组就只导这些键型（可一次多个）。 */
export function planCollections(manifest, targetTypes = []) {
  if (!Array.isArray(manifest.packs) || !manifest.packs.length) throw new Error('No published packs')
  const wanted = new Set(targetTypes)
  const groups = new Map()
  for (const pack of manifest.packs) {
    if (wanted.size && !wanted.has(pack.realType)) continue
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
  // 要的每一个键型都必须有数据。只报"一个都没导到"是不够的：`--type=TB,TYPO` 里
  // TYPO 查无数据时，若静默只导 TB，用户会以为两个都刷新了；而合并索引又会把 TYPO
  // 的旧条目滤掉 —— 一次"成功"的运行产出跟用户的理解正好相反。宁可整趟白跑。
  const missing = [...wanted].filter(realType => !groups.has(realType))
  if (missing.length) throw new Error(`No published packs for ${missing.join(', ')}`)
  if (!groups.size) throw new Error(`No published packs for ${targetTypes.join(',') || 'export'}`)
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([realType, packs]) => ({
    realType, packs: packs.sort((a, b) => a.part - b.part),
  }))
}

export async function exportCollections(manifest, { readChart, upload, publicUrl, exportedAt, targetTypes = [], concurrency = DEFAULT_READ_CONCURRENCY }) {
  const collections = []
  // Cache only text metadata, not ZIP/audio buffers. The IO adapter streams ranges.
  const cache = new Map()
  for (const { realType, packs } of planCollections(manifest, targetTypes)) {
    const tasks = []
    for (const pack of packs) for (const entry of pack.contentEntries) tasks.push({ pack, entry })
    console.log(`${realType}: 读取 ${tasks.length} 条…`)
    // 并发只作用在"读一条"上；写 CSV 和传 R2 仍按集合串行，顺序与并发数无关。
    const resolved = await mapWithConcurrency(tasks, concurrency, async ({ pack, entry }) => {
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
      // 失败不在这里抛：并发下先抛的未必是顺序上第一条，报出来的就成了随机一条。
      // 收进对象，等这一轮跑完再按原顺序取第一条失败 —— 与串行时报的完全一样。
      if (!chart) return { error: new Error(`${realType} Part ${pack.part}: ${entry.paths.join(', ')}: ${describeError(lastError)}`) }
      const title = `osu!mania Ladder ${realType}`
      return { row: { ...chart, exported_at: exportedAt, playlist_title: title, playlist_author: 'osu!mania Ladder Team',
        playlist_description: 'Published pattern collection; local edits and NSV may differ from online originals.',
        source_collection: title, real_type: realType, pack_part: pack.part,
        variant: sourcePath.endsWith('.nsv.osz') ? 'NSV' : 'main', content_key: entry.contentKey } }
    })
    const failure = resolved.find(r => r.error)
    if (failure) throw failure.error
    const rows = resolved.map(r => r.row)
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

/**
 * 解析命令行，返回要导的键型数组；空数组 = 导出全部。
 *
 * 抽成纯函数只为一件事：可测。这里写错的代价是整趟 Action 白跑 40 分钟，
 * 而它又是人工在 workflow_dispatch 输入框里敲的（`--type=ADP,CJ,CO`）。
 */
export function parseTypeArgs(args) {
  if (args.length > 1 || (args.length && !/^--type=[A-Za-z0-9]+(,[A-Za-z0-9]+)*$/.test(args[0]))) {
    throw new Error('Usage: export-pack-csv.mjs [--type=TB] / [--type=ADP,CJ,CO]（留空导出全部）')
  }
  // 去重：'ADP,ADP' 当一次算，免得合并索引时同一个键型滤两遍。
  return args[0] ? [...new Set(args[0].slice(7).split(','))] : []
}

async function main() {
  const targetTypes = parseTypeArgs(process.argv.slice(2))
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
    targetTypes, publicUrl, exportedAt, concurrency: READ_CONCURRENCY,
    // 整个"HEAD + 逐段读"包一层重试。重试会多花一次 HEAD，但换来的是：
    // 段读中途被重置（正是 2026-09-22 那次挂掉的原因）不再毁掉整趟导出。
    readChart: key => withRetry(`读取 ${key}`, async () => {
      const head = await s3.send(new HeadObjectCommand({ Bucket: mapsBucket, Key: key }))
      if (!head.ETag) throw new Error('Missing R2 ETag')
      return extractOsuFromOsz(head.ContentLength, async (start, end) => {
        const result = await s3.send(new GetObjectCommand({ Bucket: mapsBucket, Key: key,
          Range: `bytes=${start}-${end - 1}`, IfMatch: head.ETag }))
        return result.Body.transformToByteArray()
      })
    }),
    upload: ({ objectKey, body, realType }) => s3.send(new PutObjectCommand({ Bucket: packsBucket,
      Key: objectKey, Body: body, ContentType: 'text/csv; charset=utf-8',
      ContentDisposition: `attachment; filename="osu-mania-ladder-${realType}.csv"`, CacheControl: 'public, max-age=31536000, immutable' })),
  })
  // 保留本次没导的键型（它们的 CSV 仍然有效 —— 内容寻址，没重打包就不会失效），
  // 只替换本次导到的那些（一起导多个时全都要滤掉，否则旧条目会盖回来）。
  // 留空跑全量时不做保留：本次没导出来的键型说明它的包没了，旧 CSV 必须跟着消失。
  const result = targetTypes.length
    ? [...oldIndex.collections.filter(c => !targetTypes.includes(c.realType)), ...collections]
    : collections
  // Only switch download links after ALL requested collections succeeded.
  await fs.writeFile(indexPath, JSON.stringify({ collections: result.sort((a, b) => a.realType.localeCompare(b.realType)) }, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
