#!/usr/bin/env node
// 清掉比赛 JSON 里的**占位 ID**（beatmapId / beatmapsetId 的 0 / 1 / 负数）。
//
// 为什么要单独一个脚本（2026-09-18 站长反馈）：MKTC 2025 的 36 张谱面是从 Malody 的
// `.mcz` 转成 `.osz` 的，转换器写了 `BeatmapSetID:1` —— 这个值不是真的 ID，留着比没有更糟：
//   · 键型冲突工具会拿它分组（运行时已加防护，但数据本身还是错的）；
//   · 上传页"下载"按钮按 setId 下载时会去下 beatmapset 1（完全无关的图）；
//   · 误报/误标检测的"同 set"信号被污染。
//
// 默认**只报告不写**；确认无误后再加 `--write`。
// 只删占位字段，不动任何别的字段（脚本会逐文件核对"只有这些 key 变了"）。
//
// 用法：
//   node scripts/clear-placeholder-ids.mjs                      # dry-run，扫 data/tournaments
//   node scripts/clear-placeholder-ids.mjs --write              # 真的写回
//   node scripts/clear-placeholder-ids.mjs --dir <目录> [--write]

import fs from 'node:fs'
import path from 'node:path'

import { isUsableBeatmapId } from '../src/lib/beatmapIds.ts'

function parseArgs(argv) {
  const options = { dir: 'data/tournaments', write: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dir') options.dir = argv[++i]
    else if (arg === '--write') options.write = true
  }
  return options
}

/** 非空但不可用 = 占位值。 */
function isPlaceholder(value) {
  return value !== undefined && value !== null && !isUsableBeatmapId(value)
}

const options = parseArgs(process.argv.slice(2))
const files = fs.readdirSync(options.dir).filter((f) => f.endsWith('.json'))

let touchedFiles = 0
const removals = []

for (const file of files) {
  const full = path.join(options.dir, file)
  const original = fs.readFileSync(full, 'utf8')
  const tournament = JSON.parse(original)

  let dirty = false
  for (const round of tournament.rounds || []) {
    for (const map of round.maps || []) {
      for (const field of ['beatmapId', 'beatmapsetId']) {
        if (!isPlaceholder(map[field])) continue
        removals.push(`${file} :: ${round.id} :: ${map.slot} :: ${field}=${map[field]}`)
        delete map[field]
        dirty = true
      }
    }
  }
  if (!dirty) continue

  touchedFiles++
  if (!options.write) continue

  // 写回时保持仓库原来的风格：2 空格缩进 + 结尾换行。
  const next = JSON.stringify(tournament, null, 2) + '\n'
  // 自检：除了被删的那些 key，其它内容必须逐字节一致（按对象比较，忽略键顺序差异）。
  const before = JSON.parse(original)
  const strip = (value) => {
    const clone = JSON.parse(JSON.stringify(value))
    for (const round of clone.rounds || []) {
      for (const map of round.maps || []) {
        for (const field of ['beatmapId', 'beatmapsetId']) if (isPlaceholder(map[field])) delete map[field]
      }
    }
    return JSON.stringify(clone)
  }
  if (strip(before) !== strip(JSON.parse(next))) {
    throw new Error(`自检失败，未写入：${file}`)
  }
  fs.writeFileSync(full, next, 'utf8')
}

console.log(`扫描 ${files.length} 个文件 —— 命中 ${touchedFiles} 个文件 / ${removals.length} 处占位 ID`)
for (const line of removals) console.log('  -', line)
console.log(options.write ? '已写回。记得核对 git diff 再提交。' : '（dry-run：加 --write 才会写回）')
