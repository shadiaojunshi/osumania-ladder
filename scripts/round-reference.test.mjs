import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// 整轮「参考」的共享实现。
//
// 这段逻辑原本内联在 `src/components/admin/RoundEditor.tsx` 的 applyRoundRef 里，
// 抽到 `src/lib/roundReference.ts` 是为了让**公开反馈页**也能用同一份（公开页不能 import
// 带 OAuth/KV 的编辑器组件）。抽出时必须做到行为一字不改，所以这里用一张期望表把语义钉死：
//
//   · 同一个大类的**每一张**图都写成同一个值（整轮参考 = 把这一轮拉平到参考线）
//   · `> 0` 才写；0 = 这一项不动（不是"改成 0"）
//   · SV 与 SPECIAL（含自定义池）**有意不碰**
//   · 没被改动的图返回**同一个对象引用**，调用方用引用比较就能判断"这张图没动"

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  ROUND_REF_FIELDS,
  ROUND_REF_KEYS,
  applyRoundRefToMaps,
  categoryOfRaw,
  computeRoundRefValues,
  describeRoundRefChanges,
  emptyRoundRefValues,
  formatRoundRefValues,
  refCategoryOf,
  roundRefAffectedSlots,
  roundRefIsEmpty,
  roundRefWriteSet,
  sameRoundRefValues,
} = await import('../src/lib/roundReference.ts')
const { baseLadderRounds, resolveLadder, sampleLadderAtPos } = await import('../src/lib/referenceData.ts')

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url))

const V = (over = {}) => ({ ...emptyRoundRefValues(), ...over })

// 一轮混合谱面：每个大类两张（HB/TB 有双刻度），外加 SV 与一个自定义 SPECIAL 池。
function mixedRound() {
  return [
    { slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 6.0 },
    { slot: 'RC2', type: 'RC', realType: 'JS', difficulty: 6.8 },
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 5.5, difficultyLn: 4.5 },
    { slot: 'HB2', type: 'HB', realType: 'HB3', difficulty: 6.5, difficultyLn: 5.5 },
    { slot: 'LN1', type: 'LN', realType: 'RE', difficulty: 5.2 },
    { slot: 'TB', type: 'TB', realType: 'TB', difficulty: 6.9, difficultyLn: 6.1 },
    { slot: 'SV1', type: 'SV', realType: 'SV1', difficulty: 4.4 },
    { slot: 'X1', type: 'HBSV', realType: 'PDEX', difficulty: 7.7, difficultyLn: 3.3 },
  ]
}

test('六个值的键与字段表一一对应（顺序即界面预览顺序）', () => {
  assert.deepEqual(ROUND_REF_FIELDS.map((f) => f.key), [...ROUND_REF_KEYS])
  assert.deepEqual(ROUND_REF_KEYS, ['rc', 'hbRf', 'hbLn', 'ln', 'tbRf', 'tbLn'])
  assert.equal(ROUND_REF_FIELDS.some((f) => f.type === 'SV'), false, 'SV 不在参考字段里')
})

test('大类判定：只有标准五类，其余归 SPECIAL', () => {
  for (const c of ['RC', 'LN', 'HB', 'SV', 'TB']) assert.equal(categoryOfRaw(c), c)
  for (const c of ['SPECIAL', 'HBSV', 'HB&SV', '', null, undefined, 'rc', 42]) {
    assert.equal(categoryOfRaw(c), 'SPECIAL', `${JSON.stringify(c)} 应归 SPECIAL`)
  }
  // 编辑器对象带 category 时优先级更高（用户可能刚改过大类）
  assert.equal(refCategoryOf({ category: 'HB', type: 'RC' }), 'HB')
  assert.equal(refCategoryOf({ type: 'HB' }), 'HB')
  assert.equal(refCategoryOf(null), 'SPECIAL')
})

