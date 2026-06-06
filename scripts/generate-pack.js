const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')
const { ZipArchive } = require('archiver')
const fs = require('fs')
const path = require('path')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'osumania-ladder-maps'
// 合包公开桶:与 R2_BUCKET(私有,放 .osz 原始文件)分离。
// 给前端 /download 直链下载用,r2.dev 公开域名,流量免费。
const R2_PACKS_BUCKET = process.env.R2_PACKS_BUCKET || 'osumania-ladder-packs'
const R2_PACKS_PUBLIC_URL = (process.env.R2_PACKS_PUBLIC_URL || '').replace(/\/+$/, '')

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

const REAL_TYPE_NAMES = {
  SS: 'Single/Minijack Stream/Consistency', JS: 'Jumpstream', SA: 'Stamina', CJ: 'Chordjack',
  SJ: 'Jackspeed', MX: 'Rcmix', DP: 'Dump', ADP: 'Accurate Dump', STC: 'Streamtech',
  MTC: 'Minijacktech', JTC: 'Jack-mained tech', WTC: 'Wild/Ultra Burst tech',
  TC: 'Tech', ORC: 'Otherrice',
  HB1: 'Speed/Generic Hybrid', HB2: 'Mid-tempo/Jack/Shield Hybrid', HB3: 'Technical Hybrid',
  HB4: 'Wildcard Hybrid', HB5: 'Old-school Hybrid',
  RCmainHB: 'RC-main Hybrid', LNmainHB: 'LN-main Hybrid', MNTB: 'Mini-Tiebreaker Hybrid',
  OHB: 'OtherHybrid',
  RE: 'Release', CO: 'Coordination', TE: 'Timinghell', DE: 'Density',
  SW: 'Speedy Wildcard LN', JW: 'Jacky Wildcard LN', IN: 'Inverse', LNMX: 'LN Mixed', LNTC: 'Technical LN', OLN: 'OtherLongnote',
  SV1: 'Pattern SV', SV2: 'Rhythm SV', SI: 'Sightread SV', ME: 'Memorization SV', SVMX: 'Mix SV',
  TB: 'Tiebreaker',
}

function sanitizeFileName(name) {
  // 注意:逗号必须替换掉。osu! 的 .osu 解析器读 [Events] 里的背景行
  // 0,0,"file.jpg" 是按逗号分割的,文件名里带逗号会让解析器把后半段当成
  // 别的字段,曲绘加载失败。同样的隐患也存在于 AudioFilename 行。
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseOsu(content) {
  const lines = content.split('\n')
  const meta = {}
  let currentSection = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1)
      continue
    }
    if (currentSection === 'General' && trimmed.startsWith('AudioFilename:')) {
      meta.audioFilename = trimmed.split(':').slice(1).join(':').trim()
    }
    if (currentSection === 'Metadata') {
      const [key, ...rest] = trimmed.split(':')
      const value = rest.join(':').trim()
      if (key === 'Title') meta.title = value
      if (key === 'TitleUnicode') meta.titleUnicode = value
      if (key === 'Artist') meta.artist = value
      if (key === 'ArtistUnicode') meta.artistUnicode = value
      if (key === 'Creator') meta.creator = value
      if (key === 'Version') meta.version = value
      if (key === 'BeatmapID') meta.beatmapId = value
      if (key === 'BeatmapSetID') meta.beatmapSetId = value
    }
    if (currentSection === 'Events') {
      // [Events] 里背景行格式有两种:带引号 0,0,"file.jpg",0,0 / 不带引号 0,0,file.jpg,0,0
      // 之前只匹配带引号的,导致部分谱子的 backgroundFile 为 undefined,
      // 合包时不写曲绘进 archive,游戏里就没图。两种都要兜住。
      if (!meta.backgroundFile) {
        const quoted = trimmed.match(/^0\s*,\s*0\s*,\s*"([^"]+\.(?:jpg|jpeg|png))"/i)
        if (quoted) {
          meta.backgroundFile = quoted[1]
        } else {
          const unquoted = trimmed.match(/^0\s*,\s*0\s*,\s*([^,]+\.(?:jpg|jpeg|png))/i)
          if (unquoted) meta.backgroundFile = unquoted[1].trim()
        }
      }
    }
  }
  return meta
}

