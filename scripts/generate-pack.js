const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')
const { formatSources } = require('./source-label')
const { ZipArchive } = require('archiver')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const REAL_TYPE_ALIASES = { WC: 'LNWC' }
function normalizeRealType(realType) {
  const value = String(realType || '').trim()
  return REAL_TYPE_ALIASES[value] || value
}

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
  SJ: 'Jackspeed', FCJ: 'Finger Control Jack', MX: 'Rcmix', DP: 'Dump', ADP: 'Accurate Dump', STC: 'Streamtech',
  MTC: 'Minijacktech', SATC: 'Stamina tech', JTC: 'Jack-mained tech', WTC: 'Wild/Ultra Burst tech',
  TC: 'Tech', ORC: 'Otherrice', PDRC: 'Pending RC',
  HB1: 'Speed/Generic Hybrid', HB2: 'Mid-tempo/Jack/Shield Hybrid', HB3: 'Technical Hybrid',
  HB4: 'Wildcard Hybrid', HB5: 'Old-school Hybrid',
  RCmainHB: 'RC-main Hybrid', LNmainHB: 'LN-main Hybrid', MXHB: 'Mixed Hybrid', MNTB: 'Mini-Tiebreaker Hybrid',
  OHB: 'OtherHybrid', PDHB: 'Pending Hybrid',
  RE: 'Release', CO: 'Coordination', TE: 'Timinghell', DE: 'Density',
  JW: 'Jacky Wildcard LN', SW: 'Speedy Wildcard LN', LNMX: 'LN Mixed', LNWC: 'LN Wildcard', LNTC: 'Technical LN', IN: 'Inverse', LNWL: 'LNwall', OLN: 'Other LN', PDLN: 'Pending LN',
  SV1: 'Pattern SV', SV2: 'Rhythm SV', SI: 'Sightread SV', ME: 'Memorization SV', SVMX: 'Mix SV', GM: 'Gimmick SV', PDSV: 'Pending SV',
  PDEX: 'Pending Special',
  TB: 'Tiebreaker',
}

// Pending RC/LN/HB/特殊 are classification queues, not downloadable pattern packs.
// Pending SV is intentionally downloadable because unresolved SV maps still need
// a usable catch-all pack.
// PDEX(待分类的特殊槽位)同属分类队列,不进合包(2026-09-15 站长要求)。
const PACK_EXCLUDED_REAL_TYPES = new Set(['PDRC', 'PDLN', 'PDHB', 'PDEX'])

// [Difficulty] 段**整体不再干预**:OD 与 HP 都跟随原谱,原谱是多少就是多少。
//   - OD:2026-09-13 用户要求取消全部 OD 下限,旧的 OD_FLOOR 表(按 realType 抬到 7.2~9)
//     已删除。
//   - HP:2026-09-13 用户要求「HP 也跟随原谱」,原先固定写 7 的 HP_TARGET 已删除。
// 共同理由:改写会改 .osu 字节,而 osu! 本地成绩绑的是 .osu 文件 hash(见 CODEX-HANDOFF §5.4)。
// 现在真正会被改写的只有 Metadata / General(音频行)与背景行。

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

