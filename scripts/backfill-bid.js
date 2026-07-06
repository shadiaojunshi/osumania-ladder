// 从 R2 原始 .osz 回填 beatmapId / beatmapsetId（顺带补空 name）到 tournament JSON。
//
// 背景：网站早期在"主表格批量导入"功能出现前，很多比赛的谱面文件已经上传到
// R2（maps/{tid}/{rid}/{slot}.osz），但 JSON 里没有回填 beatmapId 等元数据，
// 表现为 map 只有 {slot,type,realType,name?,difficulty}。这批图无法参与
// 「同一 beatmapId 重复检测」和合包去重。本脚本把它们的 BID 从 R2 里捞回来。
//
// 严格只增不改：
//   - 只对「缺 beatmapId」的 map 生效；
//   - 只写 beatmapId / beatmapsetId；name 仅在当前为空时补真实曲名；
//   - difficulty（人工评级）绝不触碰，其他字段也不动；
//   - R2 无对应文件、或 .osu 里 BeatmapID<=0（未上传谱）→ 跳过并列进报告，不猜不删。
//
// 复用 generate-pack.js 相同的 R2 凭证：
//   R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET
//
// 用法：
//   node scripts/backfill-bid.js              # dry-run，只出报告，不写文件（默认）
//   node scripts/backfill-bid.js --apply      # 实际写回 data/tournaments/*.json

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')
const fs = require('fs')
const path = require('path')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'osumania-ladder-maps'

const APPLY = process.argv.includes('--apply')
const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

// ---------- R2 工具 ----------

async function listAllKeys(prefix) {
  const keys = new Set()
  let token
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    if (res.Contents) for (const o of res.Contents) keys.add(o.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function downloadToBuffer(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// 从 .osz 里解析 .osu 的 [Metadata] 段。返回 { beatmapId, beatmapSetId, artist, title, version }。
async function parseOszMetadata(buffer) {
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
  console.log(`模式: ${APPLY ? '实际写回 (--apply)' : 'DRY-RUN (只出报告，加 --apply 才写)'}\n`)

  const files = fs.readdirSync(tournamentsDir).filter((f) => f.endsWith('.json'))

  // 收集所有缺 beatmapId 的 map（带定位信息）
  const targets = []
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
    for (const round of data.rounds || []) {
      for (const map of round.maps || []) {
        if (map.beatmapId) continue
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

  console.log(`缺 beatmapId 的 map 共 ${targets.length} 张`)

  // 先列出 R2 里实际存在的 maps/ 对象，避免为每张图单独 HEAD。
  console.log('列举 R2 maps/ 对象…')
  const r2Keys = await listAllKeys('maps/')
  console.log(`R2 maps/ 下有 ${r2Keys.size} 个对象\n`)

  // 拆成"有文件"和"R2 无文件"两组
  const withFile = targets.filter((t) => r2Keys.has(t.r2Key))
  const noFile = targets.filter((t) => !r2Keys.has(t.r2Key))

  console.log(`R2 里有文件、可尝试回填: ${withFile.length}`)
  console.log(`R2 里无文件、待手动处理: ${noFile.length}\n`)

  // 下载 + 解析（4 并发）
  console.log('下载并解析 .osu 元数据…')
  let done = 0
  const resolved = await mapWithConcurrency(withFile, 4, async (t) => {
    try {
      const buf = await downloadToBuffer(t.r2Key)
      const meta = await parseOszMetadata(buf)
      done++
      if (done % 50 === 0) console.log(`  已处理 ${done}/${withFile.length}…`)
      if (!meta) return { ...t, status: 'no-osu' }
      if (!meta.beatmapId || meta.beatmapId <= 0) return { ...t, status: 'unsubmitted', meta }
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
  const byFile = new Map()
  for (const r of ok) {
    if (!byFile.has(r.file)) byFile.set(r.file, [])
    byFile.get(r.file).push(r)
  }

  for (const [file, entries] of byFile) {
    const fullPath = path.join(tournamentsDir, file)
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
    let touched = false
    for (const e of entries) {
      const round = (data.rounds || []).find((rd) => rd.id === e.rid)
      if (!round) continue
      const map = (round.maps || []).find((m) => m.slot === e.slot && !m.beatmapId)
      if (!map) continue

      map.beatmapId = e.meta.beatmapId
      if (e.meta.beatmapSetId && e.meta.beatmapSetId > 0) {
        map.beatmapsetId = e.meta.beatmapSetId
      }
      filledBid++
      touched = true

      // name 仅在为空 / 等于 slot 占位时补真实曲名，不覆盖已有真实名。
      const curName = (map.name || '').trim()
      if (!curName || curName === map.slot) {
        const artist = e.meta.artist || 'Unknown'
        const title = e.meta.title || 'Unknown'
        const version = e.meta.version || 'Normal'
        map.name = `${artist} - ${title} [${version}]`
        filledName++
      }
    }
    if (touched && APPLY) {
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
    }
  }

  // ---------- 报告 ----------
  console.log('\n═══════════════════════════════════════════')
  console.log(`可回填 BID:        ${ok.length}  (name 补 ${filledName})`)
  console.log(`未上传谱(BID<=0):  ${unsubmitted.length}  → 需手动处理`)
  console.log(`R2 无文件:         ${noFile.length}  → 需重传或确认`)
  console.log(`解析出错/无.osu:   ${errored.length}`)
  console.log('═══════════════════════════════════════════')

  const dump = (label, arr, extra) => {
    if (arr.length === 0) return
    console.log(`\n--- ${label} (${arr.length}) ---`)
    for (const r of arr) console.log(`  ${r.tid} / ${r.rid} / ${r.slot}${extra ? extra(r) : ''}`)
  }
  dump('未上传谱 (BeatmapID<=0)', unsubmitted)
  dump('R2 无文件', noFile)
  dump('解析出错', errored, (r) => `  [${r.status}${r.error ? ': ' + r.error : ''}]`)

  // 完整报告落盘，方便逐条核对
  const report = { generatedAt: new Date().toISOString(), apply: APPLY, ok, unsubmitted, noFile, errored }
  const reportPath = path.join(__dirname, '..', 'backfill-bid-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\n详细报告: ${reportPath}`)

  if (!APPLY) {
    console.log('\n这是 DRY-RUN，未写任何文件。确认无误后加 --apply 实际回填。')
  } else {
    console.log(`\n已写回 ${byFile.size} 个 JSON 文件，回填 ${filledBid} 个 beatmapId。`)
    console.log('接下来: git diff 核对 → 提交 → 推送触发重建。')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
