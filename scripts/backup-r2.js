// 每日 R2 备份 + 回收站清理脚本（由 GitHub Actions 定时调用）。
//
// 做两件事：
//   1. 增量备份：把主 bucket 的对象同步到备份 bucket（maps/ + versions/）。
//      用 size + ETag 比对，只复制新增/变化的对象，省流量。
//   2. 回收站清理：删除主 bucket 中 trash/ 前缀下、超过保留期的对象。
//      （KV 里的回收站元数据靠 TTL 自动过期，但 R2 文件体需要这里主动删。）
//
// 失败策略（重要）：
//   - 任何前缀「列举失败」或「复制失败」都算本次备份不完整 → 跳过全部 trash 清理并以非零退出。
//     列举失败不会被当成"空 bucket"，权限/网络错误会明确报错。
//   - 清理阶段自身的删除失败也计入非零退出。
//   - 备份 bucket 用的是同键覆盖（镜像），不是版本历史；trash/ 不做独立镜像备份，
//     因此本次删除的过期 trash 对象没有第二份副本。R06 的 versions/ 会随本脚本一起备份。
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

// 需要镜像的前缀。versions/ 由 R06 引入，不存在时列举结果为空，属正常情况。
const BACKUP_PREFIXES = ['maps/', 'versions/']
const TRASH_PREFIX = 'trash/'

let s3 = null

function getClient() {
  if (!s3) {
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    })
  }
  return s3
}

function assertEnv() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.')
    process.exit(1)
  }
}

// 日志里若意外带上凭据值,一律打码(验收要求失败日志不含密钥)。
function redactSecrets(text, secrets = [R2_ACCESS_KEY, R2_SECRET_KEY]) {
  let out = String(text == null ? '' : text)
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 6) out = out.split(secret).join('[redacted]')
  }
  return out
}

async function listAll(client, bucket, prefix) {
  const out = []
  let token
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    )
    if (res.Contents) out.push(...res.Contents)
    // 被截断却没有续页 token 是异常的(会静默漏对象),必须报错而不是返回部分清单。
    if (res.IsTruncated && !res.NextContinuationToken) {
      throw new Error(`listing ${bucket} prefix=${prefix} truncated without a continuation token`)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// 复制时保留恢复所需的对象属性(至少 ContentType;元数据/缓存头一并带上)。
function copyHeaders(got) {
  const headers = { ContentType: got.ContentType || 'application/octet-stream' }
  if (got.Metadata && Object.keys(got.Metadata).length > 0) headers.Metadata = got.Metadata
  if (got.CacheControl) headers.CacheControl = got.CacheControl
  if (got.ContentDisposition) headers.ContentDisposition = got.ContentDisposition
  if (got.ContentEncoding) headers.ContentEncoding = got.ContentEncoding
  if (got.ContentLanguage) headers.ContentLanguage = got.ContentLanguage
  return headers
}

// ---------- 1. 增量备份 ----------

// 备份单个前缀。返回 status: 'ok' | 'failed'。
// 列举失败 → status 'failed' 且不把源对象数当成 0(区分"真的空"与"读不到")。
async function backupPrefix(client, { sourceBucket, backupBucket, prefix, log = console, redact = redactSecrets }) {
  const result = { prefix, status: 'failed', listed: false, sourceCount: 0, copied: 0, skipped: 0, failed: 0, failures: [] }

  let sourceObjects
  let backupObjects
  try {
    sourceObjects = await listAll(client, sourceBucket, prefix)
    backupObjects = await listAll(client, backupBucket, prefix)
  } catch (err) {
    result.error = redact(err && err.message)
    log.error(`  [${prefix}] 列举失败(权限或网络问题?): ${result.error}`)
    return result
  }

  result.listed = true
  result.sourceCount = sourceObjects.length
  const backupIndex = new Map()
  for (const o of backupObjects) backupIndex.set(o.Key, { size: o.Size, etag: o.ETag })

  for (const obj of sourceObjects) {
    const existing = backupIndex.get(obj.Key)
    // size 与 etag 都一致则认为未变，跳过。
    if (existing && existing.size === obj.Size && existing.etag === obj.ETag) {
      result.skipped++
      continue
    }
    try {
      const got = await client.send(new GetObjectCommand({ Bucket: sourceBucket, Key: obj.Key }))
      const body = await streamToBuffer(got.Body)
      await client.send(
        new PutObjectCommand({
          Bucket: backupBucket,
          Key: obj.Key,
          Body: body,
          ...copyHeaders(got),
        }),
      )
      result.copied++
      if (result.copied % 20 === 0) log.log(`  [${prefix}] 已复制 ${result.copied} 个…`)
    } catch (err) {
      result.failed++
      const message = redact(err && err.message)
      result.failures.push({ key: obj.Key, message })
      log.warn(`  复制失败 ${obj.Key}: ${message}`)
    }
  }

  result.status = result.failed === 0 ? 'ok' : 'failed'
  return result
}

async function backupAll(client, { sourceBucket, backupBucket, prefixes = BACKUP_PREFIXES, log = console, redact = redactSecrets }) {
  const results = []
  for (const prefix of prefixes) {
    log.log(`\n=== 备份 ${sourceBucket} -> ${backupBucket} (${prefix}) ===`)
    results.push(await backupPrefix(client, { sourceBucket, backupBucket, prefix, log, redact }))
  }
  return results
}

// 备份是否完整成功。false 时禁止执行任何删除。
function shouldSkipCleanup(backupResults) {
  return backupResults.some((r) => !r || r.status !== 'ok')
}

// ---------- 2. 回收站清理 ----------

async function cleanupTrash(client, { bucket, prefix = TRASH_PREFIX, retentionDays = TRASH_RETENTION_DAYS, now = Date.now(), log = console, redact = redactSecrets } = {}) {
  const result = { prefix, listed: false, deleted: 0, kept: 0, failed: 0, failures: [] }

  let objects
  try {
    objects = await listAll(client, bucket, prefix)
  } catch (err) {
    result.error = redact(err && err.message)
    log.error(`  [${prefix}] 列举失败: ${result.error}`)
    return result
  }

  result.listed = true
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000

  for (const obj of objects) {
    const lastModified = obj.LastModified ? new Date(obj.LastModified).getTime() : 0
    if (!lastModified || lastModified >= cutoff) {
      result.kept++
      continue
    }
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
      result.deleted++
    } catch (err) {
      result.failed++
      const message = redact(err && err.message)
      result.failures.push({ key: obj.Key, message })
      log.warn(`  删除失败 ${obj.Key}: ${message}`)
    }
  }

  return result
}