test('整轮参考：同一大类全部拉平到同一个值，SV 与 SPECIAL 不动', () => {
  const maps = mixedRound()
  const next = applyRoundRefToMaps(maps, V({ rc: 5.2, hbRf: 4.8, hbLn: 4.0, ln: 4.1, tbRf: 5.5, tbLn: 5.0 }))
  const bySlot = Object.fromEntries(next.map((m) => [m.slot, m]))

  assert.equal(bySlot.RC1.difficulty, 5.2)
  assert.equal(bySlot.RC2.difficulty, 5.2, '两张 RC 都要写成同一个值 —— 这就是"拉平"')

  assert.equal(bySlot.HB1.difficulty, 4.8)
  assert.equal(bySlot.HB1.difficultyLn, 4.0)
  assert.equal(bySlot.HB2.difficulty, 4.8, 'HB 双刻度各自写')
  assert.equal(bySlot.HB2.difficultyLn, 4.0)

  assert.equal(bySlot.LN1.difficulty, 4.1)

  assert.equal(bySlot.TB.difficulty, 5.5, 'TB 不参与 round.difficulty 统计，但参考要写它')
  assert.equal(bySlot.TB.difficultyLn, 5.0)

  assert.equal(bySlot.SV1.difficulty, 4.4, 'SV 有意不动')
  assert.equal(bySlot.X1.difficulty, 7.7, '自定义 SPECIAL 池有意不动')
  assert.equal(bySlot.X1.difficultyLn, 3.3)
})

test('0 表示"这一项不动"，且不动时返回同一个对象引用', () => {
  const maps = mixedRound()
  const onlyRc = applyRoundRefToMaps(maps, V({ rc: 5.2 }))
  const bySlot = Object.fromEntries(onlyRc.map((m) => [m.slot, m]))

  assert.equal(bySlot.RC1.difficulty, 5.2)
  assert.notEqual(bySlot.RC1, maps[0], '改过的图要换新对象')
  assert.equal(bySlot.LN1, maps[4], '没改的 LN 保持同一引用')
  assert.equal(bySlot.HB1, maps[2], '只改 RC 时 HB 保持同一引用')
  assert.equal(bySlot.SV1, maps[6])
  assert.equal(bySlot.X1, maps[7])

  // HB 只给一个刻度：另一个刻度既不能写 0，也不能删掉原值
  const hbRfOnly = applyRoundRefToMaps(maps, V({ hbRf: 4.8 }))
  assert.equal(hbRfOnly[2].difficulty, 4.8)
  assert.equal(hbRfOnly[2].difficultyLn, 4.5, 'hbLn=0 → 原 difficultyLn 原样保留')
})

test('六个值全 0 = 空建议：整轮一张图都不动', () => {
  const maps = mixedRound()
  const next = applyRoundRefToMaps(maps, emptyRoundRefValues())
  assert.deepEqual(next, maps)
  assert.equal(next.every((m, i) => m === maps[i]), true, '全 0 时必须逐个保持同一引用')
  assert.equal(roundRefIsEmpty(emptyRoundRefValues()), true)
  assert.deepEqual(roundRefWriteSet(emptyRoundRefValues()), [])
})

test('roundRefWriteSet：只列 > 0 的键', () => {
  assert.deepEqual(roundRefWriteSet(V({ rc: 5, hbLn: 0.5, tbLn: 3 })), ['rc', 'hbLn', 'tbLn'])
  assert.deepEqual(roundRefWriteSet(V({ rc: -1, hbRf: 0 })), [], '负值不算"要写"')
  assert.deepEqual(roundRefWriteSet(V({ rc: 1, hbRf: 2, hbLn: 3, ln: 4, tbRf: 5, tbLn: 6 })), [...ROUND_REF_KEYS])
})

test('变更清单与实际应用永远一致（审核页显示的就是会写下去的）', () => {
  const maps = mixedRound()
  const v = V({ rc: 5.2, hbRf: 4.8, hbLn: 4.0, ln: 4.1, tbRf: 5.5, tbLn: 5.0 })
  const changes = describeRoundRefChanges(maps, v)

  // 逐条对照"实际写下去的结果"
  const expected = []
  const rcMaps = maps.filter((m) => m.type === 'RC')
  for (const m of rcMaps) expected.push([m.slot, 'difficulty', m.difficulty, 5.2])
  expected.push(['HB1', 'difficulty', 5.5, 4.8], ['HB1', 'difficultyLn', 4.5, 4.0])
  expected.push(['HB2', 'difficulty', 6.5, 4.8], ['HB2', 'difficultyLn', 5.5, 4.0])
  expected.push(['LN1', 'difficulty', 5.2, 4.1])
  expected.push(['TB', 'difficulty', 6.9, 5.5], ['TB', 'difficultyLn', 6.1, 5.0])

  assert.deepEqual(
    changes.map((c) => [c.slot, c.field, c.before, c.after]),
    expected,
  )
  assert.equal(changes.some((c) => c.slot === 'SV1' || c.slot === 'X1'), false, 'SV / SPECIAL 不该出现在变更清单里')

  // 值没变就不该报（幂等：再算一次，清单为空）
  const reapplied = applyRoundRefToMaps(maps, v)
  assert.deepEqual(describeRoundRefChanges(reapplied, v), [], '已经是参考值时不该再报变更')
})

