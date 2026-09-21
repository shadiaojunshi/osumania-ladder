#!/usr/bin/env node
/**
 * 比较两个 .osz（或两个 .osu）的**玩法内容**，回答「同 BID 但内容不同」到底是真的两张谱，还是同一张谱的
 * 倍速/重定时版本 —— 也就是合包日志里那句 `⚠ 同 BID但内容不同 — 未合并，各自打包` 该怎么判读。
 *
 * 为什么要有它：身份报告只会告诉你"内容不同"，但**不说差在哪**。而"差在哪"决定了该怎么办：
 *   · 只有 [Difficulty] 不同      → 玩法一样，只是 OD/AR/HP/CS/SV 设置不同（"假不同"）
 *   · 只有 [TimingPoints] 不同    → 音符一模一样、时间轴不同（重定时/倍速版）
 *   · 音符数相同 + 末尾时间成比例 → 倍速版（真不同，但属于设计内：倍速版本来就共用原谱 BID）
 *   · 音符本身不同                → 真的两张谱（或被 cut 过、被编辑过）
 *
 * ⚠️ 口径与合包**完全一致**：这里的"内容"直接取自 `scripts/mapIdentity.js` 的 `canonicalContent`
 * （= `[General] Mode` + `[Difficulty]` + `[TimingPoints]` + `[HitObjects]`，**不含 Metadata/Events**）。
 * 所以它说"内容相同"就一定是签名相同；说"某段不同"就是管线判冲突的那一段。
 *
 * 用法：
 *   node scripts/compare-osz.mjs a.osz b.osz     # 逐段比对 + 结论
 *   node scripts/compare-osz.mjs a.osz           # 单个文件的玩法摘要
 *   node scripts/compare-osz.mjs a.osz --json    # 机器可读
 *   node scripts/compare-osz.mjs --help
 *
 * 退出码：0 = 跑完；1 = 文件读不了；2 = 参数错。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const { canonicalContent } = require('./mapIdentity.js')

/** 常见的倍速档位（用来把"时间轴比例"翻译成人话）。 */
export const KNOWN_RATES = [1.05, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]
const RATE_TOLERANCE = 0.005
const DIFFICULTY_KEYS = ['HPDrainRate', 'CircleSize', 'OverallDifficulty', 'ApproachRate', 'SliderMultiplier', 'SliderTickRate']

/** 把 canonical 文本切成 { 段名: [行…] }。canonical 的行格式就是 `段名\t内容`。 */
export function sectionLines(canonicalText) {
  const out = { General: [], Difficulty: [], TimingPoints: [], HitObjects: [] }
  for (const line of String(canonicalText == null ? '' : canonicalText).split('\n')) {
    const i = line.indexOf('\t')
    if (i <= 0) continue
    const section = line.slice(0, i)
    if (out[section]) out[section].push(line.slice(i + 1))
  }
  return out
}

/** 从 [Difficulty] 段里取设置。纯展示用，不参与判定。 */
export function difficultySettings(lines) {
  const out = {}
  for (const line of lines || []) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    if (DIFFICULTY_KEYS.includes(key)) out[key] = line.slice(i + 1).trim()
  }
  return out
}

/** 4K 列分布（x 坐标 → 列号）。列分布不同 = 键型/键数布局不同。 */
export function columnHistogram(hitObjectLines) {
  const hist = [0, 0, 0, 0]
  for (const line of hitObjectLines || []) {
    const x = Number(String(line).split(',')[0])
    if (!Number.isFinite(x)) continue
    const col = Math.max(0, Math.min(3, Math.floor((x * 4) / 512)))
    hist[col]++
  }
  return hist
}

/**
 * 玩法统计。全部从 canonical 行里取 —— 不重新解析 .osu，避免与管线口径漂移。
 * ⚠️ 长音判据必须用 type 的 128 位：普通音符的第 6 字段是 hitSample（`0:0:0:0:`），
 * 也含 ':'，按"第 6 字段有没有冒号"判会把**所有**音符都算成长音（实测踩过）。
 */
