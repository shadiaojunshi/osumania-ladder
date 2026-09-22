// 反馈界面里**给玩家看的错误文案**。
//
// 分两层，别把两层混起来：
//  - `validation.ts` / `patch.ts` 的 `message` / `detail` 是**中文诊断原文**。它们是纯逻辑，
//    被 src/ + functions/ + 独立反馈 Worker **三边共用**，不能依赖 React 或 i18n；
//    服务端日志、审核页、测试都靠它读原因。**原文不动**。
//  - 玩家看到的是这里按**错误码**选出的句子。码认不出来（比如前端上线早于服务端）就退回原文，
//    不会出现空白提示。与后台反馈审核的两轨做法一致（已知错→文案，未知→原文直显）。
//
// 表用 `Record<错误码, [中文, 英文]>` 写：`validation.ts` 里新增一个码而不在这里补文案，
// **typecheck 直接报错**（`messages.en.ts` 的 key parity 是同一个套路）。
//
// 三个 `Tr` 参数而不是 dict key：`/feedback` 这一整套（页面 + 两个表单）用的是内联
// `tr(zh, en)` 约定，不是 `messages.*` 字典。跟着所在模块的约定走。

import type { SuggestPlanError, SuggestPlanFailureCode } from './patch'
import type { SuggestErrorCode, SuggestFieldError } from './validation'

/** 与 `/feedback` 表单里的内联双语辅助同形。 */
export type Tr = (zh: string, en: string) => string

/** `{var}` 替换。与 `i18n.ts` 的 `format` 同规则 —— 那边是 dict 版、不外传，这里自带一份。 */
function fmt(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? `{${key}}` : String(vars[key])))
}

// ---------------------------------------------------------------------------
// ① 提交失败（独立 Worker 返回的机器码）
// ---------------------------------------------------------------------------

/**
 * 玩家可能看到的全部提交失败码。**这份清单要与 Worker 实际 `reject(...)` 的码对齐** ——
 * `scripts/suggest-error-text.test.mjs` 会扫 `workers/feedback/src/` 的码字面量来对账，
 * 那边新增一个会走到客户端的码而不在这里补文案，测试就红。
 */
export const SUBMISSION_TEXT = {
  NETWORK: ['网络中断或超时。请检查网络后重试。', 'Network error or timeout. Check your connection and retry.'],
  INVALID_RECEIPT: [
    '服务返回的收据不完整，这次可能没有提交成功。请重试。',
    'The server sent an incomplete receipt — this may not have gone through. Please retry.',
  ],
  DISABLED: ['反馈提交暂未开放。', 'Feedback submission is not open yet.'],
  TOO_LARGE: ['内容太大了。请删减理由或链接后重试。', 'Too large. Shorten the reason or links, then retry.'],
  BAD_REQUEST: [
    '这份内容被服务端拒绝了。可能是页面数据已经过期，请刷新后重试。',
    'The server rejected this. The page data may be stale — refresh and retry.',
  ],
  INTERNAL: ['服务暂时不可用。请稍后重试。', 'Service temporarily unavailable. Please retry later.'],
  TURNSTILE_FAILED: ['人机验证没通过。请重新完成验证。', 'The human check failed. Please complete it again.'],
  DUPLICATE_CONFLICT: [
    '这次提交用的编号已经用过，但内容和上次不一样。请重新验证后再提交一次。',
    'This submission ID was already used with different content. Verify again and submit once more.',
  ],
  RATE_LIMITED: [
    '提交太频繁。请等按钮上的倒计时走完再试。',
    'Too many submissions. Wait for the countdown on the button, then retry.',
  ],
  BUDGET_EXHAUSTED: [
    '今天的反馈额度已经用完（北京时间早上 8 点重置）。',
    'Today’s feedback allowance is used up (resets 08:00 UTC+8).',
  ],
} as const satisfies Record<string, readonly [string, string]>

export type SubmissionErrorCode = keyof typeof SUBMISSION_TEXT

export function isSubmissionErrorCode(code: string): code is SubmissionErrorCode {
  return Object.prototype.hasOwnProperty.call(SUBMISSION_TEXT, code)
}

/**
 * `SubmissionError.message` 装的就是码（见 `client.ts`），所以直接把 `e.message` 传进来。
 * 认不出来时把码原样带上 —— 玩家报"提交不了"时至少有个可复述的东西，而不是一句笼统的失败。
 */
export function submissionErrorText(code: string, tr: Tr): string {
  if (!isSubmissionErrorCode(code)) return tr(`提交失败（${code}）。`, `Submission failed (${code}).`)
  const [zh, en] = SUBMISSION_TEXT[code]
  return tr(zh, en)
}