function rewriteOsu(content, { newTitle, newArtist, newCreator, newVersion, newAudioFilename, newBgFilename }) {
  let result = content
  const replaceLine = (section, key, value) => {
    const regex = new RegExp(`(\\[${section}\\][\\s\\S]*?)^${key}:.*$`, 'm')
    result = result.replace(regex, `$1${key}:${value}`)
  }

  replaceLine('General', 'AudioFilename', ' ' + newAudioFilename)
  replaceLine('Metadata', 'Title', newTitle)
  replaceLine('Metadata', 'TitleUnicode', newTitle)
  replaceLine('Metadata', 'Artist', newArtist)
  replaceLine('Metadata', 'ArtistUnicode', newArtist)
  replaceLine('Metadata', 'Creator', newCreator)
  replaceLine('Metadata', 'Version', newVersion)
  replaceLine('Metadata', 'BeatmapID', '0')
  replaceLine('Metadata', 'BeatmapSetID', '-1')
  replaceLine('Metadata', 'Source', '')
  replaceLine('Metadata', 'Tags', '')

  if (newBgFilename) {
    // 改背景行,同样兼容带引号 / 不带引号两种格式。
    // 改完统一用带引号格式,这样新文件名里如果带空格不会断成两段。
    if (/^(0,0,").+?(".*)$/m.test(result)) {
      result = result.replace(/^(0,0,")(.+?)(".*)$/m, `$1${newBgFilename}$3`)
    } else {
      result = result.replace(/^(0\s*,\s*0\s*,\s*)([^,\s][^,]*\.(?:jpg|jpeg|png))(.*)$/im, `$1"${newBgFilename}"$3`)
    }
  }

  return result
}

async function downloadFromR2(key) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
  const res = await s3.send(cmd)
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function listR2Objects(prefix) {
  const objects = []
  let continuationToken
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: continuationToken,
    })
    const res = await s3.send(cmd)
    if (res.Contents) objects.push(...res.Contents)
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

async function uploadToR2(key, buffer) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: 'application/octet-stream',
  })
  await s3.send(cmd)
}

function getAudioExtension(filename) {
  const ext = path.extname(filename).toLowerCase()
  return ['.mp3', '.ogg', '.wav'].includes(ext) ? ext : '.mp3'
}

function getBgExtension(filename) {
  const ext = path.extname(filename).toLowerCase()
  return ['.jpg', '.jpeg', '.png'].includes(ext) ? ext : '.jpg'
}

const DELETE_PLACEHOLDER_OSU = `osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:DELETE THIS DIFFICULTY
TitleUnicode:DELETE THIS DIFFICULTY
Artist:placeholder
ArtistUnicode:placeholder
Creator:shadiaojunshi
Version:delete this
BeatmapID:0
BeatmapSetID:-1
Source:
Tags:

[Difficulty]
HPDrainRate:8
CircleSize:4
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
0,500,4,1,0,100,1,0

[HitObjects]
256,192,0,128,0,500:0:0:0:0:
`

const MAX_MAPS_PER_PACK = 80

