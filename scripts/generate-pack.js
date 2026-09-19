const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')
const { formatSources } = require('./source-label')
const { ZipArchive } = require('archiver')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  STATUS_OK,
  STATUS_FAILED,
  STATUS_SKIPPED,
  evaluatePack,
  summarizeRun,
  labelOf,
  buildManifestPacks,
  findOrphanKeys,
  objectKeyFor,
  parsePackCli,
  describeCliError,
  CLI_USAGE,
} = require('./pack-publish')
const {
  contentSignature,
  metadataCandidateKey,
  pathsNeedingContentCheck,
  clusterEntries,
  findSameContentDifferentIdentity,
  slotTotalOf,
  pickExistingPath,
  tryPathsInOrder,
} = require('./mapIdentity')

const REAL_TYPE_ALIASES = { WC: 'LNWC' }
function normalizeRealType(realType) {
  const value = String(realType || '').trim()
  return REAL_TYPE_ALIASES[value] || value
}

/**
 * R2 下载并发。原来是写死的 4 —— 合包时间基本都花在"逐张下载 + 解压 + 解析"上，
 * 所以这是唯一一个不用改架构就能提速的旋钮。
 *
 * 用环境变量 `PACK_DOWNLOAD_CONCURRENCY` 调；非法值（0 / 负数 / NaN / 空）回退默认值，
 * 免得把并发设成 0 让任务空转。上限 32：再往上收益很小，更容易被上游限流。
 */
const DEFAULT_DOWNLOAD_CONCURRENCY = 8
const MAX_DOWNLOAD_CONCURRENCY = 32
function resolveDownloadConcurrency(raw = process.env.PACK_DOWNLOAD_CONCURRENCY) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DOWNLOAD_CONCURRENCY
  return Math.min(Math.floor(n), MAX_DOWNLOAD_CONCURRENCY)
}

const DOWNLOAD_CONCURRENCY = resolveDownloadConcurrency()
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'osumania-ladder-maps'
// 合包公开桶:与 R2_BUCKET(私有,放 .osz 原始文件)分离。
// 给前端 /download 直链下载用,r2.dev 公开域名,流量免费。
const R2_PACKS_BUCKET = process.env.R2_PACKS_BUCKET || 'osumania-ladder-packs'
const R2_PACKS_PUBLIC_URL = (process.env.R2_PACKS_PUBLIC_URL || '').replace(/\/+$/, '')

// 凭据检查放到 main 里（解析完 CLI、处理完 --help 之后）—— 否则 `--help` / 参数写错
// 都会先被一句"缺少凭据"挡住，看不到用法。
function assertR2Env() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.')
    process.exit(1)
  }
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

/** packs 桶的对象列表（分页 —— 对象数可能超过单页 1000，不分页会漏判孤儿）。 */
async function listPackBucketObjects() {
  const objects = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: R2_PACKS_BUCKET, ContinuationToken: token }))
    if (res.Contents) objects.push(...res.Contents)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
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

