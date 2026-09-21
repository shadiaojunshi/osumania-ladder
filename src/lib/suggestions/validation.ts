// 反馈提交的**纯校验**（公开 Worker / 后台 API / 前端 三边共用，不依赖 React、不依赖 functions/）。
//
// 为什么要有第二份长度/字符集常量：`src/` 与 `functions/` 在仓库里是**两个独立的构建单元**
// （functions 被根 tsconfig exclude，双方也从不互相 import）。给公开提交做第一道闸门的是
// 独立 Worker，它只该拿到这份纯逻辑，不该被拖进 Pages 后台的鉴权/KV 依赖。
//
// 因此这里的规则是 functions/api/_lib/{validation,mapKeys,tournamentId}.ts 的**独立复刻**，
// scripts/suggestion-validation.test.mjs 会断言两边的数字相等、键段规则逐例同判 ——
// 改一边必须改另一边（与 difficultyLimits.ts / DIFFICULTY_MAX 同一个先例）。
//
// 三条刻意的设计：
//  1. **白名单式解构**：每个层级都先收未知字段再取值。客户端传 `id`/`status`/`reviewerUid`/
//     `appliedCommitSha` 一律拒 —— 身份与状态只由服务端生成。
//  2. **不猜**：类型不对就报错，不做 `Number(x)` 之类的宽容转换（NaN 会被当成 0 写进数据）。
//  3. **0 的语义**：整轮参考里 0 = "这一项不动"；槽位难度里 0 是**非法**（清空难度要走
//     显式的业务操作，不能隐含在空输入里，见方案第 5 节）。

import { DIFFICULTY_MAX } from '../difficultyLimits.ts'
import { REAL_TYPES } from '../realTypeCatalog.ts'
import { normalizeRealType } from '../realType.ts'
import { SUGGESTION_SCHEMA_VERSION } from './types.ts'
import type {
  SuggestDifficultyValue,
  SuggestProposal,
  SuggestReferenceValue,
  SuggestSubmission,
  SuggestTarget,
  TextProposal,
} from './types.ts'

export const SUGGEST_LIMITS = {
  /** 与 functions/api/_lib/tournamentId.ts 的 MAX_TOURNAMENT_ID_LENGTH 一致。 */
  maxTournamentIdLength: 128,
  /** 与 functions/api/_lib/validation.ts 的 LIMITS.maxRoundIdLength 一致。 */
  maxRoundIdLength: 64,
  /** 与 functions/api/_lib/validation.ts 的 LIMITS.maxSlotLength 一致。 */
  maxSlotLength: 40,
  /** 与 functions/api/_lib/validation.ts 的 LIMITS.maxUrlLength 一致。 */
  maxUrlLength: 500,
  /** 与 functions/api/_lib/validation.ts 的 LIMITS.maxDifficulty 一致。 */
  maxDifficulty: DIFFICULTY_MAX,
  /** 新增的上限（functions 侧没有对应项，不需要镜像断言）。 */
  maxReasonLength: 500,
  maxMessageLength: 1000,
  maxAliasLength: 60,
  maxEvidenceUrls: 2,
  maxRequestIdLength: 36,
  maxDatasetVersionLength: 128,
  maxFingerprintLength: 128,
  maxTurnstileTokenLength: 4096,
} as const

// 与 functions/api/_lib/tournamentId.ts / validation.ts 的 ROUND_ID_PATTERN 完全同形。
const TOURNAMENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/
const ROUND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SuggestFieldError {
  field: string
  code: string
  message: string
}

export type SuggestValidation<T> = { ok: true; value: T } | { ok: false; errors: SuggestFieldError[] }

