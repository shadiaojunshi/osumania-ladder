#!/usr/bin/env node
/**
 * 合包对象的垃圾回收（独立命令）。
 *
 * 为什么不能挂在生成流程末尾（另一条线的审查 P1）：
 *   · 生成流程手上那份清单**还没提交**；重跑一次若 ZIP 内容/hash 有细微差异，新键与被
 *     线上引用的键不同 —— 于是"按本次清单判孤儿"会把**线上正在引用**的对象删掉。
 *   · 刚上传、清单还没提交的那批对象，此刻正好是"桶里有、清单没引用"的状态。
 * 所以这里：读**已提交/已部署**的清单 + 设**保留期**（默认 24h）+ 默认只报告。
 *
 * 用法：
 *   node scripts/gc-pack-objects.mjs                     # 只报告（默认）
 *   node scripts/gc-pack-objects.mjs --clean-orphans      # 真删
 *   node scripts/gc-pack-objects.mjs --min-age-hours=72   # 改保留期
 *   node scripts/gc-pack-objects.mjs --manifest=<path>    # 指定清单（默认必须是已提交、已推送的那份）
  node scripts/gc-pack-objects.mjs --allow-uncommitted  # 明知线上不是这一版，仍要强行清理
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { findOrphanObjects, referencedObjectKeys, evaluateManifestLiveness } = require('./pack-publish.js')

const ROOT = path.join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(name + '='))
  return hit ? hit.slice(name.length + 1) : fallback
}

if (flag('--help') || flag('-h')) {
  console.log(`用法:node scripts/gc-pack-objects.mjs [选项]

  （无选项）               只报告:列出桶里未被**已提交清单**引用的对象
  --clean-orphans          真删（默认不删）
  --min-age-hours=<n>      保留期,默认 24 —— 比这更新的对象一律不动
  --manifest=<path>        指定清单,默认 data/packs-manifest.json
  --allow-uncommitted      清单有未提交改动/没推送时也强行清理（默认拒绝）
  --help                   显示本说明

注意:清理对象必须在**清单已提交且已部署**之后做。要回滚时旧对象就是你唯一的退路。
默认会先用 git 核实这一点;核实不了（不是 git 仓库等）只警告,不阻止。`)
  process.exit(0)
}

const unknown = args.filter((a) => a.startsWith('-') && !a.startsWith('--min-age-hours=') && !a.startsWith('--manifest=') && !['--clean-orphans', '--allow-uncommitted', '--help', '-h'].includes(a))
if (unknown.length > 0) {
  console.error(`参数错误:未知选项 ${unknown.join(', ')}`)
  process.exit(2)
}

const manifestPath = path.resolve(ROOT, opt('--manifest', path.join('data', 'packs-manifest.json')))
const minAgeHours = Number(opt('--min-age-hours', '24'))
if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
  console.error('参数错误:--min-age-hours 必须是非负数字')
  process.exit(2)
}
const doDelete = flag('--clean-orphans')

if (!fs.existsSync(manifestPath)) {
  console.error(`找不到清单:${manifestPath}`)
  process.exit(1)
}

// 清理的基准必须是**线上正在生效**的那份清单（另一条线的审查 P1）。
// 光靠"确认后再跑"的提示不够：生成成功但提交/部署失败时，本地这份清单引用的是新键，
// 线上引用的还是旧键 —— 按本地这份删，删掉的正是线上正在用的包。
// 判据交给 pack-publish.js 的纯函数（可单测），这里只负责从 git 取事实。
const allowUncommitted = flag('--allow-uncommitted')
const liveness = evaluateManifestLiveness({ ...probeManifestInGit(manifestPath), allowUncommitted })
if (!liveness.ok) {
  console.error(`拒绝清理:${liveness.detail}`)
  console.error('  清理的对象是"清单不再引用"的那些键;本地清单 ≠ 线上一份时,删掉的正是线上在用的包。')
  console.error('  若只是本地改了没提交/没推:先提交并推上去,等部署完成再跑。')
  console.error('  确实明知线上不是这一版仍要清理（很少见）:加 --allow-uncommitted。')
  process.exit(1)
}
if (liveness.forced) console.warn(`⚠ 强行放行:${liveness.detail}`)
if (liveness.warning) console.warn(`⚠ ${liveness.warning}`)

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
} catch (err) {
  // 手滑指到别的文件时给一句人话，而不是一坨 JSON.parse 的栈。
  console.error(`清单不是合法 JSON:${manifestPath} —— ${err.message}`)
  process.exit(1)
}

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY
const R2_SECRET_KEY = process.env.R2_SECRET_KEY
const R2_PACKS_BUCKET = process.env.R2_PACKS_BUCKET || 'osumania-ladder-packs'
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('缺失 R2 凭据:需要 R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY')
  process.exit(1)
}

const packs = manifest.packs || []
// 空清单绝不能继续:那会把桶里所有对象都判成孤儿。
if (packs.length === 0) {
  console.error('清单里没有任何条目 —— 拒绝执行（否则桶里的对象会被全部判成孤儿）。')
  process.exit(1)
}

/**
 * 用 git 取三个事实交给纯函数判定。**不抛异常**：git 不可用、不是仓库、路径在仓库外
 * 一律返回 null = "判断不了"（上层只警告）—— 只有明确查到"确实没跟踪/确实有改动/
 * 确实没推送"才算危险证据。
 */
