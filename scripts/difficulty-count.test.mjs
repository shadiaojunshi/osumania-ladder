import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { countableMaps, countsForDifficulty } from '../src/lib/difficultyCount.ts'

// 2026-09-15 站长要求:每轮编辑页的每个槽位行可以勾"不参与难度统计"，
// 勾上后该图难度不进"本轮/该键型"的平均值,也不参与 ladder 框高。默认不勾。
// 这个文件锁住"默认参与 + 只有显式 true 才排除 + 字段形状合法"这三条。

const require = createRequire(import.meta.url)

test('默认参与:字段缺席或 false 都算参与,只有显式 true 才排除', () => {
  assert.equal(countsForDifficulty({}), true)
  assert.equal(countsForDifficulty({ excludeFromDifficulty: undefined }), true)
  assert.equal(countsForDifficulty({ excludeFromDifficulty: false }), true)
  assert.equal(countsForDifficulty({ excludeFromDifficulty: true }), false)
})

test('countableMaps 过滤但保持顺序', () => {
  const maps = [
    { slot: 'RC1', difficulty: 12 },
    { slot: 'RC2', difficulty: 13, excludeFromDifficulty: true },
    { slot: 'RC3', difficulty: 14 },
  ]
  assert.deepEqual(countableMaps(maps).map((m) => m.slot), ['RC1', 'RC3'])
  assert.deepEqual(countableMaps([]), [])
  assert.equal(countableMaps(maps).length, 2, '原数组不被修改')
  assert.equal(maps.length, 3)
})

// 上线时的一次性核对(2026-09-15 执行:扫全库 4526 张图、零命中,功能不改变既有显示)已经做完。
// 这里**故意不再断言"必须为零"** —— 站长一旦真的勾上某张图,那条断言就会变红,而那是功能的
// 正常用法,不是回归。留下的是真正该长期守的东西:字段形状。口径是"默认参与、只有显式 true
// 才排除",所以 true 与缺席都合法;false 是取消勾选时没清干净的脏值(编辑器写回 undefined),
// 其它类型则是坏数据 —— 这两类出现都说明别处写错了。
test('现有数据的 excludeFromDifficulty 形状合法:只允许 true 或缺席', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = path.join(process.cwd(), 'data', 'tournaments')
  const bad = []
  let maps = 0

  for (const file of fs.readdirSync(dir)) {
    const tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        maps++
        const value = map.excludeFromDifficulty
        if (value !== undefined && value !== true) {
          bad.push(`${file} ${round.id} ${map.slot} = ${JSON.stringify(value)}`)
        }
      }
    }
  }

  assert.ok(maps > 4000, `应扫到全部谱面(实际 ${maps})`)
  assert.deepEqual(bad, [], '只允许 true 或缺席;false / 其它类型说明写回时没清干净')
  assert.equal(countableMaps([{ excludeFromDifficulty: true }]).length, 0)
})