function fail(field: string, code: string, message: string): SuggestValidation<never> {
  return { ok: false, errors: [{ field, code, message }] }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 白名单检查：返回所有不在 `allowed` 里的键。
 * 排序输出，保证同样输入永远得到同样的错误列表（便于测试与幂等比较）。
 */
export function unknownFields(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  const ok = new Set(allowed)
  return Object.keys(value).filter((key) => !ok.has(key)).sort()
}

// ---------------------------------------------------------------------------
// 基础字段
// ---------------------------------------------------------------------------

/**
 * 与 functions/api/_lib/mapKeys.ts 的 validateKeySegment **同规则**：
 * 不 trim（静默改值会让两个端点认成不同的键）、拒绝空串、超长、控制字符、反斜杠，
 * 以及会让 R2 键产生歧义的空路径段 / `.` / `..`。
 * 注意：`/`、`&`、`(`、`)` 是**允许**的（现有槽位里真的有 `HB4(Wild&SV)` 这种）。
 */
export function validateKeySegment(
  value: unknown,
  { field, maxLength }: { field: string; maxLength: number },
): SuggestValidation<string> {
  if (typeof value !== 'string') return fail(field, 'NOT_STRING', `${field} 必须是字符串`)
  if (value === '') return fail(field, 'EMPTY', `${field} 不能为空`)
  if (value.length > maxLength) return fail(field, 'TOO_LONG', `${field} 超过 ${maxLength} 字符上限`)
  if (/[\u0000-\u001f\u007f]/.test(value)) return fail(field, 'CONTROL_CHAR', `${field} 含控制字符`)
  if (value.includes('\\')) return fail(field, 'BACKSLASH', `${field} 不能含反斜杠`)
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return fail(field, 'EMPTY_SEGMENT', `${field} 含空路径段或 . / ..（会让 R2 键产生歧义）`)
  }
  return { ok: true, value }
}

export function validateTournamentId(value: unknown): SuggestValidation<string> {
  if (typeof value !== 'string') return fail('tournamentId', 'NOT_STRING', 'tournamentId 必须是字符串')
  if (value === '') return fail('tournamentId', 'EMPTY', 'tournamentId 不能为空')
  if (value.length > SUGGEST_LIMITS.maxTournamentIdLength) {
    return fail('tournamentId', 'TOO_LONG', `tournamentId 超过 ${SUGGEST_LIMITS.maxTournamentIdLength} 字符上限`)
  }
  if (!TOURNAMENT_ID_PATTERN.test(value)) {
    return fail('tournamentId', 'CHARSET', 'tournamentId 只允许字母、数字、连字符，且不能以连字符开头')
  }
  return { ok: true, value }
}

export function validateRoundId(value: unknown): SuggestValidation<string> {
  if (typeof value === 'string' && !ROUND_ID_PATTERN.test(value)) {
    return fail('roundId', 'CHARSET', 'roundId 只允许字母、数字、下划线、连字符，且不能以符号开头')
  }
  return validateKeySegment(value, { field: 'roundId', maxLength: SUGGEST_LIMITS.maxRoundIdLength })
}

export function validateSlot(value: unknown): SuggestValidation<string> {
  return validateKeySegment(value, { field: 'slot', maxLength: SUGGEST_LIMITS.maxSlotLength })
}

const ALL_REAL_TYPES: ReadonlySet<string> = new Set(
  Object.values(REAL_TYPES).flatMap((list) => list.map((option) => option.id)),
)

/** 键型白名单。允许历史别名（`WC` → `LNWC`），但**落盘的是规范化之后的值**。 */
export function validateRealType(value: unknown): SuggestValidation<string> {
  if (typeof value !== 'string') return fail('value', 'NOT_STRING', 'realType 必须是字符串')
  const normalized = normalizeRealType(value)
  if (normalized === '') return fail('value', 'EMPTY', 'realType 不能为空')
  if (!ALL_REAL_TYPES.has(normalized)) {
    return fail('value', 'UNKNOWN_REAL_TYPE', `realType "${normalized}" 不在键型目录里`)
  }
  return { ok: true, value: normalized }
}

/**
 * 难度数值。`allowZero` 只在整轮参考里为 true（0 = 这一项不动）；
 * 槽位难度不允许 0 —— 清空要走显式业务操作。
 * 超过 DIFFICULTY_MAX **直接拒**，不截断（与 difficultyLimits.ts 的既定原则一致）。
 */
function validateDifficultyNumber(
  value: unknown,
  field: string,
  { allowZero }: { allowZero: boolean },
): SuggestValidation<number> {
  if (typeof value !== 'number') return fail(field, 'NOT_NUMBER', `${field} 必须是数字（不接受字符串）`)
  if (!Number.isFinite(value)) return fail(field, 'NOT_FINITE', `${field} 必须是有限数字`)
  if (value < 0) return fail(field, 'NEGATIVE', `${field} 不能为负数`)
  if (value === 0 && !allowZero) return fail(field, 'ZERO_NOT_ALLOWED', `${field} 不能为 0（清空难度请用显式的删除操作）`)
  if (value > SUGGEST_LIMITS.maxDifficulty) {
    return fail(field, 'OVER_LIMIT', `${field} 超过上限 ${SUGGEST_LIMITS.maxDifficulty}`)
  }
  return { ok: true, value }
}

