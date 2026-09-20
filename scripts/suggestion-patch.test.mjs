import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// 建议 → 数据变更的纯逻辑（定位 / old→new / 可写性 / 冲突）。
//
// 这里盯四件事：
//   ① **定位不猜**：轮次 id 找不到、槽位不存在、槽位在轮内不唯一、BID 与快照对不上，
//      四种情况必须分别报出来。过去后台用的是 `roundIndex || fallback` —— 排序一变就改错图。
//   ② **按大类判可写性**：RC/LN/SV 只有 `difficulty`，HB/TB/SPECIAL 才有 `difficultyLn`。
//      给了不适用的字段要**显式拒绝**，不能静默丢掉。
//   ③ **整轮参考要列全**：审核页必须看到会波及的每一个槽位（SV / SPECIAL 有意不动）。
//   ④ **冲突只认"同字段不同值"**：值相同就是同一条建议，别当冲突弹给人。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const { locateSuggestTarget, planSuggestChange, compareWithPending } = await import(
  '../src/lib/suggestions/patch.ts'
)
const { difficultyFieldsFor, needsDualDifficulty } = await import('../src/lib/realTypeCatalog.ts')

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 一个含标准五类 + SPECIAL 的轮次，用来验"整轮参考波及范围"。 */
function round(overrides = {}) {
  return {
    id: 'round-5',
    name: 'Round 5',
    abbreviation: 'R5',
    maps: [
      { slot: 'RC1', type: 'RC', realType: 'RC2', difficulty: 6.1, beatmapId: 2222, beatmapsetId: 200 },
      { slot: 'RC2', type: 'RC', realType: 'PDRC', difficulty: 0, beatmapId: 3333, beatmapsetId: 300 },
      { slot: 'LN1', type: 'LN', realType: 'LN1', difficulty: 5.5, beatmapId: 4444, beatmapsetId: 400 },
      { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 5.2, difficultyLn: 4.8, beatmapId: 5416946, beatmapsetId: 500 },
      { slot: 'TB1', type: 'TB', realType: 'TB1', difficulty: 7.1, difficultyLn: 0, beatmapId: 5555, beatmapsetId: 600 },
      { slot: 'SV1', type: 'SV', realType: 'SV1', difficulty: 3.3, beatmapId: 6666, beatmapsetId: 700 },
      { slot: 'EX1', type: 'SPECIAL', realType: 'PDEX', difficulty: 4.2, beatmapId: 7777, beatmapsetId: 800 },
    ],
    ...overrides,
  }
}

const ROUNDS = [round()]

function realTypeProposal(overrides = {}) {
  return {
    kind: 'slot.realType',
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
    value: 'HB3',
    ...overrides,
  }
}

function difficultyProposal(value, overrides = {}) {
  return {
    kind: 'slot.difficulty',
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'RC1', beatmapId: 2222 },
    value,
    ...overrides,
  }
}

function referenceProposal(value, overrides = {}) {
  return {
    kind: 'round.reference',
    target: { tournamentId: 'cup-2025', roundId: 'round-5' },
    reference: { tournamentId: 'cup-2025', roundId: 'round-5', offset: 0 },
    value,
    ...overrides,
  }
}

const ZERO_REF = { rc: 0, hbRf: 0, hbLn: 0, ln: 0, tbRf: 0, tbLn: 0 }
const FULL_REF = { rc: 7.5, hbRf: 6.4, hbLn: 6.1, ln: 6.8, tbRf: 8.0, tbLn: 7.5 }

// ---------------------------------------------------------------------------
// ① 定位
// ---------------------------------------------------------------------------

test('定位：轮次 id 找不到就报出来，不在别的轮次里找同槽位', () => {
  const r = locateSuggestTarget(ROUNDS, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-99', slot: 'HB1' },
  }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'round-not-found')
})

test('定位：槽位不存在 = 图被删了，不是"跳过"', () => {
  const r = locateSuggestTarget(ROUNDS, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB9' },
  }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'slot-not-found')
})

test('定位：槽位唯一且 BID 一致 → 命中', () => {
  const r = locateSuggestTarget(ROUNDS, realTypeProposal())
  assert.equal(r.ok, true)
  assert.equal(r.mapIndex, 3)
  assert.equal(r.category, 'HB')
})

test('定位：槽位唯一、快照 BID 与当前不符 → 图被换过，要求人工确认', () => {
  const r = locateSuggestTarget(ROUNDS, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 999999 },
  }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'beatmap-mismatch')
  assert.match(r.detail, /5416946/)
})

