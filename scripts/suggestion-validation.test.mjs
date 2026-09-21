import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// 反馈提交的第一道闸门（独立 Worker 用的纯校验）。
//
// 这里盯三件事：
//   ① **镜像**：src/lib/suggestions/validation.ts 与 functions/api/_lib/{mapKeys,tournamentId,validation}.ts
//      是两份独立实现（两边不能互相 import）。长度常量必须相等，键段规则必须**逐例同判**。
//   ② **白名单**：客户端传 id/status/reviewerUid 这类服务端字段一律拒 —— 这是防伪造的第一道，
//      不能靠"反正后面会覆盖"来兜。
//   ③ **不猜**：类型不对、NaN、缺项都报错，不做宽容转换（NaN 会被当成 0 写进真实数据）。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  SUGGEST_LIMITS,
  validateEvidenceUrls,
  validateKeySegment,
  validateProposal,
  validateRealType,
  validateRoundId,
  validateSlot,
  validateSubmission,
  validateTournamentId,
  stripToken,
} = await import('../src/lib/suggestions/validation.ts')
const { SUGGESTION_SCHEMA_VERSION } = await import('../src/lib/suggestions/types.ts')

const {
  validateKeySegment: serverKeySegment,
  validateRoundId: serverRoundId,
  validateSlot: serverSlot,
} = await import('../functions/api/_lib/mapKeys.ts')
const { LIMITS } = await import('../functions/api/_lib/validation.ts')
const { MAX_TOURNAMENT_ID_LENGTH, isValidTournamentId } = await import('../functions/api/_lib/tournamentId.ts')
const { DIFFICULTY_MAX } = await import('../src/lib/difficultyLimits.ts')

const REQUEST_ID = '3f1a6f0e-1c2b-4d3e-8f90-abcdef012345'