async function generatePack(targetType) {
  const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
  const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))

  const mapsToProcess = []

  const tournamentsList = files.map(file =>
    JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
  )
  tournamentsList.sort((a, b) => {
    const yearDiff = (a.year || 0) - (b.year || 0)
    if (yearDiff !== 0) return yearDiff
    return a.id.localeCompare(b.id)
  })

  for (const tournament of tournamentsList) {
    for (const round of tournament.rounds) {
      for (const map of round.maps) {
        if (map.realType === targetType) {
          mapsToProcess.push({
            tournamentId: tournament.id,
            tournamentAbbr: tournament.abbreviation,
            roundId: round.id,
            roundAbbr: round.abbreviation,
            slot: map.slot,
            difficulty: map.difficulty || 0,
            r2Key: `maps/${tournament.id}/${round.id}/${map.slot}.osz`,
          })
        }
      }
    }
  }

  console.log(`[${targetType}] Found ${mapsToProcess.length} maps total`)

  const r2Objects = await listR2Objects('maps/')
  const r2Keys = new Set(r2Objects.map(o => o.Key))

  const available = []
  for (const m of mapsToProcess) {
    if (!r2Keys.has(m.r2Key)) continue
    available.push({ ...m, isNsv: false })
    const nsvKey = m.r2Key.replace(/\.osz$/, '.nsv.osz')
    if (r2Keys.has(nsvKey)) {
      available.push({ ...m, r2Key: nsvKey, isNsv: true })
    }
  }
  const nsvCount = available.filter(m => m.isNsv).length
  console.log(`[${targetType}] ${available.length} maps have files in R2 (incl. ${nsvCount} NSV variants)`)

  if (available.length === 0) {
    console.log(`[${targetType}] No files available, skipping`)
    return []
  }

  const outputDir = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const totalPacks = Math.ceil(available.length / MAX_MAPS_PER_PACK)
  const results = []

  for (let packIdx = 0; packIdx < totalPacks; packIdx++) {
    const chunk = available.slice(packIdx * MAX_MAPS_PER_PACK, (packIdx + 1) * MAX_MAPS_PER_PACK)
    chunk.sort((a, b) => (a.difficulty || 0) - (b.difficulty || 0))
    const partNum = packIdx + 1
    const packName = `4K Contest ${REAL_TYPE_NAMES[targetType] || targetType} Pack ${partNum}`
    const outputFileName = `${targetType}_${partNum}.osz`
    const outputPath = path.join(outputDir, outputFileName)
    const output = fs.createWriteStream(outputPath)
    const archive = new ZipArchive({ zlib: { level: 5 } })
    archive.pipe(output)

    let processed = 0
    for (const map of chunk) {
      try {
        const oszBuffer = await downloadFromR2(map.r2Key)
        const zip = await JSZip.loadAsync(oszBuffer)

        let osuFileName = Object.keys(zip.files).find(f => f.endsWith('.osu'))
        if (!osuFileName) { console.warn(`  Skip ${map.r2Key}: no .osu file`); continue }

        const osuContent = await zip.files[osuFileName].async('string')
        const meta = parseOsu(osuContent)

        // TB1 习惯上等同于 TB(单张约定)。R2 路径里仍是 TB1,只在合包里显示成 TB。
        const displaySlot = map.slot === 'TB1' ? 'TB' : map.slot
        const newVersion = `(${map.tournamentAbbr} ${map.roundAbbr} ${displaySlot}${map.isNsv ? ' NSV' : ''}) ${meta.artist || 'Unknown'} - ${meta.title || 'Unknown'} [${meta.creator || 'Unknown'}] (${meta.version || 'Normal'})`
        const safeVersion = sanitizeFileName(newVersion)

        const audioExt = getAudioExtension(meta.audioFilename || 'audio.mp3')
        const newAudioName = safeVersion + audioExt

        const bgExt = getBgExtension(meta.backgroundFile || 'bg.jpg')
        const newBgName = safeVersion + bgExt

        const rewritten = rewriteOsu(osuContent, {
          newTitle: packName,
          newArtist: 'Various Artists',
          newCreator: 'shadiaojunshi',
          newVersion: newVersion,
          newAudioFilename: newAudioName,
          newBgFilename: newBgName,
        })

        archive.append(Buffer.from(rewritten, 'utf-8'), { name: safeVersion + '.osu' })

        if (meta.audioFilename && zip.files[meta.audioFilename]) {
          const audioData = await zip.files[meta.audioFilename].async('nodebuffer')
          archive.append(audioData, { name: newAudioName })
        }

        if (meta.backgroundFile && zip.files[meta.backgroundFile]) {
          const bgData = await zip.files[meta.backgroundFile].async('nodebuffer')
          archive.append(bgData, { name: newBgName })
        }

        processed++
        if (processed % 10 === 0) console.log(`  [Pack ${partNum}] Processed ${processed}/${chunk.length}`)
      } catch (err) {
        console.warn(`  Error processing ${map.r2Key}: ${err.message}`)
      }
    }

    archive.append(Buffer.from(DELETE_PLACEHOLDER_OSU, 'utf-8'), { name: 'delete this.osu' })
    await archive.finalize()
    await new Promise(resolve => output.on('close', resolve))

    const stats = fs.statSync(outputPath)
    console.log(`[${targetType} ${partNum}] Pack generated: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${processed} maps`)

    results.push({
      realType: targetType,
      name: packName,
      part: partNum,
      mapCount: processed,
      totalMaps: mapsToProcess.length,
      sizeMB: Math.round(stats.size / 1024 / 1024),
      outputPath,
    })
  }

  return results
}

