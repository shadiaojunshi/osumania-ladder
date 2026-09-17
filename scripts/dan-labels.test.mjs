import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildDifficultyLabel,
  danBand,
  labelForSingleMap,
  lnDanName,
  rfDanName,
} from '../src/lib/danLabels.ts'

// 2026-09-16 站长反馈:悬浮卡的 TB 段位显示的是"平均难度"(一轮里 TB 型图可能不止一张,
// 加上整轮平均的兜底),要改成用那张图的**实际难度**。
// 这段逻辑原先内联在 HoverCard.tsx(含 JSX + @data),没法单测 —— 抽到 src/lib/danLabels.ts 后
// 用这里锁住三条规则:① 悬浮具体框只认那张图;② 缺值时不拿平均充数;③ 槽位名其实是键型名时退回聚合。

const dataDir = path.join(process.cwd(), 'data', 'scales')
const levels = {
  rf: JSON.parse(fs.readFileSync(path.join(dataDir, 'reform-dan.json'), 'utf8')).levels,
  ln: JSON.parse(fs.readFileSync(path.join(dataDir, 'ln-dan.json'), 'utf8')).levels,
}

const map = (over) => ({ slot: 'TB', type: 'TB', realType: 'TB', name: '', difficulty: 0, ...over })
const round = (maps, over = {}) => ({
  id: 'r1',
  name: 'r1',
  abbreviation: 'r1',
  order: 1,
  difficulty: { min: 0, max: 0, average: 0 },
  maps,
  ...over,
})

test('悬浮具体 TB 框:段位只来自那张图的实际难度,不用 typeDifficulties 缓存', () => {
  const target = round(
    [map({ slot: 'TB', difficulty: 16.2, difficultyLn: 17.2 })],
    // 缓存里是旧值(站长现场:CET GF TB 缓存 15.3/16.4,实际 16.2/17.2)
    { typeDifficulties: { TB: { rf: 15.3, ln: 16.4 } } },
  )
  const got = buildDifficultyLabel(target, { type: 'TB', slot: 'TB' }, levels)
  const fromActual = `~${rfDanName(16.2, levels.rf)} / ${lnDanName(17.2, levels.ln)}`
  const fromStale = `~${rfDanName(15.3, levels.rf)} / ${lnDanName(16.4, levels.ln)}`
  assert.equal(got, fromActual)
  assert.notEqual(got, fromStale, '不能读汇总缓存')
})

test('一轮两张及以上 TB:两张都按该键型的平均(站长 2026-09-17 规则)', () => {
  const target = round([
    map({ slot: 'TB', difficulty: 12, difficultyLn: 13 }),
    map({ slot: 'SHOWTB', difficulty: 16, difficultyLn: 17 }),
  ])
  const expected = `~${rfDanName(14, levels.rf)} / ${lnDanName(15, levels.ln)}`
  assert.equal(buildDifficultyLabel(target, { type: 'TB', slot: 'TB' }, levels), expected)
  assert.equal(buildDifficultyLabel(target, { type: 'TB', slot: 'SHOWTB' }, levels), expected)
  // 没有值的图不参与平均
  const withBlank = round([
    map({ slot: 'TB', difficulty: 12, difficultyLn: 13 }),
    map({ slot: 'SHOWTB' }),
    map({ slot: 'SHOWTB2', difficulty: 16, difficultyLn: 17 }),
  ])
  assert.equal(buildDifficultyLabel(withBlank, { type: 'TB' }, levels), expected)
})

test('TB 没有实际难度时退到"平均"(而不是显示空)', () => {
  const target = round(
    [
      map({ slot: 'TB' }),
      map({ slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 9.2 }),
      map({ slot: 'LN1', type: 'LN', realType: 'RE', difficulty: 9.4 }),
    ],
    { difficulty: { min: 9.2, max: 9.4, average: 9.3 } },
  )
  // 单张 TB 框:图上没值 → 退到整轮平均
  assert.equal(buildDifficultyLabel(target, { type: 'TB', slot: 'TB' }, levels), `~${rfDanName(9.3, levels.rf)}`)
  // 管理员填过 TB 汇总时优先用汇总
  const withSummary = round([map({ slot: 'TB' })], {
    typeDifficulties: { TB: { rf: 11, ln: 12 } },
    difficulty: { min: 0, max: 0, average: 9.3 },
  })
  assert.equal(
    buildDifficultyLabel(withSummary, { type: 'TB' }, levels),
    `~${rfDanName(11, levels.rf)} / ${lnDanName(12, levels.ln)}`,
  )
  // 连整轮平均都是 0 → 没有"平均"可用,不显示
  assert.equal(buildDifficultyLabel(round([map({ slot: 'TB' })]), { type: 'TB' }, levels), '')
})