function submission(overrides = {}) {
  return {
    schemaVersion: SUGGESTION_SCHEMA_VERSION,
    clientRequestId: REQUEST_ID,
    datasetVersion: 'build-2026-09-19',
    baseFingerprint: 'rc5-hb3',
    proposal: {
      kind: 'slot.realType',
      target: { tournamentId: 'asia-suiji-cup-2025', roundId: 'round-5', slot: 'HB1', beatmapId: 5416946 },
      value: 'HB3',
    },
    turnstileToken: 'token-abc',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ① 镜像
// ---------------------------------------------------------------------------

test('长度常量与 functions 侧一致（改一边必须改另一边）', () => {
  assert.equal(SUGGEST_LIMITS.maxTournamentIdLength, MAX_TOURNAMENT_ID_LENGTH)
  assert.equal(SUGGEST_LIMITS.maxTournamentIdLength, LIMITS.maxIdLength)
  assert.equal(SUGGEST_LIMITS.maxRoundIdLength, LIMITS.maxRoundIdLength)
  assert.equal(SUGGEST_LIMITS.maxSlotLength, LIMITS.maxSlotLength)
  assert.equal(SUGGEST_LIMITS.maxUrlLength, LIMITS.maxUrlLength)
  assert.equal(SUGGEST_LIMITS.maxDifficulty, LIMITS.maxDifficulty)
  assert.equal(SUGGEST_LIMITS.maxDifficulty, DIFFICULTY_MAX)
})

const SEGMENT_CORPUS = [
  '', 'a', 'RC1', 'HB4(Wild&SV)', 'TB', 'ST7',
  'slot/with/slash', 'a/b', '.', '..', 'a/..', 'a/.',
  'a\\b', '..\\..\\etc', 'a\u0000b', 'a\u001fb', 'a\u007fb',
  'x'.repeat(40), 'x'.repeat(41), 'x'.repeat(400),
  '  ', 'a b', '-', '_', 'RC1.nsv', '中文槽位', '/leading', 'trailing/',
]

test('键段规则与 functions 侧逐例同判（含路径穿越与控制字符）', () => {
  for (const value of SEGMENT_CORPUS) {
    const mine = validateKeySegment(value, { field: 'slot', maxLength: SUGGEST_LIMITS.maxSlotLength })
    const theirs = serverKeySegment(value, { field: 'slot', maxLength: LIMITS.maxSlotLength })
    assert.equal(
      mine.ok,
      theirs.ok,
      `键段 ${JSON.stringify(value)} 判定不一致：我方 ${mine.ok ? '通过' : '拒绝'}，服务端 ${theirs.ok ? '通过' : '拒绝'}`,
    )
    if (mine.ok && theirs.ok) assert.equal(mine.value, theirs.value, '通过时值必须原样保留（不 trim）')
  }
})

test('validateSlot / tournamentId 与服务端同判', () => {
  for (const value of SEGMENT_CORPUS) {
    assert.equal(validateSlot(value).ok, serverSlot(value).ok, `slot ${JSON.stringify(value)}`)
  }
  const ids = ['', 'a', 'abc-123', '-abc', 'ab_c', 'a.b', 'a b', 'x'.repeat(128), 'x'.repeat(129), '中文']
  for (const id of ids) {
    assert.equal(validateTournamentId(id).ok, isValidTournamentId(id), `tournamentId ${JSON.stringify(id)}`)
  }
})

test('roundId 比服务端的键段检查更严（子集关系，不是不同判）', () => {
  const ids = ['round-1', 'round-5', 'QF_1', 'RO32', 'GF', 'a.b', 'a b', '-x', '_x', 'a\u0000', 'a\\b', '..']
  for (const id of ids) {
    const mine = validateRoundId(id)
    const theirs = serverRoundId(id)
    if (mine.ok) {
      assert.equal(theirs.ok, true, `roundId ${JSON.stringify(id)} 我方通过但服务端拒绝 —— 不是子集关系`)
      assert.equal(mine.value, theirs.value)
    }
  }
  // 真实存在的轮次 id 必须全部能过
  for (const id of ['round-1', 'round-5', 'QF_1', 'RO32', 'GF', 'Qual', 'TB']) {
    assert.equal(validateRoundId(id).ok, true, `${id} 应该被接受`)
  }
})

// ---------------------------------------------------------------------------
// ② 白名单 / ③ 不猜
// ---------------------------------------------------------------------------

test('合法提交能过，且规范化结果可落盘', () => {
  const result = validateSubmission(submission())
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors))
  assert.equal(result.value.proposal.kind, 'slot.realType')
  assert.equal(result.value.proposal.value, 'HB3')
  assert.equal(result.value.clientRequestId, REQUEST_ID)
  assert.equal('reason' in result.value, false, '没给的字段不该凭空出现')
})

test('身份字段由服务端生成 —— 客户端传了就拒', () => {
  for (const field of ['id', 'status', 'reviewerUid', 'appliedCommitSha', 'revision', 'payloadHash', 'ipHash']) {
    const result = validateSubmission(submission({ [field]: 'forged' }))
    assert.equal(result.ok, false, `${field} 必须被拒`)
    assert.equal(result.errors[0].code, 'UNKNOWN_FIELD')
    assert.match(result.errors[0].message, new RegExp(field))
  }
})

test('嵌套层级同样白名单：target / proposal / value 内的未知字段都拒', () => {
  const base = submission()

  const badTarget = validateSubmission({
    ...base,
    proposal: { ...base.proposal, target: { ...base.proposal.target, category: 'HB' } },
  })
  assert.equal(badTarget.ok, false)
  assert.match(badTarget.errors[0].message, /target/)

  const badProposal = validateSubmission({
    ...base,
    proposal: { ...base.proposal, applied: true },
  })
  assert.equal(badProposal.ok, false)
  assert.equal(badProposal.errors[0].field, 'proposal')

  const badValue = validateSubmission({
    ...base,
    proposal: {
      kind: 'slot.difficulty',
      target: base.proposal.target,
      value: { difficulty: 6, difficultySv: 4 },
    },
  })
  assert.equal(badValue.ok, false)
  assert.equal(badValue.errors[0].code, 'UNKNOWN_FIELD')
})

