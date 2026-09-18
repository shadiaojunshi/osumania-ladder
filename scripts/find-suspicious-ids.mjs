#!/usr/bin/env node
// 找出"不可靠的 beatmapId / beatmapsetId"（只读，不改任何数据）。
//
// 为什么需要（2026-09-18 站长反馈）：MKTC 2025 的一批谱面是从 Malody 的 `.mcz` 转成
// `.osz` 的，转换器写了占位 ID（`BeatmapSetID:1`）—— 上传解析当时只滤 `> 0`，于是
// **36 张不同歌曲的谱面共用 `beatmapsetId = 1`**。这类占位 ID 会让：
//   · 键型冲突工具把无关谱面粘成一组「同 set 待核对」（真实冲突被淹掉）；
//   · 上传页按 setId 下载时去下 beatmapset 1（完全无关的图）；
//   · 误标检测的"同 set 共识"信号被污染。
// 判断口径与运行时的唯一实现一致（`src/lib/beatmapIds.ts`）：0/1/负数一律不可用。
//
// 用法：
//   node scripts/find-suspicious-ids.mjs                 # 扫 data/tournaments
//   node scripts/find-suspicious-ids.mjs --dir <目录>     # 扫别的目录（例如从线上下下来的数据）
//   node scripts/find-suspicious-ids.mjs --out <文件>     # 改报告路径
//   node scripts/find-suspicious-ids.mjs --json          # 只打印 JSON

import fs from 'node:fs'
import path from 'node:path'

import { isUsableBeatmapId, songKeyOf, SET_ID_UNRELIABLE_SONG_COUNT } from '../src/lib/beatmapIds.ts'

function parseArgs(argv) {
  const options = {
    dir: 'data/tournaments',
    out: 'reports/beatmap-id-suspects.md',
    json: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dir') options.dir = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--json') options.json = true
  }
  return options
}

function collect(dir) {
  const maps = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    let tournament
    try {
      tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    } catch {
      continue
    }
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        maps.push({
          file,
          tournamentId: tournament.id,
          tournamentAbbr: tournament.abbreviation || tournament.id,
          roundId: round.id,
          roundAbbr: round.abbreviation || round.name || round.id,
          slot: map.slot,
          type: map.type,
          realType: map.realType,
          name: map.name || '',
          beatmapId: map.beatmapId,
          beatmapsetId: map.beatmapsetId,
        })
      }
    }
  }
  return maps
}

/** 非空但不可用 = 占位值（0/1/负数）。 */
function isPlaceholder(value) {
  return value !== undefined && value !== null && !isUsableBeatmapId(value)
}

function analyze(maps) {
  const placeholders = maps.filter((m) => isPlaceholder(m.beatmapId) || isPlaceholder(m.beatmapsetId))

  const bySet = new Map()
  const byBid = new Map()
  for (const m of maps) {
    if (isUsableBeatmapId(m.beatmapsetId)) {
      if (!bySet.has(m.beatmapsetId)) bySet.set(m.beatmapsetId, [])
      bySet.get(m.beatmapsetId).push(m)
    }
    if (isUsableBeatmapId(m.beatmapId)) {
      if (!byBid.has(m.beatmapId)) byBid.set(m.beatmapId, [])
      byBid.get(m.beatmapId).push(m)
    }
  }

  // setId 下面挂着 ≥3 首不同的歌 → 这个 setId 本身不可靠（占位/复制粘贴事故）。
  const unreliableSets = []
  for (const [setId, group] of bySet) {
    const songs = new Map()
    for (const m of group) {
      const key = songKeyOf(m.name)
      if (key) songs.set(key, (songs.get(key) || 0) + 1)
    }
    if (songs.size >= SET_ID_UNRELIABLE_SONG_COUNT) {
      unreliableSets.push({ setId, group, songCount: songs.size, songs: [...songs.keys()] })
    }
  }
  unreliableSets.sort((a, b) => b.group.length - a.group.length)

  // 同一个 bid 被 ≥2 首不同的歌共用：可能是"同一张图两处写法不同"，也可能又是占位/复制，
  // 单独列出来给人工判断（运行时不会自动改）。
  const sharedBids = []
  for (const [bid, group] of byBid) {
    const songs = new Set(group.map((m) => songKeyOf(m.name)).filter(Boolean))
    if (songs.size >= 2) sharedBids.push({ bid, group, songs: [...songs] })
  }

  return { placeholders, unreliableSets, sharedBids }
}

