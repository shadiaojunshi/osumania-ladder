// 一次性脚本:给已录入的比赛批量设 priority。
// 规则(用户要求):
//   MWC(非NMWC) → 5
//   MCNC/VNMC/MCLC → 3
// 其余手动填。

const fs = require('fs')
const path = require('path')

const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
const files = fs.readdirSync(tournamentsDir).filter((f) => f.endsWith('.json'))

let changed = 0

for (const file of files) {
  const filePath = path.join(tournamentsDir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  // 已有 priority 就跳过
  if (data.priority !== undefined && data.priority !== 0) continue

  const abbr = data.abbreviation || ''
  let newPriority = null

  if (/\bMWC\b/i.test(abbr) && !/NMWC/i.test(abbr)) {
    newPriority = 5
  } else if (/\b(MCNC|VNMC|MCLC)\b/i.test(abbr)) {
    newPriority = 3
  }

  if (newPriority !== null) {
    data.priority = newPriority
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
    console.log(`[${data.id}] ${abbr} → priority ${newPriority}`)
    changed++
  }
}

console.log(`\n${changed} tournaments updated`)
