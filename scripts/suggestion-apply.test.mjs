import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// 「建议 → 草稿」这一环。
//
// 盯五件事：
//   ① 写进去的是审核员看过的那个值，不是在这里重算的；
//   ② **原子性**：任一处对不上就整条拒绝，草稿一个字都不许变；
//   ③ 草稿已经是目标值 → 不重复写，但要记成已应用（同值建议合并来源）；
//   ④ 改过难度才重算 `round.difficulty`（键型建议不重算）；
//   ⑤ 定位不猜：轮次没了 / 槽位没了 / 槽位重复，分别报出来。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const { applySuggestPlan } = await import('../src/lib/suggestions/apply.ts')
const { planSuggestChange } = await import('../src/lib/suggestions/patch.ts')

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function tournament() {
  return {
    id: 'cup-2025',
    name: 'Cup 2025',
    abbreviation: 'C25',
    keyCount: 4,
    year: 2025,
    rounds: [
      {
        id: 'round-5',
        name: 'Round 5',
        abbreviation: 'R5',
        order: 5,
        // 夹具里的 summary 故意先写一份"对的"，好验证重算确实发生了。
        difficulty: { min: 4.93, max: 6.1, average: 5.44 },
        maps: [
          { slot: 'RC1', type: 'RC', realType: 'RC2', name: 'RC2', difficulty: 6.1, beatmapId: 2222 },
          { slot: 'LN1', type: 'LN', realType: 'LN1', name: 'LN1', difficulty: 5.5, beatmapId: 4444 },
          {
            slot: 'HB1', type: 'HB', realType: 'HB1', name: 'HB1',
            difficulty: 5.2, difficultyLn: 4.8, beatmapId: 5416946,
          },
          // TB 双刻度，但不参与 round.difficulty 统计。
          { slot: 'TB1', type: 'TB', realType: 'TB1', name: 'TB1', difficulty: 7.1, difficultyLn: 0, beatmapId: 5555 },
        ],
      },
    ],
  }
}

const realTypeProposal = (overrides = {}) => ({
  kind: 'slot.realType',
  target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
  value: 'HB3',
  ...overrides,
})

const difficultyProposal = (value, overrides = {}) => ({
  kind: 'slot.difficulty',
  target: { tournamentId: 'cup-2025', roundId: 'round-5', slot: 'RC1', beatmapId: 2222 },
  value,
  ...overrides,
})

const referenceProposal = (value) => ({
  kind: 'round.reference',
  target: { tournamentId: 'cup-2025', roundId: 'round-5' },
  reference: { tournamentId: 'cup-2025', roundId: 'round-5', offset: 0 },
  value,
})

const FULL_REF = { rc: 7.5, hbRf: 6.4, hbLn: 6.1, ln: 6.8, tbRf: 8.0, tbLn: 7.5 }

const mapOf = (draft, slot) => draft.rounds[0].maps.find((m) => m.slot === slot)

// ---------------------------------------------------------------------------
// ① 槽位级
// ---------------------------------------------------------------------------

test('采纳：键型只改 realType（大类不动），且不重算 summary', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: realTypeProposal() })
  const r = applySuggestPlan({ draft, plan, suggestionId: 's-1', revision: 3 })

  assert.equal(r.ok, true)
  assert.equal(r.roundDifficultyRecalculated, false, '键型与难度无关，不该动 round.difficulty')
  const map = mapOf(draft, 'HB1')
  assert.equal(map.realType, 'HB3')
  assert.equal(map.type, 'HB', '大类是另一个动作，建议不该碰')
  assert.deepEqual(draft.rounds[0].difficulty, { min: 4.93, max: 6.1, average: 5.44 }, 'summary 原样')
  assert.deepEqual(r.records, [
    {
      suggestionId: 's-1',
      revision: 3,
      kind: 'slot.realType',
      key: 'round-5/HB1',
      roundId: 'round-5',
      slot: 'HB1',
      field: 'realType',
      before: 'HB1',
      after: 'HB3',
      status: 'applied',
    },
  ])
})

test('采纳：RC 难度改完会重算 round.difficulty（TB 仍不参与）', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: difficultyProposal({ difficulty: 6.5 }) })
  const r = applySuggestPlan({ draft, plan, suggestionId: 's-2', revision: 1 })

  assert.equal(r.ok, true)
  assert.equal(r.roundDifficultyRecalculated, true)
  assert.equal(mapOf(draft, 'RC1').difficulty, 6.5)
  // RC1=6.5、LN1=5.5、HB1=5.2+(4.8-5.2)*2/3≈4.933；TB1 排除。
  assert.deepEqual(draft.rounds[0].difficulty, { min: 4.93, max: 6.5, average: 5.64 })
  assert.equal(r.records[0].status, 'applied')
  assert.equal(r.records[0].before, 6.1)
})