const DIFFICULTY_FIELDS = ['difficulty', 'difficultyLn'] as const

function validateDifficultyValue(value: unknown): SuggestValidation<SuggestDifficultyValue> {
  if (!isPlainObject(value)) return fail('value', 'NOT_OBJECT', 'value 必须是对象')
  const extra = unknownFields(value, DIFFICULTY_FIELDS)
  if (extra.length > 0) return fail('value', 'UNKNOWN_FIELD', `value 含未知字段：${extra.join('、')}`)
  const out: SuggestDifficultyValue = {}
  for (const field of DIFFICULTY_FIELDS) {
    if (!(field in value)) continue
    const parsed = validateDifficultyNumber(value[field], `value.${field}`, { allowZero: false })
    if (!parsed.ok) return parsed
    out[field] = parsed.value
  }
  if (out.difficulty === undefined && out.difficultyLn === undefined) {
    return fail('value', 'EMPTY', 'difficulty 与 difficultyLn 至少要给一个')
  }
  return { ok: true, value: out }
}

const REFERENCE_FIELDS = ['rc', 'hbRf', 'hbLn', 'ln', 'tbRf', 'tbLn'] as const

function validateReferenceValue(value: unknown): SuggestValidation<SuggestReferenceValue> {
  if (!isPlainObject(value)) return fail('value', 'NOT_OBJECT', 'value 必须是对象')
  const extra = unknownFields(value, REFERENCE_FIELDS)
  if (extra.length > 0) return fail('value', 'UNKNOWN_FIELD', `value 含未知字段：${extra.join('、')}`)
  const out = {} as SuggestReferenceValue
  let anyPositive = false
  for (const field of REFERENCE_FIELDS) {
    // 六个值必须全给（0 = 这一项不动），缺项说明客户端做了自己的默认值推断 —— 不猜。
    if (!(field in value)) return fail(`value.${field}`, 'MISSING', `整轮参考必须给出 ${field}（0 表示该项不动）`)
    const parsed = validateDifficultyNumber(value[field], `value.${field}`, { allowZero: true })
    if (!parsed.ok) return parsed
    out[field] = parsed.value
    if (parsed.value > 0) anyPositive = true
  }
  if (!anyPositive) return fail('value', 'ALL_ZERO', '六个值全为 0 —— 这条建议不会改动任何谱面')
  return { ok: true, value: out }
}

// ---------------------------------------------------------------------------
// target / reference / proposal
// ---------------------------------------------------------------------------

const TARGET_FIELDS = ['tournamentId', 'roundId', 'slot', 'beatmapId'] as const
/** BID 是 osu! 的全局编号（现有数据 7 位数），给一个明确上界防止塞进 1e300 这种值。 */
const MAX_BEATMAP_ID = 2147483647

/**
 * 目标里的 beatmapId：**不是难度**，所以走自己的整数校验，不能借难度那条通道
 * （难度上限 25，真实 BID 是七位数，借用会把所有正常提交都判成"超上限"）。
 */
function validateBeatmapId(value: unknown): SuggestValidation<number> {
  if (typeof value !== 'number') return fail('target.beatmapId', 'NOT_NUMBER', 'beatmapId 必须是数字')
  if (!Number.isFinite(value)) return fail('target.beatmapId', 'NOT_FINITE', 'beatmapId 必须是有限数字')
  if (!Number.isInteger(value)) return fail('target.beatmapId', 'NOT_INTEGER', 'beatmapId 必须是整数')
  if (value < 0) return fail('target.beatmapId', 'NEGATIVE', 'beatmapId 不能为负数')
  if (value > MAX_BEATMAP_ID) return fail('target.beatmapId', 'OVER_LIMIT', `beatmapId 超过上限 ${MAX_BEATMAP_ID}`)
  return { ok: true, value }
}