test('定位：轮内同槽位多于一张且没带 BID → 不猜（列出候选）', () => {
  const dup = [round({ maps: [
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 5, beatmapId: 111 },
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 6, beatmapId: 222 },
  ] })]
  const r = locateSuggestTarget(dup, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1' },
  }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'slot-ambiguous')
  assert.equal(r.candidates.length, 2)
})

test('定位：轮内同槽位多于一张，但 BID 唯一定位 → 命中那一条', () => {
  const dup = [round({ maps: [
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 5, beatmapId: 111 },
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 6, beatmapId: 222 },
  ] })]
  const r = locateSuggestTarget(dup, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 222 },
  }))
  assert.equal(r.ok, true)
  assert.equal(r.mapIndex, 1)
})

test('定位：占位 BID（0/1）不算 ID —— 不能拿它当身份', () => {
  // JSON 里是占位 1，提案快照也写了 1：两边都"没有可信 ID"，所以只按槽位定位。
  const placeholder = [round({ maps: [
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 5, beatmapId: 1, beatmapsetId: 1 },
  ] })]
  const r = locateSuggestTarget(placeholder, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 1 },
  }))
  assert.equal(r.ok, true, '占位值在两边都当"没有 ID"，不该判 mismatch')

  // 反方向：提案带了真实 BID、而当前数据是占位 → 认不出是同一张，必须拦。
  const r2 = locateSuggestTarget(placeholder, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
  }))
  assert.equal(r2.ok, false)
  assert.equal(r2.code, 'beatmap-mismatch')
})

test('定位：轮次级建议不带 slot，也不需要 BID', () => {
  const r = locateSuggestTarget(ROUNDS, referenceProposal(FULL_REF))
  assert.equal(r.ok, true)
  assert.equal(r.mapIndex, -1)
  assert.equal(r.map, null)
})

test('定位：提案带的是占位 BID → 等于"没带"，不能因此判成图被换过', () => {
  // 反方向也成立才行：JSON 里是真实 5416946，提案却写了占位 1。
  // 若把 1 当真 ID 拿去比，就会误报"图被换过" —— 而用户只是提交了转换器留下的默认值。
  const r = locateSuggestTarget(ROUNDS, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 1 },
  }))
  assert.equal(r.ok, true, '占位 1 不是可信 ID，等于没带快照')
  assert.equal(r.mapIndex, 3)
})

// ---------------------------------------------------------------------------
// ② 键型变更
// ---------------------------------------------------------------------------
test('键型：before 也走规范化（历史别名 WC → LNWC）', () => {
  const legacy = [round({ maps: [{ slot: 'LN1', type: 'LN', realType: 'WC', difficulty: 5 }] })]
  const plan = planSuggestChange({
    rounds: legacy,
    proposal: realTypeProposal({
      target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'LN1' },
      value: 'LNWC',
    }),
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.changes, [{ field: 'realType', before: 'LNWC', after: 'LNWC' }])
  assert.equal(plan.noop, true, '别名与规范名是同一个键型 → 无实际变化')
})

test('键型：只改 realType，不碰 type（大类变换是另一个动作）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: realTypeProposal() })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.changes.map((c) => c.field), ['realType'])
  assert.equal(plan.changes[0].before, 'HB1')
  assert.equal(plan.changes[0].after, 'HB3')
  assert.equal(plan.noop, false)
})

test('键型：建议值就是当前值 → 空改动（审核页该提示，而不是"已应用"）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: realTypeProposal({ value: 'HB1' }) })
  assert.equal(plan.ok, true)
  assert.equal(plan.noop, true)
})

// ---------------------------------------------------------------------------
// ③ 难度：按大类判可写性
// ---------------------------------------------------------------------------

test('难度：RC 是单刻度，给了 difficultyLn 要显式拒绝', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: difficultyProposal({ difficulty: 6.5, difficultyLn: 6.0 }) })
  assert.equal(plan.ok, false)
  assert.equal(plan.code, 'field-not-applicable')
  assert.match(plan.detail, /difficultyLn/)
})

test('难度：RC 只改 difficulty，单刻度', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: difficultyProposal({ difficulty: 6.5 }) })
  assert.equal(plan.ok, true)
  assert.equal(plan.dual, false)
  assert.deepEqual(plan.changes, [{ field: 'difficulty', before: 6.1, after: 6.5 }])
})