function probeManifestInGit(file) {
  const UNKNOWN = { tracked: null, matchesHead: null, pushedToUpstream: null }
  const git = (args) => {
    try {
      execFileSync('git', args, { cwd: ROOT, stdio: 'ignore' })
      return 0
    } catch (err) {
      // git 不存在（ENOENT）等没有 status 的情况 → 128（与"没跟踪"的 1 区分开）。
      return typeof err.status === 'number' ? err.status : 128
    }
  }
  // 先确认这确实是个 git 工作区；不是就什么都不用说了。
  if (git(['rev-parse', '--is-inside-work-tree']) !== 0) return UNKNOWN
  const rel = path.relative(ROOT, file)
  if (rel.startsWith('..')) return UNKNOWN // --manifest 指到仓库外 → git 说不了话

  // ls-files --error-unmatch：1 = 这个路径没被跟踪；其它非 0 = 判断不了。
  const lsExit = git(['ls-files', '--error-unmatch', '--', rel])
  if (lsExit === 1) return { tracked: false, matchesHead: null, pushedToUpstream: null }
  if (lsExit !== 0) return UNKNOWN

  // diff --quiet：0 = 与 HEAD 一致；1 = 有改动。
  const diffExit = git(['diff', '--quiet', 'HEAD', '--', rel])
  const matchesHead = diffExit === 0 ? true : diffExit === 1 ? false : null

  let upstream = ''
  try {
    upstream = execFileSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
      cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    upstream = '' // 游离 HEAD / 没配 upstream
  }
  // merge-base --is-ancestor：0 = HEAD 已在 upstream 上（都推了）；1 = 还没推。
  const pushedExit = upstream ? git(['merge-base', '--is-ancestor', 'HEAD', upstream]) : -1
  const pushedToUpstream = pushedExit === 0 ? true : pushedExit === 1 ? false : null
  return { tracked: true, matchesHead, pushedToUpstream }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

async function listPacksBucket() {
  const objects = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: R2_PACKS_BUCKET, ContinuationToken: token }))
    if (res.Contents) objects.push(...res.Contents)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return objects
}

const objects = await listPacksBucket()
const rows = objects
  .filter((o) => o && typeof o.Key === 'string')
  .map((o) => ({ key: o.Key, lastModified: o.LastModified, size: o.Size }))
const { orphans, kept } = findOrphanObjects({
  objects: rows, packs, minAgeHours, now: Date.now(),
})

console.log(`清单:${path.relative(ROOT, manifestPath)}（${packs.length} 个条目,lastGenerated=${manifest.lastGenerated || '未知'}）`)
console.log(`清单引用对象键:${referencedObjectKeys(packs).size} 个`)
console.log(`桶内对象:${rows.length} 个`)
console.log(`未被引用:${orphans.length + kept.length} 个 —— 其中 ${kept.length} 个比保留期(${minAgeHours}h)新,本次一律不动`)

if (orphans.length === 0) {
  console.log('\n没有可以清理的对象。')
  process.exit(0)
}

console.log(`\n可清理(${orphans.length} 个):`)
for (const k of orphans) {
  const row = rows.find((r) => r.key === k)
  const when = row && row.lastModified ? new Date(row.lastModified).toISOString() : '未知时间'
  const mb = row && Number.isFinite(row.size) ? (row.size / 1024 / 1024).toFixed(1) + 'MB' : '?'
  console.log(`  - ${k}  ${when}  ${mb}`)
}
if (kept.length > 0) {
  console.log(`\n保留(太新,${kept.length} 个):`)
  for (const k of kept) console.log(`  - ${k}`)
}

if (!doDelete) {
  console.log('\n默认只报告，没有删除任何对象。确认这份清单就是**线上正在生效**的那份')
  console.log('（例如 git log -1 -- data/packs-manifest.json 看它是否已提交、线上是否已是这一版）之后:')
  console.log('  node scripts/gc-pack-objects.mjs --clean-orphans')
  process.exit(0)
}

console.log(`\n开始清理 ${orphans.length} 个对象...`)
let ok = 0
const failed = []
for (const k of orphans) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_PACKS_BUCKET, Key: k }))
    ok++
    console.log(`  deleted ${k}`)
  } catch (err) {
    failed.push({ k, message: err && err.message })
    console.warn(`  failed  ${k}: ${err && err.message}`)
  }
}
console.log(`\n完成:删除 ${ok} 个，失败 ${failed.length} 个。`)
if (failed.length > 0) process.exitCode = 1
