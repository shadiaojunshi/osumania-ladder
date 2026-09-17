import assert from 'node:assert/strict'
import test from 'node:test'

// R17：`field === 'ln'` 一律读 `map.difficultyLn`，而 **LN 图没有这个字段**
// （全库实测 LN 1205 张 difficultyLn 全为空；HB 470/882、TB 164/321 才有）。
// 结果：LN 的 **fallback 分支**（无显式 typeDifficulties.LN.ln 时按图平均）必然取不到值，
// 而 difficultyFit 当时单独打了补丁 → 两份实现分叉。
// 影响面：全库 351 个 LN 轮次里 181 个有显式汇总值（显式优先，一直有值），另 170 个图上也没录
// difficulty —— 修复前全库**没有**一处真的受影响，属预防性修复（导入/新建数据漏填汇总值时才会踩到）。
// 现在统一走 src/lib/mapDifficultyReading.ts 的 readMapDifficulty。
import { readMapDifficulty } from '../src/lib/mapDifficultyReading.ts'
import { getRefValue, resolveLadder } from '../src/lib/referenceData.ts'
import { getRoundDifficulty } from '../src/lib/difficultyFit.ts'

const map = (slot, type, difficulty, difficultyLn) => ({
  slot,
  type,
  realType: type,
  name: slot,
  difficulty,
  ...(difficultyLn === undefined ? {} : { difficultyLn }),
})

const tournament = (rounds) => ({
  id: 'cup',
  name: 'Cup',
  abbreviation: 'CUP',
  keyCount: 4,
  year: 2026,
  rounds,
})

const round = (id, maps, typeDifficulties) => ({
  id,
  name: id,
  abbreviation: id.toUpperCase(),
  order: 1,
  difficulty: { min: 0, max: 0, average: 0 },
  maps,
  ...(typeDifficulties ? { typeDifficulties } : {}),
})

test('readMapDifficulty：LN 的 ln 读 difficulty（LN 图没有 difficultyLn）', () => {
  assert.equal(readMapDifficulty(map('LN1', 'LN', 12), 'LN', 'ln'), 12)
  // LN 的 rf 侧也读 difficulty（LN 图只存一个数）
  assert.equal(readMapDifficulty(map('LN1', 'LN', 12), 'LN', 'rf'), 12)
})

test('readMapDifficulty：HB / TB 的 ln 读 difficultyLn，rf 读 difficulty', () => {
  const hb = map('HB1', 'HB', 14, 16.5)
  assert.equal(readMapDifficulty(hb, 'HB', 'rf'), 14)
  assert.equal(readMapDifficulty(hb, 'HB', 'ln'), 16.5)
  const tb = map('TB', 'TB', 15.1, 17.2)
  assert.equal(readMapDifficulty(tb, 'TB', 'rf'), 15.1)
  assert.equal(readMapDifficulty(tb, 'TB', 'ln'), 17.2)
})

test('readMapDifficulty：0 / 缺失 / NaN / 负值都算"没有读数"', () => {
  assert.equal(readMapDifficulty(map('RC1', 'RC', 0), 'RC', 'rf'), null)
  assert.equal(readMapDifficulty({ difficulty: 0 }, 'HB', 'ln'), null)
  assert.equal(readMapDifficulty({ difficulty: 10, difficultyLn: 0 }, 'HB', 'ln'), null)
  assert.equal(readMapDifficulty({ difficulty: NaN }, 'RC', 'rf'), null)
  assert.equal(readMapDifficulty({ difficulty: Infinity }, 'RC', 'rf'), null)
  assert.equal(readMapDifficulty({ difficulty: -3 }, 'RC', 'rf'), null)
})

test('readMapDifficulty：LN 只有 difficultyLn 时的兜底（不退回 null）', () => {
  assert.equal(readMapDifficulty({ difficulty: 0, difficultyLn: 13 }, 'LN', 'ln'), 13)
})

test('getRefValue：LN + ln 从谱面取到值（修前该 fallback 分支恒为 null）', () => {
  const t = tournament([round('qf', [map('LN1', 'LN', 12), map('LN2', 'LN', 13)])])
  assert.equal(getRefValue(t, 'qf', 'LN', 'ln'), 12.5)
  assert.equal(getRefValue(t, 'qf', 'LN', 'rf'), 12.5)
})