test('普通键型不受影响:悬浮槽位用实际值,聚合口径与原来一致', () => {
  const target = round([
    map({ slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 12 }),
    map({ slot: 'RC2', type: 'RC', realType: 'JS', difficulty: 14 }),
  ])
  assert.equal(buildDifficultyLabel(target, { type: 'RC', slot: 'RC1' }, levels), `~${rfDanName(12, levels.rf)}`)
  assert.equal(buildDifficultyLabel(target, { type: 'RC' }, levels), `~${rfDanName(13, levels.rf)}`)
})

test('槽位名其实就是键型名时退回聚合口径(不能显示成空)', () => {
  const target = round([
    map({ slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 11, difficultyLn: 12 }),
    map({ slot: 'HB2', type: 'HB', realType: 'HB2', difficulty: 13 }),
  ])
  const bypassed = buildDifficultyLabel(target, { type: 'HB', slot: 'HB' }, levels)
  assert.notEqual(bypassed, '')
  assert.equal(bypassed, buildDifficultyLabel(target, { type: 'HB' }, levels))
})

test('LN 的键型值存 difficulty(不是 difficultyLn)时也能出标签', () => {
  const target = round([map({ slot: 'LN1', type: 'LN', realType: 'RE', difficulty: 14 })])
  assert.equal(
    buildDifficultyLabel(target, { type: 'LN', slot: 'LN1' }, levels),
    `~${lnDanName(14, levels.ln)}`,
  )
})

test('勾了"不参与难度统计"的图不参与聚合', () => {
  const target = round([
    map({ slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 10 }),
    map({ slot: 'RC2', type: 'RC', realType: 'JS', difficulty: 20, excludeFromDifficulty: true }),
  ])
  assert.equal(buildDifficultyLabel(target, { type: 'RC' }, levels), `~${rfDanName(10, levels.rf)}`)
})

test('labelForSingleMap:HB/TB 双段、RC 单段、缺值返回空串', () => {
  assert.equal(
    labelForSingleMap(map({ difficulty: 10, difficultyLn: 11 }), 'TB', levels),
    `~${rfDanName(10, levels.rf)} / ${lnDanName(11, levels.ln)}`,
  )
  assert.equal(
    labelForSingleMap(map({ difficulty: 10, difficultyLn: 11 }), 'HB', levels),
    `~${rfDanName(10, levels.rf)} / ${lnDanName(11, levels.ln)}`,
  )
  assert.equal(labelForSingleMap(map({ difficulty: 10 }), 'RC', levels), `~${rfDanName(10, levels.rf)}`)
  assert.equal(labelForSingleMap(map({}), 'TB', levels), '')
  assert.equal(labelForSingleMap(map({}), 'RC', levels), '')
})

test('分档规则:纯档 / 双档 / 越界夹取(用合成等级表锁定)', () => {
  const synthetic = [
    { id: 'a', name: 'a', numericValue: 12, color: '#000' },
    { id: 'b', name: 'b', numericValue: 11, color: '#000' },
  ]
  assert.equal(danBand(13, synthetic).primary.name, 'a') // 高于最高档 → 夹到最高
  assert.equal(danBand(12.05, synthetic).primary.name, 'a')
  assert.equal(danBand(12.05, synthetic).secondary, null)
  assert.equal(danBand(11.5, synthetic).primary.name, 'b') // 两档之间 → 低档为主、高档为副
  assert.equal(danBand(11.5, synthetic).secondary.name, 'a')
  assert.equal(danBand(10.5, synthetic).primary.name, 'b') // 低于最低档 → 夹到最低
  assert.equal(danBand(10.5, synthetic).secondary, null)
})