test('schemaVersion 必须精确匹配', () => {
  assert.equal(validateSubmission(submission({ schemaVersion: SUGGESTION_SCHEMA_VERSION + 1 })).ok, false)
  assert.equal(validateSubmission(submission({ schemaVersion: '1' })).ok, false)
  assert.equal(validateSubmission(submission({ schemaVersion: undefined })).ok, false)
})

test('clientRequestId 必须是 UUID（幂等靠它，不能随手填）', () => {
  for (const bad of ['', 'abc', '123', REQUEST_ID.replace('-', ''), REQUEST_ID + 'x', null]) {
    const result = validateSubmission(submission({ clientRequestId: bad }))
    assert.equal(result.ok, false, `${JSON.stringify(bad)} 必须被拒`)
  }
  assert.equal(validateSubmission(submission({ clientRequestId: REQUEST_ID.toUpperCase() })).ok, true, 'UUID 大小写不敏感')
})

test('槽位难度：0 非法、超上限拒、NaN / 字符串拒，且至少给一个字段', () => {
  const withDiff = (value) =>
    validateSubmission({
      ...submission(),
      proposal: {
        kind: 'slot.difficulty',
        target: { tournamentId: 'asia-suiji-cup-2025', roundId: 'round-5', slot: 'HB1' },
        value,
      },
    })

  assert.equal(withDiff({ difficulty: 6.4 }).ok, true)
  assert.equal(withDiff({ difficulty: 6.4, difficultyLn: 5 }).ok, true)

  const zero = withDiff({ difficulty: 0 })
  assert.equal(zero.ok, false, '0 不能表示"清空"')
  assert.equal(zero.errors[0].code, 'ZERO_NOT_ALLOWED')

  assert.equal(withDiff({ difficulty: DIFFICULTY_MAX }).ok, true, '等于上限可以')
  const over = withDiff({ difficulty: DIFFICULTY_MAX + 0.01 })
  assert.equal(over.ok, false, '超上限直接拒，不截断')
  assert.equal(over.errors[0].code, 'OVER_LIMIT')

  assert.equal(withDiff({ difficulty: Number.NaN }).ok, false)
  assert.equal(withDiff({ difficulty: '6.4' }).ok, false, '字符串数字不接受')
  assert.equal(withDiff({ difficulty: Number.POSITIVE_INFINITY }).ok, false)
  assert.equal(withDiff({}).ok, false, '两个字段都不给 → 拒')
  assert.equal(withDiff({ difficulty: null }).ok, false)
})

test('整轮参考：六个值必须齐全、0 表示不动、全 0 拒', () => {
  const withRef = (value, target) =>
    validateSubmission({
      ...submission(),
      proposal: {
        kind: 'round.reference',
        target: target ?? { tournamentId: 'asia-suiji-cup-2025', roundId: 'round-5' },
        reference: { tournamentId: 'osumania-4k-world-cup-2025', roundId: 'round-6', offset: 0 },
        value,
      },
    })

  const full = { rc: 5.2, hbRf: 4.8, hbLn: 0, ln: 4.1, tbRf: 5.5, tbLn: 0 }
  const ok = withRef(full)
  assert.equal(ok.ok, true, ok.ok ? '' : JSON.stringify(ok.errors))

  const missing = withRef({ rc: 5.2, hbRf: 4.8, hbLn: 0, ln: 4.1, tbRf: 5.5 })
  assert.equal(missing.ok, false, '缺项要报错 —— 不替客户端猜默认值')
  assert.equal(missing.errors[0].code, 'MISSING')

  const allZero = withRef({ rc: 0, hbRf: 0, hbLn: 0, ln: 0, tbRf: 0, tbLn: 0 })
  assert.equal(allZero.ok, false)
  assert.equal(allZero.errors[0].code, 'ALL_ZERO')

  const withSlot = withRef(full, { tournamentId: 'asia-suiji-cup-2025', roundId: 'round-5', slot: 'HB1' })
  assert.equal(withSlot.ok, false, '整轮参考是按轮次的建议，带 slot 要拒')
  assert.equal(withSlot.errors[0].code, 'SLOT_NOT_ALLOWED')

  const badOffset = validateSubmission({
    ...submission(),
    proposal: {
      kind: 'round.reference',
      target: { tournamentId: 'asia-suiji-cup-2025', roundId: 'round-5' },
      reference: { tournamentId: 'osumania-4k-world-cup-2025', roundId: 'round-6', offset: 99 },
      value: full,
    },
  })
  assert.equal(badOffset.ok, false)
  assert.equal(badOffset.errors[0].field, 'reference.offset')
})