test('getRefValue：HB 两侧不串（rf=difficulty、ln=difficultyLn）', () => {
  const t = tournament([round('qf', [map('HB1', 'HB', 14, 16.5), map('HB2', 'HB', 15, 17.5)])])
  assert.equal(getRefValue(t, 'qf', 'HB', 'rf'), 14.5)
  assert.equal(getRefValue(t, 'qf', 'HB', 'ln'), 17)
})

test('getRefValue：显式汇总值优先于谱面平均', () => {
  const t = tournament([
    round('qf', [map('LN1', 'LN', 12), map('LN2', 'LN', 13)], { LN: { rf: 11, ln: 11.5 } }),
  ])
  assert.equal(getRefValue(t, 'qf', 'LN', 'ln'), 11.5, '管理员显式录入的 ln 优先')
  assert.equal(getRefValue(t, 'qf', 'LN', 'rf'), 11)
})

test('getRefValue：汇总值里是 0 / 缺失时仍然回退到谱面', () => {
  const t = tournament([
    round('qf', [map('LN1', 'LN', 12)], { LN: { rf: 0, ln: 0 } }),
  ])
  assert.equal(getRefValue(t, 'qf', 'LN', 'ln'), 12, '0 不是有效汇总值，要回退')
})

test('getRefValue：没有任何有效读数时返回 null（不会被 0 变成有效测量）', () => {
  const t = tournament([round('qf', [map('LN1', 'LN', 0)])])
  assert.equal(getRefValue(t, 'qf', 'LN', 'ln'), null)
  assert.equal(getRefValue(t, 'qf', 'HB', 'ln'), null)
})

test('resolveLadder：LN 轮次在 ln 维度上不再整条落空', () => {
  const t = tournament([round('qf', [map('LN1', 'LN', 12)]), round('gf', [map('LN1', 'LN', 15)])])
  const entries = [
    { tournamentId: 'cup', roundId: 'qf' },
    { tournamentId: 'cup', roundId: 'gf' },
  ]
  const ladder = resolveLadder([t], entries, 'LN', 'ln')
  assert.deepEqual(ladder.map((item) => item.value), [12, 15], '两级轮次都要有值，链才连得上')
})

test('difficultyFit 与 referenceData 对同一份数据给同一答案（两份实现已合并）', () => {
  for (const [type, field, dim] of [
    ['RC', 'rf', 'rc-rf'],
    ['LN', 'ln', 'ln-ln'],
    ['HB', 'rf', 'hb-rf'],
    ['HB', 'ln', 'hb-ln'],
    ['TB', 'rf', 'tb-rf'],
    ['TB', 'ln', 'tb-ln'],
  ]) {
    const maps = [map('M1', type, 13, 15), map('M2', type, 14, 16)]
    const t = tournament([round('qf', maps)])
    const ref = getRefValue(t, 'qf', type, field)
    const fit = getRoundDifficulty(t.rounds[0], dim)
    assert.equal(fit.value, Number(ref), `${type}/${field} 两处读数必须一致`)
  }
})

test('口径与全库真实数据一致：LN 类确实没有 difficultyLn', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.join(process.cwd(), 'data', 'tournaments')
  let ln = 0
  let lnWithLn = 0
  let hbWithLn = 0
  for (const file of fs.readdirSync(dir)) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const r of t.rounds || []) {
      for (const m of r.maps || []) {
        if (m.type === 'LN') {
          ln++
          if (typeof m.difficultyLn === 'number' && m.difficultyLn > 0) lnWithLn++
        }
        if (m.type === 'HB' && typeof m.difficultyLn === 'number' && m.difficultyLn > 0) hbWithLn++
      }
    }
  }
  assert.ok(ln > 1000, `LN 图应有上千张（实际 ${ln}）`)
  assert.equal(lnWithLn, 0, 'LN 类不该有 difficultyLn —— 所以"一律读 difficultyLn"必然取不到值')
  assert.ok(hbWithLn > 100, `HB 类应有带 difficultyLn 的图（实际 ${hbWithLn}）`)
})
