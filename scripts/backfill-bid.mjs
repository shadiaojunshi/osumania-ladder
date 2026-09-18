// 从 R2 原始 .osz 回填 beatmapId / beatmapsetId（顺带补空 name）到 tournament JSON。
//
// 背景：网站早期在"主表格批量导入"功能出现前，很多比赛的谱面文件已经上传到
// R2（maps/{tid}/{rid}/{slot}.osz），但 JSON 里没有回填 beatmapId 等元数据，
// 表现为 map 只有 {slot,type,realType,name?,difficulty}。这批图无法参与
// 「同一 beatmapId 重复检测」和合包去重。本脚本把它们的 BID 从 R2 里捞回来。
//
// 严格只增不改：
//   - 只对「beatmapId 不可用」的 map 生效（缺失 **或占位** —— 见下）；
//   - 只写 beatmapId / beatmapsetId；name 仅在当前为空时补真实曲名；
//   - difficulty（人工评级）绝不触碰，其他字段也不动；
//   - R2 无对应文件、或 .osu 里 BeatmapID 不可用（未上传谱）→ 跳过并列进报告，不猜不删。
//
// R20（2026-09-18）改了两件事：
//   1. **ID 判读统一到 `src/lib/beatmapIds.ts`**。旧版到处写 `> 0`：占位
//      `BeatmapSetID:1` 会被当成真 setId 写回去（MKTC 2025 那 36 张就是这么来的），
//      而占位 `BeatmapID:1` 又会被当成"已有 BID"从而永远修不了。现在统一用
//      `isUsableBeatmapId`（0/1/负数/非整数一律视为不可用）。
//   2. 为了 import 那份共享实现（`src/lib/*.ts`）从 CJS 改成 ESM —— 与同目录的
//      `find-suspect-realtypes.mjs` / `clear-placeholder-ids.mjs` 保持一致。
//
// 复用 generate-pack.js 相同的 R2 凭证：
//   R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET
//
// 用法：
//   node scripts/backfill-bid.mjs              # dry-run，只出报告，不写文件（默认）
//   node scripts/backfill-bid.mjs --apply      # 实际写回 data/tournaments/*.json

import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'

import { isUsableBeatmapId } from '../src/lib/beatmapIds.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tournamentsDir = path.join(ROOT, 'data', 'tournaments')

// ---------- 纯函数：这张图要不要回填、回填什么 ----------

/**
 * 决定单个 map 的回填内容。**不产生任何 I/O**，便于单测。
 * @param {{beatmapId?: number, beatmapsetId?: number, slot: string, name?: string}} map 比赛 JSON 里的当前值
 * @param {{beatmapId?: number, beatmapsetId?: number, artist?: string, title?: string, version?: string}} meta 从 .osu 读到的元数据
 * @returns {{beatmapId: number, beatmapsetId?: number, name?: string, replacedPlaceholder: boolean} | null}
 *          null = 不需要改（已有可用 BID 且名字也不需要补）
 */
export function decideFill(map, meta) {
  const bidUsable = isUsableBeatmapId(meta?.beatmapId)
  if (!bidUsable) return null
  // 已经有可用 BID 的图不动（只增不改）。
  if (isUsableBeatmapId(map?.beatmapId)) return null

  const result = {
    beatmapId: meta.beatmapId,
    replacedPlaceholder: map?.beatmapId !== undefined && map?.beatmapId !== null,
  }

  // setId 同样按共享判读：占位 1 / 0 / 负数不写回。
  if (isUsableBeatmapId(meta.beatmapSetId)) result.beatmapsetId = meta.beatmapSetId

  // name 仅在为空 / 等于 slot 占位时补真实曲名，不覆盖已有真实名。
  const curName = String(map?.name ?? '').trim()
  if (!curName || curName === map?.slot) {
    const artist = meta.artist || 'Unknown'
    const title = meta.title || 'Unknown'
    const version = meta.version || 'Normal'
    result.name = `${artist} - ${title} [${version}]`
  }

  return result
}

// ---------- R2 工具 ----------

function createClient(env) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.accessKey, secretAccessKey: env.secretKey },
  })
}

async function listAllKeys(s3, bucket, prefix) {
  const keys = new Set()
  let token
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    )
    if (res.Contents) for (const o of res.Contents) keys.add(o.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function downloadToBuffer(s3, bucket, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// 从 .osz 里解析 .osu 的 [Metadata] 段。返回 { beatmapId, beatmapSetId, artist, title, version }。
export async function parseOszMetadata(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const osuName = Object.keys(zip.files).find((f) => f.toLowerCase().endsWith('.osu'))
  if (!osuName) return null
  const content = await zip.files[osuName].async('string')

  const meta = {}
  let section = ''
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1)
      continue
    }
    if (section !== 'Metadata') continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key === 'Artist' && !meta.artist) meta.artist = value
    if (key === 'Title' && !meta.title) meta.title = value
    if (key === 'Version') meta.version = value
    if (key === 'BeatmapID') meta.beatmapId = parseInt(value, 10)
    if (key === 'BeatmapSetID') meta.beatmapSetId = parseInt(value, 10)
  }
  return meta
}

// 简单并发控制（照搬 generate-pack.js 风格，4 并发）
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ---------- 主流程 ----------