// 读一个引用的"身份"：元数据（只当候选键用）+ 内容摘要（真正的等价依据）。
// 一次下载同时拿两样，避免为同一张图下载两次。
async function readIdentity(r2Key) {
  try {
    const oszBuffer = await downloadFromR2(r2Key)
    const zip = await JSZip.loadAsync(oszBuffer)
    const osuFileName = Object.keys(zip.files).find(f => f.endsWith('.osu'))
    if (!osuFileName) return { ok: false, error: '压缩包里没有 .osu 文件' }
    const osuContent = await zip.files[osuFileName].async('string')
    return { ok: true, meta: parseOsu(osuContent), contentKey: contentSignature(osuContent) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * 预取一个条目：按候选路径依次尝试。
 *
 * R11 第 3 条：过去只按 `r2Keys.has()` 挑一个路径，首选文件损坏就直接丢图 ——
 * 明明还有一份内容等价的副本可用。现在首选失败（下载/解压/没 .osu/内容不符）时
 * 逐个换备选，全部失败才算是这张图这次拿不到（于是 R10 的门控会拦住发布）。
 */
async function prefetchMap(map, packName) {
  const paths = (map.alternatePaths && map.alternatePaths.length) ? map.alternatePaths : [map.r2Key]
  const outcome = await tryPathsInOrder(paths, (key) => prefetchOne({ ...map, r2Key: key }, packName))
  if (outcome.ok) {
    if (outcome.usedPath !== paths[0]) {
      console.warn(`  备选路径命中:${paths[0]} → ${outcome.usedPath}（共试 ${outcome.attempts} 个）`)
    }
    return outcome
  }
  return outcome.last || { ok: false, key: map.r2Key, reason: 'read-failed', error: 'unknown' }
}

async function prefetchOne(map, packName) {
  try {
    const oszBuffer = await downloadFromR2(map.r2Key)
    const zip = await JSZip.loadAsync(oszBuffer)

    const osuFileName = Object.keys(zip.files).find((f) => f.endsWith('.osu'))
    if (!osuFileName) {
      console.warn(`  Skip ${map.r2Key}: no .osu file`)
      return { ok: false, key: map.r2Key, reason: 'no-osu', error: '压缩包里没有 .osu 文件' }
    }
    const osuContent = await zip.files[osuFileName].async('string')

    // 内容摘要：既用于身份校验（备选路径不能冒充），也顺手交给调用方做「跨身份来源的
    // 同内容」报告 —— 此处 .osu 已经在手上，多算一次哈希**不额外下载任何东西**。
    const sig = contentSignature(osuContent)
    if (map.contentKey && sig !== map.contentKey) {
      return {
        ok: false,
        key: map.r2Key,
        reason: 'content-mismatch',
        error: `内容摘要不一致（期望 ${map.contentKey}，实际 ${sig || '空'}）`,
      }
    }

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
      ok: true,
      // 顺手带出内容摘要：只用于「跨身份来源的同内容」报告，不参与合并决策。
      contentKey: sig,
      payload: {
        osu: Buffer.from(rewritten, 'utf-8'),
        osuName: safeVersion + '.osu',
        audio: audioBuf,
        audioName: newAudioName,
        bg: bgBuf,
        bgName: newBgName,
        audioFromMain,
        bgFromMain,
      },
    }
  } catch (err) {
    console.warn(`  Error processing ${map.r2Key}: ${err.message}`)
    // 不再吞成 null 让外层静默 continue —— 见 R10:一张读不出来的图过去只会少一张,
    // 包照样上传、manifest 照样换成新统计,线上就变成"统计说有 100 张、包里只有 99 张"。
    return { ok: false, key: map.r2Key, reason: 'read-failed', error: err.message }
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

/**
 * 比赛的排序。**这就是包内来源标签的顺序** —— `formatSources` 只按首次出现分组、
 * 分组顺序即输入顺序，它自己不再排序，所以顺序完全由这个 comparator 决定。
 *
 * 2026-09-19 站长定稿：`priority` 降序 → `year` **升序**（旧→新）→ 缩写升序 → id 升序。
 *   · priority 排在年份**之前** —— 不是"先按年份"；
 *   · 年份是**升序**：同一张图被多个比赛用过时，先列早期比赛；
 *   · 第三级用**缩写**（包面标签显示的就是它），最后才用 id 兜底保证全序稳定（重名比赛）。
 *
 * ⚠️ 改这一处会改包内**合并谱面的 Version 字符串**（= 玩家成绩的身份），要改一次改定。
 * 单独抽成函数是为了能被 `generate-pack.test.mjs` 静态锁定顺序。
 */
function compareTournamentsForSources(a, b) {
  const priA = a.priority || 0
  const priB = b.priority || 0
  if (priA !== priB) return priB - priA
  const yearDiff = (a.year || 0) - (b.year || 0)
  if (yearDiff !== 0) return yearDiff
  const abbrDiff = (a.abbreviation || a.id).localeCompare(b.abbreviation || b.id)
  if (abbrDiff !== 0) return abbrDiff
  return a.id.localeCompare(b.id)
}

/**
 * 分包方案(2026-09-19 站长:「不喜欢第一个包里全是 MWC」)。
 *
 * 顺序数组本身没变(仍由上面 compareTournamentsForSources 决定),变的只是**怎么切成包**:
 *   · `sequence` —— 原来的行为:按累计张数连续切。于是最高优先级、年份最早的那批比赛
 *     会整批落进第 1 包(DE 实测第 1 包 = MWC 四届 + 4DM2023 + …)。
 *   · `tournament`(默认) —— 以**整场比赛**为单位轮流发牌:第 1 场进第 1 包、第 2 场进第 2 包……
 *     于是 MWC 四届被分散到四个包,每个包都同时拿到高/中/低 priority 的比赛(实测"平均
 *     priority 极差" 0.00~0.09,而连续切是 1.3~2.0)。两条例外:
 *       ① 一场比赛在目标包里**装不下**时会被切开,余量继续发给下一个最空的包(站长:不要紧);
 *       ② 张数超过"一个包的 1/8"的**大场**先摊成 P 段再轮流发 —— 否则一场 30 张的比赛会
 *          独占某个包的三分之一(DE 实测"最大单场占比" 34% → 10%)。实测只有 3~5 场会被切开。
 *   · `entry` —— 混沌版:逐张轮流发牌,每个包都拿到每场比赛的 1/P,包与包几乎无法区分;
 *     代价是**每一场**都会被切碎(实测 52/52 场)。
 *
 * 三种方案共同保证:
 *   ① 每包条目数 ≈ packSizes(均分,偏差 ≤ 2 条);
 *   ② **确定性** —— 同一份数据每次得到同样的划分。绝不用随机数:随机种子会让每次发布都
 *      重排包成员,而包名(含 `Pack N`)写进了每张图的 Title,等于每次发布都动玩家的成绩身份;
 *   ③ 不把一张图的 NSV 变体拆到主图之外(见 buildAtoms)。
 *
 * ⚠️ 换方案 = 换包成员 = 换包号 → 换每张图的 Title/Version → **已下载旧包的玩家会断成绩**。
 * 要换就一次换定。改这一处之前先确认站长知情(与 compareTournamentsForSources 同一个坑)。
 */
const SPLIT_MODES = new Set(['sequence', 'tournament', 'entry'])
const DEFAULT_SPLIT_MODE = 'tournament'
// 大场阈值:单场比赛超过"一个包的 1/8"时先摊成 P 段再轮流发(见 splitIntoPacks)
const BIG_BLOCK_DIVISOR = 8
function resolveSplitMode(raw = process.env.PACK_SPLIT_MODE) {
  const value = String(raw == null ? '' : raw).trim()
  return SPLIT_MODES.has(value) ? value : DEFAULT_SPLIT_MODE
}
const SPLIT_MODE = resolveSplitMode()

/**
 * 这张 NSV 是不是这张主图的变体?比对时带上 alternatePaths —— 主图被合并(被多个比赛复用)时,
 * 簇里留下的代表路径未必是这条 NSV 旁边的那个路径。
 */
function isNsvOf(nsv, main) {
  const nsvKey = String((nsv && nsv.r2Key) || '')
  if (!nsvKey.endsWith('.nsv.osz')) return false
  const paths = [main.r2Key, ...(main.alternatePaths || [])]
  return paths.some((p) => String(p || '').replace(/\.osz$/, '.nsv.osz') === nsvKey)
}

/**
 * 切成"原子":普通条目自己一个原子;NSV 紧跟在它的主图后面时并入同一个原子。
 * 切包只在原子之间落刀 —— 任何方案都不会出现"主图在包 1、它的 NSV 在包 2"。
 */
function buildAtoms(entries) {
  const atoms = []
  for (const e of entries) {
    const prev = atoms[atoms.length - 1]
    const prevTail = prev && prev[prev.length - 1]
    if (e && e.isNsv && prevTail && !prevTail.isNsv && isNsvOf(e, prevTail)) prev.push(e)
    else atoms.push([e])
  }
  return atoms
}

/**
 * 一个原子占几条条目(1 条,或"主图 + 它的 NSV"2 条)。
 * 写成函数是为了防御:一旦原子的形状不对,`undefined` 会让下面的容量计算变成 NaN,
 * 而 NaN 比较恒为 false → 所有条目会静默堆进第 1 包(2026-09-19 踩过这个坑)。
 */
function atomSize(atom) {
  return Array.isArray(atom) ? atom.length : 1
}

/**
 * 相邻、同一场比赛的条目归成一组。
 * `available` 的顺序保证同场比赛的条目连续(簇落在"第一次出现"的位置,而遍历是比赛优先的)。
 */
function groupByTournament(atoms) {
  const groups = []
  for (const atom of atoms) {
    const id = (atom[0] && atom[0].tournamentId) || ''
    const last = groups[groups.length - 1]
    if (last && last.id === id) last.atoms.push(atom)
    else groups.push({ id, atoms: [atom] })
  }
  return groups
}

/**
 * 按 packSizes 把条目分到各包。返回长度 = packSizes.length,每项是该包的条目,
 * **保持输入顺序**(难度排序由调用方在包内再做)。
 * packSizes 之和必须等于条目数(由 packSizeFor 保证),否则末尾会丢条目 —— 这里会直接抛。
 */
function splitIntoPacks(entries, packSizes, mode = SPLIT_MODE) {
  const sizes = Array.isArray(packSizes) ? packSizes : []
  const packs = sizes.map(() => [])
  const list = Array.isArray(entries) ? entries : []
  const expected = sizes.reduce((s, n) => s + n, 0)
  if (list.length !== expected) {
    throw new Error(`分包容量与条目数不符:${list.length} 条 vs 容量和 ${expected}`)
  }
  if (packs.length === 0 || list.length === 0) return packs
  const parts = packs.length
  const atoms = buildAtoms(list)

  if (mode === 'entry') {
    let cursor = 0
    for (const atom of atoms) {
      packs[cursor % parts].push(...atom)
      cursor++
    }
    return packs
  }

  if (mode === 'sequence') {
    // 与旧行为等价(按累计张数连续切),只是不再从原子中间落刀。
    let packIdx = 0
    for (const atom of atoms) {
      while (packIdx < parts - 1 && packs[packIdx].length >= sizes[packIdx]) packIdx++
      packs[packIdx].push(...atom)
    }
    return packs
  }

  // tournament(默认):整场优先,装不下才切,切下来的余量给下一个最空的包。
  // "大场"(超过一个包 1/8)先摊成 P 段再轮流发 —— 否则一场三四十张的比赛会独占一个包。
  const remaining = sizes.slice()
  const bigThreshold = parts > 1 ? Math.max(2, Math.floor(Math.max(...sizes) / BIG_BLOCK_DIVISOR)) : Infinity
  for (const group of groupByTournament(atoms)) {
    // "牌"的粒度:未超阈值的比赛整场是一张牌([group.atoms] 是"一张牌,里面 N 个原子"),
    // 超阈值的先摊成 P 段,每段一张牌。⚠️ 这里必须是"牌的数组" —— 直接把 group.atoms 当 blocks
    // 会退化成"每个原子一张牌",整场比赛就被拆碎了(2026-09-19 踩过)。
    let blocks = [group.atoms]
    if (group.atoms.length > bigThreshold) {
      const per = Math.ceil(group.atoms.length / parts)
      blocks = []
      for (let i = 0; i < group.atoms.length; i += per) blocks.push(group.atoms.slice(i, i + per))
    }
    for (const block of blocks) {
      // 一张"牌" = 整场比赛(或大场摊开后的其中一段)。装不下就切,余量留给下一个最空的包。
      let rest = block
      while (rest.length > 0) {
        let best = -1
        for (let i = 0; i < parts; i++) {
          if (remaining[i] <= 0) continue
          if (best < 0 || remaining[i] > remaining[best]) best = i
        }
        // 容量全被占满在理论上不会发生(容量和 = 条目数);兜底成"堆进第 1 包"也绝不丢条目。
        if (best < 0) best = 0
        let take = 0
        let used = 0
        while (take < rest.length && used + atomSize(rest[take]) <= remaining[best]) {
          used += atomSize(rest[take])
          take++
        }
        if (take === 0) {
          // 连一个原子(≤2 条)都放不下 → 允许这个包超出容量 1 条,而不是把原子切开。
          take = 1
          used = atomSize(rest[0])
        }
        packs[best].push(...rest.slice(0, take).flat())
        remaining[best] -= used
        rest = rest.slice(take)
      }
    }
  }
  return packs
}

async function generatePack(targetType, { publish = true } = {}) {
  targetType = normalizeRealType(targetType)
  if (PACK_EXCLUDED_REAL_TYPES.has(targetType)) {
    console.log(`[${targetType}] Skipped: pending classification types are not downloadable packs`)
    return { realType: targetType, status: STATUS_SKIPPED, reason: 'excluded-type', plannedSlots: 0, packs: [] }
  }
  const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
  const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))

  const mapsToProcess = []
  const r2PathClaims = new Map()

  const tournamentsList = files.map(file =>
    JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
  )
  tournamentsList.sort(compareTournamentsForSources)

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

  // JSON 里这个类型一个槽位都没有 → 视作"本次数据里没有该类型",保留旧包与旧清单项。
  // 必须与"有槽位但读不到文件"分开:后者是本次生成失败(见下面 available.length === 0),
  // 混为一谈的话,一次数据滞后就会把线上包当孤儿删掉(R10 第 1、2 条)。
  if (mapsToProcess.length === 0) {
    console.log(`[${targetType}] No slots in current data — keeping previously published packs`)
    return { realType: targetType, status: STATUS_SKIPPED, reason: 'no-slots', plannedSlots: 0, packs: [] }
  }

  const r2Objects = await listR2Objects('maps/')
  const r2Keys = new Set(r2Objects.map(o => o.Key))
  // 对象大小:用于给"同 BID 多路径"预筛 —— 大小不同必然不是同一份内容,
  // 不必各下载一次(R2 的 list 会带 Size)。
  const r2Sizes = new Map(r2Objects.map(o => [o.Key, o.Size]))

  // ---- 身份判定（R11）----
  // 过去按 `Artist|Title|Creator|Version` 指纹合并：同元数据不同音符会被判成同一张
  // （只打包一张，另一个槽位拿到的是别的曲子），元数据全空时全库并成一张。
  // 现在：元数据只用来**收窄候选**，等价性由**内容摘要**（Mode + 难度 + 时间轴 + 音符）决定。
  //
  // 一、收集所有物理引用。主图**即使 R2 里没有**也收进来 —— 它的来源标签不能丢，
  //     身份能确认时要挂到别的副本上（过去这里直接 continue，标签就没了）。
  const rawEntries = []
  for (const m of mapsToProcess) {
    const src = { tournamentAbbr: m.tournamentAbbr, roundAbbr: m.roundAbbr, slot: m.slot }
    rawEntries.push({
      ...m, isNsv: false, source: src,
      exists: r2Keys.has(m.r2Key), metadataKey: null, contentKey: null,
    })
    const nsvKey = m.r2Key.replace(/\.osz$/, '.nsv.osz')
    if (r2Keys.has(nsvKey)) {
      rawEntries.push({
        ...m, r2Key: nsvKey, isNsv: true, source: src,
        exists: true, metadataKey: null, contentKey: null,
      })
    }
  }

  // 二、需要读内容的引用只有两类：
  //     a) 没有 BID 的（要元数据当候选键，顺带算内容摘要）
  //     b) 同一个 BID 出现在多个物理路径上的（要核对内容是否真的一样）
  //     其余不必多花一次下载 —— 单一路径的 BID 本身就是身份。
  const ambiguousPaths = pathsNeedingContentCheck(rawEntries, r2Sizes)
  const needRead = rawEntries.filter(e => e.exists && (!e.beatmapId || ambiguousPaths.has(e.r2Key)))
  if (needRead.length > 0) {
    console.log(`[${targetType}] 身份核对:读取 ${needRead.length} 个引用（无 BID 或同 BID 多路径）...`)
    const infos = await mapWithConcurrency(needRead, DOWNLOAD_CONCURRENCY, (e) => readIdentity(e.r2Key))
    const byKey = new Map(needRead.map((e, i) => [e.r2Key, infos[i]]))
    for (const e of needRead) {
      const info = byKey.get(e.r2Key)
      if (info && info.ok) {
        e.metadataKey = metadataCandidateKey(info.meta)
        e.contentKey = info.contentKey
      } else {
        // 读不出来 → 不给候选键也不给摘要 → 它只与自身相等（绝不与别人合并）。
        e.identityError = (info && info.error) || 'read-failed'
        console.warn(`  身份核对失败 ${e.r2Key}: ${e.identityError}`)
      }
    }
  }

  // 三、聚簇 + 选路
  const { clusters, conflicts, unresolved } = clusterEntries(rawEntries)
  const available = []
  for (const c of clusters) {
    const best = pickExistingPath(c.alternatePaths, r2Keys)
    if (!best) {
      console.warn(`  跳过（所有候选路径都不在 R2）: ${c.alternatePaths.join(', ')}`)
      continue
    }
    c.r2Key = best
    available.push(c)
  }

  const identity = { conflicts, unresolved }
  for (const c of conflicts) {
    console.warn(
      `  ⚠ 同${c.candidateKey.startsWith('bid:') ? ' BID' : '元数据'}但内容不同 —— 未合并，各自打包: ` +
        c.members.map((m) => m.paths[0]).join(' vs '),
    )
  }
  if (unresolved.length > 0) {
    console.warn(`  ⚠ ${unresolved.length} 个引用指向的文件不存在、且身份无法确认（来源标签未挂靠）`)
    for (const u of unresolved.slice(0, 5)) console.warn(`    ${u.r2Key}（${u.reason}）`)
  }
  const mergedGroups = available.filter((c) => c.memberKeys.length > 1)
  if (mergedGroups.length > 0) {
    console.log(`[${targetType}] 按内容摘要合并了 ${mergedGroups.length} 组等价引用`)
  }

  // 计数口径:只数主图簇 —— 与包内 mapCount(非 NSV 条目数)同口径。
  // 过去按 `bid:xxx` / `raw:r2Key` 去重,合并后的簇会被算成多份,分母永远追不上分子。
  const uniqueSlotTotal = slotTotalOf(available)

  const dupCollapsed = rawEntries.length - available.length
  const nsvCount = available.filter(m => m.isNsv).length
  console.log(
    `[${targetType}] ${available.length} unique files in R2 (incl. ${nsvCount} NSV; collapsed ${dupCollapsed} duplicate slot ref(s))`
  )

  if (available.length === 0) {
    // 有槽位却一张可读文件都没有 = 本次生成失败(疑似谱面未上传 / 本地数据滞后),
    // **不能**当成"这个类型没图了":过去返回 [] 会让该类型从新 manifest 里整段消失,
    // 紧接着的孤儿清理就会把线上包删掉(R10)。
    console.error(`[${targetType}] ${mapsToProcess.length} slots in data but no available files in R2 — treating as FAILED`)
    return {
      realType: targetType,
      status: STATUS_FAILED,
      reason: 'no-available-files',
      plannedSlots: mapsToProcess.length,
      packs: [],
    }
  }

  const outputDir = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const totalPacks = packCountFor(available.length)
  const packSizes = Array.from({ length: totalPacks }, (_, i) => packSizeFor(available.length, i, totalPacks))
  // 切包方案见 SPLIT_MODE:默认"以整场比赛为单位轮流发牌",避免第一个包把最高优先级的比赛
  // 整批吞下;旧的连续切仍可用 PACK_SPLIT_MODE=sequence 复现(见 splitIntoPacks)。
  const packChunks = splitIntoPacks(available, packSizes)
  console.log(`[${targetType}] 分包:${available.length} 张 → ${totalPacks} 包 (${packSizes.join(' / ')}) 方案=${SPLIT_MODE}`)
  const results = []

  // 「跨身份来源的同内容」报告用：预取阶段每个条目本来就下载+解析过了，这里只是把
  // 已经算好的内容摘要收集起来。**零额外下载**，也不影响任何打包/合并决策。
  const identitySeen = []

  for (let packIdx = 0; packIdx < totalPacks; packIdx++) {
    const chunk = packChunks[packIdx]
    chunk.sort((a, b) => (a.difficulty || 0) - (b.difficulty || 0))
    const partNum = packIdx + 1
    const packName = `4K Tournament ${REAL_TYPE_NAMES[targetType] || targetType} Pack ${partNum}`
    const outputFileName = `${targetType}_${partNum}.osz`
    const outputPath = path.join(outputDir, outputFileName)
    const output = fs.createWriteStream(outputPath)
    const archive = new ZipArchive({ zlib: { level: 5 } })
    archive.pipe(output)

    // 并发预取:R2 下载 + JSZip 解压 + parseOsu。并发数见 DOWNLOAD_CONCURRENCY
    // （默认 8，可用 PACK_DOWNLOAD_CONCURRENCY 调）。失败/缺 .osu 的返回 null,
    // prefetch 内部已经 warn 过了。
    let prefetched
    let prefetchError = null
    try {
      prefetched = await mapWithConcurrency(chunk, DOWNLOAD_CONCURRENCY, (m) => prefetchMap(m, packName))
    } catch (err) {
      // mapWithConcurrency 只在 fn 抛异常时才抛;prefetchMap 自己已把失败包成对象,
      // 所以走到这里属于意外错误 —— 整包作废(下面会判成 failed)。
      console.warn(`  [Pack ${partNum}] prefetch error: ${err.message}`)
      prefetchError = err.message
      prefetched = chunk.map(() => null)
    }

    // append 顺序与 chunk 原顺序一致(按难度排过),保证 zip 里图也是按难度排
    let processed = 0
    let processedSlots = 0  // 不含 NSV 变体,用于 manifest.mapCount —— 与 totalMaps(slot 数)同口径
    let audioFromMainCount = 0
    let audioMissingCount = 0
    const audioMissingKeys = []
    const skippedMaps = []
    for (let i = 0; i < chunk.length; i++) {
      const item = prefetched[i]
      if (!item || !item.ok) {
        // 计划里的这张没进来 —— 记下来交给 evaluatePack 判失败。
        // 过去这里是裸 `continue`,一张坏图只表现为"包里少一张",没人会发现。
        skippedMaps.push({
          key: (item && item.key) || chunk[i].r2Key,
          reason: (item && item.reason) || 'prefetch-failed',
          error: (item && item.error) || prefetchError || '',
        })
        continue
      }
      const p = item.payload
      identitySeen.push({
        r2Key: item.usedPath || chunk[i].r2Key,
        beatmapId: chunk[i].beatmapId,
        metadataKey: chunk[i].metadataKey,
        isNsv: !!chunk[i].isNsv,
        contentKey: item.contentKey || chunk[i].contentKey || null,
        sources: chunk[i].sources || [],
      })
      if (p.audioFromMain) audioFromMainCount++
      if (!p.audio) { audioMissingCount++; audioMissingKeys.push(chunk[i].r2Key) }
      archive.append(p.osu, { name: p.osuName })
      if (p.audio) archive.append(p.audio, { name: p.audioName })
      if (p.bg) archive.append(p.bg, { name: p.bgName })
      processed++
      if (!chunk[i].isNsv) processedSlots++
      if (processed % 10 === 0) console.log(`  [Pack ${partNum}] Appended ${processed}/${chunk.length}`)
    }

    archive.append(Buffer.from(DELETE_PLACEHOLDER_OSU, 'utf-8'), { name: 'delete this.osu' })
    await archive.finalize()
    await new Promise(resolve => output.on('close', resolve))

    const stats = fs.statSync(outputPath)
    const plannedSlots = chunk.filter((e) => !e.isNsv).length
    const contentVerdict = evaluatePack({
      plannedEntries: chunk.length,
      processedEntries: processed,
      plannedSlots,
      processedSlots,
    })
    console.log(`[${targetType} ${partNum}] Pack generated: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${processed} entries (${processedSlots} slots)`)

    const packEntry = {
      realType: targetType,
      name: packName,
      part: partNum,
      mapCount: processedSlots,
      // 用去重后的唯一槽位数(而非 mapsToProcess.length),避免下载页进度条
      // 因为多个比赛复用同一张图导致 mapCount 永远追不上 totalMaps。
      totalMaps: uniqueSlotTotal,
      sizeMB: Math.round(stats.size / 1024 / 1024),
      outputPath,
      key: outputFileName,
      // 内容寻址的对象键（上传成功后才填）
      objectKey: null,
      status: contentVerdict.status,
      reason: contentVerdict.reason,
      detail: contentVerdict.detail || '',
      skippedMaps,
    }
    // 音频体检:借主图补上的、以及**仍然没有音频**的(后者在游戏里没声音,要人补传)。
    if (audioFromMainCount > 0 || audioMissingCount > 0) {
      console.warn(`  [${targetType} ${partNum}] 音频:借用主图 ${audioFromMainCount} 张;仍缺 ${audioMissingCount} 张${audioMissingCount > 0 ? ' → ' + audioMissingKeys.slice(0, 5).join(', ') + (audioMissingKeys.length > 5 ? ' …' : '') : ''}`)
    }

    // 内容层面就不完整(有图没进来 / 整包只有占位图)→ **不上传、不进清单**(R10)。
    // 过去是继续走:少几张的包覆盖掉桶里的旧包,而 manifest 却写着新的 mapCount。
    if (contentVerdict.status === STATUS_FAILED) {
      console.error(
        `  [${targetType} ${partNum}] 不发布该包:${labelOf(contentVerdict.reason)}` +
          (contentVerdict.detail ? `(${contentVerdict.detail})` : '') +
          (skippedMaps.length
            ? ` — 未进来:${skippedMaps.slice(0, 5).map((s) => s.key).join(', ')}${skippedMaps.length > 5 ? ' …' : ''}`
            : ''),
      )
      try {
        fs.unlinkSync(outputPath)
      } catch { /* 删不掉只是磁盘垃圾,不影响结论 */ }
      results.push(packEntry)
      continue
    }

    // 生成完立即上传 R2 packs 桶并删本地副本。关键:删除必须发生在生成阶段,
    // 不能等所有包都生成完再一起删——否则 output/ 会堆满全部 52 个包
    // (12.6GB+),在 14GB 磁盘的 runner 上先被撑爆(进程被杀 → "hosted runner
    // lost communication" + 日志空)。逐包上传让磁盘峰值只占一个包(~几百MB)。
    // Body 用 Buffer 而非流:SDK 对流式 body 默认走 Transfer-Encoding: chunked,
    // 而 R2 的 S3 API 不支持 chunked(会 403 签名错误),Buffer + Content-Length
    // 才是 R2 验证过的上传方式。每包 Buffer(~几百MB)+ 前面 prefetch/archive
    // 的缓冲仍远在 8GB 内存内,不是瓶颈。
    // publish=false（单类型离线预览）时连 R2 都不碰 —— 不留旧计数、也不覆盖线上对象。
    if (!publish && R2_PACKS_PUBLIC_URL) {
      // 离线预览:不传,但把"假如发布会用哪个键"算出来打日志,方便比对。
      const buf = fs.readFileSync(outputPath)
      const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
      console.log(`  [${targetType} ${partNum}] 预览（未上传）对象键会是 ${objectKeyFor(targetType, partNum, hash)}`)
    }
    if (R2_PACKS_PUBLIC_URL && publish) {
      const buf = fs.readFileSync(outputPath)
      // 内容寻址:键里带内容哈希。新内容 = 新键 → 传到一半失败也只有新键是坏的,
      // 线上清单仍指向旧键(旧对象原地不动),不会出现"同一个键一半新一半旧"(R10 第 3 条)。
      const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
      const objectKey = objectKeyFor(targetType, partNum, hash)
      try {
        await withRetry(() => s3.send(new PutObjectCommand({
          Bucket: R2_PACKS_BUCKET,
          Key: objectKey,
          Body: buf,
          ContentType: 'application/x-osu-archive',
        })), { label: `上传 ${objectKey}` })
        packEntry.objectKey = objectKey
        packEntry.links = { r2: `${R2_PACKS_PUBLIC_URL}/${objectKey}` }
        console.log(`  [${targetType} ${partNum}] Uploaded ${objectKey} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
      } catch (err) {
        // 上传失败 = 这个包本次没更新成功 → 标成 failed,整次发布会被取消。
        // 这样就不会出现"manifest 说更新了、桶里还是旧包"的半发布。
        packEntry.status = STATUS_FAILED
        packEntry.reason = 'r2-upload'
        packEntry.detail = err.message
        console.warn(`  Failed to upload ${objectKey}: ${err.message} (local copy kept)`)
      }
      // 只在上传成功后才删本地:失败时保留(单包几百MB可接受),避免这张包
      // 从 R2 里静默消失、下载页直接断链。
      if (packEntry.links && packEntry.links.r2) {
        try {
          fs.unlinkSync(outputPath)
        } catch (unlinkErr) {
          console.warn(`  Failed to remove local ${outputPath}: ${unlinkErr.message}`)
        }
      }
    }

    results.push(packEntry)
  }

  return {
    realType: targetType,
    status: STATUS_OK,
    // JSON 里引用的槽位数（不是 R2 里存在的数量）——用来识别"有槽位却一个包都没产出"。
    plannedSlots: mapsToProcess.length,
    packs: results,
    // 身份判定的产出（同 BID/同元数据但内容不同、缺文件且身份无法确认），
    // 由 main 汇总成 reports/pack-identity-report.md 供人工核对。
    // sameContent 是**只报告不改包**的一项：内容摘要相同、但身份来源（候选键）不同，
    // 现在既不合并不报冲突 —— 先量化规模，再决定要不要真的按内容合并（R11 后续）。
    identity: {
      ...identity,
      sameContent: findSameContentDifferentIdentity(identitySeen),
      sameContentScanned: identitySeen.length,
    },
  }
}

const IDENTITY_REPORT_PATH = path.join(__dirname, '..', 'reports', 'pack-identity-report.md')
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'packs-manifest.json')
const PREV_MANIFEST_PATH = path.join(__dirname, '..', 'data', 'packs-manifest.previous.json')

/**
 * 报告里有内容的条数：conflicts + unresolved + sameContent。
 * 用来决定"要不要提示报告已更新"—— **三类都算**，漏掉 sameContent 会让
 * "只有同内容重复、没有冲突"的那次运行一声不吭（看起来像没出报告）。
 */
function countIdentityIssues(identity) {
  if (!identity) return 0
  return (identity.conflicts || []).length + (identity.unresolved || []).length + (identity.sameContent || []).length
}

/**
 * 把"需要人工核对"的身份问题写成报告（R11 要求输出核对项，而不是静默合并/静默丢弃）。
 * 内容等价的多路径引用属于正常合并，不进这份报告（在运行日志里）。
 */
function writeIdentityReport(typeResults, outPath = IDENTITY_REPORT_PATH, options = {}) {
  const lines = [
    '# 合包身份核对报告',
    '',
    `生成时间：${new Date().toISOString()}`,
    ...(options.note ? [options.note, ''] : []),
    '',
    '只列**需要人工核对**的项：同一个 BID / 同一组元数据下内容不同的谱面（已阻止合并，各自打包），',
    '指向的文件缺失、身份无法确认的引用（来源标签未挂靠），以及**内容摘要相同但身份来源不同**',
    '（现在的实现既不合并不报冲突，只在这里列出来量化规模）。内容等价的多路径引用属正常合并，只在运行日志里。',
    '',
  ]
  if (options.summaryTable) {
    const n = (arr) => (arr || []).length
    lines.push(
      '## 本次体检汇总',
      '',
      '| 类型 | 槽位 | 可读引用 | 读取失败 | 同 BID/元数据但内容不同 | 缺文件身份不明 | 同内容不同身份来源 |',
      '|---|---:|---:|---:|---:|---:|---:|',
    )
    for (const t of typeResults) {
      const id = (t && t.identity) || {}
      lines.push(
        `| ${t.realType} | ${t.status === STATUS_SKIPPED ? 0 : t.plannedSlots ?? '-'} | ${id.readableEntries ?? '-'} | ` +
          `${id.readFailed ?? '-'} | ${t.identity ? n(id.conflicts) : '-'} | ${t.identity ? n(id.unresolved) : '-'} | ${t.identity ? n(id.sameContent) : '-'} |`,
      )
    }
    lines.push('', '> `读取失败` = 这些引用没看清（下载/解压/解析失败），**不等于**它们没有重复。', '')
  }
  let total = 0
  for (const t of typeResults) {
    const id = t && t.identity
    if (!id) continue
    const conflicts = id.conflicts || []
    const unresolved = id.unresolved || []
    const sameContent = id.sameContent || []
    if (conflicts.length === 0 && unresolved.length === 0 && sameContent.length === 0) continue
    total += conflicts.length + unresolved.length + sameContent.length
    lines.push(`## ${t.realType}`, '')
    if (id.readFailed) {
      lines.push(`> 有 ${id.readFailed} 个引用读取失败、未参与本次判定 —— 这部分是"看不清"，不等于"没有重复"。`, '')
    }
    if (conflicts.length) {
      lines.push('### 同 BID / 同元数据但内容不同（已阻止合并）', '')
      for (const c of conflicts) {
        lines.push(`- **${c.candidateKey}**（${c.reason}）`)
        for (const m of c.members) {
          const from = m.sources.map((s) => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).join('、')
          lines.push(`  - 内容摘要 \`${m.contentKey || '无'}\`：\`${m.paths.join('` / `')}\` ← ${from}`)
        }
      }
      lines.push('')
    }
    if (unresolved.length) {
      lines.push(`### 文件缺失且身份无法确认（${unresolved.length} 条）`, '')
      for (const u of unresolved) {
        const from = `${u.source.tournamentAbbr}${u.source.roundAbbr} ${u.source.slot}`
        lines.push(`- \`${u.r2Key}\`（${u.reason}，beatmapId=${u.beatmapId || '无'}）← ${from}`)
      }
      lines.push('')
    }
    if (sameContent.length) {
      lines.push(
        `### 内容摘要相同、但身份来源不同（${sameContent.length} 组，只报告、未改动打包结果）`,
        '',
        '判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，',
        '但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。',
        '是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。',
        '',
      )
      for (const g of sameContent) {
        lines.push(`- 摘要 \`${g.contentKey}\`${g.isNsv ? '（NSV）' : ''}`)
        for (const grp of g.groups) {
          const members = grp.members.map((m) => {
            const from = (m.sources || []).map((s) => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).join('、')
            return `\`${m.r2Key}\`${from ? ` ← ${from}` : ''}`
          })
          lines.push(`  - **${grp.candidateKey}**：${members.join(' ／ ')}`)
        }
      }
      lines.push('')
    }
  }
  if (total === 0) lines.push('（本次没有任何需要人工核对的项）', '')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join('\n') + '\n')
}

/**
 * 只读身份体检（`--identity-report`）：**不打包、不上传、不改 manifest、不写 output/**。
 *
 * 为什么单独实现而不复用 `generatePack`：generatePack 的后半段是分包 → 写 zip → 传 R2 →
 * 门控发布，报告模式一条都不需要。抽出公共部分要把全项目最贵的那条流程改一遍；这里只复用
 * 它的**原语**（列对象、聚簇、读身份、报告渲染），编排逻辑重复约 40 行，换来的是
 * 「报告绝不可能影响打包结果」。
 *
 * 与合包流程的关键差别：这里要读**所有存在的引用**的内容摘要。合包只在「无 BID」或
 * 「同 BID 多路径」时才读内容（单路径的 BID 本身就是身份）—— 而跨身份来源的重复，
 * 恰恰有一半是「有 BID」的那种，不读就会漏。代价是下载该类型的每张图（只读，不改任何东西）。
 */
async function analyzeTypeIdentity(targetType, sharedR2Keys = null) {
  const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
  const files = fs.readdirSync(tournamentsDir).filter((f) => f.endsWith('.json'))

  const mapsToProcess = []
  for (const file of files) {
    const tournament = JSON.parse(fs.readFileSync(path.join(tournamentsDir, file), 'utf-8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        if (normalizeRealType(map.realType) !== targetType) continue
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

  console.log(`[${targetType}] 槽位 ${mapsToProcess.length} 个`)
  if (mapsToProcess.length === 0) {
    return { realType: targetType, status: STATUS_SKIPPED, reason: 'no-slots', plannedSlots: 0, identity: null }
  }

  // 全部类型体检时共用一份清单：maps/ 前缀的对象可能有上万个，逐类型重复列举既慢又白花请求。
  const r2Keys = sharedR2Keys || new Set((await listR2Objects('maps/')).map((o) => o.Key))

  const rawEntries = []
  for (const m of mapsToProcess) {
    const src = { tournamentAbbr: m.tournamentAbbr, roundAbbr: m.roundAbbr, slot: m.slot }
    rawEntries.push({
      ...m, isNsv: false, source: src, exists: r2Keys.has(m.r2Key), metadataKey: null, contentKey: null,
    })
    const nsvKey = m.r2Key.replace(/\.osz$/, '.nsv.osz')
    if (r2Keys.has(nsvKey)) {
      rawEntries.push({
        ...m, r2Key: nsvKey, isNsv: true, source: src, exists: true, metadataKey: null, contentKey: null,
      })
    }
  }

  const needRead = rawEntries.filter((e) => e.exists)
  let readFailed = 0
  if (needRead.length > 0) {
    console.log(`[${targetType}] 读取 ${needRead.length} 个引用的内容摘要（只读，不打包）...`)
    const infos = await mapWithConcurrency(needRead, DOWNLOAD_CONCURRENCY, (e) => readIdentity(e.r2Key))
    const byKey = new Map(needRead.map((e, i) => [e.r2Key, infos[i]]))
    for (const e of needRead) {
      const info = byKey.get(e.r2Key)
      if (info && info.ok) {
        e.metadataKey = metadataCandidateKey(info.meta)
        e.contentKey = info.contentKey
      } else {
        e.identityError = (info && info.error) || 'read-failed'
        readFailed++
        console.warn(`  身份读取失败 ${e.r2Key}: ${e.identityError}`)
      }
    }
  }

  const { conflicts, unresolved } = clusterEntries(rawEntries)
  const readable = rawEntries.filter((e) => e.exists && e.contentKey)
  const sameContent = findSameContentDifferentIdentity(readable)

  console.log(
    `[${targetType}] 槽位 ${mapsToProcess.length}｜可读引用 ${readable.length}｜读取失败 ${readFailed}` +
      `｜同 BID/同元数据但内容不同 ${conflicts.length}｜缺文件身份不明 ${unresolved.length}｜同内容不同身份来源 ${sameContent.length}`,
  )

  return {
    realType: targetType,
    status: STATUS_OK,
    plannedSlots: mapsToProcess.length,
    packs: [],
    identity: { conflicts, unresolved, sameContent, readFailed, readableEntries: readable.length },
  }
}

async function main() {
  const cli = parsePackCli(process.argv.slice(2), {
    knownTypes: Object.keys(REAL_TYPE_NAMES),
    excludedTypes: [...PACK_EXCLUDED_REAL_TYPES],
  })

  if (cli.mode === 'help') {
    console.log(CLI_USAGE)
    return
  }
  if (!cli.ok) {
    for (const e of cli.errors) console.error(`参数错误:${describeCliError(e)}`)
    console.error(`\n${CLI_USAGE}`)
    console.error(`\n可用的 realType:${Object.keys(REAL_TYPE_NAMES).join(', ')}`)
    process.exit(2)
  }

  assertR2Env()
  for (const w of cli.warnings) {
    if (w.code === 'excluded-type') {
      console.warn(`注意:${w.type} 属于 Pending 族,不产出下载包。`)
    }
  }

  if (cli.mode === 'identity-report') {
    // 只读体检：先于打包/发布分支返回，绝不落到"全量发布"那条路上。
    const allTypes = Object.keys(REAL_TYPE_NAMES).filter((t) => !PACK_EXCLUDED_REAL_TYPES.has(t))
    const types = cli.targetType ? [cli.targetType] : allTypes
    console.log(`只读身份体检：${types.length} 个类型 —— ${types.join(', ')}`)
    console.log('不打包、不上传 R2、不改 manifest、不写 output/；只读 R2 算身份并写报告。')
    // 全部类型共用一份 maps/ 对象清单（否则 38 个类型要各列一遍）。
    let sharedR2Keys = null
    if (types.length > 1) {
      console.log('先列一次 maps/ 的对象清单（全部类型共用）...')
      sharedR2Keys = new Set((await listR2Objects('maps/')).map((o) => o.Key))
      console.log(`maps/ 现有对象 ${sharedR2Keys.size} 个`)
    }
    const results = []
    for (const type of types) {
      try {
        results.push(await analyzeTypeIdentity(type, sharedR2Keys))
      } catch (err) {
        console.error(`[${type}] 体检失败：${err.message}`)
        results.push({
          realType: type, status: STATUS_FAILED, reason: 'identity-report',
          detail: err.message, packs: [], identity: null,
        })
      }
    }
    const failed = results.filter((r) => r.status === STATUS_FAILED)
    if (failed.length > 0) {
      // **不写报告**：部分类型失败时写出来的是一份"看起来完整、其实是残的"报告，
      // 覆盖掉上一次的结果之后没法分辨（尤其它是会被提交进仓库的文件）。
      console.error(`\n${failed.length} 个类型体检失败：${failed.map((r) => r.realType).join(', ')}`)
      console.error('为避免用不完整的报告覆盖上一次的结果，本次不写报告文件。')
      process.exit(1)
    }
    writeIdentityReport(results, IDENTITY_REPORT_PATH, {
      note: '本次由 `--identity-report` 生成（**只读体检**）：没有生成或上传任何包，也没有改动清单。',
      summaryTable: true,
    })
    const issues = results.reduce((n, r) => n + countIdentityIssues(r.identity), 0)
    console.log(`\n报告：${path.relative(path.join(__dirname, '..'), IDENTITY_REPORT_PATH)}`)
    console.log(`共 ${issues} 条需要人工看。`)
    return
  }

  if (cli.mode === 'single-preview' || cli.mode === 'single-publish') {
    // 单类型有两种明确语义（R12 第 3 条）:
    //   · 预览（默认）—— 只生成到 output/,不上传 R2、不动 manifest
    //   · 发布（--publish）—— 上传 R2 + **只替换该类型**的清单条目（其他类型与人工链接原样保留）
    // 过去是"更新对象却不更新清单",于是线上会出现旧计数/旧 part 列表。
    const publish = cli.mode === 'single-publish'
    console.log(`单类型模式:${cli.targetType} —— ${publish ? '发布（上传 R2 + 更新该类型清单条目）' : '仅离线预览（不碰 R2 与 manifest）'}`)
    const result = await generatePack(cli.targetType, { publish })

    console.log('\nDone:', JSON.stringify(result.packs.map((p) => ({
      key: p.key, mapCount: p.mapCount, sizeMB: p.sizeMB, status: p.status, outputPath: p.outputPath,
    })), null, 2))

    const summary = summarizeRun([result])
    if (!summary.publishable) {
      console.error('\n本次生成失败(未更新任何清单):')
      for (const f of summary.failures) console.error(`  - ${f.label}${f.detail ? ' — ' + f.detail : ''}`)
      process.exit(1)
    }

    if (result.status === STATUS_SKIPPED) {
      console.log(`\n${cli.targetType} 在当前数据里没有槽位（或属于不产包的类型）—— 没有做任何改动。`)
    } else if (!publish) {
      console.log('\n离线预览完成:包在 output/ 下,未上传 R2、未改动 manifest。要发布请加 --publish。')
    } else {
      let oldManifest = { packs: [], lastGenerated: '' }
      if (fs.existsSync(MANIFEST_PATH)) oldManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
      const { packs, pendingMirrors } = buildManifestPacks({
        typeResults: [result], oldManifest, preserveOtherTypes: true,
      })
      const manifest = { packs, lastGenerated: new Date().toISOString() }
      if (pendingMirrors.length > 0) manifest.pendingMirrors = pendingMirrors
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
      console.log(`\n已更新 manifest 里 ${cli.targetType} 的条目（其他类型与人工链接原样保留）。`)
      console.log('注意:单类型发布**不写** packs-manifest.previous.json、**不清理**孤儿 —— 这两件只有全量发布才做。')
      if (pendingMirrors.length > 0) {
        console.warn(`该类型的镜像链接仍指向旧内容:${pendingMirrors.join(', ')}（Drive 需整套重跑）`)
      }
    }

    // 身份核对报告（只含本次这个类型）
    writeIdentityReport([result])
    if (countIdentityIssues(result.identity) > 0) {
      console.warn(`身份核对报告（只含 ${cli.targetType}）: ${path.relative(path.join(__dirname, '..'), IDENTITY_REPORT_PATH)}`)
    }
    return
  }

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
  const typeResults = []
  for (const type of allTypes) {
    typeResults.push(await generatePack(type))
  }

  const manifestPath = MANIFEST_PATH
  const prevManifestPath = PREV_MANIFEST_PATH
  let oldManifest = { packs: [], lastGenerated: '' }
  if (fs.existsSync(manifestPath)) {
    oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  }

  const summary = summarizeRun(typeResults)

  // 有任何失败 → **整次发布取消**:不写 manifest、不写 .previous、不做任何清理。
  // 线上仍是上一次那套完整可用的版本 —— 这是 R10 要的核心保证:
  // 宁可什么都不更新,也不能出现"新统计配旧对象链接"或半新半旧。
  if (!summary.publishable) {
    console.error(`\n本次生成失败(${summary.failures.length} 项),已取消发布:`)
    for (const f of summary.failures) console.error(`  - ${f.label}${f.detail ? ' — ' + f.detail : ''}`)
    console.error('data/packs-manifest.json 未被改动,也没有删除任何对象 —— 线上仍指向上一版完整包。')
    console.error('修掉上面的问题后重跑;若确认是数据侧确实该删,请先处理数据再重跑。')
    process.exit(1)
  }
  const { packs, pendingMirrors } = buildManifestPacks({ typeResults, oldManifest })
  const manifest = { packs, lastGenerated: new Date().toISOString() }
  if (pendingMirrors.length > 0) manifest.pendingMirrors = pendingMirrors

  // .previous 是给 upload-to-gdrive.js 判断 Drive 孤儿用的过程文件。
  // 只在确定要发布(没有任何失败)时才写它,否则 Drive 侧会照一份没被采用的清单去算孤儿。
  fs.writeFileSync(prevManifestPath, JSON.stringify(oldManifest, null, 2) + '\n')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('\nManifest updated:', manifestPath)

  writeIdentityReport(typeResults)
  const identityIssues = typeResults.reduce((n, t) => n + countIdentityIssues(t.identity), 0)
  if (identityIssues > 0) {
    console.warn(`\n身份核对:${identityIssues} 项需要人工看 → ${path.relative(path.join(__dirname, '..'), IDENTITY_REPORT_PATH)}`)
  }

  if (summary.skippedTypes.length) {
    console.warn(`\n注意:${summary.skippedTypes.join(', ')} 在当前数据里没有任何槽位,其旧包与旧清单项已原样保留。`)
    console.warn('  若这些类型确实已废弃,请人工从 packs-manifest.json 删掉对应条目、再清理 R2 桶。')
  }
  if (pendingMirrors.length) {
    console.warn(`\n注意:${pendingMirrors.length} 个包的内容本次有更新,其镜像链接此刻仍指向旧内容:`)
    console.warn(`  ${pendingMirrors.join(', ')}`)
    console.warn('  跑 upload-to-gdrive 后会同步;清单顶层的 pendingMirrors 就是给那一步与人工核查用的。')
  }

  // 桶里"本次清单没引用"的对象：这里**只报告，绝不删**。
  //
  // 真删挪到了独立命令 `node scripts/gc-pack-objects.mjs`，原因有两条（另一条线的审查 P1）：
  //   ① 它必须基于**已提交/已部署**的清单来判。生成流程里手上这份清单还没提交，
  //      而重跑一次若 ZIP hash 变了，新键与被线上引用的旧键不同 → 会把线上正在引用的对象删掉。
  //   ② 刚上传、清单还没提交的那批对象此刻正是"没人引用"的状态，必须有保留期兜着。
  if (!R2_PACKS_PUBLIC_URL) {
    console.log('\nR2_PACKS_PUBLIC_URL not set, skipping R2 packs upload')
    return
  }
  try {
    const bucketObjects = await listPackBucketObjects()
    const orphanKeys = findOrphanKeys({ bucketKeys: bucketObjects.map(o => o.Key).filter(Boolean), packs })
    if (orphanKeys.length === 0) {
      console.log('\n桶里没有未被清单引用的对象。')
      return
    }
    console.warn(`\n桶里有 ${orphanKeys.length} 个对象未被本次清单引用（多数是上一版的旧键）:`)
    for (const k of orphanKeys.slice(0, 20)) console.warn(`  - ${k}`)
    if (orphanKeys.length > 20) console.warn(`  … 还有 ${orphanKeys.length - 20} 个`)
    console.warn('本次**不会删除任何对象**。确认新清单已提交并部署之后再跑:')
    console.warn('  node scripts/gc-pack-objects.mjs                   # 先看（默认只报告）')
    console.warn('  node scripts/gc-pack-objects.mjs --clean-orphans   # 确认后真删（带保留期）')
  } catch (err) {
    console.warn(`孤儿报告跳过: ${err.message}`)
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
  // 包内来源标签的顺序唯一实现（含 priority/year/缩写/id 四级）
  compareTournamentsForSources,
  // 切包方案：纯函数，导出给单测（三种方案的分布 / 原子不被切开 / 容量守恒）
  splitIntoPacks,
  buildAtoms,
  groupByTournament,
  resolveSplitMode,
  SPLIT_MODE,
  DEFAULT_SPLIT_MODE,
  PACK_EXCLUDED_REAL_TYPES,
  // 报告渲染是纯函数式的（给一个类型结果数组 + 输出路径），导出来是为了能单测
  writeIdentityReport,
  countIdentityIssues,
  // 并发旋钮：导出给单测（默认值 / 非法值回退 / 上限）
  resolveDownloadConcurrency,
  DEFAULT_DOWNLOAD_CONCURRENCY,
  MAX_DOWNLOAD_CONCURRENCY,
}