export function chartStats(sections) {
  const notes = sections.HitObjects || []
  let ln = 0
  let firstTime = null
  let lastTime = null
  for (const line of notes) {
    const f = String(line).split(',')
    const t = Number(f[2])
    if (Number.isFinite(t)) {
      if (firstTime === null || t < firstTime) firstTime = t
      if (lastTime === null || t > lastTime) lastTime = t
    }
    const type = Number(f[3])
    if (Number.isFinite(type) && (type & 128) !== 0) ln++
  }
  const timing = (sections.TimingPoints || [])
    .map((l) => Number(String(l).split(',')[0]))
    .filter((t) => Number.isFinite(t))
  return {
    noteCount: notes.length,
    lnCount: ln,
    firstTime,
    lastTime,
    durationMs: firstTime === null || lastTime === null ? null : lastTime - firstTime,
    timingCount: timing.length,
    firstTiming: timing.length ? Math.min(...timing) : null,
    columns: columnHistogram(notes),
    difficulty: difficultySettings(sections.Difficulty),
  }
}

/** 逐段比较：相同 / 不同（并给出首个差异行，便于人眼看）。 */
export function compareSection(name, aLines, bLines) {
  const a = aLines || []
  const b = bLines || []
  const same = a.length === b.length && a.every((line, i) => line === b[i])
  if (same) return { section: name, same: true, aLines: a.length, bLines: b.length }
  let firstDiff = -1
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) { firstDiff = i; break }
  }
  return {
    section: name,
    same: false,
    aLines: a.length,
    bLines: b.length,
    firstDiffIndex: firstDiff,
    firstDiffA: firstDiff >= 0 && a[firstDiff] !== undefined ? a[firstDiff] : '(没有这一行)',
    firstDiffB: firstDiff >= 0 && b[firstDiff] !== undefined ? b[firstDiff] : '(没有这一行)',
  }
}

/** 把比例翻译成"约等于哪一档倍速"，不像就返回 null。 */
export function nearestRate(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  for (const r of KNOWN_RATES) {
    if (Math.abs(ratio - r) <= RATE_TOLERANCE) return r
  }
  return null
}

/**
 * 两份音符序列的"前缀关系"。用来识别"被 cut 了一刀"：
 * 短的那份是长的那份的**完整前缀**（从第一个音符开始逐行相同，只是提前结束）→ 多半是从尾部截断的。
 * 注意 canonical 保留文件里的原始行序；osu! 的 HitObjects 正常就按时间排，所以前缀是有意义的。
 */
export function prefixRelation(aLines, bLines) {
  const a = aLines || []
  const b = bLines || []
  const n = Math.min(a.length, b.length)
  let same = 0
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) break
    same++
  }
  return {
    commonPrefix: same,
    /** 短的那份是长的完整前缀（前 n 行全同，且之后没有残留） */
    truncation: same === n && a.length !== b.length,
    aExtra: a.length - same,
    bExtra: b.length - same,
  }
}

/**
 * 核心判定。输入两份 .osu 文本，输出结论 + 依据。
 * 结论（verdict）取值：
 *   identical        玩法内容完全一致（那就不该被报成冲突 —— 除非管线是按"文件大小不同"提前判的）
 *   difficulty-only  只有 [Difficulty] 不同 → 玩法相同、难度设置不同
 *   timing-only      只有 [TimingPoints] 不同 → 音符相同、时间轴不同（重定时）
 *   rate-variant     音符数相同、时间轴成倍速比例 → 倍速版
 *   notes-differ     音符本身不同 → 真的两张谱（或被编辑/cut 过）
 *   no-content       有一份没有可比内容（空谱 / 只有元数据）
 */