async function main() {
  const args = process.argv.slice(2)
  let targetType = null
  for (const arg of args) {
    if (arg.startsWith('--type=')) targetType = arg.split('=')[1]
  }

  if (targetType) {
    const results = await generatePack(targetType)
    if (results.length > 0) console.log('\nDone:', JSON.stringify(results, null, 2))
  } else {
    const allTypes = new Set()
    const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
    const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      const t = JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
      for (const r of t.rounds) for (const m of r.maps) allTypes.add(m.realType)
    }

    console.log(`Generating packs for ${allTypes.size} types: ${[...allTypes].join(', ')}`)
    const allResults = []
    for (const type of allTypes) {
      const results = await generatePack(type)
      allResults.push(...results)
    }

    const manifestPath = path.join(__dirname, '..', 'data', 'packs-manifest.json')
    const prevManifestPath = path.join(__dirname, '..', 'data', 'packs-manifest.previous.json')
    let oldManifest = { packs: [], lastGenerated: '' }
    if (fs.existsSync(manifestPath)) {
      oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    }
    // 把旧 manifest 写到 .previous,让 upload-to-gdrive.js 用它来判断哪些
    // fileId 是上一版的孤儿(本次不再生成),好同步删 Drive。
    fs.writeFileSync(prevManifestPath, JSON.stringify(oldManifest, null, 2) + '\n')

    // 全量重建:本次没生成的 entry 直接消失,避免分包数变化时残留孤儿。
    const manifest = { packs: [], lastGenerated: '' }
    for (const result of allResults) {
      const previous = (oldManifest.packs || []).find(p =>
        p.realType === result.realType && (p.part || undefined) === result.part
      )
      manifest.packs.push({
        realType: result.realType,
        name: result.name,
        part: result.part,
        mapCount: result.mapCount,
        totalMaps: result.totalMaps,
        lastUpdated: new Date().toISOString().split('T')[0],
        links: previous?.links || {},
        gdriveFileId: previous?.gdriveFileId,
        sizeMB: result.sizeMB,
      })
    }
    manifest.lastGenerated = new Date().toISOString()

    // R2 直发:把生成好的 .osz 同步上传到 packs 公开桶,manifest 写 links.r2。
    // 没配 R2_PACKS_PUBLIC_URL 就跳过(本地手动跑、或还没建 packs 桶时)。
    if (R2_PACKS_PUBLIC_URL) {
      console.log(`\nUploading ${allResults.length} pack(s) to R2 packs bucket...`)
      const uploadedKeys = new Set()
      for (const result of allResults) {
        const key = `${result.realType}_${result.part}.osz`
        try {
          const buf = fs.readFileSync(result.outputPath)
          await s3.send(new PutObjectCommand({
            Bucket: R2_PACKS_BUCKET,
            Key: key,
            Body: buf,
            ContentType: 'application/x-osu-archive',
          }))
          uploadedKeys.add(key)
          const entry = manifest.packs.find(p => p.realType === result.realType && p.part === result.part)
          if (entry) {
            entry.links = entry.links || {}
            entry.links.r2 = `${R2_PACKS_PUBLIC_URL}/${key}`
          }
          console.log(`  Uploaded ${key} (${result.sizeMB}MB)`)
        } catch (err) {
          console.warn(`  Failed to upload ${key}: ${err.message}`)
        }
      }

      // 删孤儿:packs 桶里有但本次没产出的 .osz(分包数缩了 / type 删了)
      try {
        const cmd = new ListObjectsV2Command({ Bucket: R2_PACKS_BUCKET })
        const res = await s3.send(cmd)
        const orphans = (res.Contents || [])
          .map(o => o.Key)
          .filter(k => k && k.endsWith('.osz') && !uploadedKeys.has(k))
        for (const k of orphans) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: R2_PACKS_BUCKET, Key: k }))
            console.log(`  Deleted orphan ${k}`)
          } catch (err) {
            console.warn(`  Failed to delete orphan ${k}: ${err.message}`)
          }
        }
        // 同时清掉 manifest 里 r2 链接所指向的孤儿引用(其它 entry 的 links.r2 已在上面写好)
        for (const pack of manifest.packs) {
          const expected = `${pack.realType}_${pack.part}.osz`
          if (pack.links && pack.links.r2 && !uploadedKeys.has(expected)) {
            delete pack.links.r2
          }
        }
      } catch (err) {
        console.warn(`Orphan cleanup skipped: ${err.message}`)
      }
    } else {
      console.log('\nR2_PACKS_PUBLIC_URL not set, skipping R2 packs upload')
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log('\nManifest updated:', manifestPath)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