test('键型：目录内的能过、目录外的拒、历史别名被规范化', () => {
  assert.equal(validateRealType('HB3').ok, true)
  assert.equal(validateRealType('PDLN').ok, true, 'Pending 键型也是目录里的合法值')
  assert.equal(validateRealType('WC').value, 'LNWC', '历史别名 WC 要规范化成 LNWC')
  for (const bad of ['HACK', 'hb3', '', ' ', 'RC1; DROP', '../etc', 'X'.repeat(50)]) {
    assert.equal(validateRealType(bad).ok, false, `${JSON.stringify(bad)} 不该被接受`)
  }
})

test('路径穿越 / 控制字符 / 超长在 target 上也被拦下', () => {
  const withSlot = (slot) =>
    validateSubmission({
      ...submission(),
      proposal: {
        kind: 'slot.realType',
        target: { tournamentId: 'asia-suiji-cup-2025', roundId: 'round-5', slot },
        value: 'HB3',
      },
    })

  for (const slot of ['../../etc/passwd', 'HB1/../../x', 'a\\b', 'a\u0000b', 'x'.repeat(41), '', '.', '..']) {
    assert.equal(withSlot(slot).ok, false, `slot ${JSON.stringify(slot)} 必须被拒`)
  }
  assert.equal(withSlot('HB4(Wild&SV)').ok, true, '真实存在的槽位名要能过')

  const badRound = validateSubmission({
    ...submission(),
    proposal: {
      kind: 'slot.realType',
      target: { tournamentId: 'a/../b', roundId: 'round-5', slot: 'HB1' },
      value: 'HB3',
    },
  })
  assert.equal(badRound.ok, false)
  assert.equal(badRound.errors[0].field, 'tournamentId')
})