export function compareOsuTexts(aText, bText) {
  const ca = canonicalContent(aText)
  const cb = canonicalContent(bText)
  if (!ca || !cb) {
    return {
      verdict: 'no-content',
      canonicalA: ca,
      canonicalB: cb,
      sections: [],
      stats: null,
      ratio: null,
      rate: null,
      notes: ['有一份没有可比内容（canonicalContent 为空）→ 管线会给它 contentSignature=null，也就是"绝不与别人合并"。'],
    }
  }

  const sa = sectionLines(ca)
  const sb = sectionLines(cb)
  const sections = ['General', 'Difficulty', 'TimingPoints', 'HitObjects'].map((n) => compareSection(n, sa[n], sb[n]))
  const diff = (n) => !sections.find((s) => s.section === n).same

  const stats = { a: chartStats(sa), b: chartStats(sb) }
  const ratio =
    stats.a.lastTime && stats.b.lastTime && stats.a.firstTime !== null && stats.b.firstTime !== null
      ? (stats.b.lastTime - stats.b.firstTime) / (stats.a.lastTime - stats.a.firstTime)
      : null
  const rate = nearestRate(ratio)

  const sameMode = !diff('General')
  const diffDifficulty = diff('Difficulty')
  const diffTiming = diff('TimingPoints')
  const diffNotes = diff('HitObjects')
  const notes = []

  const sameCount = stats.a.noteCount === stats.b.noteCount
  const prefix = prefixRelation(sa.HitObjects, sb.HitObjects)

  let verdict
  if (!sameMode) {
    verdict = 'notes-differ'
    notes.push('[General] Mode 不同 —— 不是同一个键数/模式，肯定是两份不同的图。')
  } else if (!diffDifficulty && !diffTiming && !diffNotes) {
    verdict = 'identical'
    notes.push('玩法内容逐段一致：签名的三段（Difficulty / TimingPoints / HitObjects）全都相同。')
    notes.push('→ 管线若仍报"内容不同"，多半是按**文件大小不同**提前判的（大小不同就不下载比对）。用本工具的结果为准：这就是同一个玩法内容。')
  } else if (!diffNotes && !diffTiming) {
    verdict = 'difficulty-only'
    notes.push('只有 [Difficulty] 不同：音符与时间轴完全一样，只是难度设置（OD/AR/HP/CS/SV）不同。')
    notes.push('→ 玩法上是同一张谱（"假不同"）。是否该并成一条，取决于你们把难度设置算不算身份。')
  } else if (!diffNotes && diffTiming) {
    verdict = 'timing-only'
    notes.push('音符一模一样，只有 [TimingPoints] 不同 —— 典型的重定时/倍速处理。')
  } else if (diffNotes && sameCount && rate && Math.abs(ratio - 1) > 1e-9) {
    // 倍速版会**连时间轴一起改**，所以这里不要求 [TimingPoints] 相同 ——
    // 判据是"音符数一模一样 + 时长成已知倍速比例"。
    verdict = 'rate-variant'
    notes.push(`音符数相同（${stats.a.noteCount}），整条时间轴比例 ≈ ${rate}x —— 同一张谱的 ${rate}x 倍速版。`)
    notes.push('→ **真不同，但属于设计内**：倍速版本来就是重新定时的另一份文件，却常与原谱共用 BID。保持"不合并、各自打包"是对的。')
  } else {
    verdict = 'notes-differ'
    if (stats.a.noteCount !== stats.b.noteCount) {
      notes.push(`音符数不同：${stats.a.noteCount} vs ${stats.b.noteCount}。`)
    } else {
      notes.push(`音符数相同（${stats.a.noteCount}）但内容不同。`)
    }
    if (prefix.truncation) {
      notes.push(
        `短的那份是长的那份**前 ${prefix.commonPrefix} 个音符的完整前缀** → 像是从尾部 cut 掉了 ${Math.abs(stats.a.noteCount - stats.b.noteCount)} 个音符（你说的"被 cut 一刀"）。`,
      )
    }
    if (diffTiming) notes.push('[TimingPoints] 也不同。')
    // 已确认是"完整前缀截断"时，时长差异已经被解释掉了 —— 再说"比例不成倍速档位"会自相矛盾
    // （实测：16 音符砍成 13 个，比例 0.8 被 nearestRate 判成"不像倍速"，却与截断结论打架）。
    if (prefix.truncation) {
      notes.push('时长差异可以用上面的截断解释清楚，不必再按倍速档位猜。')
    } else if (ratio !== null && Math.abs(ratio - 1) < 1e-6) {
      // 比例≈1 时 nearestRate 会返回 null（1.0 不在倍速档位里），所以这里判的是 ratio 本身。
      notes.push('时长几乎一致 → 更像"被编辑过"（cut 掉一段、删/加音符、改列）而不是倍速。')
    } else if (rate) {
      notes.push(`时间轴比例 ≈ ${rate}x —— 但它同时又被截断过，两者都能解释差异。`)
    } else if (ratio) {
      notes.push(`时长比例 ${ratio.toFixed(4)}，不成常见的倍速档位 → 更像两份真的不同的谱面。`)
    }
    notes.push('→ 抽查两边的首个差异行（下面已列出）确认是"改过"还是"另一张谱"。')
  }

  return { verdict, canonicalA: ca, canonicalB: cb, sections, stats, ratio, rate, notes }
}

