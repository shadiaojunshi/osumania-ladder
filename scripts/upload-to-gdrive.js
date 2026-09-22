const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GDRIVE_REFRESH_TOKEN
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID

// 合包在 CI 上不再落盘本地(output/ 只是 generate 阶段的临时缓冲,R2 上传后即删)。
// Drive 上传优先从 R2 packs 桶拉流直传,避免 runner 磁盘再次被全量包撑爆(14GB);
// 本地手动跑(没配 R2_* 但 output/ 里有包)时回退到读本地文件。
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_PACKS_BUCKET = process.env.R2_PACKS_BUCKET || 'osumania-ladder-packs'
const hasR2 = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY)

const s3 = hasR2 ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
}) : null

const OUTPUT_DIR = path.join(__dirname, '..', 'output')
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'packs-manifest.json')
const PREV_MANIFEST_PATH = path.join(__dirname, '..', 'data', 'packs-manifest.previous.json')

// auth 类错误(401 / invalid_grant)不重试,直接抛给上层 fail-fast;其余(网络抖动 /
// 5xx / 超时)带指数退避重试。每次重试内部会重新 createReadStream,不会复用坏流。
function isFatalAuthError(err) {
  const code = err && err.code
  const msg = (err && err.message) || ''
  return code === 401 || (typeof msg === 'string' && msg.includes('invalid_grant'))
}

async function withRetry(fn, { attempts = 3, baseDelayMs = 1500, label = 'op', delay = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (isFatalAuthError(err)) throw err // 认证失效重试也没用
      lastErr = err
      if (i < attempts) {
        const wait = baseDelayMs * Math.pow(2, i - 1)
        console.warn(`  ${label} 第 ${i}/${attempts} 次失败: ${err.message} —— ${wait}ms 后重试`)
        await delay(wait)
      }
    }
  }
  throw lastErr
}

function getAuth() {
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: REFRESH_TOKEN })
  return oauth2
}

// 目标 manifest 里所有仍被引用的 Drive fileId:gdriveFileId 字段 + googleDrive 链接。
// 失败包会继承旧 manifest 的 fileId(见 generate-pack.js),因此这些旧对象仍在被引用,
// 不能当作孤儿删除。
function collectReferencedFileIds(packs) {
  const ids = new Set()
  for (const p of packs || []) {
    if (p && p.gdriveFileId) ids.add(String(p.gdriveFileId))
    const url = p && p.links && p.links.googleDrive
    if (typeof url === 'string') {
      const byQuery = url.match(/[?&]id=([^&]+)/)
      const byPath = url.match(/\/file\/d\/([^/]+)/)
      if (byQuery) ids.add(byQuery[1])
      else if (byPath) ids.add(byPath[1])
    }
  }
  return ids
}

// 孤儿 = 旧 manifest 里存在、但目标 manifest 已不再引用的 Drive 文件。去重;标注来源供日志。
function computeOrphans(prevPacks, referencedIds) {
  const seen = new Set()
  const orphans = []
  for (const old of prevPacks || []) {
    const id = old && old.gdriveFileId
    if (!id) continue
    const key = String(id)
    if (referencedIds.has(key) || seen.has(key)) continue
    seen.add(key)
    orphans.push({ id: key, label: `${old.realType}_${old.part || '?'}` })
  }
  return orphans
}

// 权限 API 的 400 只在"该文件已是 anyone 可读"时可接受,其余 400 视为失败。
function isAlreadySharedError(err) {
  if (!err || err.code !== 400) return false
  const reason = err.errors && err.errors[0] && err.errors[0].reason
  if (reason === 'alreadyExists') return true
  const msg = typeof err.message === 'string' ? err.message : ''
  return /already exists|alreadyExists/i.test(msg)
}

async function findExistingFileId(drive, name) {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${FOLDER_ID}' in parents and trashed = false`
  const res = await drive.files.list({
    q,
    fields: 'files(id,name)',
    pageSize: 10,
    spaces: 'drive',
  })
  return res.data.files && res.data.files[0] ? res.data.files[0].id : null
}