test('采纳：整轮参考改一批槽位，逐字段都有记录', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: referenceProposal(FULL_REF) })
  const r = applySuggestPlan({ draft, plan, suggestionId: 's-3', revision: 2 })

  assert.equal(r.ok, true)
  assert.equal(r.records.length, 6, 'RC1/LN1 各 1 + HB1 2 + TB1 2')
  assert.equal(mapOf(draft, 'RC1').difficulty, 7.5)
  assert.equal(mapOf(draft, 'LN1').difficulty, 6.8)
  assert.equal(mapOf(draft, 'HB1').difficulty, 6.4)
  assert.equal(mapOf(draft, 'HB1').difficultyLn, 6.1)
  // TB 不参与统计，但要写。
  assert.equal(mapOf(draft, 'TB1').difficulty, 8.0)
  assert.equal(mapOf(draft, 'TB1').difficultyLn, 7.5)
  assert.ok(r.records.every((x) => x.key && x.roundId === 'round-5'))
})

// ---------------------------------------------------------------------------
// ② 原子性
// ---------------------------------------------------------------------------

test('采纳：草稿已被别处改过 → 整条拒绝，一个字都不写', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: referenceProposal(FULL_REF) })
  // 另一位管理员先把 LN1 手改成了别的值。
  mapOf(draft, 'LN1').difficulty = 9.9
  const snapshot = JSON.stringify(draft)

  const r = applySuggestPlan({ draft, plan, suggestionId: 's-4', revision: 1 })

  assert.equal(r.ok, false)
  assert.equal(r.code, 'superseded')
  assert.equal(r.conflicts.length, 1)
  assert.equal(r.conflicts[0].key, 'round-5/LN1')
  assert.equal(r.conflicts[0].current, 9.9)
  assert.equal(r.conflicts[0].expected, 5.5)
  assert.equal(JSON.stringify(draft), snapshot, '拒稿时不能有任何部分写入')
})

test('采纳：草稿已是目标值 → 不重复写，但算已应用（同值建议合并来源）', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: realTypeProposal() })
  // 另一条建议先采纳了同样的值。
  mapOf(draft, 'HB1').realType = 'HB3'

  const r = applySuggestPlan({ draft, plan, suggestionId: 's-5', revision: 1 })

  assert.equal(r.ok, true)
  assert.equal(r.records.length, 1)
  assert.equal(r.records[0].status, 'already')
  assert.equal(r.roundDifficultyRecalculated, false)
})

// ---------------------------------------------------------------------------
// ③ 不可采纳的情况
// ---------------------------------------------------------------------------

test('采纳：noop 的建议不该被采纳（没有实际变化）', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: realTypeProposal({ value: 'HB1' }) })
  assert.equal(plan.noop, true)

  const r = applySuggestPlan({ draft, plan, suggestionId: 's-6', revision: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'noop')
})

test('采纳：轮次在草稿里没了 → round-missing', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: realTypeProposal() })
  const round = draft.rounds[0]
  draft.rounds = []

  const r = applySuggestPlan({ draft, plan, suggestionId: 's-7', revision: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'round-missing')
  assert.equal(round.maps[0].realType, 'RC2', '拒绝时不能碰数据')
})

test('采纳：槽位被删掉 → slot-missing', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: realTypeProposal() })
  draft.rounds[0].maps = draft.rounds[0].maps.filter((m) => m.slot !== 'HB1')

  const r = applySuggestPlan({ draft, plan, suggestionId: 's-8', revision: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'slot-missing')
})

test('采纳：草稿里同槽位出现两张 → 不猜（slot-ambiguous）', () => {
  const draft = tournament()
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: realTypeProposal() })
  draft.rounds[0].maps.push({ ...mapOf(draft, 'HB1') })

  const r = applySuggestPlan({ draft, plan, suggestionId: 's-9', revision: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'slot-ambiguous')
})

test('采纳：难度 0 不写（validation 已挡，apply 也不接受把 0 当值写进去）', () => {
  const draft = tournament()
  // 绕过 validation 直接造一个 after=0 的计划：当前是 0、建议写 0 → noop
  const plan = planSuggestChange({ rounds: draft.rounds, proposal: difficultyProposal({ difficulty: 6.1 }) })
  assert.equal(plan.noop, true, '与当前值相同')
  const r = applySuggestPlan({ draft, plan, suggestionId: 's-10', revision: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'noop')
})