// ---------------------------------------------------------------------------
// ② 字段校验（本地校验与 Worker 的 400 都长这样）
// ---------------------------------------------------------------------------

/** 会露给玩家的字段名。表里没有的（`value.difficultyLn` 这类内部路径）直接原样显示。 */
const FIELD_LABEL: Record<string, readonly [string, string]> = {
  evidenceUrls: ['证据链接', 'evidence link'],
  reason: ['理由', 'reason'],
  alias: ['昵称', 'alias'],
  message: ['反馈内容', 'feedback text'],
  tournamentId: ['比赛', 'tournament'],
  roundId: ['轮次', 'round'],
  slot: ['槽位', 'slot'],
  body: ['请求体', 'request'],
  schemaVersion: ['数据版本', 'data version'],
  clientRequestId: ['提交编号', 'submission ID'],
  datasetVersion: ['数据版本', 'dataset version'],
  baseFingerprint: ['数据指纹', 'data fingerprint'],
  turnstileToken: ['人机验证', 'human check'],
  proposal: ['建议内容', 'suggestion'],
  target: ['目标', 'target'],
  reference: ['参考来源', 'reference'],
  value: ['值', 'value'],
  offset: ['标尺位置', 'ladder position'],
}

function fieldLabel(field: string, tr: Tr): string {
  const index = /\[(\d+)\]$/.exec(field)
  const label = FIELD_LABEL[field.replace(/\[\d+\]$/, '')]
  if (!label) return field
  const name = tr(label[0], label[1])
  // 数组字段要带序号：不然"证据链接有问题"看不出是第几条。
  return index ? tr(`${name}（第 ${Number(index[1]) + 1} 条）`, `${name} #${Number(index[1]) + 1}`) : name
}

/**
 * 校验码 → 文案。**故意不带原文里的具体上限**（如"超过 500 字符"）：每个字段的上限不同，
 * `SuggestFieldError` 只带 `field`/`code`，硬写一个数字会在别的字段上说错话。
 * 精确上限留在 `message` 里（服务端日志有），界面上输入框本身也已经限长。
 */
export const VALIDATION_TEXT = {
  NOT_STRING: ['{field}必须是文本。', '{field} must be text.'],
  EMPTY: ['{field}不能为空。', '{field} can’t be empty.'],
  TOO_LONG: ['{field}太长了，请缩短后再提交。', '{field} is too long — shorten it and retry.'],
  CONTROL_CHAR: ['{field}含控制字符，请重新输入。', '{field} contains control characters. Please re-enter it.'],
  BACKSLASH: ['{field}不能含反斜杠。', '{field} can’t contain a backslash.'],
  EMPTY_SEGMENT: ['{field}里含空路径段或 `.` / `..`，请重新选择。', '{field} contains an empty path segment or `.` / `..`. Please pick again.'],
  CHARSET: ['{field}含有不允许的字符。', '{field} contains characters that aren’t allowed.'],
  UNKNOWN_REAL_TYPE: ['这个键型不在键型目录里，请重新选择。', 'That pattern isn’t in the pattern list. Please pick again.'],
  NOT_NUMBER: ['{field}必须是数字。', '{field} must be a number.'],
  NOT_FINITE: ['{field}必须是有限数字。', '{field} must be a finite number.'],
  NEGATIVE: ['{field}不能为负数。', '{field} can’t be negative.'],
  ZERO_NOT_ALLOWED: ['{field}不能为 0。要清空难度请用显式的删除操作。', '{field} can’t be 0. To clear a difficulty, use the explicit remove action.'],
  OVER_LIMIT: ['{field}超出允许的上限。', '{field} is above the allowed maximum.'],
  NOT_OBJECT: ['{field}必须是对象。', '{field} must be an object.'],
  UNKNOWN_FIELD: ['请求里有不认识的字段。请刷新页面后重试。', 'The request has unrecognized fields. Refresh the page and retry.'],
  MISSING: ['{field}不能为空。', '{field} is required.'],
  ALL_ZERO: ['整轮参考的六个值全是 0，这条建议不会改动任何谱面。', 'All six reference values are 0 — this suggestion wouldn’t change any map.'],
  NOT_INTEGER: ['{field}必须是整数。', '{field} must be a whole number.'],
  SLOT_NOT_ALLOWED: ['整轮参考是按轮次给的建议，不带槽位。', 'A round reference applies to the whole round and takes no slot.'],
  BAD_OFFSET: ['标尺位置必须是 0~12 的整数。', 'The ladder position must be a whole number from 0 to 12.'],
  UNKNOWN_KIND: ['建议类型不在允许的三种里，请重新选择。', 'That suggestion type isn’t one of the three allowed. Please pick again.'],
  NOT_ARRAY: ['{field}必须是数组。', '{field} must be a list.'],
  TOO_MANY: ['{field}最多 2 条，请删减后重试。', '{field}: at most 2 — remove some and retry.'],
  BAD_URL: ['{field}不是合法的网址，请检查后重试。', '{field} isn’t a valid URL. Please check it and retry.'],
  NOT_HTTPS: ['{field}只接受 https 链接。', 'Only https links are accepted for {field}.'],
  BAD_VERSION: ['页面数据版本与服务端不一致，请刷新后重试。', 'The page data version doesn’t match the server. Refresh and retry.'],
  NOT_UUID: ['提交编号不是合法 UUID。请刷新页面后重试。', 'The submission ID isn’t a valid UUID. Refresh the page and retry.'],
} as const satisfies Record<SuggestErrorCode, readonly [string, string]>