// getBody 是"每次调用都返回一条全新可读流"的工厂:update/create 各自消费一条,
// 404 回退重传时也必须拿到新流(旧流已被上一次请求消费)。
async function uploadOrUpdate(drive, getBody, fileName, knownFileId) {
  let fileId = knownFileId

  if (fileId) {
    try {
      await drive.files.update({
        fileId,
        media: { mimeType: 'application/octet-stream', body: await getBody() },
        supportsAllDrives: false,
      })
      console.log(`  Updated ${fileName} (id=${fileId})`)
    } catch (err) {
      const status = err && err.code
      if (status === 404) {
        console.log(`  Stored fileId ${fileId} not found, creating new`)
        fileId = null
      } else {
        throw err
      }
    }
  }

  if (!fileId) {
    const existing = await findExistingFileId(drive, fileName)
    if (existing) {
      await drive.files.update({
        fileId: existing,
        media: { mimeType: 'application/octet-stream', body: await getBody() },
        supportsAllDrives: false,
      })
      fileId = existing
      console.log(`  Updated existing ${fileName} (id=${fileId})`)
    } else {
      const created = await drive.files.create({
        requestBody: { name: fileName, parents: [FOLDER_ID] },
        media: { mimeType: 'application/octet-stream', body: await getBody() },
        fields: 'id',
      })
      fileId = created.data.id
      console.log(`  Created ${fileName} (id=${fileId})`)
    }
  }

  await ensureAnyoneReader(drive, fileId)

  return fileId
}

async function ensureAnyoneReader(drive, fileId) {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    })
  } catch (err) {
    // 已经是公开可读 → 幂等可接受;其它 400/5xx 交给上层按失败处理。
    if (isAlreadySharedError(err)) return
    throw err
  }
}

async function deleteOrphans(drive, orphans, log = console) {
  if (!orphans.length) return
  log.log(`Deleting ${orphans.length} orphan file(s) on Drive...`)
  for (const o of orphans) {
    try {
      await drive.files.delete({ fileId: o.id })
      log.log(`  Deleted ${o.label} (id=${o.id})`)
    } catch (err) {
      const code = err && err.code
      if (code === 404) {
        log.log(`  ${o.label} (id=${o.id}) already gone`)
      } else {
        throw err
      }
    }
  }
}

/**
 * 把一个包同步到 Drive。
 *
 * **版本化上传**：R2 对象键是内容寻址的 `{realType}_{part}.{hash8}.osz`，Drive 侧用**同一个名字**。
 *   · 同名即同内容 → 清单里已记着"这个内容键"对应的文件 id、或 Drive 上已有同名文件，
 *     就直接复用，**不必再传一遍**（重跑能省下整轮流量）。
 *   · 内容变了 → 新键 → Drive 上新建文件，旧文件原地不动。旧文件只是"不再被清单引用"，
 *     由孤儿报告列出。这样两个镜像要么都指旧版、要么都指新版，不会半新半旧。
 *   · 历史条目（没有 objectKey）沿用按名字覆盖的老行为 —— 否则 Drive 里会多出同名副本，
 *     而线上旧清单的链接还指向老 id。
 */
async function syncOnePack(drive, entry, makeBody, delay, log = console) {
  // pendingMirrors 与人工核查用的是这个稳定键（不带哈希）
  const manifestKey = `${entry.realType}_${entry.part}.osz`
  const versioned = typeof entry.objectKey === 'string' && entry.objectKey.length > 0
  const driveName = versioned ? entry.objectKey : manifestKey
  const getBody = makeBody(manifestKey, entry.objectKey)

  if (!versioned) {
    const fileId = await withRetry(
      () => uploadOrUpdate(drive, getBody, driveName, entry.gdriveFileId || null),
      { label: `上传 ${driveName}`, delay },
    )
    entry.gdriveObjectKey = null
    return { fileId, skipped: false }
  }

  // ① 清单里已经记着这个内容键对应的文件 → 复用
  if (entry.gdriveObjectKey === entry.objectKey && entry.gdriveFileId) {
    await ensureAnyoneReader(drive, entry.gdriveFileId)
    entry.gdriveObjectKey = entry.objectKey
    return { fileId: entry.gdriveFileId, skipped: true }
  }
  // ② Drive 上已有同名文件（上次跑到一半、或清单被回滚过）→ 同一份内容
  const existing = await findExistingFileId(drive, driveName)
  if (existing) {
    await ensureAnyoneReader(drive, existing)
    entry.gdriveObjectKey = entry.objectKey
    return { fileId: existing, skipped: true }
  }
  // ③ 新建
  const created = await withRetry(async () => {
    const res = await drive.files.create({
      requestBody: { name: driveName, parents: [FOLDER_ID] },
      media: { mimeType: 'application/octet-stream', body: await getBody() },
      fields: 'id',
    })
    return res.data.id
  }, { label: `上传 ${driveName}`, delay })
  await ensureAnyoneReader(drive, created)
  entry.gdriveObjectKey = entry.objectKey
  return { fileId: created, skipped: false }
}

