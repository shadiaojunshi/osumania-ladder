#!/usr/bin/env node
// 谱面键型（realType）冲突检查 —— CLI 版（R20 重写）。
//
// 与后台「realType 体检」面板**同源**：分类规则一律来自
// `src/lib/mapConflictDetection.ts` 与 `src/lib/beatmapIds.ts`，
// 本文件不自己解释一遍（旧版自己按 `type` 分组，把"同 set 不同难度"误报成必修冲突，
// 且用 `setId` 真值判断，占位 `BeatmapSetID:1` 会把无关谱面粘成一组）。
//
// 三种结果（与面板一致）：
//   bid       同一 beatmapId（同一难度）被标了不同 realType —— 自相矛盾，可统一。
//   rateSet   同一 setId 下多个难度 + 存在倍速差异 —— 通常是倍速变体，可统一。
//   setReview 同一 setId 下多个难度 + 倍速相同但 realType 不同 —— 合法可能性存在
//             （同套图里 rc 版与 ln 版），**只供人工核对，本脚本不会改它**。
//
// 安全约定：
//   1. **不带参数 = 只读报告，不写任何文件**（连报告文件都不写）。旧版会直接进入
//      交互式修复并且遍历所有 rounds、只按 slot + beatmapId 匹配 —— 两个 undefined
//      beatmapId 会相等，于是能把**别的轮次**里同 slot 的图一起改掉。
//   2. 写回必须显式指定"改哪一组、统一成什么"：
//        node scripts/detect-type-conflicts.mjs --apply --bid=1234567 --to=JS
//        node scripts/detect-type-conflicts.mjs --apply --set=7654321 --to=JS
//      不接受"一把全改"。
//   3. 写回前逐条核对：定位必须唯一（文件 + 轮次 + slot，轮次 id 重复时用轮次下标收敛，
//      必要时再按 beatmapId 收敛），且文件里的值必须仍等于报告里记的原值。
//      **任何一条对不上就整组拒绝**，不做部分写入。
//   4. 写回保留文件原有换行风格（比赛 JSON 实际是 CRLF），并断言"改动行数 == 计划条数"，
//      避免正序列化把整个文件重排成 LF 那种无法审查的补丁。
//
// 用法：
//   node scripts/detect-type-conflicts.mjs                    # 只读报告
//   node scripts/detect-type-conflicts.mjs --report           # 额外把 JSON 报告落盘
//   node scripts/detect-type-conflicts.mjs --apply --bid=… --to=…

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { classifySetConflict, extractRate } from '../src/lib/mapConflictDetection.ts'
import { isUsableBeatmapId } from '../src/lib/beatmapIds.ts'
import { normalizeRealType } from '../src/lib/realType.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 比赛目录允许用环境变量覆盖 —— **只给自动化测试用**（测试要在临时目录里造数据，
// 绝不能拿真实 data/tournaments 练手）。
export const TOURNAMENTS_DIR = process.env.TOURNAMENTS_DIR
  ? path.resolve(process.env.TOURNAMENTS_DIR)
  : path.join(ROOT, 'data', 'tournaments')
const DEFAULT_REPORT_PATH = path.join(ROOT, 'type-conflicts-report.json')

// ─────────────────────────── 纯函数部分（可单测） ───────────────────────────

export function majority(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  let best = ''
  let max = 0
  // Map 保序：同票数时取先出现的那个，保证输出稳定。
  for (const [value, count] of counts) if (count > max) { max = count; best = value }
  return best
}

function pushGroup(map, key, usage) {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(usage)
}

/**
 * 遍历所有比赛文档，找出冲突组。
 * @param {{ file: string, data: any }[]} documents
 */
