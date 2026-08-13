const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')
const { ZipArchive } = require('archiver')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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
  TC: 'Tech', ORC: 'Otherrice', SATC: 'Stamina tech',
  HB1: 'Speed/Generic Hybrid', HB2: 'Mid-tempo/Jack/Shield Hybrid', HB3: 'Technical Hybrid',
  HB4: 'Wildcard Hybrid', HB5: 'Old-school Hybrid',
  RCmainHB: 'RC-main Hybrid', LNmainHB: 'LN-main Hybrid', MXHB: 'Mixed Hybrid', MNTB: 'Mini-Tiebreaker Hybrid',
  OHB: 'OtherHybrid',
  RE: 'Release', CO: 'Coordination', TE: 'Timinghell', DE: 'Density',
  SW: 'Speedy Wildcard LN', JW: 'Jacky Wildcard LN', IN: 'Inverse', LNMX: 'LN Mixed', LNTC: 'Technical LN', LNWL: 'LNwall', OLN: 'OtherLongnote',
  SV1: 'Pattern SV', SV2: 'Rhythm SV', SI: 'Sightread SV', ME: 'Memorization SV', SVMX: 'Mix SV',
  TB: 'Tiebreaker',
}

// 各 realType 的 OD 下限:谱面 OD 低于此值就抬到此值,已高于则不动。
// 未列出的(SV1/SV2/SI/ME/SVMX)= 不改 OD。HP 另行统一设 7(见 rewriteOsu)。
const OD_FLOOR = {
  // RC
  JS: 8.5, SA: 8.5, SJ: 8.5,
  JTC: 8.2,
  CJ: 9,
  SS: 8, MX: 8, DP: 8, ADP: 8, STC: 8, MTC: 8, WTC: 8, TC: 8, ORC: 8, SATC: 8,
  // LN
  RE: 7.2, CO: 7.2, TE: 7.2,
  DE: 7.5, SW: 7.5, JW: 7.5, IN: 7.5, LNMX: 7.5, LNTC: 7.5, LNWL: 7.5, OLN: 7.5,
  // HB (HB3 特例 7.2,其余含 RCmainHB/LNmainHB 一律 7.5)
  HB3: 7.2,
  HB1: 7.5, HB2: 7.5, HB4: 7.5, HB5: 7.5, RCmainHB: 7.5, LNmainHB: 7.5, MXHB: 7.5, MNTB: 7.5, OHB: 7.5,
  // TB
  TB: 7.5,
}

// 返回该 realType 的 OD 下限,SV 等未列出者返回 null(不改 OD)。
function getOdFloor(realType) {
  return Object.prototype.hasOwnProperty.call(OD_FLOOR, realType) ? OD_FLOOR[realType] : null
}

// HP 统一目标值(所有包)。
const HP_TARGET = 7

// 带指数退避的重试:网络抖动 / R2 偶发 5xx 时自动重试,避免整趟全量重传前功尽弃。
async function withRetry(fn, { attempts = 3, baseDelayMs = 1000, label = 'op' } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
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

function rewriteOsu(content, { newTitle, newArtist, newCreator, newVersion, newAudioFilename, newBgFilename, odFloor }) {
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

  // 统一 OD/HP。OD 只抬不降:读当前 [Difficulty] 的 OverallDifficulty,低于 odFloor
  // 才抬到 odFloor(odFloor 为 null 表示该类型不动 OD,如 SV)。HP 一律设 HP_TARGET。
  if (typeof odFloor === 'number') {
    const odMatch = result.match(/(\[Difficulty\][\s\S]*?)^OverallDifficulty:\s*([0-9.]+)\s*$/m)
    if (odMatch) {
      const curOd = parseFloat(odMatch[2])
      if (!isNaN(curOd) && curOd < odFloor) {
        replaceLine('Difficulty', 'OverallDifficulty', String(odFloor))
      }
    }
  }
  replaceLine('Difficulty', 'HPDrainRate', String(HP_TARGET))

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

// 在 zip 里按名字找文件,大小写不敏感 + basename 兜底。
// 镜像站(catboy/nerinyan)重打包时经常把文件名大小写改掉(.osu 写
// "song.mp3" 但压缩包里是 "Song.mp3"),或把音频放进子目录。精确匹配
// zip.files[name] 会失败,导致合包时音乐/曲绘静默丢失。这里逐级放宽:
// 精确 → 全路径小写相等 → 仅 basename 小写相等。
function findZipEntry(zip, wanted) {
  if (!wanted) return null
  if (zip.files[wanted] && !zip.files[wanted].dir) return zip.files[wanted]
  const wl = wanted.toLowerCase()
  const wbase = wl.split('/').pop()
  let baseMatch = null
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name]
    if (f.dir) continue
    const nl = name.toLowerCase()
    if (nl === wl) return f
    if (!baseMatch && nl.split('/').pop() === wbase) baseMatch = f
  }
  return baseMatch
}

