// 每日 R2 备份 + 回收站清理脚本（由 GitHub Actions 定时调用）。
//
// 做三件事：
//   1. 增量备份：把主 bucket 的对象同步到备份 bucket（maps/）。
//      用 size + ETag 比对，只复制新增/变化的对象，省流量。
//   2. **变更前存档（2026-09-18 新增）**：覆盖镜像之前，先把镜像里那份**旧内容**
//      写进当天的快照前缀 `snapshots/<YYYY-MM-DD>/maps/…`，保留若干天后轮转删除。
//      没有这一步的话，一次覆盖就会把备份里**唯一**的好副本换成新内容 ——
//      实测攻击路径：上传页对同一槽位连改两次（`versions/` 每槽位只留一版，第 2 次就把它覆盖了）
//      + 等一晚这个备份跑过 = 那张原图在所有地方都没有好副本了。
//      有存档之后，攻击者改内容的那一晚，备份反而把"被改之前的那一份"存了下来。
//   3. 回收站清理：删除主 bucket 中 trash/ 前缀下、超过保留期的对象。
//      （KV 里的回收站元数据靠 TTL 自动过期，但 R2 文件体需要这里主动删。）
//
// 失败策略（重要）：
//   - 任何前缀「列举失败」或「复制失败」都算本次备份不完整 → 跳过全部删除（trash 清理与快照轮转）
//     并以非零退出。列举失败不会被当成"空 bucket"，权限/网络错误会明确报错。
//   - **变更前存档失败 → 该对象不覆盖镜像**（宁可让镜像暂时落后，也不把唯一的好副本换掉），
//     并计入失败（下次运行会重试）。
//   - 清理/轮转阶段自身的删除失败也计入非零退出。
//   - 镜像本身仍是同键覆盖；trash/ 与 versions/ 都不镜像：本次删除的过期 trash 对象没有第二份副本，
//     versions/（被覆盖的旧谱面）也不镜像（2026-09-14 用户定：灾难恢复要的是当前数据，
//     不镜像每个槽位的历史版本）。**快照存档存的是"变更前的镜像内容"，不是每槽位的历史版本**，
//     两者不冲突，且只在对象真的变化时才写一份。
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

// 需要镜像的前缀。versions/（被覆盖的旧谱面）**不在这里**：每个槽位只留最近一版本身
// 就已经有界，而灾难恢复要的是当前数据、不是历史版本，镜像它只是白花一倍存储。
// 备份 bucket 里若残留着早先镜像过去的 versions/ 对象，没有任何流程会去删 —— 无害的残留。
const BACKUP_PREFIXES = ['maps/']
const TRASH_PREFIX = 'trash/'

