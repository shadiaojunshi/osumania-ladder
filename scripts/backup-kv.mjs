// KV 备份：把管理员名单、审计日志、回收站元数据导出到 R2 备份桶。
//
// 为什么单独一个脚本：`backup-r2.js` 只处理 **R2 对象**（用 R2 的 S3 凭据），而 KV 必须走
// **Cloudflare API**（另一套凭据：API token + account id + namespace id）。混在一起的话，
// 任一侧的凭据缺失会连带拖垮另一侧 —— 而 R2 备份是每天都要跑的关键任务。
//
// 为什么需要它（2026-09-20 核查发现）：`RECOVERY-RUNBOOK.md` 原来只覆盖了「比赛 JSON 在 git」
// 与「maps/ 的 .osz 有每日快照」两类，**KV 完全不在任何恢复路径里**。其中：
//   · `admins` 丢了还能靠 `BOOTSTRAP_OWNER_UID` 进后台重建，问题不大；
//   · `audit:` 丢了 → **事后无法取证**，这是真正不可恢复的损失；
//   · `trash:` 丢了 → 后台回收站列表看不到（但 R2 里 `trash/` 的对象键是自描述的，能手工救）。
//
// 失败策略：**读不全也写**，但在快照里记 `failures` 并让进程非零退出。
// 理由与 backup-r2 相反 —— 那里"不完整就跳过删除"，这里"有洞的快照也好过没有快照"，
// 因为 KV 没有第二份副本；洞本身被显式记下来，恢复时能看见。
//
// 凭据（前三个是本脚本新增的，仓库里没有）：
//   CF_API_TOKEN        —— 需要「KV Storage:Read」权限（Account 级）
//   CF_ACCOUNT_ID       —— Cloudflare 账号 id
//   CF_KV_NAMESPACE_ID  —— LADDER_KV 的 namespace id
//   R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BACKUP_BUCKET —— 复用备份那条链

import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { pathToFileURL } from 'node:url'

export const KV_BACKUP_PREFIX = 'kv-snapshots/'
export const DEFAULT_RETENTION_DAYS = 30

/** 单次 bulk/get 的上限（Cloudflare API 规定）。 */
export const BULK_GET_LIMIT = 100

/**
 * 要备份的 key 规则。**只列这三类**：其余（如 `trashop:` 幂等标记）是短期过程数据，
 * 过期就自动消失，备份它们只会让快照膨胀。
 */
export const BACKUP_RULES = [
  { label: 'admins', match: (key) => key === 'admins' },
  { label: 'audit', match: (key) => key.startsWith('audit:') },
  { label: 'trash', match: (key) => key.startsWith('trash:') },
]

export function classifyKey(key) {
  const rule = BACKUP_RULES.find((item) => item.match(key))
  return rule ? rule.label : null
}

export function shouldBackup(key) {
  return classifyKey(key) !== null
}