// ---------------------------------------------------------------------------
// IO 层
// ---------------------------------------------------------------------------

/** 读一个文件：.osz/.zip 取包里的 .osu；其它扩展名当作纯 .osu 文本。 */
export async function readMapFile(file) {
  const buf = fs.readFileSync(file)
  const looksZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b // PK
  if (!looksZip) return { name: path.basename(file), entries: [{ name: path.basename(file), text: buf.toString('utf-8') }] }
  const zip = await JSZip.loadAsync(buf)
  const entries = []
  for (const name of Object.keys(zip.files).sort()) {
    if (!/\.osu$/i.test(name) || zip.files[name].dir) continue
    entries.push({ name, text: await zip.files[name].async('string') })
  }
  return { name: path.basename(file), size: buf.length, entries }
}

/** 一个 .osz 里若有多个难度（合包产物就是这样），取与给定提示匹配的那个，否则取第一个。 */
export function pickEntry(entries, hint) {
  if (!entries || entries.length === 0) return null
  if (hint) {
    const hit = entries.find((e) => e.name.includes(hint))
    if (hit) return hit
  }
  return entries[0]
}

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '?'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function printFile(label, file, entry) {
  console.log(`\n${label} ${file.name}${file.size ? `（${(file.size / 1024 / 1024).toFixed(1)}MB）` : ''}`)
  console.log(`  .osu 条目 ${file.entries.length} 个${file.entries.length > 1 ? '（取第一个：' + entry.name + '）' : ''}: ${entry.name}`)
  const sections = sectionLines(canonicalContent(entry.text))
  const s = chartStats(sections)
  console.log(`  音符 ${s.noteCount}（其中长音 ${s.lnCount}）｜列分布 ${s.columns.join(' / ')}`)
  console.log(`  时间轴 ${fmtMs(s.firstTime)} → ${fmtMs(s.lastTime)}（时长 ${fmtMs(s.durationMs)}）｜时间点 ${s.timingCount} 个`)
  const d = s.difficulty
  console.log(
    `  难度设置 OD=${d.OverallDifficulty ?? '?'} AR=${d.ApproachRate ?? '?'} HP=${d.HPDrainRate ?? '?'} CS=${d.CircleSize ?? '?'} SV=${d.SliderMultiplier ?? '?'}`,
  )
}