function validateTarget(
  value: unknown,
  { requireSlot }: { requireSlot: boolean },
): SuggestValidation<SuggestTarget & { slot: string }> | SuggestValidation<SuggestTarget> {
  if (!isPlainObject(value)) return fail('target', 'NOT_OBJECT', 'target 必须是对象')
  const extra = unknownFields(value, TARGET_FIELDS)
  if (extra.length > 0) return fail('target', 'UNKNOWN_FIELD', `target 含未知字段：${extra.join('、')}`)

  const tournamentId = validateTournamentId(value.tournamentId)
  if (!tournamentId.ok) return tournamentId
  const roundId = validateRoundId(value.roundId)
  if (!roundId.ok) return roundId

  const out: SuggestTarget = { tournamentId: tournamentId.value, roundId: roundId.value }

  if (value.beatmapId !== undefined && value.beatmapId !== null) {
    const bid = validateBeatmapId(value.beatmapId)
    if (!bid.ok) return bid
    // 0 / 1 是"占位 ID"（见 src/lib/beatmapIds.ts）→ 当作没给，不写进建议。
    if (bid.value > 1) out.beatmapId = bid.value
  }

  if (requireSlot) {
    const slot = validateSlot(value.slot)
    if (!slot.ok) return slot
    return { ok: true, value: { ...out, slot: slot.value } }
  }
  // 轮次级建议：`slot` 是"已知但不该有"的字段，单独给一句能看懂的错，
  // 比笼统的"含未知字段 slot"有用（客户端很可能只是复用了谱面建议的表单）。
  if (value.slot !== undefined) return fail('target.slot', 'SLOT_NOT_ALLOWED', '整轮参考是按轮次的建议，不带 slot')
  return { ok: true, value: out }
}

const REFERENCE_SOURCE_FIELDS = ['tournamentId', 'roundId', 'offset'] as const

function validateReferenceSource(value: unknown) {
  if (!isPlainObject(value)) return fail('reference', 'NOT_OBJECT', 'reference 必须是对象')
  const extra = unknownFields(value, REFERENCE_SOURCE_FIELDS)
  if (extra.length > 0) return fail('reference', 'UNKNOWN_FIELD', `reference 含未知字段：${extra.join('、')}`)
  const tournamentId = validateTournamentId(value.tournamentId)
  if (!tournamentId.ok) return { ok: false as const, errors: tournamentId.errors.map((e) => ({ ...e, field: `reference.${e.field}` })) }
  const roundId = validateRoundId(value.roundId)
  if (!roundId.ok) return { ok: false as const, errors: roundId.errors.map((e) => ({ ...e, field: `reference.${e.field}` })) }
  const offset = validateDifficultyNumber(value.offset, 'reference.offset', { allowZero: true })
  if (!offset.ok) return offset
  if (!Number.isInteger(offset.value) || offset.value > 12) {
    return fail('reference.offset', 'BAD_OFFSET', 'offset 必须是 0~12 的整数')
  }
  return { ok: true as const, value: { tournamentId: tournamentId.value, roundId: roundId.value, offset: offset.value } }
}

export const SUGGEST_KINDS = ['slot.realType', 'slot.difficulty', 'round.reference'] as const

const PROPOSAL_FIELDS: Record<string, readonly string[]> = {
  'slot.realType': ['kind', 'target', 'value'],
  'slot.difficulty': ['kind', 'target', 'value'],
  'round.reference': ['kind', 'target', 'reference', 'value'],
}