test('难度：HB 是双刻度，两个字段都给就都列出来', () => {
  const plan = planSuggestChange({
    rounds: ROUNDS,
    proposal: difficultyProposal({ difficulty: 5.6, difficultyLn: 5.0 }, {
      target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
    }),
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.dual, true)
  assert.deepEqual(plan.changes, [
    { field: 'difficulty', before: 5.2, after: 5.6 },
    { field: 'difficultyLn', before: 4.8, after: 5.0 },
  ])
})

test('难度：HB 只给 rf 就只改 rf（ln 保持不动）', () => {
  const plan = planSuggestChange({
    rounds: ROUNDS,
    proposal: difficultyProposal({ difficulty: 5.6 }, {
      target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'TB1', beatmapId: 5555 },
    }),
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.changes, [{ field: 'difficulty', before: 7.1, after: 5.6 }])
})

test('难度：一个适用字段都没给就拒（不能当"清空难度"）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: difficultyProposal({}) })
  assert.equal(plan.ok, false)
  assert.equal(plan.code, 'no-fields')
})

test('难度：与当前值相同 → 空改动', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: difficultyProposal({ difficulty: 6.1 }) })
  assert.equal(plan.ok, true)
  assert.equal(plan.noop, true)
})

test('难度：HB 只改 ln、rf 不动也算有变化（noop 只看真实差异）', () => {
  const plan = planSuggestChange({
    rounds: ROUNDS,
    proposal: difficultyProposal({ difficulty: 5.2, difficultyLn: 5.0 }, {
      target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
    }),
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.noop, false, 'rf 没变但 ln 变了 —— 不能因为第一项相同就判成空改动')
})

test('单/双刻度规则与组件侧同判（移到 lib 后不能漂）', () => {
  for (const category of ['RC', 'LN', 'SV']) {
    assert.equal(needsDualDifficulty(category), false, category)
    assert.deepEqual([...difficultyFieldsFor(category)], ['difficulty'])
  }
  for (const category of ['HB', 'TB', 'SPECIAL']) {
    assert.equal(needsDualDifficulty(category), true, category)
    assert.deepEqual([...difficultyFieldsFor(category)], ['difficulty', 'difficultyLn'])
  }
})

// ---------------------------------------------------------------------------
// ④ 整轮参考
// ---------------------------------------------------------------------------

test('整轮参考：列出全部受影响槽位（SV 与 SPECIAL 有意不动）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: referenceProposal(FULL_REF) })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.affectedSlots, ['RC1', 'RC2', 'LN1', 'HB1', 'TB1'])
  assert.equal(plan.affectedSlots.includes('SV1'), false, 'SV 刻度不同量纲，不参与整轮参考')
  assert.equal(plan.affectedSlots.includes('EX1'), false, 'SPECIAL 是自定义池，没有对应参考线')
  assert.equal(plan.noop, false)
})

test('整轮参考：0 = 这一项不动（不是"改成 0"）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: referenceProposal({ ...ZERO_REF, rc: 7.5 }) })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.affectedSlots, ['RC1', 'RC2'], '只有 rc 会写')
  const fields = new Set(plan.roundChanges.map((c) => c.field))
  assert.deepEqual([...fields], ['difficulty'])
})

test('整轮参考：六个值全 0 → 空改动', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: referenceProposal(ZERO_REF) })
  assert.equal(plan.ok, true)
  assert.equal(plan.noop, true)
  assert.deepEqual(plan.affectedSlots, [])
})

test('整轮参考：TB 不参与统计但要写（双刻度照写）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: referenceProposal({ ...ZERO_REF, tbRf: 8, tbLn: 7.5 }) })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.affectedSlots, ['TB1'])
  assert.deepEqual(
    plan.roundChanges.filter((c) => c.slot === 'TB1').map((c) => `${c.field}:${c.before}->${c.after}`),
    ['difficulty:7.1->8', 'difficultyLn:0->7.5'],
  )
})

test('整轮参考：参考来源与目标轮不一致 → 拒（预览与算出来的值不是一回事）', () => {
  const plan = planSuggestChange({
    rounds: ROUNDS,
    proposal: referenceProposal(FULL_REF, {
      reference: { tournamentId: 'cup-2025', roundId: 'round-4', offset: 0 },
    }),
  })
  assert.equal(plan.ok, false)
  assert.equal(plan.code, 'reference-mismatch')
})