export function collectConflicts(documents) {
  const byBid = new Map()
  const bySet = new Map()

  for (const { file, data } of documents) {
    const rounds = Array.isArray(data?.rounds) ? data.rounds : []
    rounds.forEach((round, roundIndex) => {
      for (const map of round?.maps || []) {
        const usage = {
          file,
          tid: data.id,
          tAbbr: data.abbreviation || data.id,
          roundIndex,
          rid: round.id,
          rAbbr: round.abbreviation || round.name || round.id,
          slot: map.slot,
          realType: normalizeRealType(map.realType),
          rawRealType: map.realType,
          name: map.name,
          beatmapId: map.beatmapId || 0,
          beatmapsetId: map.beatmapsetId,
          rate: extractRate(map.name),
        }
        // 占位 ID（0/1/负数）不参与分组 —— 它们不是真实 ID，混进来会把无关谱面
        // 粘成一组（MKTC 2025 那 36 张 `BeatmapSetID:1` 就是这么来的）。
        if (isUsableBeatmapId(map.beatmapId)) pushGroup(byBid, map.beatmapId, usage)
        if (isUsableBeatmapId(map.beatmapsetId)) pushGroup(bySet, map.beatmapsetId, usage)
      }
    })
  }

  const conflicts = []

  // 1) 同一 beatmapId 的 realType 不一致 —— 自相矛盾，可统一。
  for (const [beatmapId, usages] of byBid) {
    if (usages.length < 2) continue
    const realTypes = usages.map((u) => u.realType)
    if (new Set(realTypes).size < 2) continue
    conflicts.push({
      key: `b:${beatmapId}`,
      kind: 'bid',
      linkId: beatmapId,
      name: usages.find((u) => u.name)?.name || String(beatmapId),
      realTypes: Array.from(new Set(realTypes)),
      mostCommon: majority(realTypes),
      usages,
    })
  }

  // 2) 同一 beatmapset 的 realType 不一致 —— 倍数可解释的（rateSet）可统一，
  //    其余（setReview）只列出来供人工核对。
  const bidConflictIds = new Set(conflicts.map((c) => c.linkId))
  for (const [beatmapsetId, usages] of bySet) {
    const kind = classifySetConflict(usages)
    if (!kind) continue
    const distinctBids = new Set(usages.map((u) => u.beatmapId).filter(Boolean))
    // 该 set 只含单个 beatmapId、且已被 bid 组覆盖 → 不重复报。
    if (distinctBids.size === 1 && bidConflictIds.has([...distinctBids][0])) continue
    const realTypes = usages.map((u) => u.realType)
    conflicts.push({
      key: `s:${beatmapsetId}`,
      kind,
      linkId: beatmapsetId,
      name: usages.find((u) => u.name)?.name || String(beatmapsetId),
      realTypes: Array.from(new Set(realTypes)),
      mostCommon: majority(realTypes),
      usages,
    })
  }

  conflicts.sort((a, b) => b.usages.length - a.usages.length)
  return conflicts
}

/** 轮次 id 可能重复（SSR SF/F 那种），所以优先用轮次下标收敛。 */
export function locateRound(doc, usage) {
  const rounds = Array.isArray(doc?.rounds) ? doc.rounds : []
  const indexed = rounds[usage.roundIndex]
  if (indexed && indexed.id === usage.rid) return indexed
  const matched = rounds.filter((r) => r.id === usage.rid)
  if (matched.length === 1) return matched[0]
  // 0 个 → 数据变了；≥2 个且下标对不上 → 不敢猜是哪一个。
  return null
}

/**
 * 把「统一某一组」翻译成逐条精确修改。**只计划、不改数据。**
 * @param {object} conflict collectConflicts 里的一组
 * @param {string} target 统一到的 realType
 * @param {Map<string, any>} docs file → 比赛文档
 */
export function buildPlan(conflict, target, docs) {
  const edits = []
  const problems = []
  if (!conflict) return { edits, problems: ['找不到这一组冲突（--bid / --set 的值不对？）'] }

  const to = normalizeRealType(target)
  if (!to) return { edits, problems: ['--to 不能为空'] }

  if (conflict.kind === 'setReview') {
    return {
      edits,
      problems: [
        '这一组的 kind 是 setReview（同 set 下多个难度的 realType 不同，且倍速相同）——' +
          '同套图里 rc 版与 ln 版都合法，本脚本不会自动改它，请人工核对后手工编辑。',
      ],
    }
  }

  const candidates = conflict.realTypes.map(normalizeRealType)
  if (!candidates.includes(to)) {
    problems.push(`--to=${target} 不在这组的取值里（${conflict.realTypes.join(' / ')}）`)
    return { edits, problems }
  }

  for (const usage of conflict.usages) {
    if (normalizeRealType(usage.realType) === to) continue
    const where = `${usage.tid} / ${usage.rid} / ${usage.slot}`

    const doc = docs.get(usage.file)
    if (!doc) { problems.push(`读不到文件：${usage.file}`); continue }

    const round = locateRound(doc, usage)
    if (!round) {
      problems.push(`定位不到轮次：${where}（轮次 id 重复或已改名，拒绝瞎猜）`)
      continue
    }

    const sameSlot = (round.maps || []).filter((m) => m.slot === usage.slot)
    let map = null
    if (isUsableBeatmapId(usage.beatmapId)) {
      const byBid = sameSlot.filter((m) => m.beatmapId === usage.beatmapId)
      if (byBid.length === 1) map = byBid[0]
      else if (byBid.length > 1) problems.push(`同一轮里 slot=${usage.slot} 重复 ${byBid.length} 次：${where}`)
      else problems.push(`文件里找不到 beatmapId=${usage.beatmapId} 的 slot=${usage.slot}：${where}`)
    } else if (sameSlot.length === 1) {
      // 没有可用 beatmapId 时不敢按 slot 跨位置匹配（旧版就是这里把别的轮次改串了），
      // 只有"该轮 slot 唯一"才敢动。
      map = sameSlot[0]
    } else {
      problems.push(
        `没有可用 beatmapId，且同一轮里 slot=${usage.slot} 有 ${sameSlot.length} 张 —— 身份不可靠，拒绝自动修：${where}`,
      )
    }
    if (!map) continue

    if (normalizeRealType(map.realType) !== normalizeRealType(usage.realType)) {
      problems.push(
        `文件里已是 ${map.realType}，与报告里记的原值 ${usage.realType} 不一致（数据被别人改过？）：${where}`,
      )
      continue
    }

    edits.push({
      file: usage.file,
      tid: usage.tid,
      rid: usage.rid,
      roundIndex: usage.roundIndex,
      slot: usage.slot,
      beatmapId: usage.beatmapId,
      name: usage.name,
      from: map.realType,
      to,
    })
  }

  return { edits, problems }
}