test('受影响槽位去重且保持原顺序', () => {
  const maps = mixedRound()
  const slots = roundRefAffectedSlots(maps, V({ rc: 5.2, hbRf: 4.8, hbLn: 4.0 }))
  assert.deepEqual(slots, ['RC1', 'RC2', 'HB1', 'HB2'], 'HB 两个字段都变，但槽位只出现一次')
  assert.deepEqual(roundRefAffectedSlots(maps, emptyRoundRefValues()), [])
})

test('等价性回归锁：旧内联实现（switch(map.category)）与新实现的判定完全一致', () => {
  // 旧实现直接 switch 编辑器对象的 category 字段；新实现走 refCategoryOf。
  // 这里用一张表把旧语义固化下来，任何重构导致的行为漂移都会在这里亮红灯。
  const legacyApply = (maps, v) =>
    maps.map((map) => {
      switch (map.category) {
        case 'RC':
          return v.rc > 0 ? { ...map, difficulty: v.rc } : map
        case 'HB':
          return {
            ...map,
            ...(v.hbRf > 0 ? { difficulty: v.hbRf } : {}),
            ...(v.hbLn > 0 ? { difficultyLn: v.hbLn } : {}),
          }
        case 'LN':
          return v.ln > 0 ? { ...map, difficulty: v.ln } : map
        case 'TB':
          return {
            ...map,
            ...(v.tbRf > 0 ? { difficulty: v.tbRf } : {}),
            ...(v.tbLn > 0 ? { difficultyLn: v.tbLn } : {}),
          }
        default:
          return map
      }
    })

  const STANDARD = ['RC', 'LN', 'HB', 'SV', 'TB']
  const editorMaps = mixedRound().map((m) => ({
    ...m,
    category: STANDARD.includes(m.type) ? m.type : 'SPECIAL',
  }))

  const cases = [
    emptyRoundRefValues(),
    V({ rc: 5.2 }),
    V({ hbRf: 4.8 }),
    V({ hbLn: 4.0 }),
    V({ ln: 4.1 }),
    V({ tbRf: 5.5 }),
    V({ tbLn: 5.0 }),
    V({ rc: 5.2, hbRf: 4.8, hbLn: 4.0, ln: 4.1, tbRf: 5.5, tbLn: 5.0 }),
    V({ rc: 0.5, ln: 0.5 }),
  ]
  for (const v of cases) {
    const legacy = legacyApply(editorMaps, v)
    const next = applyRoundRefToMaps(editorMaps, v)
    assert.deepEqual(
      next.map((m) => [m.slot, m.difficulty, m.difficultyLn]),
      legacy.map((m) => [m.slot, m.difficulty, m.difficultyLn]),
      `六个值 ${JSON.stringify(v)} 下新旧实现结果不一致`,
    )

    // 引用相等性**有意收紧**：旧实现里 HB/TB 即使两个刻度都不写也会展开一次
    // （deep-equal 但引用不同，导致整轮参考的 no-op 仍然让这些行重渲染）。
    // 新实现遇到"这一类完全不写"时直接返回原对象。值不受影响，只影响"动没动"的判定。
    const writesFor = (category) => {
      switch (category) {
        case 'RC': return v.rc > 0
        case 'HB': return v.hbRf > 0 || v.hbLn > 0
        case 'LN': return v.ln > 0
        case 'TB': return v.tbRf > 0 || v.tbLn > 0
        default: return false
      }
    }
    editorMaps.forEach((m, i) => {
      if (writesFor(m.category)) return
      assert.equal(next[i], editorMaps[i], `${m.slot}（${m.category}）不该被写时必须是同一个对象引用`)
    })
  }
})

// ---------------------------------------------------------------------------
// 静态标尺取数（公开页唯一允许的路径：不发请求）
// ---------------------------------------------------------------------------