// 兜底:.osu 声明的 AudioFilename 完全对不上时(改名/丢字段),
// 直接取压缩包里第一个音频文件。返回 { entry, name } 或 null。
function findAnyAudioEntry(zip) {
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name]
    if (f.dir) continue
    if (/\.(mp3|ogg|wav)$/i.test(name)) return { entry: f, name }
  }
  return null
}

// 并发执行 fn(item) 但限制同时只跑 limit 个,结果按 items 原顺序返回。
// 用来把"R2 下载 + JSZip 解压 + parseOsu"这段从串行改成并发,
// 4 核 runner 上比纯串行快 ~3x。limit 设 4 是为了控住内存峰值。
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// 为 .osu 文件生成指纹 (Artist + Title + Creator + Version)
// 用于没有 beatmapId 的谱面去重
async function generateMapFingerprint(oszBuffer) {
  try {
    const zip = await JSZip.loadAsync(oszBuffer)
    const osuFileName = Object.keys(zip.files).find(f => f.endsWith('.osu'))
    if (!osuFileName) return null

    const osuContent = await zip.files[osuFileName].async('string')
    const meta = parseOsu(osuContent)

    // 使用 Artist + Title + Creator + Version 组合作为指纹
    // 这些字段组合在一起足以唯一标识一张谱面
    const fingerprint = `${meta.artist || ''}|${meta.title || ''}|${meta.creator || ''}|${meta.version || ''}`
    return fingerprint.toLowerCase().trim()
  } catch (err) {
    console.warn(`  Error generating fingerprint: ${err.message}`)
    return null
  }
}

// 去重后同一物理文件可能被多个比赛槽位引用。把这些来源渲染成一段紧凑的
// 标签写进 osu 的 Version 字段:
//   ≤3 个: "MWC 4K 2025 F HB3 & VNMC 4K 2025 F HB3"       -- 空格 + &
//   ≥4 个: "MWC2025F HB3/VNMC2025F HB3/..."                -- 紧凑,去 "4K"、去内空格
// 注意:sanitizeFileName 会把 '/' 从文件名里剔掉,所以合包里的 .osu/.mp3/.jpg
// 文件名遇到 4+ 源时会变成连着的一串(游戏内 [Version] 字段照常渲染 '/')。
function formatSources(sources, isNsv) {
  const nsvSuffix = isNsv ? ' NSV' : ''
  const displaySlot = (slot) => (slot === 'TB1' ? 'TB' : slot)
  if (sources.length <= 3) {
    return sources
      .map((s) => `${s.tournamentAbbr} ${s.roundAbbr} ${displaySlot(s.slot)}${nsvSuffix}`)
      .join(' & ')
  }
  return sources
    .map((s) => {
      const compactAbbr = (s.tournamentAbbr || '').replace(/\s*4K\s*/g, '').replace(/\s+/g, '')
      return `${compactAbbr}${s.roundAbbr} ${displaySlot(s.slot)}${nsvSuffix}`
    })
    .join('/')
}