// ---------------------------------------------------------------------------
// ⑤ 与已有暂存比较
// ---------------------------------------------------------------------------

test('冲突：同字段不同值才算冲突', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: realTypeProposal() })
  const pending = new Map([['round-5/HB1', { realType: 'HB2' }]])
  const { conflicts, identical } = compareWithPending(pending, plan)
  assert.equal(conflicts.length, 1)
  assert.deepEqual(conflicts[0], { slot: 'HB1', field: 'realType', pending: 'HB2', proposed: 'HB3' })
  assert.deepEqual(identical, [])
})

test('冲突：值相同是同一条建议，不算冲突（合并来源即可）', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: realTypeProposal() })
  const pending = new Map([['round-5/HB1', { realType: 'HB3' }]])
  const { conflicts, identical } = compareWithPending(pending, plan)
  assert.deepEqual(conflicts, [])
  assert.equal(identical.length, 1)
  assert.equal(identical[0].proposed, 'HB3')
})

test('冲突：暂存里没有该字段（只是补 BID）就不算冲突', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: realTypeProposal() })
  const pending = new Map([['round-5/HB1', { beatmapId: 5416946 }]])
  const { conflicts, identical } = compareWithPending(pending, plan)
  assert.deepEqual(conflicts, [])
  assert.deepEqual(identical, [])
})

test('冲突：整轮参考按每个受影响的槽位分别查暂存', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: referenceProposal(FULL_REF) })
  const pending = new Map([
    ['round-5/RC1', { difficulty: 7.5 }],   // 与建议值相同
    ['round-5/LN1', { difficulty: 9.9 }],   // 被手改过，冲突
  ])
  const { conflicts, identical } = compareWithPending(pending, plan)
  assert.deepEqual(identical.map((c) => c.slot), ['RC1'])
  assert.deepEqual(conflicts.map((c) => c.slot), ['LN1'])
})

test('冲突：没有暂存 → 两边都空', () => {
  const plan = planSuggestChange({ rounds: ROUNDS, proposal: realTypeProposal() })
  const { conflicts, identical } = compareWithPending(new Map(), plan)
  assert.deepEqual(conflicts, [])
  assert.deepEqual(identical, [])
})

// ---------------------------------------------------------------------------
// 复核补的三条（自审时发现：下面三处行为改错了测试也不会红）
// ---------------------------------------------------------------------------

test('难度：changes 顺序固定，不跟随提交方的键序', () => {
  // 对象字面量的键序就是 difficultyLn 在前 —— 旧实现直接 Object.keys(value)，
  // 于是同一条建议在审核页上的 old→new 顺序会随提交方变化。
  const plan = planSuggestChange({
    rounds: ROUNDS,
    proposal: difficultyProposal({ difficultyLn: 5.0, difficulty: 5.6 }, {
      target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
    }),
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(
    plan.changes.map((c) => c.field),
    ['difficulty', 'difficultyLn'],
    '顺序必须由大类决定（rf 在前），不能由提交方决定',
  )
})

test('轮次级：没有单一类别 —— 是 null，不是 SPECIAL', () => {
  const located = locateSuggestTarget(ROUNDS, referenceProposal(FULL_REF))
  assert.equal(located.ok, true)
  assert.equal(located.category, null)

  const plan = planSuggestChange({ rounds: ROUNDS, proposal: referenceProposal(FULL_REF) })
  assert.equal(plan.ok, true)
  assert.equal(plan.category, null, '一条整轮建议横跨 RC/HB/LN/TB，报成 SPECIAL 会误导界面')
  assert.equal(plan.dual, false)
})

test('定位：字符串形式的 BID 不当 ID（不做 Number 宽容转换）', () => {
  const stringBid = [round({ maps: [
    { slot: 'HB1', type: 'HB', realType: 'HB1', difficulty: 5, beatmapId: '5416946' },
  ] })]
  // 数据里 BID 是字符串 = 数据有问题 → 按"没有 ID"处理，退回"槽位唯一"这条路。
  const ok = locateSuggestTarget(stringBid, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1' },
  }))
  assert.equal(ok.ok, true)
  assert.equal(ok.category, 'HB')

  // 提案带真数字 BID、而数据里是字符串 → 认不出是同一张，必须要求人工确认。
  const bad = locateSuggestTarget(stringBid, realTypeProposal({
    target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
  }))
  assert.equal(bad.ok, false)
  assert.equal(bad.code, 'beatmap-mismatch')
})
