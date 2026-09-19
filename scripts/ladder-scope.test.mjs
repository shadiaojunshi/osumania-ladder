import assert from 'node:assert/strict'
import test from 'node:test'

// 天梯视图"哪些图进几何"与"标题画在哪个难度高度"的唯一实现。
//
// 为什么有这个文件：这两件事过去直接写在 `LadderView.tsx` 里（React 组件），
// node --test 完全碰不到 —— 而它们恰好是站长反复问的两条行为：
//   ① 标题高度要用平均难度、并且**切 RC/LN/HB/TB 时要跟着变**；
//   ② 切键型时每轮图池/整轮比赛的框高也要跟着变。
// 现在判读与取值都收敛到 `src/lib/ladderScope.ts`，这里用真实几何模拟锁住它。
//
// 显示名必须带 `.ts`：本文件被 node --test 静态导入（见 MEMORY 里的约定）。

import {
  scopeToFilter,
  projectedDifficulties,
  resolveTitleAvg,
  isLnBased,
  getLnDiff,
  LN_REAL_TYPES,
  HB_REAL_TYPES,
} from '../src/lib/ladderScope.ts'

const OFFSET = 3

/** 一个混合键型的轮次：RC 9 / LN 11 / HB(rf 7, ln 10) / TB 12。 */
const roundFixture = {
  difficulty: { min: 5, max: 12, average: 8.5 },
  typeDifficulties: { RC: { rf: 9 }, LN: { ln: 11 }, HB: { rf: 7, ln: 10 } },
  maps: [
    { type: 'RC', realType: 'SS', difficulty: 9, slot: 'RC1' },
    { type: 'LN', realType: 'RE', difficulty: 11, slot: 'LN1' },
    { type: 'HB', realType: 'HB1', difficulty: 7, difficultyLn: 10, slot: 'HB1' },
    { type: 'TB', realType: 'TB', difficulty: 12, slot: 'TB' },
  ],
}

test('键型集合从键型目录推导，不是硬编码的字符串数组', () => {
  // 硬编码的旧写法在新增键型时会静默漏判（那张图就不会被当 LN 系算高度）。
  assert.ok(LN_REAL_TYPES.has('RE'), 'LN 族的真实键型要在集合里')
  assert.ok(HB_REAL_TYPES.has('HB1'), 'HB 族的真实键型要在集合里')
  assert.equal(LN_REAL_TYPES.has('PDLN'), false, 'Pending 占位不算 LN 族的一员')
  assert.equal(HB_REAL_TYPES.has('PDHB'), false, 'Pending 占位不算 HB 族的一员')

  assert.equal(isLnBased({ type: 'LN', realType: 'PDRC' }), true, '大类是 LN 就算 LN 系')
  assert.equal(isLnBased({ type: 'HB', realType: 'PDRC' }), true, '大类是 HB 就算 LN 系')
  assert.equal(isLnBased({ type: 'RC', realType: 'HB2' }), true, '真实键型属于 HB 族也算')
  assert.equal(isLnBased({ type: 'RC', realType: 'SS' }), false)
})

test('LN 系难度投影：LN 大类读 difficulty，HB 读 difficultyLn 再兜底', () => {
  assert.equal(getLnDiff({ type: 'LN', realType: 'RE', difficulty: 10, difficultyLn: 99 }), 10)
  assert.equal(getLnDiff({ type: 'HB', realType: 'HB1', difficulty: 7, difficultyLn: 10 }), 10)
  assert.equal(getLnDiff({ type: 'HB', realType: 'HB1', difficulty: 7 }), 7, '没有 ln 值就退到 rf')
})

test('筛选收敛：该轮没有这个大类时原样返回整轮（避免同列高度节奏乱跳）', () => {
  const maps = roundFixture.maps
  assert.equal(scopeToFilter(maps, null), maps, '不筛选就是原样')
  assert.equal(scopeToFilter(maps, 'RC').length, 1)
  assert.equal(scopeToFilter(maps, 'SV').length, maps.length, '该轮没有 SV → 退回整轮')
})