/** 保留原文件的换行风格与结尾换行。 */
export function serializePreservingEol(doc, originalText) {
  const eol = originalText.includes('\r\n') ? '\r\n' : '\n'
  const body = JSON.stringify(doc, null, 2).split('\n').join(eol)
  return originalText.endsWith(eol) ? body + eol : body
}

/** 逐行比对的差异行数 —— 用来断言"只改了该改的那几行"。 */
export function changedLineCount(before, after) {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  let n = Math.abs(a.length - b.length)
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++
  return n
}

// ─────────────────────────────── CLI 部分 ───────────────────────────────

export function parseArgs(argv) {
  const options = { apply: false, bid: null, set: null, to: null, report: false, reportPath: DEFAULT_REPORT_PATH, json: false }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--json') options.json = true
    else if (arg === '--report') options.report = true
    else if (arg.startsWith('--report=')) { options.report = true; options.reportPath = path.resolve(ROOT, arg.slice('--report='.length)) }
    else if (arg.startsWith('--bid=')) options.bid = Number(arg.slice(6))
    else if (arg.startsWith('--set=')) options.set = Number(arg.slice(6))
    else if (arg.startsWith('--to=')) options.to = arg.slice(5)
    else if (arg === '--dry-run' || arg === '--help' || arg === '-h') options.help = arg !== '--dry-run'
    else return { error: `未知参数: ${arg}` }
  }
  return options
}

const USAGE = `用法：
  node scripts/detect-type-conflicts.mjs                             只读报告（默认，不写任何文件）
  node scripts/detect-type-conflicts.mjs --report                    额外把 JSON 报告写到 type-conflicts-report.json
  node scripts/detect-type-conflicts.mjs --apply --bid=<id> --to=<key>   统一「同一 beatmapId」的那一组
  node scripts/detect-type-conflicts.mjs --apply --set=<id> --to=<key>   统一「同一 beatmapset」的那一组
（不含 --apply 时永远只读；含 --apply 时必须同时给出 --bid 或 --set 与 --to。）`

function loadDocuments() {
  const files = fs.readdirSync(TOURNAMENTS_DIR).filter((f) => f.endsWith('.json'))
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(TOURNAMENTS_DIR, file), 'utf-8')
      return { file, raw, data: JSON.parse(raw) }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}

