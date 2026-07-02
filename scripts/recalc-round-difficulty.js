// One-shot 脚本:遍历 data/tournaments/*.json,按新公式重算每个 round 的
// difficulty.{min,max,average},原地写回。跑一遍洗掉存量脏数据(比如 GBC
// 2025 Spring EX+ SF 那种 min=8.5 但所有 map ≥ 10.8 的情况)。
//
// 公式(与 src/components/admin/RoundEditor.tsx 里的 recalcDifficulty 保持一致):
//   TB (type === 'TB',含 slot='TB1'):不参与本轮统计
//   HB:同一张图有 rf/ln 两侧,两侧都填就取平均 (rf+ln)/2 作为一个数据点,
//        单侧有就用那侧,两侧都 0 就跳过。
//   其它 (RC/LN/SV/SPECIAL):存储字段 difficulty > 0 就收 difficulty。
//
// 只重算 round.difficulty,typeDifficulties 不动。
//
// 跑法:node scripts/recalc-round-difficulty.js
//       node scripts/recalc-round-difficulty.js --dry   仅打印 diff 不写回

const fs = require('fs')
const path = require('path')

const dryRun = process.argv.includes('--dry')

function recalc(maps) {
  const points = []
  for (const m of maps) {
    if (m.type === 'TB') continue
    if (m.type === 'HB') {
      const vals = [m.difficulty || 0, m.difficultyLn || 0].filter((v) => v > 0)
      if (vals.length === 0) continue
      points.push(vals.reduce((s, v) => s + v, 0) / vals.length)
    } else {
      if (m.difficulty > 0) points.push(m.difficulty)
    }
  }
  if (points.length === 0) return { min: 0, max: 0, average: 0 }
  const min = +Math.min(...points).toFixed(1)
  const max = +Math.max(...points).toFixed(1)
  const average = +(points.reduce((s, d) => s + d, 0) / points.length).toFixed(1)
  return { min, max, average }
}

const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
const files = fs.readdirSync(tournamentsDir).filter((f) => f.endsWith('.json'))

let totalRounds = 0
let changedRounds = 0
let touchedFiles = 0

for (const file of files) {
  const filePath = path.join(tournamentsDir, file)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)
  let fileChanged = false
  for (const round of data.rounds || []) {
    totalRounds++
    const before = round.difficulty || { min: 0, max: 0, average: 0 }
    const after = recalc(round.maps || [])
    if (before.min !== after.min || before.max !== after.max || before.average !== after.average) {
      changedRounds++
      fileChanged = true
      console.log(
        `[${data.id}] ${round.abbreviation || round.id}: ` +
          `min ${before.min}→${after.min}, max ${before.max}→${after.max}, avg ${before.average}→${after.average}`
      )
      round.difficulty = after
    }
  }
  if (fileChanged && !dryRun) {
    // 保持 2 空格缩进 + 尾行 \n,和其它工具产出的 JSON 对齐
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
    touchedFiles++
  } else if (fileChanged) {
    touchedFiles++
  }
}

console.log(
  `\n${dryRun ? '[dry]' : ''} ${changedRounds}/${totalRounds} rounds changed across ${touchedFiles} file(s)`
)
