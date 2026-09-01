// SSR 事故修复:SF 和 F 两个 round 的 id 曾同为 round-8,R2 key
// maps/solo-score-rush/round-8/{slot}.osz 互相覆盖。JSON 已修复
// (F 改 id=round-8-f),本脚本把 R2 上的 .osz 搬到正确前缀:
//
//   1. 下载 maps/solo-score-rush/round-8/ 下每个 .osz,解出第一个 .osu 的
//      BeatmapID(合包重写过 Metadata,但 BeatmapID 保留;且这些图先于合包上传,
//      内部 BID 是原始值);
//   2. BID 属于 F 轮数据 → 搬到 round-8-f/(目标已有同名文件则先备份);
//      BID 属于 SF 轮 → 留在 round-8/;
//      两轮都不是 → 不动,进报告人工判断;
//   3. F 的文件搬完后,round-8/ 下只剩 SF 的文件。
//
// 只增不删:被顶掉的文件改名存成 <key>.orphan-<ts>,绝不直接覆盖。
// dry-run 默认,--apply 才真搬。
//
// 复用 generate-pack.js 的 R2 凭证环境变量:
//   R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET
//
// 用法:
//   node scripts/fix-ssr-r2.js            # dry-run
//   node scripts/fix-ssr-r2.js --apply

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const JSZip = require('jszip')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'osumania-ladder-maps'
const APPLY = process.argv.includes('--apply')

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

const PREFIX = 'maps/solo-score-rush/round-8/'
const DEST_PREFIX = 'maps/solo-score-rush/round-8-f/'

// 当前 JSON 里两轮的 BID → slot 映射(与搬移判定解耦,脚本重跑也稳)
const { sfByBid, fByBid } = (() => {
  const d = require('../data/tournaments/solo-score-rush.json')
  const sf = d.rounds.find(r => r.abbreviation === 'SF')
  const f = d.rounds.find(r => r.abbreviation === 'F')
  const build = (round) => {
    const m = new Map()
    for (const map of round.maps) if (map.beatmapId) m.set(map.beatmapId, map.slot)
    return m
  }
  return { sfByBid: build(sf), fByBid: build(f) }
})()

async function listAll(prefix) {
  const out = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }))
    if (res.Contents) out.push(...res.Contents)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

async function getBuffer(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// .osz 内第一个 .osu 的 BeatmapID(原始上传内部就是原始 BID;被合包重写过的
// Title/Creator 不影响判定)。找不到/≤0 返回 null。
async function readBeatmapId(key) {
  const buf = await getBuffer(key)
  const zip = await JSZip.loadAsync(buf)
  const osuName = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.osu'))
  if (!osuName) return null
  const content = await zip.files[osuName].async('string')
  const m = content.match(/^BeatmapID:\s*(\d+)\s*$/m)
  const bid = m ? parseInt(m[1], 10) : 0
  return bid > 0 ? bid : null
}

async function main() {
  console.log(`模式: ${APPLY ? 'APPLY(真搬)' : 'DRY-RUN(加 --apply 才动 R2)'}\n`)

  const objects = await listAll(PREFIX)
  console.log(`round-8/ 下对象 ${objects.length} 个\n`)

  // 目标前缀现状(F 的文件应该搬过去的位置)
  const destExisting = new Set((await listAll(DEST_PREFIX)).map(o => o.Key))

  const actions = []
  for (const obj of objects) {
    const rel = obj.Key.slice(PREFIX.length)
    if (!rel.endsWith('.osz') || rel.includes('.nsv.osz')) {
      // NSV 同曲:跟着主文件同进退,判定交给主文件;这里只处理主 .osz
      if (rel.endsWith('.nsv.osz')) actions.push({ key: obj.Key, rel, follow: rel.replace('.nsv.osz', '.osz') })
      else actions.push({ key: obj.Key, rel, skip: '非 .osz 主文件' })
      continue
    }
    let bid
    try { bid = await readBeatmapId(obj.Key) } catch (e) { actions.push({ key: obj.Key, rel, skip: `读取失败: ${e.message}` }); continue }
    if (!bid) { actions.push({ key: obj.Key, rel, skip: '内部无有效 BeatmapID' }); continue }
    if (fByBid.has(bid)) {
      const slot = fByBid.get(bid)
      const destKey = `${DEST_PREFIX}${slot}.osz`
      actions.push({ key: obj.Key, rel, bid, slot, move: destKey, targetOwnedByF: slot === rel.replace('.osz', '') })
    } else if (sfByBid.has(bid)) {
      actions.push({ key: obj.Key, rel, bid, slot: sfByBid.get(bid), keep: 'SF' })
    } else {
      actions.push({ key: obj.Key, rel, bid, skip: `BID ${bid} 不在 SF/F 数据里` })
    }
  }

  // NSV 跟随主文件的判定
  for (const a of actions) {
    if (!a.follow) continue
    const main = actions.find(x => x.rel === a.follow)
    if (main?.move) a.move = `${DEST_PREFIX}${main.move.slice(DEST_PREFIX.length).replace('.osz', '.nsv.osz')}`
    else if (main?.keep) a.keep = 'SF (跟随主文件)'
    else a.skip = main?.skip || '主文件未判明'
  }

  console.log('--- 搬移计划 ---')
  let moveCount = 0, keepCount = 0, skipCount = 0
  for (const a of actions) {
    if (a.move) {
      const relabel = a.targetOwnedByF ? '(目标=同名,先备份再搬)' : ''
      console.log(`  MOVE  ${a.rel} (bid=${a.bid} → ${a.slot}) → ${a.move.replace(DEST_PREFIX, '')} ${relabel}`)
      moveCount++
    } else if (a.keep) {
      console.log(`  KEEP  ${a.rel} (bid=${a.bid}, SF) ${a.keep === 'SF' ? '' : a.keep}`)
      keepCount++
    } else {
      console.log(`  SKIP  ${a.rel} — ${a.skip}`)
      skipCount++
    }
  }
  console.log(`\nMOVE ${moveCount} / KEEP ${keepCount} / SKIP ${skipCount}`)
  console.log(`目标前缀 round-8-f/ 已有 ${destExisting.size} 个对象`)

  if (!APPLY) {
    console.log('\nDRY-RUN 结束,未动 R2。确认后加 --apply。')
    return
  }

  console.log('\n开始执行…')
  let moved = 0, backed = 0
  for (const a of actions) {
    if (!a.move) continue
    // 目标已有人(比如上轮互覆盖留下的错文件)→ 先改名保存,绝不覆盖
    if (destExisting.has(a.move)) {
      const orphanKey = `${a.move}.orphan-${Date.now()}`
      await s3.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `/${R2_BUCKET}/${encodeURIComponent(a.move)}`, Key: orphanKey }))
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: a.move }))
      console.log(`  ORPHAN ${a.move.replace(DEST_PREFIX, '')} → ${orphanKey}`)
      backed++
    }
    await s3.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `/${R2_BUCKET}/${encodeURIComponent(a.key)}`, Key: a.move }))
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: a.key }))
    moved++
    console.log(`  MOVED ${a.rel} → ${a.move.replace(DEST_PREFIX, '')}`)
  }
  console.log(`\n完成: 搬 ${moved} 个,顶掉备份 ${backed} 个。`)
  console.log('建议: admin 上传页刷新 solo-score-rush,核对 SF/F 的已传勾状态。')
}

main().catch(err => { console.error(err); process.exit(1) })