function resolveExitCode({ backupResults, cleanup }) {
  if (shouldSkipCleanup(backupResults)) return 1
  if (!cleanup) return 0
  if (!cleanup.listed || cleanup.failed > 0) return 1
  return 0
}

// 一次完整作业的可测试入口:备份 → 判定 → (仅在备份完整成功时)清理。
// 返回 { backupResults, cleanup, exitCode };cleanup 为 null 表示"没有执行任何删除"。
async function runBackupJob(client, {
  sourceBucket,
  backupBucket,
  prefixes = BACKUP_PREFIXES,
  trashPrefix = TRASH_PREFIX,
  retentionDays = TRASH_RETENTION_DAYS,
  now = Date.now(),
  log = console,
  redact = redactSecrets,
} = {}) {
  const backupResults = await backupAll(client, { sourceBucket, backupBucket, prefixes, log, redact })

  let cleanup = null
  if (shouldSkipCleanup(backupResults)) {
    log.error('备份未完整成功 → 跳过 trash 清理（不删除任何对象）。')
  } else {
    log.log(`清理 ${sourceBucket} 中超过 ${retentionDays} 天的 ${trashPrefix} 对象`)
    log.log('注意：trash/ 不做独立镜像备份，本次删除的过期对象没有第二份副本。')
    cleanup = await cleanupTrash(client, { bucket: sourceBucket, prefix: trashPrefix, retentionDays, now, log, redact })
  }

  return { backupResults, cleanup, exitCode: resolveExitCode({ backupResults, cleanup }) }
}

async function ensureBackupBucketReachable(client) {
  // 试探备份 bucket 是否可访问；不可访问时给出明确提示而不是中途崩。
  try {
    await client.send(new ListObjectsV2Command({ Bucket: R2_BACKUP_BUCKET, MaxKeys: 1 }))
  } catch (err) {
    console.error(
      `无法访问备份 bucket "${R2_BACKUP_BUCKET}"：${redactSecrets(err && err.message)}\n` +
        `请确认已在 Cloudflare R2 创建该 bucket，且 R2_BACKUP_BUCKET 环境变量正确。`,
    )
    process.exit(1)
  }
}

async function main() {
  assertEnv()
  if (R2_BACKUP_BUCKET === R2_BUCKET) {
    console.error('R2_BACKUP_BUCKET 不能与 R2_BUCKET 相同（会把备份写成自覆盖）。')
    process.exit(1)
  }

  const client = getClient()
  await ensureBackupBucketReachable(client)

  const { backupResults, cleanup, exitCode } = await runBackupJob(client, {
    sourceBucket: R2_BUCKET,
    backupBucket: R2_BACKUP_BUCKET,
  })

  for (const r of backupResults) {
    console.log(`备份 ${r.prefix}：源 ${r.sourceCount}，新增/更新 ${r.copied}，跳过 ${r.skipped}，失败 ${r.failed}`)
  }

  if (cleanup) {
    console.log(`回收站清理完成：删除 ${cleanup.deleted}，保留 ${cleanup.kept}，失败 ${cleanup.failed}`)
  } else {
    console.error('未执行 trash 清理。')
  }

  console.log('\n=== 汇总 ===')
  console.log(JSON.stringify({ backup: backupResults, trashCleanup: cleanup, exitCode }, null, 2))
  process.exitCode = exitCode
}

if (require.main === module) {
  main().catch((err) => {
    console.error(redactSecrets(err && err.stack ? err.stack : err))
    process.exit(1)
  })
}

module.exports = {
  TRASH_RETENTION_DAYS,
  BACKUP_PREFIXES,
  redactSecrets,
  listAll,
  copyHeaders,
  backupPrefix,
  backupAll,
  shouldSkipCleanup,
  cleanupTrash,
  resolveExitCode,
  runBackupJob,
}