test('参与几何的难度值：剔 TB、LN 系减偏移、<=0 丢弃（切键型时集合会变）', () => {
  const maps = roundFixture.maps
  assert.deepEqual(projectedDifficulties(maps, null, OFFSET), [9, 8, 7], 'RC 9 / LN 11-3 / HB 10-3，TB 不进')

  // ↓ 这一组就是"切 RC/LN/HB/TB 时框高会变"的根据：每种键型的值集合不同。
  assert.deepEqual(projectedDifficulties(maps, 'RC', OFFSET), [9])
  assert.deepEqual(projectedDifficulties(maps, 'LN', OFFSET), [8])
  assert.deepEqual(projectedDifficulties(maps, 'HB', OFFSET), [7])
  assert.deepEqual(projectedDifficulties(maps, 'TB', OFFSET), [], 'TB 只画红条，不进框高')
  assert.deepEqual(projectedDifficulties(maps, 'SV', OFFSET), [9, 8, 7], '该轮没有 SV → 退回整轮口径')

  // 0 / 负值不算"有难度"，不能把框高拖到地上。
  const withZeros = [
    { type: 'RC', realType: 'SS', difficulty: 0, slot: 'RC1' },
    { type: 'RC', realType: 'SS', difficulty: -1, slot: 'RC2' },
    { type: 'RC', realType: 'SS', difficulty: 6, slot: 'RC3' },
  ]
  assert.deepEqual(projectedDifficulties(withZeros, null, OFFSET), [6])
})

test('标题高度：不筛选时优先整轮存量 average，再退到逐图平均', () => {
  const maps = roundFixture.maps
  assert.equal(resolveTitleAvg(roundFixture, maps, null, OFFSET), 8.5, '用后台填的整轮 average')

  const noStoredAvg = { ...roundFixture, difficulty: { min: 0, max: 0, average: 0 } }
  assert.equal(resolveTitleAvg(noStoredAvg, maps, null, OFFSET), 8, 'average 为 0 → 逐图平均 (9+8+7)/3')

  // 整轮全是 LN 系时，存量 average 也要减偏移（与框高同一根轴）。
  const lnOnly = {
    difficulty: { min: 0, max: 0, average: 12 },
    typeDifficulties: { LN: { ln: 12 } },
    maps: [{ type: 'LN', realType: 'RE', difficulty: 12, slot: 'LN1' }],
  }
  assert.equal(resolveTitleAvg(lnOnly, lnOnly.maps, null, OFFSET), 9)
})

test('标题高度：筛选时优先该键型的存量平均，按该键型的投影轴取', () => {
  const maps = roundFixture.maps
  assert.equal(resolveTitleAvg(roundFixture, maps, 'RC', OFFSET), 9, 'RC 用 typeDifficulties.RC.rf')
  assert.equal(resolveTitleAvg(roundFixture, maps, 'LN', OFFSET), 8, 'LN 用 typeDifficulties.LN.ln 再减偏移')
  assert.equal(resolveTitleAvg(roundFixture, maps, 'HB', OFFSET), 7, 'HB 也走 ln 轴，同样减偏移')
})

test('★ 切 RC/LN/HB/TB 时标题高度会真的变（三种键型给出三个不同高度）', () => {
  const maps = roundFixture.maps
  const heights = ['RC', 'LN', 'HB'].map((f) => resolveTitleAvg(roundFixture, maps, f, OFFSET))
  assert.deepEqual(heights, [9, 8, 7])
  assert.equal(new Set(heights).size, heights.length, '三个高度必须互不相同，否则切 tab 看不出变化')
})

test('标题高度：该键型没有存量平均时，退到"只有该键型的图"的逐图平均', () => {
  const noTypeStored = { ...roundFixture, typeDifficulties: undefined }
  const maps = roundFixture.maps
  // 只有 LN 那张图 (11 - 3)；不能退成整轮的平均（那样切 tab 标题就不动了）。
  assert.equal(resolveTitleAvg(noTypeStored, maps, 'LN', OFFSET), 8)
  assert.equal(resolveTitleAvg(noTypeStored, maps, 'RC', OFFSET), 9)
  // 该轮没有 SV → 退回整轮口径 → 逐图平均。
  assert.equal(resolveTitleAvg(noTypeStored, maps, 'SV', OFFSET), 8)
})

test('标题高度：两个来源都没有时返回 null（调用方退到难度区间中点）', () => {
  const empty = {
    difficulty: { min: 0, max: 0, average: 0 },
    typeDifficulties: undefined,
    maps: [{ type: 'RC', realType: 'SS', difficulty: 0, slot: 'RC1' }],
  }
  assert.equal(resolveTitleAvg(empty, empty.maps, null, OFFSET), null)
  assert.equal(resolveTitleAvg(empty, empty.maps, 'RC', OFFSET), null)
})