/** 整句：前缀 + 逐条文案（分隔符也跟着语言走 —— 中文用全角分号，英文用分号加空格）。 */
export function validationErrorText(errors: readonly SuggestFieldError[], tr: Tr): string {
  const parts = errors.map((error) => {
    // 类型上码是穷尽的，但**码是服务端传来的字符串**：前端上线早于服务端时会出现
    // 这里没有的码，所以运行时仍要判一次 —— 认不出就退回中文原文，至少不丢原因。
    const text: readonly [string, string] | undefined = VALIDATION_TEXT[error.code]
    if (!text) return error.message
    return fmt(tr(text[0], text[1]), { field: fieldLabel(error.field, tr) })
  })
  return tr('内容有误，请修改后再提交：', 'Please fix these before submitting: ') + parts.join(tr('；', '; '))
}

// ---------------------------------------------------------------------------
// ③ 变更计划（patch.ts）
// ---------------------------------------------------------------------------

/**
 * 计划失败码 → 文案。这些几乎都是"提交之后数据被改过"，能做的动作也一样（刷新后重新选），
 * 所以句子按这个口径写，具体 ID 从 `params` 填。
 *
 * `empty-reference` 目前在 `patch.ts` 里只出现在类型联合里、没有任何分支产出它 ——
 * 但 `Record` 要求给全，先按字面意思写着；真要删它应该连同联合成员一起删。
 */
export const PLAN_TEXT = {
  'round-ambiguous': [
    '这场比赛里有重复的轮次 ID，暂时没法定位这条建议。请联系站长处理。',
    'This tournament has duplicate round IDs, so the suggestion can’t be located. Please report it.',
  ],
  'round-not-found': [
    '轮次 {roundId} 已经不在当前数据里了（比赛数据被改过），请刷新页面重新选择。',
    'Round {roundId} is no longer in the current data (it changed). Refresh and pick again.',
  ],
  'slot-required': [
    '这条建议没有带上槽位。请重新选择一张谱面。',
    'This suggestion has no slot. Please pick the map again.',
  ],
  'slot-not-found': [
    '轮次 {roundId} 里已经没有槽位 {slot} 了，请刷新页面重新选择。',
    'Slot {slot} is no longer in round {roundId}. Refresh and pick again.',
  ],
  'slot-ambiguous': [
    '轮次 {roundId} 里有 {hits} 张 {slot}，没法确定改哪一张。请联系站长处理。',
    'Round {roundId} has {hits} maps in slot {slot}, so the target is ambiguous. Please report it.',
  ],
  'beatmap-mismatch': [
    '槽位 {slot} 的谱面已经变了（提交之后被改过），请刷新页面重新选择。',
    'The map in slot {slot} has changed since you submitted. Refresh and pick again.',
  ],
  'reference-mismatch': [
    '参考轮次和目标轮次不是同一个（{reference} 对 {target}）。请重新选择参考轮次。',
    'The reference round and the target round differ ({reference} vs {target}). Pick the reference again.',
  ],
  'field-not-applicable': [
    '{category} 只用 {allowed}，这条建议却给了 {rejected}。',
    '{category} only uses {allowed}, but this suggestion gave {rejected}.',
  ],
  'no-fields': [
    '难度建议至少要给一个该类键型适用的值。',
    'A difficulty suggestion needs at least one value that applies to this pattern.',
  ],
  'empty-reference': [
    '参考轮次没有任何可用的难度值。请重新选择参考轮次。',
    'The reference round has no usable difficulty values. Pick the reference again.',
  ],
} as const satisfies Record<SuggestPlanFailureCode, readonly [string, string]>

export function planErrorText(failure: Pick<SuggestPlanError, 'code' | 'detail' | 'params'>, tr: Tr): string {
  const text: readonly [string, string] | undefined = PLAN_TEXT[failure.code]
  if (!text) return failure.detail
  return fmt(tr(text[0], text[1]), failure.params)
}
