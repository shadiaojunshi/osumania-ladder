const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GDRIVE_REFRESH_TOKEN
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !FOLDER_ID) {
  console.error('Missing GDRIVE_* env vars')
  process.exit(1)
}

const OUTPUT_DIR = path.join(__dirname, '..', 'output')
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'packs-manifest.json')
const PREV_MANIFEST_PATH = path.join(__dirname, '..', 'data', 'packs-manifest.previous.json')

function getAuth() {
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: REFRESH_TOKEN })
  return oauth2
}

// 文件名一律 <realType>_<part>.osz —— generate-pack.js 已统一
function fileNameToEntry(manifest, fileName) {
  const m = fileName.match(/^(.+)_(\d+)\.osz$/)
  if (!m) return null
  const realType = m[1]
  const part = Number(m[2])
  return manifest.packs.find(p => p.realType === realType && p.part === part) || null
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

async function uploadOrUpdate(drive, filePath, fileName, knownFileId) {
  const media = { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) }
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
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log('No output/ directory, skipping')
    return
  }
  const oszFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.osz'))
  if (oszFiles.length === 0) {
    console.log('No .osz files in output/, skipping')
    return
  }

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('packs-manifest.json missing — generate-pack must run first')
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))

  // 旧 manifest(generate-pack.js 在重建前转储到这)用来识别孤儿 fileId
  let prevManifest = { packs: [] }
  if (fs.existsSync(PREV_MANIFEST_PATH)) {
    prevManifest = JSON.parse(fs.readFileSync(PREV_MANIFEST_PATH, 'utf-8'))
  }

  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  console.log(`Uploading ${oszFiles.length} pack(s) to Google Drive...`)

  const uploadedFileIds = new Set()
  for (const fileName of oszFiles) {
    const entry = fileNameToEntry(manifest, fileName)
    if (!entry) {
      console.warn(`  Skip ${fileName}: no matching manifest entry`)
      continue
    }
    const filePath = path.join(OUTPUT_DIR, fileName)
    const knownFileId = entry.gdriveFileId || null

    try {
      const fileId = await uploadOrUpdate(drive, filePath, fileName, knownFileId)
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