function loadStaticData() {
  const tournamentsDir = `${DATA_DIR}tournaments`
  const tournaments = readdirSync(tournamentsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(`${tournamentsDir}/${f}`, 'utf-8')))
  const ladder = JSON.parse(readFileSync(`${DATA_DIR}ref-ladder.json`, 'utf-8'))
  return { tournaments, entries: ladder.entries }
}

test('静态标尺能算出六个值，全过程不发任何网络请求', async () => {
  const { tournaments, entries } = loadStaticData()
  assert.ok(tournaments.length > 0, '没读到比赛数据')
  assert.ok(entries.length > 0, '没读到参考标尺')

  const baseRounds = baseLadderRounds(tournaments, entries)
  assert.ok(baseRounds.length > 0, '基准轮为空 —— 标尺数据可能坏了')
  const base = baseRounds[0]

  let fetchCalls = 0
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    fetchCalls++
    throw new Error('公开反馈页的参考计算不允许发请求（匿名访问 /api/ref-ladder 会 401 并白耗额度）')
  }
  let values
  try {
    values = computeRoundRefValues({ tournaments, entries, basePos: base.pos, offset: 0 })
  } finally {
    globalThis.fetch = original
  }

  assert.equal(fetchCalls, 0, 'computeRoundRefValues 必须是纯计算')
  const positives = ROUND_REF_KEYS.filter((k) => values[k] > 0)
  assert.ok(positives.length >= 3, `基准轮 ${base.label} 上只算出 ${positives.length} 个非零值，取值路径可能坏了`)
  assert.equal(sameRoundRefValues(values, { ...values }), true)
  assert.match(formatRoundRefValues(values), /RC /)
})

test('等价性回归锁：RoundRefPicker 旧内联取值循环与新函数逐字段一致', () => {
  // 旧实现（RoundRefPicker 的 preview useMemo）：
  //   for (const f of FIELDS) {
  //     const ladder = resolveLadder(tournaments, entries, f.type, f.field, excludeRef)
  //     result[f.key] = sampleLadderAtPos(ladder, basePos, offsetNum) ?? 0
  //   }
  // 现在这段搬进了 computeRoundRefValues。用真实静态数据跑一遍，逐字段比对。
  const { tournaments, entries } = loadStaticData()
  const baseRounds = baseLadderRounds(tournaments, entries)
  assert.ok(baseRounds.length > 1, '需要多个基准轮才能覆盖不同 pos')

  const targets = baseRounds.slice(0, Math.min(baseRounds.length, 8))
  for (const base of targets) {
    for (const offset of [-3, -1, 0, 1, 2.5]) {
      const legacy = emptyRoundRefValues()
      for (const f of ROUND_REF_FIELDS) {
        const ladder = resolveLadder(tournaments, entries, f.type, f.field)
        legacy[f.key] = sampleLadderAtPos(ladder, base.pos, offset) ?? 0
      }
      const next = computeRoundRefValues({ tournaments, entries, basePos: base.pos, offset })
      assert.deepEqual(next, legacy, `基准轮 ${base.label} offset=${offset} 下取值不一致`)
      for (const k of ROUND_REF_KEYS) {
        assert.equal(Number.isFinite(next[k]), true, `${k} 不能是 NaN`)
        assert.equal(next[k] >= 0, true, `${k} 不能是负数`)
      }
    }
  }
})

test('参考数据取不到时记 0（= 该项不动），不抛异常', () => {
  const { tournaments, entries } = loadStaticData()
  // 一个不存在的基准比赛/轮次：resolveLadder 会跳过，六个字段全取不到
  const empty = computeRoundRefValues({
    tournaments,
    entries: [{ tournamentId: 'no-such-tournament', roundId: 'no-such-round' }],
    basePos: 0,
    offset: 0,
  })
  assert.deepEqual(empty, emptyRoundRefValues())
  assert.equal(roundRefIsEmpty(empty), true)

  // 非法数值不能变成 NaN 写进数据
  const nan = computeRoundRefValues({ tournaments, entries, basePos: Number.NaN, offset: 1 })
  assert.deepEqual(nan, emptyRoundRefValues())
  for (const k of ROUND_REF_KEYS) assert.equal(Number.isFinite(nan[k]), true, `${k} 不能是 NaN`)
})
