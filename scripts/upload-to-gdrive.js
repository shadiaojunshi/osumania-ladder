const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GDRIVE_REFRESH_TOKEN
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !FOLDER_ID) {
  console.error('Missing GDRIVE_* env vars')
  process.exit(1)
}

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

async function withRetry(fn, { attempts = 3, baseDelayMs = 1500, label = 'op' } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (isFatalAuthError(err)) throw err // 认证失效重试也没用
      lastErr = err
      if (i < attempts) {
        const delay = baseDelayMs * Math.pow(2, i - 1)
        console.warn(`  ${label} 第 ${i}/${attempts} 次失败: ${err.message} —— ${delay}ms 后重试`)
        await new Promise((r) => setTimeout(r, delay))
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

async function uploadOrUpdate(drive, body, fileName, knownFileId) {
  const media = { mimeType: 'application/octet-stream', body }
  let fileId = knownFileId

  if (fileId) {
    try {
      await drive.files.update({ fileId, media, supportsAllDrives: false })
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
      await drive.files.update({ fileId: existing, media, supportsAllDrives: false })
      fileId = existing
      console.log(`  Updated existing ${fileName} (id=${fileId})`)
    } else {
      const created = await drive.files.create({
        requestBody: { name: fileName, parents: [FOLDER_ID] },
        media,
        fields: 'id',
      })
      fileId = created.data.id
      console.log(`  Created ${fileName} (id=${fileId})`)
    }
  }

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  }).catch(err => {
    if (err && err.code !== 400) throw err
  })

  return fileId
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('packs-manifest.json missing — generate-pack must run first')
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  const packs = manifest.packs || []

  // 旧 manifest(generate-pack.js 在重建前转储到这)用来识别孤儿 fileId
  let prevManifest = { packs: [] }
  if (fs.existsSync(PREV_MANIFEST_PATH)) {
    prevManifest = JSON.parse(fs.readFileSync(PREV_MANIFEST_PATH, 'utf-8'))
  }

  // 来源:有 R2 凭据 → 从 R2 拉流;否则回退本地 output/(手动跑,generate 未删本地)。
  // 返回一个"每次调用都重新创建 body 的工厂"——重试时流是一次性的,必须重新获取。
  const makeBody = (fileName) => {
    if (hasR2) {
      const r2Key = fileName
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

  const uploadedFileIds = new Set()
  for (const entry of packs) {
    // manifest 里每个 pack 的文件名统一是 <realType>_<part>.osz,与 R2 键一致
    const fileName = `${entry.realType}_${entry.part}.osz`
    const getBody = makeBody(fileName)
    const knownFileId = entry.gdriveFileId || null

    try {
      const fileId = await withRetry(
        async () => uploadOrUpdate(drive, await getBody(), fileName, knownFileId),
        { label: `上传 ${fileName}` },
      )
      entry.gdriveFileId = fileId
      entry.links = entry.links || {}
      entry.links.googleDrive = `https://drive.google.com/uc?id=${fileId}&export=download`
      uploadedFileIds.add(fileId)
    } catch (err) {
      const code = err && err.code
      const msg = err && err.message
      if (code === 401 || (typeof msg === 'string' && msg.includes('invalid_grant'))) {
        console.error(`FATAL: refresh_token invalid (${msg}). Re-do OAuth Playground step.`)
        process.exit(2)
      }
      console.error(`  Failed ${fileName}: ${msg}`)
    }
  }

  // 删孤儿:旧 manifest 里有 fileId 但本次没用到的(分包数缩了 / type 删了)
  const orphanFileIds = []
  for (const old of prevManifest.packs || []) {
    if (old.gdriveFileId && !uploadedFileIds.has(old.gdriveFileId)) {
      orphanFileIds.push({ id: old.gdriveFileId, label: `${old.realType}_${old.part || '?'}` })
    }
  }
  if (orphanFileIds.length > 0) {
    console.log(`Deleting ${orphanFileIds.length} orphan file(s) on Drive...`)
    for (const o of orphanFileIds) {
      try {
        await drive.files.delete({ fileId: o.id })
        console.log(`  Deleted ${o.label} (id=${o.id})`)
      } catch (err) {
        const code = err && err.code
        if (code === 404) {
          console.log(`  ${o.label} (id=${o.id}) already gone`)
        } else {
          console.warn(`  Failed to delete ${o.label}: ${err.message}`)
        }
      }
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Manifest updated with Google Drive links')

  // .previous 是过程产物,清掉避免被 commit
  if (fs.existsSync(PREV_MANIFEST_PATH)) fs.unlinkSync(PREV_MANIFEST_PATH)
}

main().catch(err => { console.error(err); process.exit(1) })