function renderReport(options, maps, result) {
  const lines = []
  lines.push('# 可疑 beatmapId / beatmapsetId（自动检测，只读）')
  lines.push('')
  lines.push(`生成时间：${new Date().toISOString()}`)
  lines.push(`扫描目录：\`${options.dir}\` · 谱面 ${maps.length} 张`)
  lines.push('')
  lines.push(`> 口径：**0 / 1 / 负数一律视为占位或未提交**（与 \`src/lib/beatmapIds.ts\` 同一实现）。`)
  lines.push(`> 「同一 setId 挂 ≥${SET_ID_UNRELIABLE_SONG_COUNT} 首不同的歌」= 这个 id 不可靠。`)
  lines.push('')
  lines.push('## 总览')
  lines.push('')
  lines.push(`- **占位 ID**：${result.placeholders.length} 条`)
  lines.push(`- **不可靠的 setId**：${result.unreliableSets.length} 组（共 ${result.unreliableSets.reduce((s, g) => s + g.group.length, 0)} 条记录）`)
  lines.push(`- **同一 bid 挂多首不同的歌**：${result.sharedBids.length} 组`)
  lines.push('')

  lines.push('## 1. 占位 ID（0 / 1 / 负数）')
  lines.push('')
  if (result.placeholders.length === 0) {
    lines.push('（无）')
  } else {
    lines.push('| 比赛 | 轮次 | 槽位 | 键型 | beatmapId | beatmapsetId | 名称 |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const m of result.placeholders) {
      lines.push(
        `| ${m.tournamentAbbr} | ${m.roundAbbr} | ${m.slot} | ${m.realType} | ${m.beatmapId ?? '—'} | ${m.beatmapsetId ?? '—'} | ${(m.name || '').slice(0, 50)} |`,
      )
    }
  }
  lines.push('')

  lines.push('## 2. 不可靠的 setId（下面挂着多首不同的歌）')
  lines.push('')
  if (result.unreliableSets.length === 0) {
    lines.push('（无）')
  } else {
    for (const group of result.unreliableSets) {
      lines.push(`### setId ${group.setId} —— ${group.group.length} 条记录 / ${group.songCount} 首不同的歌`)
      lines.push('')
      for (const m of group.group) {
        lines.push(`- ${m.tournamentAbbr} · ${m.roundAbbr} · ${m.slot} · \`${m.realType}\` · ${(m.name || '').slice(0, 60)}`)
      }
      lines.push('')
    }
  }

  lines.push('## 3. 同一 bid 挂多首不同的歌（需人工判断：可能只是同图两种写法）')
  lines.push('')
  if (result.sharedBids.length === 0) {
    lines.push('（无）')
  } else {
    for (const group of result.sharedBids) {
      lines.push(`### bid ${group.bid}`)
      lines.push('')
      for (const m of group.group) {
        lines.push(`- ${m.tournamentAbbr} · ${m.roundAbbr} · ${m.slot} · \`${m.realType}\` · ${(m.name || '').slice(0, 60)}`)
      }
      lines.push('')
    }
  }

  lines.push('## 怎么修')
  lines.push('')
  lines.push('- **占位 ID**：这些 id 不是真的，**清掉比留着好**（清掉后上传页会按"缺 BID"处理，')
  lines.push('  不再拿它去下载/分组）。真 ID 要么用「贴 BID 补传」按 BID 取回，要么在编辑页手工填。')
  lines.push('- **不可靠的 setId**：说明这个 set id 是错的（多为转换器占位或复制粘贴）。')
  lines.push('  确认后清掉该 setId；需要保留的话必须换成一个只对应这首曲子的真 setId。')
  lines.push('- 运行时已经对这类值做了防护：上传解析不接受占位 ID、冲突检查器不按占位 ID 分组、')
  lines.push('  同一个 setId 下出现多首不同的歌时不再当作"同 set 键型分歧"报出来。')
  lines.push('')
  return lines.join('\n')
}

const options = parseArgs(process.argv.slice(2))
const maps = collect(options.dir)
const result = analyze(maps)

if (options.json) {
  console.log(JSON.stringify({ scanned: maps.length, options, ...result }, null, 1))
} else {
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, renderReport(options, maps, result), 'utf8')
  console.log(`扫描 ${maps.length} 张谱面 → ${options.out}`)
  console.log(`  占位 ID：${result.placeholders.length} 条`)
  console.log(`  不可靠的 setId：${result.unreliableSets.length} 组`)
  console.log(`  同一 bid 挂多首歌：${result.sharedBids.length} 组`)
}