function printReport(conflicts, documents) {
  const total = documents.reduce(
    (n, d) => n + (d.data.rounds || []).reduce((m, r) => m + (r.maps || []).length, 0),
    0,
  )
  console.log('检测完成（与后台 realType 体检同源）')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  比赛文件:   ${documents.length}`)
  console.log(`  谱面总数:   ${total}`)
  console.log(`  冲突组:     ${conflicts.length}`)
  const byKind = { bid: 0, rateSet: 0, setReview: 0 }
  for (const c of conflicts) byKind[c.kind]++
  console.log(`    bid(同 BID 不同键型，可统一):      ${byKind.bid}`)
  console.log(`    rateSet(倍速变体，可统一):          ${byKind.rateSet}`)
  console.log(`    setReview(只供人工核对，本脚本不改): ${byKind.setReview}`)

  if (conflicts.length === 0) {
    console.log('\n未发现 realType 分配冲突。')
    return
  }

  for (const [i, c] of conflicts.entries()) {
    console.log(`\n[${i + 1}/${conflicts.length}] ${c.key}  (${c.kind})  ${c.name}`)
    console.log(`  取值: ${c.realTypes.join(' / ')}   （多数派 ${c.mostCommon}）`)
    for (const u of c.usages) {
      console.log(`  - ${u.tid} · ${u.rAbbr} · ${u.slot} · ${u.realType}${u.rate !== 1 ? ` · ${u.rate}x` : ''}`)
    }
    if (c.kind !== 'setReview') {
      console.log(`  统一命令示例: node scripts/detect-type-conflicts.mjs --apply --${c.kind === 'bid' ? 'bid' : 'set'}=${c.linkId} --to=${c.mostCommon}`)
    }
  }
}

export function main(argv) {
  const options = parseArgs(argv)
  if (options.error) {
    console.error(options.error)
    console.error(USAGE)
    return 2
  }
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  if (options.apply && options.bid === null && options.set === null) {
    console.error('--apply 必须同时指定 --bid=<id> 或 --set=<id>（不接受"一把全改"）。')
    console.error(USAGE)
    return 2
  }
  if (options.apply && !options.to) {
    console.error('--apply 必须同时指定 --to=<realType>。')
    console.error(USAGE)
    return 2
  }

  const documents = loadDocuments()
  const conflicts = collectConflicts(documents)
  const docs = new Map(documents.map((d) => [d.file, d.data]))

  if (options.json) console.log(JSON.stringify({ conflicts }, null, 2))
  else printReport(conflicts, documents)

  if (options.report) {
    fs.writeFileSync(
      options.reportPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), conflicts }, null, 2),
      'utf-8',
    )
    console.log(`\nJSON 报告: ${options.reportPath}`)
  }

  if (!options.apply) {
    console.log('\n（只读模式：没有写任何文件。要写回请显式 --apply --bid/--set … --to=…）')
    return 0
  }

  // ── 写回 ──
  const wantedKey = options.bid !== null ? `b:${options.bid}` : `s:${options.set}`
  const conflict = conflicts.find((c) => c.key === wantedKey)
  const { edits, problems } = buildPlan(conflict, options.to, docs)

  if (problems.length > 0) {
    console.error(`\n拒绝写回（整组不写），共 ${problems.length} 条问题：`)
    for (const p of problems) console.error(`  · ${p}`)
    return 1
  }
  if (edits.length === 0) {
    console.log('\n这一组本来就已经统一了，无需改动。')
    return 0
  }

  console.log(`\n将修改 ${edits.length} 处：`)
  for (const e of edits) console.log(`  ${e.file} · ${e.rid} · ${e.slot}: ${e.from} → ${e.to}`)

  // 按文件聚合后逐个写回，并断言"改动行数 == 计划条数"。
  const byFile = new Map()
  for (const e of edits) {
    if (!byFile.has(e.file)) byFile.set(e.file, [])
    byFile.get(e.file).push(e)
  }
  let written = 0
  for (const [file, fileEdits] of byFile) {
    const entry = documents.find((d) => d.file === file)
    const doc = docs.get(file)
    for (const e of fileEdits) {
      const round = locateRound(doc, e)
      const map = (round?.maps || []).find(
        (m) => m.slot === e.slot && (isUsableBeatmapId(e.beatmapId) ? m.beatmapId === e.beatmapId : true),
      )
      if (!map) throw new Error(`内部错误：写回时定位失败 ${file} / ${e.rid} / ${e.slot}`)
      map.realType = e.to
    }
    const next = serializePreservingEol(doc, entry.raw)
    const changed = changedLineCount(entry.raw, next)
    if (changed !== fileEdits.length) {
      throw new Error(
        `${file}: 改动行数 ${changed} ≠ 计划 ${fileEdits.length} —— 说明会连带重排整个文件（换行/格式不一致），已中止且未写盘。`,
      )
    }
    fs.writeFileSync(path.join(TOURNAMENTS_DIR, file), next, 'utf-8')
    written += fileEdits.length
    console.log(`  已写 ${file}（${fileEdits.length} 处，改动 ${changed} 行）`)
  }

  console.log(`\n完成：写回 ${written} 处，涉及 ${byFile.size} 个文件。`)
  console.log('接下来: git diff 核对 → 提交 → 推送触发重建。')
  return 0
}

const isMain =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) process.exit(main(process.argv.slice(2)))