async function main() {
  const apply = process.argv.includes('--apply')
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY
  const secretKey = process.env.R2_SECRET_KEY
  const bucket = process.env.R2_BUCKET || 'osumania-ladder-maps'

  console.log(`模式: ${apply ? '实际写回 (--apply)' : 'DRY-RUN (只出报告，加 --apply 才写)'}\n`)

  const files = fs.readdirSync(tournamentsDir).filter((f) => f.endsWith('.json'))

  // 收集所有 beatmapId 不可用的 map（缺失或占位），带定位信息。
  const targets = []
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
    for (const round of data.rounds || []) {
      for (const map of round.maps || []) {
        if (isUsableBeatmapId(map.beatmapId)) continue
        targets.push({
          file,
          tid: data.id,
          rid: round.id,
          slot: map.slot,
          r2Key: `maps/${data.id}/${round.id}/${map.slot}.osz`,
        })
      }
    }
  }

  console.log(`beatmapId 不可用（缺失/占位）的 map 共 ${targets.length} 张`)

  console.log('列举 R2 maps/ 对象…')
  const s3 = createClient({ accountId, accessKey, secretKey })
  const r2Keys = await listAllKeys(s3, bucket, 'maps/')
  console.log(`R2 maps/ 下有 ${r2Keys.size} 个对象\n`)

  const withFile = targets.filter((t) => r2Keys.has(t.r2Key))
  const noFile = targets.filter((t) => !r2Keys.has(t.r2Key))

  console.log(`R2 里有文件、可尝试回填: ${withFile.length}`)
  console.log(`R2 里无文件、待手动处理: ${noFile.length}\n`)

  console.log('下载并解析 .osu 元数据…')
  let done = 0
  const resolved = await mapWithConcurrency(withFile, 4, async (t) => {
    try {
      const buf = await downloadToBuffer(s3, bucket, t.r2Key)
      const meta = await parseOszMetadata(buf)
      done++
      if (done % 50 === 0) console.log(`  已处理 ${done}/${withFile.length}…`)
      if (!meta) return { ...t, status: 'no-osu' }
      if (!isUsableBeatmapId(meta.beatmapId)) return { ...t, status: 'unsubmitted', meta }
      return { ...t, status: 'ok', meta }
    } catch (err) {
      return { ...t, status: 'error', error: err.message }
    }
  })

  const ok = resolved.filter((r) => r.status === 'ok')
  const unsubmitted = resolved.filter((r) => r.status === 'unsubmitted')
  const errored = resolved.filter((r) => r.status === 'error' || r.status === 'no-osu')

  // ---------- 写回（按文件分组，一次读写一个 JSON） ----------
  let filledBid = 0
  let filledName = 0
  let replacedPlaceholder = 0
  const byFile = new Map()
  for (const r of ok) {
    if (!byFile.has(r.file)) byFile.set(r.file, [])
    byFile.get(r.file).push(r)
  }

  for (const [file, entries] of byFile) {
    const fullPath = path.join(tournamentsDir, file)
    const raw = fs.readFileSync(fullPath, 'utf-8')
    const data = JSON.parse(raw)
    let touched = false
    for (const e of entries) {
      const round = (data.rounds || []).find((rd) => rd.id === e.rid)
      if (!round) continue
      const map = (round.maps || []).find((m) => m.slot === e.slot && !isUsableBeatmapId(m.beatmapId))
      if (!map) continue

      const fill = decideFill(map, e.meta)
      if (!fill) continue

      map.beatmapId = fill.beatmapId
      if (fill.beatmapsetId !== undefined) map.beatmapsetId = fill.beatmapsetId
      if (fill.replacedPlaceholder) replacedPlaceholder++
      filledBid++
      touched = true
      if (fill.name !== undefined) {
        map.name = fill.name
        filledName++
      }
    }
    if (touched && apply) {
      // 保留原换行风格：比赛 JSON 实际是 CRLF，用 '\n' 写回会把整个文件重排。
      const eol = raw.includes('\r\n') ? '\r\n' : '\n'
      const body = JSON.stringify(data, null, 2).split('\n').join(eol)
      fs.writeFileSync(fullPath, raw.endsWith(eol) ? body + eol : body, 'utf-8')
    }
  }

  // ---------- 报告 ----------
  console.log('\n═══════════════════════════════════════════')
  console.log(`可回填 BID:        ${ok.length}  (name 补 ${filledName}，覆盖占位 ${replacedPlaceholder})`)
  console.log(`未上传谱(占位/缺 BID): ${unsubmitted.length}  → 需手动处理`)
  console.log(`R2 无文件:         ${noFile.length}  → 需重传或确认`)
  console.log(`解析出错/无.osu:   ${errored.length}`)
  console.log('═══════════════════════════════════════════')

  const dump = (label, arr, extra) => {
    if (arr.length === 0) return
    console.log(`\n--- ${label} (${arr.length}) ---`)
    for (const r of arr) console.log(`  ${r.tid} / ${r.rid} / ${r.slot}${extra ? extra(r) : ''}`)
  }
  dump('未上传谱 (BeatmapID 占位/缺失)', unsubmitted)
  dump('R2 无文件', noFile)
  dump('解析出错', errored, (r) => `  [${r.status}${r.error ? ': ' + r.error : ''}]`)

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    ok,
    unsubmitted,
    noFile,
    errored,
  }
  const reportPath = path.join(ROOT, 'backfill-bid-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\n详细报告: ${reportPath}`)

  if (!apply) {
    console.log('\n这是 DRY-RUN，未写任何文件。确认无误后加 --apply 实际回填。')
  } else {
    console.log(`\n已写回 ${byFile.size} 个 JSON 文件，回填 ${filledBid} 个 beatmapId。`)
    console.log('接下来: git diff 核对 → 提交 → 推送触发重建。')
  }
}

const isMain =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY'].filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing R2 credentials. Set ${missing.join(', ')}.`)
    process.exit(1)
  }
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
