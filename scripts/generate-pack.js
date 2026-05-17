const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')
const archiver = require('archiver')
const fs = require('fs')
const path = require('path')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'osumania-ladder-maps'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

const REAL_TYPE_NAMES = {
  SS: 'Stream', JS: 'Jumpstream', SA: 'Stamina', CJ: 'Chordjack',
  SJ: 'Jackspeed', MX: 'Rcmix', DP: 'Dump', STC: 'Streamtech',
  MTC: 'Minijacktech', JTC: 'Jackmained tech', WTC: 'Wild tech',
  TC: 'Tech', ORC: 'Otherrice',
  HB1: 'Speed Hybrid', HB2: 'Jack Hybrid', HB3: 'Technical Hybrid',
  HB4: 'Wildcard Hybrid', HB5: 'Old-school Hybrid', OHB: 'OtherHybrid',
  RE: 'Release', CO: 'Coordination', TE: 'Timinghell', DE: 'Density',
  SW: 'Speedy Wildcard LN', JW: 'Jacky Wildcard LN', IN: 'Inverse', OLN: 'OtherLongnote',
  SV1: 'Pattern SV', SV2: 'Rhythm SV', SI: 'Sightread SV', ME: 'Memorization SV',
  TB: 'Tiebreaker',
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim()
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
      const match = trimmed.match(/"([^"]+\.(jpg|jpeg|png))"/i)
      if (match) meta.backgroundFile = match[1]
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
    result = result.replace(/^(0,0,")(.+?)(".*$)/m, `$1${newBgFilename}$3`)
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

async function generatePack(targetType) {
  const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
  const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))

  const mapsToProcess = []

  for (const file of files) {
    const tournament = JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
    for (const round of tournament.rounds) {
      for (const map of round.maps) {
        if (map.realType === targetType) {
          mapsToProcess.push({
            tournamentId: tournament.id,
            tournamentAbbr: tournament.abbreviation,
            roundId: round.id,
            roundAbbr: round.abbreviation,
            slot: map.slot,
            r2Key: `maps/${tournament.id}/${round.id}/${map.slot}.osz`,
          })
        }
      }
    }
  }

  console.log(`[${targetType}] Found ${mapsToProcess.length} maps total`)

  const r2Objects = await listR2Objects('maps/')
  const r2Keys = new Set(r2Objects.map(o => o.Key))
  const available = mapsToProcess.filter(m => r2Keys.has(m.r2Key))
  console.log(`[${targetType}] ${available.length} maps have files in R2`)

  if (available.length === 0) {
    console.log(`[${targetType}] No files available, skipping`)
    return null
  }

  const outputDir = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const packName = `4K Contest ${REAL_TYPE_NAMES[targetType] || targetType} Pack`
  const outputPath = path.join(outputDir, `${targetType}.osz`)
  const output = fs.createWriteStream(outputPath)
  const archive = archiver('zip', { zlib: { level: 5 } })
  archive.pipe(output)

  let processed = 0
  for (const map of available) {
    try {
      const oszBuffer = await downloadFromR2(map.r2Key)
      const zip = await JSZip.loadAsync(oszBuffer)

      let osuFileName = Object.keys(zip.files).find(f => f.endsWith('.osu'))
      if (!osuFileName) { console.warn(`  Skip ${map.r2Key}: no .osu file`); continue }

      const osuContent = await zip.files[osuFileName].async('string')
      const meta = parseOsu(osuContent)

      const newVersion = `(${map.tournamentAbbr} ${map.roundAbbr} ${map.slot}) ${meta.artist || 'Unknown'} - ${meta.title || 'Unknown'} [${meta.creator || 'Unknown'}] (${meta.version || 'Normal'})`
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
      if (processed % 10 === 0) console.log(`  Processed ${processed}/${available.length}`)
    } catch (err) {
      console.warn(`  Error processing ${map.r2Key}: ${err.message}`)
    }
  }

  archive.append(Buffer.from(DELETE_PLACEHOLDER_OSU, 'utf-8'), { name: 'delete this.osu' })
  await archive.finalize()
  await new Promise(resolve => output.on('close', resolve))

  const stats = fs.statSync(outputPath)
  console.log(`[${targetType}] Pack generated: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${processed} maps`)

  return {
    realType: targetType,
    name: packName,
    mapCount: processed,
    totalMaps: mapsToProcess.length,
    sizeMB: Math.round(stats.size / 1024 / 1024),
    outputPath,
  }
}

async function main() {
  const args = process.argv.slice(2)
  let targetType = null
  for (const arg of args) {
    if (arg.startsWith('--type=')) targetType = arg.split('=')[1]
  }

  if (targetType) {
    const result = await generatePack(targetType)
    if (result) console.log('\nDone:', JSON.stringify(result, null, 2))
  } else {
    const allTypes = new Set()
    const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
    const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      const t = JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
      for (const r of t.rounds) for (const m of r.maps) allTypes.add(m.realType)
    }

    console.log(`Generating packs for ${allTypes.size} types: ${[...allTypes].join(', ')}`)
    const results = []
    for (const type of allTypes) {
      const result = await generatePack(type)
      if (result) results.push(result)
    }

    const manifestPath = path.join(__dirname, '..', 'data', 'packs-manifest.json')
    let manifest = { packs: [], lastGenerated: '' }
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    }

    for (const result of results) {
      const existing = manifest.packs.find(p => p.realType === result.realType)
      const entry = {
        realType: result.realType,
        name: result.name,
        mapCount: result.mapCount,
        totalMaps: result.totalMaps,
        lastUpdated: new Date().toISOString().split('T')[0],
        links: existing?.links || {},
        sizeMB: result.sizeMB,
      }
      if (existing) Object.assign(existing, entry)
      else manifest.packs.push(entry)
    }
    manifest.lastGenerated = new Date().toISOString()
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log('\nManifest updated:', manifestPath)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