async function prefetchMap(map, packName, odFloor) {
  try {
    const oszBuffer = await downloadFromR2(map.r2Key)
    const zip = await JSZip.loadAsync(oszBuffer)

    const osuFileName = Object.keys(zip.files).find((f) => f.endsWith('.osu'))
    if (!osuFileName) {
      console.warn(`  Skip ${map.r2Key}: no .osu file`)
      return null
    }
    const osuContent = await zip.files[osuFileName].async('string')
    const meta = parseOsu(osuContent)

    // sources 里第一条永远是"第一次出现"(mapsToProcess 已按年份+id 排过序,
    // 去重时先来先占),所以合并后的排序继承第一次出现的 difficulty 不会跳。
    const sourcesLabel = formatSources(map.sources, map.isNsv)
    const newVersion = `(${sourcesLabel}) ${meta.artist || 'Unknown'} - ${meta.title || 'Unknown'} [${meta.creator || 'Unknown'}] (${meta.version || 'Normal'})`
    const safeVersion = sanitizeFileName(newVersion)

    // 先定位真实文件(大小写不敏感),再用真实文件名的扩展名命名。
    // 音频找不到时兜底取包里第一个音频文件——否则合包里这张图没声音。
    let audioEntry = findZipEntry(zip, meta.audioFilename)
    let audioSourceName = meta.audioFilename
    if (!audioEntry) {
      const any = findAnyAudioEntry(zip)
      if (any) {
        audioEntry = any.entry
        audioSourceName = any.name
        console.warn(`  ${map.r2Key}: AudioFilename "${meta.audioFilename}" not found, falling back to "${any.name}"`)
      } else {
        console.warn(`  ${map.r2Key}: no audio file found in archive`)
      }
    }
    const bgEntry = findZipEntry(zip, meta.backgroundFile)
    if (meta.backgroundFile && !bgEntry) {
      console.warn(`  ${map.r2Key}: backgroundFile "${meta.backgroundFile}" not found in archive`)
    }

    const audioExt = getAudioExtension(audioSourceName || 'audio.mp3')
    const newAudioName = safeVersion + audioExt
    // 曲绘扩展名也按实际找到的文件取(bgEntry.name),声明 .jpg 但实际 .png 时不会错配。
    const bgExt = getBgExtension((bgEntry && bgEntry.name) || meta.backgroundFile || 'bg.jpg')
    const newBgName = safeVersion + bgExt

    const rewritten = rewriteOsu(osuContent, {
      newTitle: packName,
      newArtist: 'Various Artists',
      newCreator: 'shadiaojunshi',
      newVersion,
      newAudioFilename: newAudioName,
      newBgFilename: newBgName,
      odFloor,
    })

    let audioBuf = null
    if (audioEntry) {
      audioBuf = await audioEntry.async('nodebuffer')
    }
    let bgBuf = null
    if (bgEntry) {
      bgBuf = await bgEntry.async('nodebuffer')
    }

    return {
      osu: Buffer.from(rewritten, 'utf-8'),
      osuName: safeVersion + '.osu',
      audio: audioBuf,
      audioName: newAudioName,
      bg: bgBuf,
      bgName: newBgName,
    }
  } catch (err) {
    console.warn(`  Error processing ${map.r2Key}: ${err.message}`)
    return null
  }
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
  const odFloor = getOdFloor(targetType) // 该键型的 OD 下限;SV 等为 null(不改 OD)
  const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
  const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))

  const mapsToProcess = []

  const tournamentsList = files.map(file =>
    JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
  )
  tournamentsList.sort((a, b) => {
    // 优先级降序(5→1, 无 priority 当 0 最后),相同 priority 内年份降序(新→旧)
    const priA = a.priority || 0
    const priB = b.priority || 0
    if (priA !== priB) return priB - priA
    const yearDiff = (b.year || 0) - (a.year || 0)
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
            beatmapId: map.beatmapId || null,
            r2Key: `maps/${tournament.id}/${round.id}/${map.slot}.osz`,
          })
        }
      }
    }
  }

  console.log(`[${targetType}] Found ${mapsToProcess.length} maps total`)

  // 按 beatmapId 数唯一槽位数(缺 beatmapId 的老数据用 r2Key 兜底):
  // 用作 manifest.totalMaps,下载页的分母(不再重复计数被多个比赛复用的图)。
  const uniqueSlotKeys = new Set(
    mapsToProcess.map(m => (m.beatmapId ? `bid:${m.beatmapId}` : `raw:${m.r2Key}`))
  )
  const uniqueSlotTotal = uniqueSlotKeys.size

  const r2Objects = await listR2Objects('maps/')
  const r2Keys = new Set(r2Objects.map(o => o.Key))

  // 收集所有实际存在的物理条目(SV + NSV);同时为没有 bid 的谱面生成指纹
  const rawEntries = []
  const needFingerprint = []
  for (const m of mapsToProcess) {
    if (!r2Keys.has(m.r2Key)) continue
    rawEntries.push({ ...m, isNsv: false, fingerprint: null })
    if (!m.beatmapId) {
      needFingerprint.push({ ...m, isNsv: false })
    }
    const nsvKey = m.r2Key.replace(/\.osz$/, '.nsv.osz')
    if (r2Keys.has(nsvKey)) {
      rawEntries.push({ ...m, r2Key: nsvKey, isNsv: true, fingerprint: null })
      if (!m.beatmapId) {
        needFingerprint.push({ ...m, r2Key: nsvKey, isNsv: true })
      }
    }
  }

  // 批量并发生成指纹 (4个并发)
  if (needFingerprint.length > 0) {
    console.log(`[${targetType}] Generating fingerprints for ${needFingerprint.length} maps without beatmapId...`)

    const fingerprints = await mapWithConcurrency(needFingerprint, 4, async (m) => {
      try {
        const oszBuffer = await downloadFromR2(m.r2Key)
        const fp = await generateMapFingerprint(oszBuffer)
        return { r2Key: m.r2Key, fingerprint: fp }
      } catch (err) {
        console.warn(`  Failed to fingerprint ${m.r2Key}: ${err.message}`)
        return { r2Key: m.r2Key, fingerprint: null }
      }
    })

    // 将指纹写回 rawEntries
    const fpMap = new Map(fingerprints.map(f => [f.r2Key, f.fingerprint]))
    for (const entry of rawEntries) {
      if (!entry.beatmapId && fpMap.has(entry.r2Key)) {
        entry.fingerprint = fpMap.get(entry.r2Key)
      }
    }

    console.log(`[${targetType}] Fingerprint generation complete`)
  }

  // 改进的去重逻辑: 支持指纹匹配 + 多路径选择
  const bySignature = new Map()
  for (const m of rawEntries) {
    // 优先使用 beatmapId，其次使用指纹，最后才用 r2Key
    let key
    if (m.beatmapId) {
      key = `bid:${m.beatmapId}|${m.isNsv ? 1 : 0}`
    } else if (m.fingerprint) {
      key = `fp:${m.fingerprint}|${m.isNsv ? 1 : 0}`
    } else {
      key = `raw:${m.r2Key}`
    }

    const src = {
      tournamentAbbr: m.tournamentAbbr,
      roundAbbr: m.roundAbbr,
      slot: m.slot
    }

    const existing = bySignature.get(key)
    if (existing) {
      existing.sources.push(src)
      // 记录所有可能的文件路径，后续会选择最优的
      if (!existing.alternatePaths) {
        existing.alternatePaths = [existing.r2Key]
      }
      existing.alternatePaths.push(m.r2Key)
    } else {
      bySignature.set(key, {
        ...m,
        sources: [src],
        alternatePaths: [m.r2Key]  // 记录所有引用此谱面的路径
      })
    }
  }

  // 为每个合并后的条目选择最佳的文件路径
  // 策略: 选择文件确实存在且最新的路径
  const available = []
  for (const entry of bySignature.values()) {
    if (entry.alternatePaths && entry.alternatePaths.length > 1) {
      // 有多个路径，选择最优的
      let bestPath = entry.r2Key
      let pathExists = r2Keys.has(bestPath)

      // 如果当前路径不存在，尝试其他路径
      if (!pathExists) {
        for (const altPath of entry.alternatePaths) {
          if (r2Keys.has(altPath)) {
            bestPath = altPath
            pathExists = true
            break
          }
        }
      }

      if (!pathExists) {
        console.warn(`  Warning: No valid file path found for merged entry with ${entry.sources.length} sources:`)
        console.warn(`    Sources: ${entry.sources.map(s => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).join(', ')}`)
        console.warn(`    Tried paths: ${entry.alternatePaths.join(', ')}`)
        continue  // 跳过这个条目
      }

      // 使用找到的最佳路径
      entry.r2Key = bestPath

      if (entry.sources.length > 1) {
        console.log(`  Merged ${entry.sources.length} references to same map, using path: ${bestPath}`)
        console.log(`    Sources: ${entry.sources.map(s => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).join(', ')}`)
      }
    } else {
      // 单一路径，检查是否存在
      if (!r2Keys.has(entry.r2Key)) {
        console.warn(`  Skip non-existent file: ${entry.r2Key}`)
        continue
      }
    }

    available.push(entry)
  }

  const dupCollapsed = rawEntries.length - available.length
  const nsvCount = available.filter(m => m.isNsv).length
  console.log(
    `[${targetType}] ${available.length} unique files in R2 (incl. ${nsvCount} NSV; collapsed ${dupCollapsed} duplicate slot ref(s))`
  )

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

    // 并发预取:4 个并发跑 R2 下载 + JSZip 解压 + parseOsu。
    // 失败/缺 .osu 的返回 null,prefetch 内部已经 warn 过了。
    let prefetched
    try {
      prefetched = await mapWithConcurrency(chunk, 4, (m) => prefetchMap(m, packName, odFloor))
    } catch (err) {
      console.warn(`  [Pack ${partNum}] prefetch error: ${err.message}`)
      prefetched = chunk.map(() => null)
    }

    // append 顺序与 chunk 原顺序一致(按难度排过),保证 zip 里图也是按难度排
    let processed = 0
    let processedSlots = 0  // 不含 NSV 变体,用于 manifest.mapCount —— 与 totalMaps(slot 数)同口径
    for (let i = 0; i < chunk.length; i++) {
      const item = prefetched[i]
      if (!item) continue
      archive.append(item.osu, { name: item.osuName })
      if (item.audio) archive.append(item.audio, { name: item.audioName })
      if (item.bg) archive.append(item.bg, { name: item.bgName })
      processed++
      if (!chunk[i].isNsv) processedSlots++
      if (processed % 10 === 0) console.log(`  [Pack ${partNum}] Appended ${processed}/${chunk.length}`)
    }

    archive.append(Buffer.from(DELETE_PLACEHOLDER_OSU, 'utf-8'), { name: 'delete this.osu' })
    await archive.finalize()
    await new Promise(resolve => output.on('close', resolve))

    const stats = fs.statSync(outputPath)
    console.log(`[${targetType} ${partNum}] Pack generated: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${processed} entries (${processedSlots} slots)`)

    results.push({
      realType: targetType,
      name: packName,
      part: partNum,
      mapCount: processedSlots,
      // 用去重后的唯一槽位数(而非 mapsToProcess.length),避免下载页进度条
      // 因为多个比赛复用同一张图导致 mapCount 永远追不上 totalMaps。
      totalMaps: uniqueSlotTotal,
      sizeMB: Math.round(stats.size / 1024 / 1024),
      outputPath,
    })

    // 生成完立即上传 R2 packs 桶并删本地副本。关键:删除必须发生在生成阶段,
    // 不能等所有包都生成完再一起删——否则 output/ 会堆满全部 52 个包
    // (12.6GB+),在 14GB 磁盘的 runner 上先被撑爆(进程被杀 → "hosted runner
    // lost communication" + 日志空)。逐包上传让磁盘峰值只占一个包(~几百MB)。
    // Body 用 Buffer 而非流:SDK 对流式 body 默认走 Transfer-Encoding: chunked,
    // 而 R2 的 S3 API 不支持 chunked(会 403 签名错误),Buffer + Content-Length
    // 才是 R2 验证过的上传方式。每包 Buffer(~几百MB)+ 前面 prefetch/archive
    // 的缓冲仍远在 8GB 内存内,不是瓶颈。
    if (R2_PACKS_PUBLIC_URL) {
      const key = outputFileName
      const entry = results[results.length - 1]
      const buf = fs.readFileSync(outputPath)
      try {
        await withRetry(() => s3.send(new PutObjectCommand({
          Bucket: R2_PACKS_BUCKET,
          Key: key,
          Body: buf,
          ContentType: 'application/x-osu-archive',
        })), { label: `上传 ${key}` })
        entry.links = entry.links || {}
        entry.links.r2 = `${R2_PACKS_PUBLIC_URL}/${key}`
        console.log(`  [${targetType} ${partNum}] Uploaded ${key} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
      } catch (err) {
        console.warn(`  Failed to upload ${key}: ${err.message} (local copy kept)`)
      }
      // 只在上传成功后才删本地:失败时保留(单包几百MB可接受),避免这张包
      // 从 R2 里静默消失、下载页直接断链。
      if (entry.links && entry.links.r2) {
        try {
          fs.unlinkSync(outputPath)
        } catch (unlinkErr) {
          console.warn(`  Failed to remove local ${outputPath}: ${unlinkErr.message}`)
        }
      }
    }
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
        // links 优先取本趟生成时逐包上传写好的新 r2 链接;上传失败时回退旧 manifest
        links: result.links && Object.keys(result.links).length ? result.links : (previous?.links || {}),
        gdriveFileId: previous?.gdriveFileId,
        sizeMB: result.sizeMB,
      })
    }
    manifest.lastGenerated = new Date().toISOString()

    // 上传已内联进 generatePack 的每包循环(生成完立即传 R2 packs 桶并删本地,
    // 磁盘峰值只占一个包,不会再被全量 12.6GB 撑爆)。这里只做孤儿清理:
    // packs 桶里有但本次没产出的 .osz(分包数缩了 / type 删了)。
    // 注意用 producedKeys(本次产出的全部包)而非 uploadedKeys:若某包本趟上传
    // 失败,桶里旧文件仍是最后一版有效副本,不能当孤儿删。
    if (R2_PACKS_PUBLIC_URL) {
      const producedKeys = new Set(allResults.map(r => `${r.realType}_${r.part}.osz`))
      try {
        const cmd = new ListObjectsV2Command({ Bucket: R2_PACKS_BUCKET })
        const res = await s3.send(cmd)
        const orphans = (res.Contents || [])
          .map(o => o.Key)
          .filter(k => k && k.endsWith('.osz') && !producedKeys.has(k))
        for (const k of orphans) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: R2_PACKS_BUCKET, Key: k }))
            console.log(`  Deleted orphan ${k}`)
          } catch (err) {
            console.warn(`  Failed to delete orphan ${k}: ${err.message}`)
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