// 变更前存档的根前缀与保留天数。0 = 关闭存档与轮转（退回 2026-09-18 之前的纯镜像行为）。
const SNAPSHOT_ROOT = 'snapshots/'
const SNAPSHOT_RETENTION_DAYS = Number(process.env.R2_SNAPSHOT_RETENTION_DAYS ?? 7)

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
async function backupPrefix(client, {
  sourceBucket,
  backupBucket,
  prefix,
  snapshotPrefix = null,        // 形如 snapshots/2026-09-18/；null = 不做变更前存档
  snapshotIndex = null,         // Map<Key, {size, etag}>：当天快照已有的对象（幂等用）
  archiveBeforeOverwrite = true,
  log = console,
  redact = redactSecrets,
}) {
  const result = {
    prefix, status: 'failed', listed: false, sourceCount: 0,
    copied: 0, skipped: 0, failed: 0, archived: 0, archiveSkipped: 0, failures: [],
  }

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

    // 变更前存档：镜像里已经有一份旧内容时，先把它留到当天的快照前缀，再覆盖镜像。
    // 存档失败就**不覆盖** —— 宁可让镜像暂时落后，也不能把唯一的好副本换掉。
    if (archiveBeforeOverwrite && snapshotPrefix && existing) {
      const snapshotKey = snapshotPrefix + obj.Key
      const inSnapshot = snapshotIndex ? snapshotIndex.get(snapshotKey) : undefined
      if (inSnapshot && inSnapshot.size === existing.size && inSnapshot.etag === existing.etag) {
        result.archiveSkipped++
      } else {
        try {
          const previous = await client.send(new GetObjectCommand({ Bucket: backupBucket, Key: obj.Key }))
          const previousBody = await streamToBuffer(previous.Body)
          await client.send(
            new PutObjectCommand({
              Bucket: backupBucket,
              Key: snapshotKey,
              Body: previousBody,
              ...copyHeaders(previous),
            }),
          )
          result.archived++
        } catch (err) {
          result.failed++
          const message = redact(err && err.message)
          result.failures.push({ key: obj.Key, message: `archive failed, mirror left untouched: ${message}` })
          log.warn(`  变更前存档失败，保留镜像旧内容 ${obj.Key}: ${message}`)
          continue
        }
      }
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

async function backupAll(client, {
  sourceBucket,
  backupBucket,
  prefixes = BACKUP_PREFIXES,
  snapshotPrefix = null,
  snapshotIndex = null,
  archiveBeforeOverwrite = true,
  log = console,
  redact = redactSecrets,
}) {
  const results = []
  for (const prefix of prefixes) {
    log.log(`\n=== 备份 ${sourceBucket} -> ${backupBucket} (${prefix}) ===`)
    if (snapshotPrefix) log.log(`  变更前存档 -> ${snapshotPrefix}${prefix}`)
    results.push(
      await backupPrefix(client, {
        sourceBucket, backupBucket, prefix, snapshotPrefix, snapshotIndex, archiveBeforeOverwrite, log, redact,
      }),
    )
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

// ---------- 3. 快照轮转 ----------

// 只认 `snapshots/<YYYY-MM-DD>/...` 形状的键；别的（比如手放的说明文件）一律保留。
const SNAPSHOT_KEY_RE = /^snapshots\/(\d{4}-\d{2}-\d{2})\//

function snapshotDatePrefix(now = Date.now(), root = SNAPSHOT_ROOT) {
  return `${root}${new Date(now).toISOString().slice(0, 10)}/`
}

// 删除超过保留期的快照。返回 { root, listed, deleted, kept, ignored, failed, failures }；
// retentionDays <= 0 时返回 { disabled: true } 且不列举、不删除。
async function pruneSnapshots(client, {
  bucket,
  root = SNAPSHOT_ROOT,
  retentionDays = SNAPSHOT_RETENTION_DAYS,
  now = Date.now(),
  log = console,
  redact = redactSecrets,
} = {}) {
  const result = { root, listed: false, deleted: 0, kept: 0, ignored: 0, failed: 0, failures: [] }
  if (!(Number(retentionDays) > 0)) {
    result.disabled = true
    return result
  }

  let objects
  try {
    objects = await listAll(client, bucket, root)
  } catch (err) {
    result.error = redact(err && err.message)
    log.error(`  [${root}] 列举失败: ${result.error}`)
    return result
  }

  result.listed = true
  // YYYY-MM-DD 定长，直接按字符串比较即可。
  const cutoff = new Date(now - Number(retentionDays) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  for (const obj of objects) {
    const match = SNAPSHOT_KEY_RE.exec(obj.Key)
    if (!match) {
      result.ignored++
      continue
    }
    if (match[1] >= cutoff) {
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

function resolveExitCode({ backupResults, cleanup, snapshotPrune }) {
  if (shouldSkipCleanup(backupResults)) return 1
  if (cleanup && (!cleanup.listed || cleanup.failed > 0)) return 1
  if (snapshotPrune && !snapshotPrune.disabled && (!snapshotPrune.listed || snapshotPrune.failed > 0)) return 1
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
  snapshotRoot = SNAPSHOT_ROOT,
  snapshotRetentionDays = SNAPSHOT_RETENTION_DAYS,
  now = Date.now(),
  log = console,
  redact = redactSecrets,
} = {}) {
  const snapshotPrefix = snapshotRetentionDays > 0 ? snapshotDatePrefix(now, snapshotRoot) : null

  // 当天快照已有什么（幂等用）：同一天第二次触发时不重复写同一份存档。
  let snapshotIndex = null
  if (snapshotPrefix) {
    try {
      const existing = await listAll(client, backupBucket, snapshotPrefix)
      snapshotIndex = new Map(existing.map((o) => [o.Key, { size: o.Size, etag: o.ETag }]))
    } catch (err) {
      // 读不到不算备份失败：最坏结果是同一份存档被重复写一次（内容相同）。
      log.warn(`  读取当天快照失败（忽略，继续备份）: ${redact(err && err.message)}`)
    }
  }

  const backupResults = await backupAll(client, {
    sourceBucket, backupBucket, prefixes, snapshotPrefix, snapshotIndex, log, redact,
  })

  let cleanup = null
  let snapshotPrune = null
  if (shouldSkipCleanup(backupResults)) {
    log.error('备份未完整成功 → 跳过 trash 清理与快照轮转（不删除任何对象）。')
  } else {
    log.log(`清理 ${sourceBucket} 中超过 ${retentionDays} 天的 ${trashPrefix} 对象`)
    log.log('注意：trash/ 不做独立镜像备份，本次删除的过期对象没有第二份副本。')
    cleanup = await cleanupTrash(client, { bucket: sourceBucket, prefix: trashPrefix, retentionDays, now, log, redact })

    if (snapshotPrefix) {
      log.log(`快照轮转：删除 ${backupBucket} 中超过 ${snapshotRetentionDays} 天的 ${snapshotRoot} 快照`)
      snapshotPrune = await pruneSnapshots(client, {
        bucket: backupBucket, root: snapshotRoot, retentionDays: snapshotRetentionDays, now, log, redact,
      })
    }
  }

  return { backupResults, cleanup, snapshotPrune, exitCode: resolveExitCode({ backupResults, cleanup, snapshotPrune }) }
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

  const { backupResults, cleanup, snapshotPrune, exitCode } = await runBackupJob(client, {
    sourceBucket: R2_BUCKET,
    backupBucket: R2_BACKUP_BUCKET,
  })

  for (const r of backupResults) {
    console.log(
      `备份 ${r.prefix}：源 ${r.sourceCount}，新增/更新 ${r.copied}，跳过 ${r.skipped}，` +
        `变更前存档 ${r.archived}（已有同内容快照 ${r.archiveSkipped}），失败 ${r.failed}`,
    )
  }

  if (snapshotPrune && !snapshotPrune.disabled) {
    console.log(
      `快照轮转：删除 ${snapshotPrune.deleted}，保留 ${snapshotPrune.kept}，` +
        `非日期键跳过 ${snapshotPrune.ignored}，失败 ${snapshotPrune.failed}`,
    )
  }

  if (cleanup) {
    console.log(`回收站清理完成：删除 ${cleanup.deleted}，保留 ${cleanup.kept}，失败 ${cleanup.failed}`)
  } else {
    console.error('未执行 trash 清理。')
  }

  console.log('\n=== 汇总 ===')
  console.log(JSON.stringify({ backup: backupResults, trashCleanup: cleanup, snapshotPrune, exitCode }, null, 2))
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
  SNAPSHOT_ROOT,
  SNAPSHOT_RETENTION_DAYS,
  BACKUP_PREFIXES,
  redactSecrets,
  listAll,
  copyHeaders,
  snapshotDatePrefix,
  backupPrefix,
  backupAll,
  shouldSkipCleanup,
  cleanupTrash,
  pruneSnapshots,
  resolveExitCode,
  runBackupJob,
}