// 上传所有 pack。返回 { failed, succeeded, skipped, orphans }。
// 只写内存中的 entry,不做任何删除——删除决定留给调用方,确保失败时不误删。
async function runDriveSync({ drive, packs, prevPacks, makeBody, log = console, delay, targetType = null }) {
  const failed = []
  const succeeded = []
  let skipped = 0
  for (const entry of packs) {
    if (targetType && entry.realType !== targetType) continue
    const manifestKey = `${entry.realType}_${entry.part}.osz`
    try {
      const { fileId, skipped: wasSkipped } = await syncOnePack(drive, entry, makeBody, delay, log)
      if (wasSkipped) {
        skipped++
        log.log(`  Skipped ${entry.objectKey || manifestKey}（内容已在 Drive 上）`)
      }
      entry.gdriveFileId = fileId
      entry.links = entry.links || {}
      entry.links.googleDrive = `https://drive.google.com/uc?id=${fileId}&export=download`
      succeeded.push(manifestKey)
    } catch (err) {
      // 认证失效不可恢复,直接抛给 main 做 fail-fast。
      if (isFatalAuthError(err)) throw err
      failed.push({ fileName: manifestKey, message: err && err.message })
      // 注意:失败时**不动** entry.links.googleDrive —— 那个链接此刻指向的是旧内容。
      // 链接不删(人工维护的镜像不能凭空消失),但包名会留在 manifest 顶层的
      // pendingMirrors 里,供下载页与人工核查识别"这个镜像还没同步"。
      log.error(`  Failed ${manifestKey}: ${err && err.message}`)
    }
  }

  const referencedIds = collectReferencedFileIds(packs)
  // 任一失败 → 本次不做任何孤儿清理(保留旧文件,便于重跑恢复)。
  const orphans = failed.length === 0 ? computeOrphans(
    targetType ? (prevPacks || []).filter(p => p.realType === targetType) : prevPacks, referencedIds,
  ) : []
  return { failed, succeeded, skipped, referencedIds, orphans }
}

function assertDriveEnv() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !FOLDER_ID) {
    console.error('Missing GDRIVE_* env vars')
    process.exit(1)
  }
}

