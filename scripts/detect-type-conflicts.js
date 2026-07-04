#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')

// 提取倍速信息（支持多种格式）
function extractRate(name) {
  if (!name) return 1.0

  // 格式: [1.1x Rate], [1.1x rate], (1.1x Rate), 1.1x Rate
  let match = name.match(/[\[(]?([0-9.]+)x\s*[Rr]ate[\])]?/i)
  if (match) return parseFloat(match[1])

  // 格式: [x1.1], (x1.1)
  match = name.match(/[\[(]?x([0-9.]+)[\])]?/)
  if (match) return parseFloat(match[1])

  // 格式: [1.1倍速], (1.1倍速)
  match = name.match(/[\[(]?([0-9.]+)倍速[\])]?/)
  if (match) return parseFloat(match[1])

  // 格式: 124bpm (从原始bpm推测倍速，但这个比较难，先跳过)

  return 1.0
}

// 收集所有beatmap的type分配
const beatmapUsage = new Map() // beatmapsetId -> [{ tournamentId, roundId, slot, type, realType, name, beatmapId, rate, filePath }]

// 遍历所有比赛
const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))
for (const file of files) {
  const filePath = path.join(tournamentsDir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  for (const round of data.rounds || []) {
    for (const map of round.maps || []) {
      if (map.beatmapsetId) {
        const key = map.beatmapsetId
        if (!beatmapUsage.has(key)) {
          beatmapUsage.set(key, [])
        }
        beatmapUsage.get(key).push({
          tournamentId: data.id,
          tournamentName: data.name,
          roundId: round.id,
          roundName: round.name,
          slot: map.slot,
          type: map.type,
          realType: map.realType,
          name: map.name,
          beatmapId: map.beatmapId,
          rate: extractRate(map.name || ''),
          filePath: file
        })
      }
    }
  }
}

// 检测冲突
const conflicts = []
for (const [beatmapsetId, usages] of beatmapUsage) {
  if (usages.length < 2) continue

  // 按type分组
  const typeGroups = new Map()
  for (const usage of usages) {
    if (!typeGroups.has(usage.type)) {
      typeGroups.set(usage.type, [])
    }
    typeGroups.get(usage.type).push(usage)
  }

  // 如果有多个type，记录冲突
  if (typeGroups.size > 1) {
    conflicts.push({
      beatmapsetId,
      types: Array.from(typeGroups.keys()),
      usages,
      typeGroups
    })
  }
}

// 输出结果
console.log(`\n检测完成！`)
console.log(`═══════════════════════════════════════════════════════════\n`)
console.log(`统计信息：`)
console.log(`  总谱面集数: ${beatmapUsage.size}`)
console.log(`  多次使用的谱面集: ${Array.from(beatmapUsage.values()).filter(u => u.length > 1).length}`)
console.log(`  存在type冲突: ${conflicts.length}`)

if (conflicts.length === 0) {
  console.log('\n✓ 未发现type分配冲突')
  process.exit(0)
}

console.log(`\n检测到 ${conflicts.length} 个谱面集存在type分配冲突：\n`)

// 显示所有冲突
for (let i = 0; i < conflicts.length; i++) {
  const conflict = conflicts[i]
  console.log(`\n[${i + 1}/${conflicts.length}] ═══════════════════════════════════════════════════════════`)
  console.log(`Beatmapset ID: ${conflict.beatmapsetId}`)
  console.log(`涉及类型: ${conflict.types.join(', ')}`)
  console.log(`\n使用情况：`)

  // 按type分组显示
  for (const [type, usages] of conflict.typeGroups) {
    console.log(`\n  【${type}】`)
    for (const usage of usages) {
      console.log(`    • ${usage.tournamentName}`)
      console.log(`      ${usage.roundName} - ${usage.slot} - ${usage.realType}`)
      console.log(`      ${usage.name}`)
      console.log(`      BeatmapID: ${usage.beatmapId}, Rate: ${usage.rate}x`)
      console.log(`      文件: ${usage.filePath}`)
    }
  }
}

// 导出详细报告
const reportPath = path.join(__dirname, '..', 'type-conflicts-report.json')
fs.writeFileSync(reportPath, JSON.stringify(conflicts, null, 2), 'utf-8')
console.log(`\n详细报告已导出到: ${reportPath}`)

// 交互式修复
async function interactiveFix() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve))

  console.log(`\n是否要进行交互式修复？(y/n): `)
  const answer = await question('')

  if (answer.toLowerCase() !== 'y') {
    rl.close()
    console.log('\n退出修复流程')
    return
  }

  // 逐个处理冲突
  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i]
    console.log(`\n\n处理冲突 [${i + 1}/${conflicts.length}]`)
    console.log(`Beatmapset ID: ${conflict.beatmapsetId}`)
    console.log(`当前涉及类型: ${conflict.types.join(', ')}`)

    // 显示选项
    console.log(`\n选择正确的type:`)
    conflict.types.forEach((type, idx) => {
      console.log(`  ${idx + 1}. ${type} (${conflict.typeGroups.get(type).length} 个使用)`)
    })
    console.log(`  s. 跳过这个冲突`)
    console.log(`  q. 退出修复流程`)

    const choice = await question(`\n你的选择: `)

    if (choice.toLowerCase() === 'q') {
      console.log('退出修复流程')
      break
    }

    if (choice.toLowerCase() === 's') {
      console.log('跳过')
      continue
    }

    const choiceIdx = parseInt(choice) - 1
    if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= conflict.types.length) {
      console.log('无效选择，跳过')
      continue
    }

    const correctType = conflict.types[choiceIdx]
    console.log(`\n将统一修改为: ${correctType}`)

    // 修改所有不匹配的文件
    let modifiedCount = 0
    for (const usage of conflict.usages) {
      if (usage.type !== correctType) {
        const filePath = path.join(tournamentsDir, usage.filePath)
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

        // 找到对应的map并修改
        for (const round of data.rounds || []) {
          for (const map of round.maps || []) {
            if (map.beatmapId === usage.beatmapId && map.slot === usage.slot) {
              console.log(`  修改: ${usage.tournamentName} - ${usage.roundName} - ${usage.slot}`)
              console.log(`    ${usage.type} -> ${correctType}`)
              map.type = correctType
              modifiedCount++
            }
          }
        }

        // 保存文件
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
      }
    }

    console.log(`\n已修改 ${modifiedCount} 个条目`)
  }

  rl.close()
  console.log('\n修复完成！')
}

// 如果有冲突且不是在CI环境，启动交互式修复
if (conflicts.length > 0 && !process.env.CI) {
  interactiveFix().catch(console.error)
}