const USAGE = `用法：node scripts/compare-osz.mjs <a.osz> [b.osz] [选项]

  （一个文件）    只打印该 .osz 的玩法摘要（包内多个 .osu 时取第一个）
  （两个文件）    逐段比对并给出结论
  --json          以 JSON 输出结论（便于脚本消费）
  --help          显示本说明

判定用的"内容"与合包完全同一口径（mapIdentity.js 的 canonicalContent）：
[General] Mode + [Difficulty] + [TimingPoints] + [HitObjects]，**不含 Metadata/Events**。
所以"同名同 BID 却内容不同"必然差在这三段里；本工具会告诉你差在哪一段。`

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(USAGE)
    process.exit(args.length === 0 ? 2 : 0)
  }
  const json = args.includes('--json')
  const files = args.filter((a) => !a.startsWith('-'))
  if (files.length === 0 || files.length > 2) {
    console.error(`参数错误：要 1 或 2 个文件路径（收到 ${files.length} 个）`)
    console.error(USAGE)
    process.exit(2)
  }
  const unknown = args.filter((a) => a.startsWith('-') && !['--json', '--help', '-h'].includes(a))
  if (unknown.length > 0) {
    console.error(`参数错误：未知选项 ${unknown.join(', ')}`)
    process.exit(2)
  }

  let a
  let b
  try {
    a = await readMapFile(files[0])
    if (files[1]) b = await readMapFile(files[1])
  } catch (err) {
    console.error(`读不了文件：${err.message}`)
    process.exit(1)
  }

  const entryA = pickEntry(a.entries)
  if (!entryA) {
    console.error(`${a.name} 里没有 .osu 文件`)
    process.exit(1)
  }
  if (!b) {
    printFile('文件', a, entryA)
    process.exit(0)
  }
  const entryB = pickEntry(b.entries)
  if (!entryB) {
    console.error(`${b.name} 里没有 .osu 文件`)
    process.exit(1)
  }

  const result = compareOsuTexts(entryA.text, entryB.text)
  if (json) {
    console.log(JSON.stringify({ a: { file: a.name, entry: entryA.name }, b: { file: b.name, entry: entryB.name }, ...result }, null, 2))
    process.exit(0)
  }

  printFile('A =', a, entryA)
  printFile('B =', b, entryB)

  console.log('\n逐段比对（判据 = 合包用的那三段）')
  for (const s of result.sections) {
    if (s.same) {
      console.log(`  ✓ [${s.section}] 相同（${s.aLines} 行）`)
    } else {
      console.log(`  ✗ [${s.section}] 不同（A ${s.aLines} 行 / B ${s.bLines} 行，首个差异在第 ${s.firstDiffIndex + 1} 行）`)
      console.log(`      A: ${String(s.firstDiffA).slice(0, 110)}`)
      console.log(`      B: ${String(s.firstDiffB).slice(0, 110)}`)
    }
  }

  console.log(`\n结论：${result.verdict}${result.rate ? `（时间轴比例 ≈ ${result.rate}x）` : result.ratio ? `（时间轴比例 ${result.ratio.toFixed(4)}）` : ''}`)
  for (const n of result.notes) console.log(`  · ${n}`)
  progressLog(result)
}

/** 一句话给"该怎么办"。 */
function progressLog(result) {
  const advice = {
    identical: '→ 两份玩法一致：按同一张谱处理即可（管线若因文件大小报了冲突，可人工忽略）。',
    'difficulty-only': '→ 玩法相同，只有难度设置不同：想让它俩合并，就得把 [Difficulty] 移出身份判据 —— 别在数据里改，那是全局口径。',
    'timing-only': '→ 音符相同、时间轴不同：多半是重定时版本，保持各自打包。',
    'rate-variant': '→ 倍速版：真不同、但设计内。两个槽位都对，不用改数据。',
    'notes-differ': '→ 需要人工判：去两个槽位的比赛 JSON 里核对 name / beatmapId —— 常见原因是① 那份文件被 cut/编辑过；② 一边的 BID 写错。',
    'no-content': '→ 有一份读不出玩法内容（空谱或只有元数据）：先确认那个 .osz 是不是传坏了。',
  }[result.verdict]
  if (advice) console.log(`\n${advice}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