// 空 manifest 绝不能继续往下走:孤儿判定是「上一版引用的 fileId − 本版引用的 fileId」,
// 本版为空 = 上一版全部被判成孤儿,Drive 上所有包会被一次性删掉。
// (manifest 为空的常见来源:generate-pack 没产出包、或 manifest 被半截写入。)
function assertNonEmptyPacks(packs) {
  if (!Array.isArray(packs) || packs.length === 0) {
    throw new Error(
      'packs-manifest.json 里没有任何包（packs 为空）——拒绝执行，避免把上一版全部当成孤儿删除。请先跑 generate-pack 产出包。'
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some(a => a !== '--type=TB' && a !== '--clean-orphans')) throw new Error('只支持 --type=TB 或 --clean-orphans')
  const targetType = args.includes('--type=TB') ? 'TB' : null
  if (targetType && args.includes('--clean-orphans')) throw new Error('TB 专项同步不能清理旧文件')
  assertDriveEnv()
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('packs-manifest.json missing — generate-pack must run first')
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  const packs = manifest.packs || []
  assertNonEmptyPacks(packs)
  if (targetType && !packs.some(p => p.realType === targetType)) throw new Error('清单没有 TB 包，拒绝同步')

  // 旧 manifest(generate-pack.js 在重建前转储到这)用来识别孤儿 fileId
  let prevManifest = { packs: [] }
  if (fs.existsSync(PREV_MANIFEST_PATH)) {
    prevManifest = JSON.parse(fs.readFileSync(PREV_MANIFEST_PATH, 'utf-8'))
  }

  // 来源:有 R2 凭据 → 从 R2 拉流;否则回退本地 output/(手动跑,generate 未删本地)。
  // 返回一个"每次调用都重新创建 body 的工厂"——重试时流是一次性的,必须重新获取。
  // R2 键用清单里的 `objectKey`（内容寻址，带哈希）；历史条目没有这个字段时回退旧命名。
  const makeBody = (fileName, objectKey) => {
    if (hasR2) {
      const r2Key = objectKey || fileName
      return async () => {
        const getRes = await s3.send(new GetObjectCommand({ Bucket: R2_PACKS_BUCKET, Key: r2Key }))
        return getRes.Body
      }
    }
    const filePath = path.join(OUTPUT_DIR, fileName)
    return () => fs.createReadStream(filePath)
  }

  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  console.log(`Uploading ${packs.length} pack(s) to Google Drive (source: ${hasR2 ? 'R2' : 'local output/'})...`)

  let result
  try {
    result = await runDriveSync({ drive, packs, prevPacks: prevManifest.packs, makeBody, targetType })
  } catch (err) {
    const msg = err && err.message
    if (isFatalAuthError(err)) {
      console.error(`FATAL: refresh_token invalid (${msg}). Re-do OAuth Playground step.`)
      process.exit(2)
    }
    throw err
  }

  const { failed, orphans, succeeded, skipped } = result

  // pendingMirrors 清账：本次成功同步的包划掉；失败 / 未涉及的保留标记。
  // 失败包的镜像链接此刻仍指向旧内容，标记不能撤 —— 一撤就等于宣称"镜像已更新"。
  if (Array.isArray(manifest.pendingMirrors)) {
    const done = new Set(succeeded)
    const stillPending = manifest.pendingMirrors.filter((k) => !done.has(k))
    if (stillPending.length > 0) manifest.pendingMirrors = stillPending
    else delete manifest.pendingMirrors
  }

  // 先落盘进度(失败包保留上一版的旧链接,manifest 不会指向坏对象),再决定是否清理。
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Manifest updated with Google Drive links')
  if (skipped > 0) {
    console.log(`${skipped} 个包的内容已在 Drive 上（同名即同内容），本次跳过上传。`)
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} pack(s) failed to upload — orphan cleanup skipped, no Drive file was deleted.`)
    for (const f of failed) console.error(`  - ${f.fileName}: ${f.message}`)
    if (Array.isArray(manifest.pendingMirrors) && manifest.pendingMirrors.length > 0) {
      console.error('以下包的镜像链接仍指向旧内容（已记在 manifest 的 pendingMirrors 里）：')
      console.error(`  ${manifest.pendingMirrors.join(', ')}`)
    }
    console.error('packs-manifest.previous.json kept; re-run this job to resume.')
    process.exit(1)
  }

  // Drive 的孤儿清理**默认只报告**（另一条线的审查 P1）：
  // 本脚本无法知道 workflow 的 git push 是否成功，而线上**旧** manifest 仍可能引用这些
  // fileId —— push 失败时删掉它们，下载页会立刻断链。所以真删要显式开关，且必须在
  // 确认线上 manifest 已是新版之后。
  if (orphans.length > 0) {
    const clean = process.argv.slice(2).includes('--clean-orphans')
    if (clean) {
      await deleteOrphans(drive, orphans)
    } else {
      console.warn(`\n发现 ${orphans.length} 个 Drive 孤儿文件（旧清单引用、新清单不再引用）:`)
      for (const o of orphans) console.warn(`  - ${o.label} (id=${o.id})`)
      console.warn('本次**不删除**。确认线上 manifest 已经是新版（git push 成功、Pages 已部署）之后，')
      console.warn('再单独跑一次并加 --clean-orphans。')
    }
  }

  // .previous 是过程产物,全部成功后才清掉避免被 commit
  if (!targetType && fs.existsSync(PREV_MANIFEST_PATH)) fs.unlinkSync(PREV_MANIFEST_PATH)
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1) })
}

module.exports = {
  assertNonEmptyPacks,
  isFatalAuthError,
  withRetry,
  collectReferencedFileIds,
  computeOrphans,
  isAlreadySharedError,
  uploadOrUpdate,
  ensureAnyoneReader,
  deleteOrphans,
  runDriveSync,
}