/** UTC 日期串（`YYYY-MM-DD`）—— 与 R2 快照同一天界。 */
export function dateString(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/** `kv-snapshots/2026-09-20.json` */
export function snapshotObjectKey(nowMs, prefix = KV_BACKUP_PREFIX) {
  return `${prefix}${dateString(nowMs)}.json`
}

const SNAPSHOT_KEY_RE = /^kv-snapshots\/(\d{4}-\d{2}-\d{2})\.json$/

/** 从对象键解析出快照日期；不是这个形状（比如手放的说明文件）返回 null —— 那种一律不删。 */
export function snapshotDateOf(key) {
  const match = SNAPSHOT_KEY_RE.exec(key)
  return match ? match[1] : null
}

/** 快照是否已过保留期。日期串畸形时返回 false（**不删**，宁可留着）。 */
export function isExpired(dateStr, nowMs, retentionDays) {
  if (!dateStr) return false
  const ts = Date.parse(`${dateStr}T00:00:00.000Z`)
  if (!Number.isFinite(ts)) return false
  return nowMs - ts > retentionDays * 24 * 60 * 60 * 1000
}

export function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * 组装要写进备份桶的内容。
 *
 * 形状刻意做成"一个对象装全部"：恢复时读一份就够，不必列举 + N 次 get。
 * KV 的 key 里含 `:`（`audit:` / `trash:`）不适合当路径，所以放进 `items` 的键而不是对象名。
 */
export function buildSnapshot({ items, missing = [], nowMs, namespaceId }) {
  const counts = { admins: 0, audit: 0, trash: 0 }
  for (const key of Object.keys(items)) {
    const label = classifyKey(key)
    if (label) counts[label]++
  }
  return {
    schemaVersion: 1,
    exportedAt: new Date(nowMs).toISOString(),
    namespaceId,
    counts,
    /** 列到了却没读到值的 key —— 恢复时要知道快照是有洞的。 */
    failures: [...missing].sort(),
    items,
  }
}

// ---------------------------------------------------------------------------
// Cloudflare API
// ---------------------------------------------------------------------------

const CF_API = 'https://api.cloudflare.com/client/v4'

async function cfFetch(path, token, { method = 'GET', body, fetchImpl = fetch, attempts = 3 } = {}) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(`${CF_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const parsed = await res.json()
      if (!res.ok || parsed?.success === false) {
        // 权限/参数错误重试没有意义，但这里仍走统一重试：网络层 5xx 也会落到这条。
        const detail = (parsed?.errors || []).map((e) => `${e.code}:${e.message}`).join('; ')
        throw new Error(`Cloudflare API ${res.status} ${detail || ''}`.trim())
      }
      return parsed.result
    } catch (err) {
      lastError = err
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastError
}

/** 列出 namespace 下**全部** key（自带分页）。 */
export async function listAllKvKeys({ accountId, namespaceId, token, fetchImpl, limit = 1000, log = console }) {
  const keys = []
  let cursor = ''
  let page = 0
  do {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor) query.set('cursor', cursor)
    const result = await cfFetch(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?${query}`,
      token,
      { fetchImpl },
    )
    const list = Array.isArray(result) ? result : result?.keys || []
    for (const item of list) if (item?.name) keys.push(item.name)
    cursor = (Array.isArray(result) ? '' : result?.cursor) || ''
    page++
    if (page % 5 === 0) log.log(`  已列举 ${keys.length} 个 key…`)
  } while (cursor)
  return keys
}

/**
 * 批量取值。
 *
 * Cloudflare 的 `bulk/get` 一次最多 100 个，而且**只返回 JSON 值** —— 非 JSON 或读不到的 key
 * 不会出现在结果里。所以这里把「请求过的 key 减去返回的 key」显式记成 missing，
 * 而不是悄悄吞掉（恢复时得能看见快照哪里有洞）。
 *
 * bulk 整批失败时退化成逐个 `GET /values/{key}`：慢，但不会因为一个坏 key 丢掉整批。
 */