test('证据链接只收 https 且最多 2 条（服务端不抓取，界面只做外链）', () => {
  assert.equal(validateEvidenceUrls(undefined).ok, true)
  assert.equal(validateEvidenceUrls([]).ok, true)
  assert.equal(validateEvidenceUrls(['https://osu.ppy.sh/b/123', 'https://youtu.be/x']).ok, true)

  for (const bad of [
    ['http://osu.ppy.sh/b/1'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>'],
    ['file:///etc/passwd'],
    ['not a url'],
    ['https://a', 'https://b', 'https://c'],
    ['https://' + 'x'.repeat(600)],
  ]) {
    const result = validateEvidenceUrls(bad)
    assert.equal(result.ok, false, `${JSON.stringify(bad).slice(0, 60)} 必须被拒`)
  }
})

test('理由与昵称有上限；超长整条拒（不静默截断）', () => {
  assert.equal(validateSubmission(submission({ reason: 'x'.repeat(SUGGEST_LIMITS.maxReasonLength) })).ok, true)
  const longReason = validateSubmission(submission({ reason: 'x'.repeat(SUGGEST_LIMITS.maxReasonLength + 1) }))
  assert.equal(longReason.ok, false)
  assert.equal(longReason.errors[0].field, 'reason')

  assert.equal(validateSubmission(submission({ alias: 'x'.repeat(SUGGEST_LIMITS.maxAliasLength) })).ok, true)
  assert.equal(validateSubmission(submission({ alias: 'x'.repeat(SUGGEST_LIMITS.maxAliasLength + 1) })).ok, false)

  assert.equal(validateSubmission(submission({ reason: '' })).ok, true, '空理由 = 没给理由')
})

test('turnstileToken 必填、有长度上限', () => {
  assert.equal(validateSubmission(submission({ turnstileToken: '' })).ok, false)
  assert.equal(validateSubmission(submission({ turnstileToken: undefined })).ok, false)
  assert.equal(validateSubmission(submission({ turnstileToken: 123 })).ok, false)
  assert.equal(
    validateSubmission(submission({ turnstileToken: 'x'.repeat(SUGGEST_LIMITS.maxTurnstileTokenLength + 1) })).ok,
    false,
  )
})

test('非对象请求体不会抛异常，只会被拒', () => {
  for (const bad of [null, undefined, 42, 'x', [], true]) {
    const result = validateSubmission(bad)
    assert.equal(result.ok, false, `${JSON.stringify(bad)} 必须被拒`)
  }
})

test('落盘前丢掉 turnstileToken', () => {
  const result = validateSubmission(submission())
  assert.equal(result.ok, true)
  const stored = stripToken(result.value)
  assert.equal('turnstileToken' in stored, false)
  assert.equal(stored.clientRequestId, REQUEST_ID)
  assert.equal(stored.proposal.kind, 'slot.realType')
})

test('同一份提交重复校验结果稳定（幂等比较依赖它）', () => {
  const a = validateSubmission(submission())
  const b = validateSubmission(submission())
  assert.deepEqual(a, b)
})

test('proposal.kind 不认识就拒，不退回"最像的那个"', () => {
  for (const kind of ['slot.difficulty', 'round.reference', 'slot.realType']) {
    assert.equal(
      validateProposal({
        kind,
        target: { tournamentId: 't', roundId: 'r', ...(kind === 'round.reference' ? {} : { slot: 'HB1' }) },
        ...(kind === 'round.reference'
          ? {
              reference: { tournamentId: 't', roundId: 'r2', offset: 0 },
              value: { rc: 1, hbRf: 0, hbLn: 0, ln: 0, tbRf: 0, tbLn: 0 },
            }
          : { value: kind === 'slot.realType' ? 'HB3' : { difficulty: 5 } }),
      }).ok,
      true,
      `${kind} 应该能过`,
    )
  }
  // 原型链上的键必须和普通乱串一样被拒：`kind in PROPOSAL_FIELDS` 走原型链，
  // 会让 "toString"/"__proto__" 通过判据，随后把继承来的函数当字段列表用 →
  // 校验层自己抛 TypeError → 本该 400 的畸形请求变成 503，客户端还提示"可重试"。
  // 这些键必须走 return fail(...)，**不能抛**（抛了本测试也会红，但要红在断言上）。
  for (const kind of ['', 'SLOT.REALTYPE', 'difficulty', null, 1, undefined, 'toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
    const result = validateProposal({ kind, target: {}, value: {} })
    assert.equal(result.ok, false, `${JSON.stringify(kind)} 必须被拒`)
    assert.equal(result.errors[0].field, 'proposal.kind')
    assert.equal(result.errors[0].code, 'UNKNOWN_KIND')
  }
})

test('文字反馈可直接提交，正文有 1000 字上限且目标可选', () => {
  const base = submission({
    baseFingerprint: 'text-feedback',
    proposal: { kind: 'text', message: '建议检查整轮参考难度。' },
  })
  const result = validateSubmission(base)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.value.proposal.kind, 'text')
  assert.equal(validateSubmission({ ...base, proposal: { kind: 'text', message: 'x'.repeat(SUGGEST_LIMITS.maxMessageLength + 1) } }).ok, false)
  assert.equal(validateSubmission({ ...base, proposal: { kind: 'text', message: ' ', target: { tournamentId: 'cup', roundId: 'final', slot: 'RC1' } } }).ok, false)
  assert.equal(validateSubmission({ ...base, proposal: { kind: 'text', message: '这张谱面建议复核', target: { tournamentId: 'cup', roundId: 'final', slot: 'RC1', beatmapId: 123 } } }).ok, true)
})