/** 三类建议的判别联合解析。`kind` 不合法直接拒（不退回"最像的那个"）。 */
export function validateProposal(value: unknown): SuggestValidation<SuggestProposal> {
  if (!isPlainObject(value)) return fail('proposal', 'NOT_OBJECT', 'proposal 必须是对象')
  const kind = value.kind
  // 用 hasOwnProperty 而不是 `in`：`in` 会走原型链，`kind: "toString"` / `"__proto__"`
  // 之类会通过判据，随后 `PROPOSAL_FIELDS[kind]` 拿到继承来的函数/对象，
  // 让校验层自己抛 TypeError —— 于是本该 400 的畸形请求变成 503，
  // 客户端还会当成"可重试"提示玩家再试（而同一条请求永远不可能成功）。
  // 与 functions/api/_lib/auth.ts 的角色判据同一写法，那边已有测试锁原型链键。
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(PROPOSAL_FIELDS, kind)) {
    return fail('proposal.kind', 'UNKNOWN_KIND', `proposal.kind 必须是 ${SUGGEST_KINDS.join(' / ')} 之一`)
  }
  const extra = unknownFields(value, PROPOSAL_FIELDS[kind])
  if (extra.length > 0) return fail('proposal', 'UNKNOWN_FIELD', `proposal 含未知字段：${extra.join('、')}`)

  if (kind === 'slot.realType') {
    const target = validateTarget(value.target, { requireSlot: true })
    if (!target.ok) return target
    const realType = validateRealType(value.value)
    if (!realType.ok) return realType
    return {
      ok: true,
      value: {
        kind: 'slot.realType',
        target: target.value as SuggestTarget & { slot: string },
        value: realType.value,
      },
    }
  }

  if (kind === 'slot.difficulty') {
    const target = validateTarget(value.target, { requireSlot: true })
    if (!target.ok) return target
    const diff = validateDifficultyValue(value.value)
    if (!diff.ok) return diff
    return {
      ok: true,
      value: {
        kind: 'slot.difficulty',
        target: target.value as SuggestTarget & { slot: string },
        value: diff.value,
      },
    }
  }

  const target = validateTarget(value.target, { requireSlot: false })
  if (!target.ok) return target
  const reference = validateReferenceSource(value.reference)
  if (!reference.ok) return reference
  const refValue = validateReferenceValue(value.value)
  if (!refValue.ok) return refValue
  return {
    ok: true,
    value: {
      kind: 'round.reference',
      target: target.value as SuggestTarget,
      reference: reference.value,
      value: refValue.value,
    },
  }
}

// ---------------------------------------------------------------------------
// 顶层提交
// ---------------------------------------------------------------------------

const SUBMISSION_FIELDS = [
  'schemaVersion',
  'clientRequestId',
  'datasetVersion',
  'baseFingerprint',
  'proposal',
  'reason',
  'evidenceUrls',
  'alias',
  'turnstileToken',
] as const

// 两个重载：必填的返回 `SuggestValidation<string>`（调用方不必再判 undefined），
// 可选的返回 `SuggestValidation<string | undefined>`。没有重载时 TS 无法窄化，
// 必填字段后面每一处取值都要多写一次 `?? ''`，很容易掩盖真正的空值。
function boundedString(value: unknown, field: string, maxLength: number): SuggestValidation<string>
function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  options: { optional: true },
): SuggestValidation<string | undefined>
function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  options?: { optional: true },
): SuggestValidation<string | undefined> {
  const optional = options?.optional === true
  if (value === undefined || value === null) {
    if (optional) return { ok: true, value: undefined }
    return fail(field, 'MISSING', `${field} 不能为空`)
  }
  if (typeof value !== 'string') return fail(field, 'NOT_STRING', `${field} 必须是字符串`)
  if (value === '') {
    if (optional) return { ok: true, value: undefined }
    return fail(field, 'EMPTY', `${field} 不能为空`)
  }
  if (value.length > maxLength) return fail(field, 'TOO_LONG', `${field} 超过 ${maxLength} 字符上限`)
  return { ok: true, value }
}

/**
 * 证据链接：只收 https，最多 2 条。
 * **服务端绝不抓取这些地址**（方案第 6 节：不代下载、不做图片代理 → 避免 SSRF）；
 * 界面只当外链渲染，所以这里只校验"是个能外链出去的 https 地址"。
 */
export function validateEvidenceUrls(value: unknown) {
  if (value === undefined || value === null) return { ok: true as const, value: undefined }
  if (!Array.isArray(value)) return fail('evidenceUrls', 'NOT_ARRAY', 'evidenceUrls 必须是数组')
  if (value.length > SUGGEST_LIMITS.maxEvidenceUrls) {
    return fail('evidenceUrls', 'TOO_MANY', `最多 ${SUGGEST_LIMITS.maxEvidenceUrls} 条证据链接`)
  }
  const out: string[] = []
  for (let i = 0; i < value.length; i++) {
    const raw = value[i]
    const field = `evidenceUrls[${i}]`
    if (typeof raw !== 'string') return fail(field, 'NOT_STRING', `${field} 必须是字符串`)
    if (raw.length > SUGGEST_LIMITS.maxUrlLength) {
      return fail(field, 'TOO_LONG', `${field} 超过 ${SUGGEST_LIMITS.maxUrlLength} 字符上限`)
    }
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      return fail(field, 'BAD_URL', `${field} 不是合法 URL`)
    }
    if (parsed.protocol !== 'https:') return fail(field, 'NOT_HTTPS', `${field} 只接受 https 链接`)
    out.push(raw)
  }
  return { ok: true as const, value: out }
}