export async function bulkGetValues({ accountId, namespaceId, token, keys, fetchImpl, log = console }) {
  const values = {}
  const missing = []
  const batches = chunk(keys, BULK_GET_LIMIT)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    let got = null
    try {
      const result = await cfFetch(
        `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/get`,
        token,
        { method: 'POST', body: { keys: batch }, fetchImpl },
      )
      got = result?.values && typeof result.values === 'object' ? result.values : null
    } catch (err) {
      log.warn(`  bulk/get 第 ${i + 1} 批失败，退化为逐个读取: ${err && err.message}`)
    }

    if (got === null) {
      // 退化路径：逐个读。每个 key 一次请求，慢但精确。
      for (const key of batch) {
        try {
          const value = await cfFetch(
            `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
            token,
            { fetchImpl },
          )
          if (value === undefined || value === null) missing.push(key)
          else values[key] = value
        } catch {
          missing.push(key)
        }
      }
      continue
    }

    for (const key of batch) {
      if (Object.prototype.hasOwnProperty.call(got, key)) values[key] = got[key]
      else missing.push(key)
    }
  }

  return { values, missing: missing.sort() }
}

// ---------------------------------------------------------------------------
// 保留期轮转
// ---------------------------------------------------------------------------

/**
 * 算该删哪些旧快照。**只认 `kv-snapshots/<日期>.json` 这个形状** ——
 * 别的东西（比如手放的说明文件）一律保留，与 backup-r2 的 `SNAPSHOT_KEY_RE` 同一个谨慎。
 */
export function expiredSnapshots(bucketKeys, nowMs, retentionDays) {
  const out = []
  for (const key of bucketKeys) {
    const date = snapshotDateOf(key)
    if (!date) continue
    if (isExpired(date, nowMs, retentionDays)) out.push(key)
  }
  return out.sort()
}

export async function pruneOldSnapshots({ s3, bucket, nowMs, retentionDays, log = console }) {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: KV_BACKUP_PREFIX }))
  const keys = (list.Contents || []).map((o) => o.Key).filter(Boolean)
  const expired = expiredSnapshots(keys, nowMs, retentionDays)
  let failed = 0
  for (const key of expired) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      log.log(`  已删除过期快照 ${key}`)
    } catch (err) {
      failed++
      log.warn(`  删除失败 ${key}: ${err && err.message}`)
    }
  }
  return { listed: keys.length, expired: expired.length, failed }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function redact(message) {
  return String(message || '').replace(/(key|token|secret)=[^&\s]*/gi, '$1=***')
}

export function resolveExitCode({ listFailed, missing, prune }) {
  if (listFailed) return 1
  if (missing && missing.length > 0) return 1
  if (prune && prune.failed > 0) return 1
  return 0
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const accountId = process.env.CF_ACCOUNT_ID
  const namespaceId = process.env.CF_KV_NAMESPACE_ID
  const token = process.env.CF_API_TOKEN
  const r2AccountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY
  const secretKey = process.env.R2_SECRET_KEY
  const backupBucket = process.env.R2_BACKUP_BUCKET || 'osumania-ladder-maps-backup'
  const retentionDays = Number(process.env.KV_SNAPSHOT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS)

  const missingEnv = []
  for (const [name, value] of Object.entries({ CF_ACCOUNT_ID: accountId, CF_KV_NAMESPACE_ID: namespaceId, CF_API_TOKEN: token })) {
    if (!value) missingEnv.push(name)
  }
  if (missingEnv.length > 0) {
    console.error(`缺少环境变量: ${missingEnv.join(', ')}`)
    console.error('说明：KV 备份走 Cloudflare API，需要与 R2 不同的凭据 —— 见 RECOVERY-RUNBOOK.md §0.2。')
    process.exit(1)
  }

  console.log(`模式: ${dryRun ? 'DRY-RUN（只报告，不写）' : '实际备份'}`)
  console.log(`保留期: ${retentionDays} 天\n`)

  let allKeys = []
  let listFailed = false
  try {
    console.log('列举 KV keys…')
    allKeys = await listAllKvKeys({ accountId, namespaceId, token })
  } catch (err) {
    listFailed = true
    console.error(`列举 KV keys 失败: ${redact(err && err.message)}`)
  }

  const targets = allKeys.filter(shouldBackup)
  const counts = {}
  for (const key of targets) {
    const label = classifyKey(key)
    counts[label] = (counts[label] || 0) + 1
  }
  console.log(`KV 共 ${allKeys.length} 个 key，其中要备份的 ${targets.length} 个`)
  for (const [label, n] of Object.entries(counts)) console.log(`  ${label}: ${n}`)
  console.log(`（跳过的 ${allKeys.length - targets.length} 个是短期过程数据，如 trashop:）\n`)

  if (listFailed) {
    console.error('列举失败，本次不写快照、也不做轮转（避免用一份不完整的数据覆盖良好快照）。')
    process.exit(1)
  }

  let values = {}
  let missing = []
  if (targets.length > 0) {
    console.log('读取值…')
    const got = await bulkGetValues({ accountId, namespaceId, token, keys: targets })
    values = got.values
    missing = got.missing
    console.log(`读到 ${Object.keys(values).length} 个，缺失 ${missing.length} 个`)
    if (missing.length > 0) console.warn(`  缺失示例: ${missing.slice(0, 5).join(', ')}`)
  }

  const nowMs = Date.now()
  const snapshot = buildSnapshot({ items: values, missing, nowMs, namespaceId })
  const key = snapshotObjectKey(nowMs)
  const body = JSON.stringify(snapshot, null, 2)
  console.log(`\n快照 ${key} — ${(Buffer.byteLength(body) / 1024).toFixed(1)}KB`)

  let prune = null
  if (!dryRun) {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    })
    await s3.send(
      new PutObjectCommand({ Bucket: backupBucket, Key: key, Body: body, ContentType: 'application/json' }),
    )
    console.log('已写入备份桶。')
    if (retentionDays > 0) {
      console.log('轮转旧快照…')
      prune = await pruneOldSnapshots({ s3, bucket: backupBucket, nowMs, retentionDays })
    } else {
      console.log('保留期为 0，跳过轮转。')
    }
  } else {
    console.log('（dry-run，未写入）')
  }

  const exitCode = resolveExitCode({ listFailed, missing, prune })
  if (exitCode !== 0 && missing.length > 0) {
    console.error(`\n⚠️ 有 ${missing.length} 个 key 没读到 —— 快照已写明 failures 字段，但这次退出码非零。`)
  }
  process.exit(exitCode)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`备份失败: ${redact(err && err.message)}`)
    process.exit(1)
  })
}