function rewriteOsu(content, { newTitle, newArtist, newCreator, newVersion, newAudioFilename, newBgFilename }) {
  let result = content
  // 用**函数式** replacement:值里可能带 $'、$&、$$、$1 这类序列(来自曲名/作者/版本),
  // 字符串形式的 replacement 会把它们当特殊模式展开 —— $' 会把匹配点之后的整份文件内容
  // 注入到这一行(实测:Title 行之后的内容被复制一份,谱面直接坏掉)。函数式不会展开。
  const replaceLine = (section, key, value) => {
    const regex = new RegExp(`(\\[${section}\\][\\s\\S]*?)^${key}:.*$`, 'm')
    result = result.replace(regex, (...args) => `${args[1]}${key}:${value}`)
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

  // [Difficulty] 段整体不碰:OD 与 HP 都跟随原谱(2026-09-13 两次确认)。

  if (newBgFilename) {
    // 改背景行,同样兼容带引号 / 不带引号两种格式。
    // 改完统一用带引号格式,这样新文件名里如果带空格不会断成两段。
    // 同样用函数式 replacement(文件名里可能带 $)。 */
    if (/^(0,0,").+?(".*)$/m.test(result)) {
      result = result.replace(/^(0,0,")(.+?)(".*)$/m, (...args) => `${args[1]}${newBgFilename}${args[3]}`)
    } else {
      result = result.replace(/^(0\s*,\s*0\s*,\s*)([^,\s][^,]*\.(?:jpg|jpeg|png))(.*)$/im, (...args) => `${args[1]}"${newBgFilename}"${args[3]}`)
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

async function prefetchMap(map, packName) {
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

    // NSV 变体(.nsv.osz)经常只传了 .osu,不带音频/曲绘 —— 直接打包会让这个难度**没声音**
    // (站长反馈过"一张 SV 没声音")。这里回退到**同槽主图**的 .osz 借音频/曲绘:
    // 两者本来就是同一首歌,借用不会串味;借不到才保持缺失。
    let audioFromMain = false
    let bgFromMain = false
    if (map.isNsv && /\.nsv\.osz$/.test(map.r2Key) && (!audioEntry || !bgEntry)) {
      const mainKey = map.r2Key.replace(/\.nsv\.osz$/, '.osz')
      try {
        const mainZip = await JSZip.loadAsync(await downloadFromR2(mainKey))
        if (!audioEntry) {
          const fromMain = findZipEntry(mainZip, meta.audioFilename) || (findAnyAudioEntry(mainZip) || {}).entry
          if (fromMain) {
            audioEntry = fromMain
            audioSourceName = fromMain.name
            audioFromMain = true
            console.warn(`  ${map.r2Key}: 包里没有音频 → 借用主图 ${mainKey} 的 "${fromMain.name}"`)
          }
        }
        if (!bgEntry && meta.backgroundFile) {
          const bgFrom = findZipEntry(mainZip, meta.backgroundFile)
          if (bgFrom) {
            bgEntry = bgFrom
            bgFromMain = true
            console.warn(`  ${map.r2Key}: 包里没有曲绘 → 借用主图 ${mainKey} 的 "${bgFrom.name}"`)
          }
        }
      } catch (err) {
        console.warn(`  ${map.r2Key}: 借主图资源失败(${err.message}),这张图可能没声音`)
      }
    }

    const audioExt = getAudioExtension(audioSourceName || 'audio.mp3')
    const newAudioName = safeVersion + audioExt
    // 曲绘扩展名也按实际找到的文件取(bgEntry.name),声明 .jpg 但实际 .png 时不会错配。
    const bgExt = getBgExtension((bgEntry && bgEntry.name) || meta.backgroundFile || 'bg.jpg')
    const newBgName = safeVersion + bgExt

    const rewritten = rewriteOsu(osuContent, {
      newTitle: packName,
      newArtist: 'Various Artists',
      newCreator: 'various mappers,compiled by the osu!mania Ladder Team',
      newVersion,
      newAudioFilename: newAudioName,
      newBgFilename: newBgName,
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
      audioFromMain,
      bgFromMain,
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
Creator:various mappers,compiled by the osu!mania Ladder Team
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

// 分包规则(站长 2026-09-17,含当日修订):**≤120 → 1 包;≤200 → 2 包;≤270 → 3 包;≤360 → 4 包**;
// 再往上按"超过 90×(n-1) 就分 n 包"继续(451→6…)。
// 份数定了之后**均分**(每包相差 ≤1 张)。以前是"固定 80 切块",尾包会小到十几张
// (DP 只剩 13、CO 25、TB 31…),站长要求避免这种"数量差距过大"。
//
// 3 包的阈值从 180 抬到 200 的原因:刚过阈值那一段会出现"谷"(181 张分 3 包 = 61/60/60),
// 抬到 200 后 181~200 走 2 包(91/90 … 100/100)。各段起点仍会有轻微下探
// (121→61/60、201→67/67/67、271→68/68/68/67),要更窄的区间就再调这张表。
const PACK_SINGLE_MAX = 120
const PACK_SPLIT_STEP = 90

function packCountFor(total) {
  if (total <= PACK_SINGLE_MAX) return 1
  if (total <= 200) return 2
  if (total <= 270) return 3
  if (total <= 360) return 4
  let parts = 5
  while (total > PACK_SPLIT_STEP * parts) parts++
  return parts
}

/** 第 index 包(0-based)应该放几张 —— 均分:前 total % parts 包各多 1 张。 */
function packSizeFor(total, index, parts) {
  const base = Math.floor(total / parts)
  return base + (index < total % parts ? 1 : 0)
}

async function generatePack(targetType) {
  targetType = normalizeRealType(targetType)
  if (PACK_EXCLUDED_REAL_TYPES.has(targetType)) {
    console.log(`[${targetType}] Skipped: pending classification types are not downloadable packs`)
    return []
  }
  const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
  const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))

  const mapsToProcess = []
  const r2PathClaims = new Map()

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
        if (normalizeRealType(map.realType) === targetType) {
          const r2Key = `maps/${tournament.id}/${round.id}/${map.slot}.osz`
          const claim = r2PathClaims.get(r2Key)
          if (claim && (claim.beatmapId !== (map.beatmapId || null) || claim.name !== map.name)) {
            // Keep the legacy path for compatibility, but surface data that
            // cannot be represented by the roundId/slot storage convention.
            // Duplicate IDs (e.g. SSR SF/F) otherwise silently read one file.
            console.warn(`[${targetType}] R2 path collision: ${r2Key} is claimed by ${claim.roundAbbr} and ${round.abbreviation || round.id}`)
          } else if (!claim) {
            r2PathClaims.set(r2Key, {
              beatmapId: map.beatmapId || null,
              name: map.name,
              roundAbbr: round.abbreviation || round.id,
            })
          }
          mapsToProcess.push({
            tournamentId: tournament.id,
            tournamentAbbr: tournament.abbreviation,
            roundId: round.id,
            roundAbbr: round.abbreviation,
            slot: map.slot,
            difficulty: map.difficulty || 0,
            beatmapId: map.beatmapId || null,
            r2Key,
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

  const totalPacks = packCountFor(available.length)
  const packSizes = Array.from({ length: totalPacks }, (_, i) => packSizeFor(available.length, i, totalPacks))
  console.log(`[${targetType}] 分包:${available.length} 张 → ${totalPacks} 包 (${packSizes.join(' / ')})`)
  const results = []
  let cursor = 0

  for (let packIdx = 0; packIdx < totalPacks; packIdx++) {
    const chunk = available.slice(cursor, cursor + packSizes[packIdx])
    cursor += packSizes[packIdx]
    chunk.sort((a, b) => (a.difficulty || 0) - (b.difficulty || 0))
    const partNum = packIdx + 1
    const packName = `4K Tournament ${REAL_TYPE_NAMES[targetType] || targetType} Pack ${partNum}`
    const outputFileName = `${targetType}_${partNum}.osz`
    const outputPath = path.join(outputDir, outputFileName)
    const output = fs.createWriteStream(outputPath)
    const archive = new ZipArchive({ zlib: { level: 5 } })
    archive.pipe(output)

    // 并发预取:4 个并发跑 R2 下载 + JSZip 解压 + parseOsu。
    // 失败/缺 .osu 的返回 null,prefetch 内部已经 warn 过了。
    let prefetched
    try {
      prefetched = await mapWithConcurrency(chunk, 4, (m) => prefetchMap(m, packName))
    } catch (err) {
      console.warn(`  [Pack ${partNum}] prefetch error: ${err.message}`)
      prefetched = chunk.map(() => null)
    }

    // append 顺序与 chunk 原顺序一致(按难度排过),保证 zip 里图也是按难度排
    let processed = 0
    let processedSlots = 0  // 不含 NSV 变体,用于 manifest.mapCount —— 与 totalMaps(slot 数)同口径
    let audioFromMainCount = 0
    let audioMissingCount = 0
    const audioMissingKeys = []
    for (let i = 0; i < chunk.length; i++) {
      const item = prefetched[i]
      if (!item) continue
      if (item.audioFromMain) audioFromMainCount++
      if (!item.audio) { audioMissingCount++; audioMissingKeys.push(chunk[i].r2Key) }
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
    // 音频体检:借主图补上的、以及**仍然没有音频**的(后者在游戏里没声音,要人补传)。
    if (audioFromMainCount > 0 || audioMissingCount > 0) {
      console.warn(`  [${targetType} ${partNum}] 音频:借用主图 ${audioFromMainCount} 张;仍缺 ${audioMissingCount} 张${audioMissingCount > 0 ? ' → ' + audioMissingKeys.slice(0, 5).join(', ') + (audioMissingKeys.length > 5 ? ' …' : '') : ''}`)
    }

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
      for (const r of t.rounds) for (const m of r.maps) {
        const realType = normalizeRealType(m.realType)
        if (!PACK_EXCLUDED_REAL_TYPES.has(realType)) allTypes.add(realType)
      }
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
      if (allResults.length === 0) {
        // 本趟一个包都没产出 → producedKeys 为空,桶里所有 .osz 都会被判成孤儿。
        // 这种情况一律跳过清理(桶内容原样保留),由人工核对为什么没有产出。
        console.warn('  本次没有任何产出，跳过 packs 孤儿清理（避免把桶里的包全部删除）。')
      } else {
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
      }
    } else {
      console.log('\nR2_PACKS_PUBLIC_URL not set, skipping R2 packs upload')
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log('\nManifest updated:', manifestPath)
  }
}

// 只在被当成脚本直接运行时才执行 —— 否则测试 require 它会直接把整趟合包跑起来
// (还会覆盖 manifest、打 R2)。测试里用 dummy R2 凭据 require 本文件后只调纯函数。
if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1) })
}

module.exports = {
  rewriteOsu,
  normalizeRealType,
  REAL_TYPE_NAMES,
  packCountFor,
  packSizeFor,
  PACK_EXCLUDED_REAL_TYPES,
}
