// 每日 R2 备份 + 回收站清理脚本（由 GitHub Actions 定时调用）。
//
// 做两件事：
//   1. 增量备份：把主 bucket 的所有对象同步到备份 bucket。
//      用 size + ETag 比对，只复制新增/变化的对象，省流量。
//   2. 回收站清理：删除主 bucket 中 trash/ 前缀下、超过保留期的对象。
//      （KV 里的回收站元数据靠 TTL 自动过期，但 R2 文件体需要这里主动删。）
//
// 复用已有的 R2 凭证 secret（与 generate-pack.js 相同）：
//   R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET
// 额外需要：R2_BACKUP_BUCKET（备份目标 bucket 名）

const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'osumania-ladder-maps'
const R2_BACKUP_BUCKET = process.env.R2_BACKUP_BUCKET || 'osumania-ladder-maps-backup'

// 回收站保留天数，需与 functions/api/_lib/trash.ts 的 RETENTION 一致。
const TRASH_RETENTION_DAYS = 30

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

async function listAll(bucket, prefix) {
  const out = []
  let token
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    )
    if (res.Contents) out.push(...res.Contents)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// ---------- 1. 增量备份 ----------

async function backup() {
  console.log(`\n=== 备份 ${R2_BUCKET} -> ${R2_BACKUP_BUCKET} ===`)

  const sourceObjects = await listAll(R2_BUCKET, 'maps/')
  console.log(`源 bucket 有 ${sourceObjects.length} 个对象（maps/ 前缀）`)

  // 拉取备份 bucket 现有清单，建 key -> {size, etag} 索引用于比对。
  const backupObjects = await listAll(R2_BACKUP_BUCKET, 'maps/')
  const backupIndex = new Map()
  for (const o of backupObjects) {
    backupIndex.set(o.Key, { size: o.Size, etag: o.ETag })
  }
  console.log(`备份 bucket 现有 ${backupObjects.length} 个对象`)

  let copied = 0
  let skipped = 0
  let failed = 0

  for (const obj of sourceObjects) {
    const existing = backupIndex.get(obj.Key)
    // size 与 etag 都一致则认为未变，跳过。
    if (existing && existing.size === obj.Size && existing.etag === obj.ETag) {
      skipped++
      continue
    }
    try {
      const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }))
      const body = await streamToBuffer(got.Body)
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BACKUP_BUCKET,
          Key: obj.Key,
          Body: body,
          ContentType: got.ContentType || 'application/octet-stream',
        }),
      )
      copied++
      if (copied % 20 === 0) console.log(`  已复制 ${copied} 个…`)
    } catch (err) {
      failed++
      console.warn(`  复制失败 ${obj.Key}: ${err.message}`)
    }
  }

  console.log(`备份完成：新增/更新 ${copied}，跳过 ${skipped}，失败 ${failed}`)
  return { copied, skipped, failed }
}

// ---------- 2. 回收站清理 ----------

async function cleanupTrash() {
  console.log(`\n=== 清理 ${R2_BUCKET} 中超过 ${TRASH_RETENTION_DAYS} 天的 trash/ 对象 ===`)

  const trashObjects = await listAll(R2_BUCKET, 'trash/')
  console.log(`trash/ 前缀下有 ${trashObjects.length} 个对象`)

  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let deleted = 0
  let kept = 0

  for (const obj of trashObjects) {
    const lastModified = obj.LastModified ? new Date(obj.LastModified).getTime() : 0
    if (lastModified && lastModified < cutoff) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }))
        deleted++
      } catch (err) {
        console.warn(`  删除失败 ${obj.Key}: ${err.message}`)
      }
    } else {
      kept++
    }
  }

  console.log(`回收站清理完成：删除 ${deleted}，保留 ${kept}`)
  return { deleted, kept }
}

async function ensureBackupBucketReachable() {
  // 试探备份 bucket 是否可访问；不可访问时给出明确提示而不是中途崩。
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: R2_BACKUP_BUCKET, MaxKeys: 1 }))
  } catch (err) {
    console.error(
      `无法访问备份 bucket "${R2_BACKUP_BUCKET}"：${err.message}\n` +
        `请确认已在 Cloudflare R2 创建该 bucket，且 R2_BACKUP_BUCKET 环境变量正确。`,
    )
    process.exit(1)
  }
}

async function main() {
  await ensureBackupBucketReachable()
  const b = await backup()
  const c = await cleanupTrash()
  console.log('\n=== 汇总 ===')
  console.log(JSON.stringify({ backup: b, trashCleanup: c }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