/**
 * 公开端点的唯一入口。**顺序有意为之**：先白名单、再身份字段、最后才解析 proposal ——
 * 伪造 `id`/`status` 这类字段的请求不该走到业务解析里。
 */
export function validateSubmission(raw: unknown): SuggestValidation<SuggestSubmission> {
  if (!isPlainObject(raw)) return fail('body', 'NOT_OBJECT', '请求体必须是 JSON 对象')

  const extra = unknownFields(raw, SUBMISSION_FIELDS)
  if (extra.length > 0) {
    return fail('body', 'UNKNOWN_FIELD', `请求体含未知字段：${extra.join('、')}（id/status/reviewerUid 等由服务端生成）`)
  }

  if (raw.schemaVersion !== SUGGESTION_SCHEMA_VERSION) {
    return fail('schemaVersion', 'BAD_VERSION', `schemaVersion 必须是 ${SUGGESTION_SCHEMA_VERSION}`)
  }

  const requestId = boundedString(raw.clientRequestId, 'clientRequestId', SUGGEST_LIMITS.maxRequestIdLength)
  if (!requestId.ok) return requestId
  if (!UUID_PATTERN.test(requestId.value)) {
    return fail('clientRequestId', 'NOT_UUID', 'clientRequestId 必须是 UUID（同一次提交重试要复用同一个）')
  }

  const datasetVersion = boundedString(raw.datasetVersion, 'datasetVersion', SUGGEST_LIMITS.maxDatasetVersionLength)
  if (!datasetVersion.ok) return datasetVersion
  const baseFingerprint = boundedString(raw.baseFingerprint, 'baseFingerprint', SUGGEST_LIMITS.maxFingerprintLength)
  if (!baseFingerprint.ok) return baseFingerprint

  const reason = boundedString(raw.reason, 'reason', SUGGEST_LIMITS.maxReasonLength, { optional: true })
  if (!reason.ok) return reason
  const alias = boundedString(raw.alias, 'alias', SUGGEST_LIMITS.maxAliasLength, { optional: true })
  if (!alias.ok) return alias

  const evidence = validateEvidenceUrls(raw.evidenceUrls)
  if (!evidence.ok) return evidence

  const token = boundedString(raw.turnstileToken, 'turnstileToken', SUGGEST_LIMITS.maxTurnstileTokenLength)
  if (!token.ok) return token

  const proposal = isPlainObject(raw.proposal) && raw.proposal.kind === 'text'
    ? validateTextProposal(raw.proposal) : validateProposal(raw.proposal)
  if (!proposal.ok) return proposal

  return {
    ok: true,
    value: {
      schemaVersion: SUGGESTION_SCHEMA_VERSION,
      clientRequestId: requestId.value,
      datasetVersion: datasetVersion.value,
      baseFingerprint: baseFingerprint.value,
      proposal: proposal.value,
      ...(reason.value === undefined ? {} : { reason: reason.value }),
      ...(evidence.value === undefined ? {} : { evidenceUrls: evidence.value }),
      ...(alias.value === undefined ? {} : { alias: alias.value }),
      turnstileToken: token.value,
    },
  }
}

function validateTextProposal(raw: Record<string, unknown>): SuggestValidation<TextProposal> {
  if (unknownFields(raw, ['kind', 'message', 'target']).length) return fail('proposal', 'UNKNOWN_FIELD', '文字反馈含未知字段')
  const message = boundedString(typeof raw.message === 'string' ? raw.message.trim() : raw.message, 'message', SUGGEST_LIMITS.maxMessageLength)
  if (!message.ok) return message
  if (raw.target === undefined) return { ok: true, value: { kind: 'text', message: message.value } }
  const target = validateTarget(raw.target, { requireSlot: isPlainObject(raw.target) && raw.target.slot !== undefined })
  if (!target.ok) return target
  return { ok: true, value: { kind: 'text', message: message.value, target: target.value } }
}

/** 落盘前丢掉 token（方案第 6 节）。 */
export function stripToken(submission: SuggestSubmission) {
  const { turnstileToken: _token, ...rest } = submission
  return rest
}
