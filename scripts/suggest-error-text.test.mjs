import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import test from 'node:test'

// 反馈界面错误文案层（`src/lib/suggestions/errorText.ts`）。
//
// 盯三件事：
//   ① **编译期锁不住的那一半**。校验码和计划码是联合类型，表里漏一个 tsc 直接报错；
//      但**提交失败码来自独立 Worker**（另一个构建单元，tsc 完全看不见它），
//      只能在这里扫源码对账 —— 那边新增一个会走到客户端的码而不补文案，这条测试变红。
//   ② **英文里不能夹中文**。玩家看到中英混排只会以为界面坏了。
//   ③ 认不出的码要**退回原文**，不能抛错、也不能给空白提示。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const { validationErrorText, submissionErrorText, planErrorText, SUBMISSION_TEXT, VALIDATION_TEXT, PLAN_TEXT } =
  await import('../src/lib/suggestions/errorText.ts')

const zh = (_z, _e) => _z
const en = (_z, e) => e
const TABLES = { SUBMISSION_TEXT, VALIDATION_TEXT, PLAN_TEXT }

/** 中日韩字符 + 全角标点。英文文案里出现任意一个都是漏翻。 */
const CJK = /[　-〿一-鿿＀-￯]/

// ---------------------------------------------------------------------------
// ① 提交失败码 vs Worker 源码
// ---------------------------------------------------------------------------

/**
 * 扫 Worker 源码里所有**可能走到客户端**的码字面量。
 *
 * 只认全大写：客户端看到的码全是 `SNAKE_CASE`，而 `TurnstileFailure`
 * （`non-json` / `bad-hostname` / `timeout` …）是小写，且**从不出 Worker** ——
 * `index.ts` 把任何 `!challenge.ok` 一律收敛成 `TURNSTILE_FAILED`。
 * 所以这条规则顺带就把"内部码"排除了，不用维护白名单。
 */
function workerCodes() {
  const dir = new URL('../workers/feedback/src/', import.meta.url)
  const found = new Set()
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue
    const source = readFileSync(new URL(name, dir), 'utf8')
    for (const re of [/\bcode:\s*'([A-Z][A-Z_]*[A-Z])'/g, /\breject\('([A-Z][A-Z_]*[A-Z])'/g]) {
      for (const match of source.matchAll(re)) found.add(match[1])
    }
  }
  return found
}

test('Worker 会发给客户端的每个码都有文案', () => {
  const codes = workerCodes()
  // 先确认扫描真的扫到了东西：正则写坏时"全部命中"会伪装成通过。
  assert.ok(codes.size >= 5, `扫描只找到 ${codes.size} 个码，正则大概失效了`)
  for (const code of ['DISABLED', 'TURNSTILE_FAILED', 'RATE_LIMITED', 'BUDGET_EXHAUSTED', 'DUPLICATE_CONFLICT']) {
    assert.ok(codes.has(code), `扫描没扫到 ${code} —— 正则或 Worker 结构变了`)
  }
  const missing = [...codes].filter((code) => !(code in SUBMISSION_TEXT))
  assert.deepEqual(missing, [], `这些码会以裸英文大写给玩家看，却没有文案：${missing.join(', ')}`)
})

// ---------------------------------------------------------------------------
// ② 英文文案不许夹中文
// ---------------------------------------------------------------------------

test('三张表的英文文案都不含中文', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    for (const [code, [zhText, enText]] of Object.entries(table)) {
      assert.ok(zhText.length > 0, `${name}.${code} 中文为空`)
      assert.ok(enText.length > 0, `${name}.${code} 英文为空`)
      assert.ok(!CJK.test(enText), `${name}.${code} 的英文里夹了中文：${enText}`)
    }
  }
})

test('默认参数下英文句子不残留未替换的占位符', () => {
  // `{field}` 由调用方填，这里只验"给了值就能替换掉"。
  assert.ok(!validationErrorText([{ field: 'reason', code: 'TOO_LONG', message: 'x' }], en).includes('{field}'))
  assert.ok(!planErrorText({ code: 'round-not-found', detail: 'x', params: { roundId: 'R5' } }, en).includes('{roundId}'))
})

// ---------------------------------------------------------------------------
// ③ 认不出的码退回原文
// ---------------------------------------------------------------------------

test('认不出的提交码带上原码而不是空话', () => {
  const text = submissionErrorText('SOMETHING_NEW', zh)
  assert.match(text, /SOMETHING_NEW/)
  assert.match(submissionErrorText('SOMETHING_NEW', en), /SOMETHING_NEW/)
})

test('认不出的计划码退回中文原文', () => {
  const failure = { code: 'brand-new-code', detail: '轮次 R5 不在当前数据里', params: { roundId: 'R5' } }
  assert.equal(planErrorText(failure, en), failure.detail)
})

test('认不出的校验码退回中文原文，其余条目照常渲染', () => {
  const errors = [
    { field: 'weird', code: 'NEW_CODE', message: '服务端新加的校验' },
    { field: 'evidenceUrls[0]', code: 'NOT_HTTPS', message: 'evidenceUrls[0] 只接受 https 链接' },
  ]
  const text = validationErrorText(errors, zh)
  assert.match(text, /服务端新加的校验/)
  assert.match(text, /只接受 https 链接/)
})

// ---------------------------------------------------------------------------
// ④ 具体行为
// ---------------------------------------------------------------------------

test('字段名翻成人话，数组字段带序号', () => {
  const err = [{ field: 'evidenceUrls[1]', code: 'NOT_HTTPS', message: '原文' }]
  assert.match(validationErrorText(err, zh), /证据链接（第 2 条）/)
  assert.match(validationErrorText(err, en), /evidence link #2/)
  // 表里没有的内部路径原样显示，不去猜一个好看的名字。
  const internal = [{ field: 'value.difficultyLn', code: 'ZERO_NOT_ALLOWED', message: '原文' }]
  assert.match(validationErrorText(internal, en), /value\.difficultyLn/)
})

test('分隔符跟着语言走', () => {
  const errors = [
    { field: 'evidenceUrls[0]', code: 'BAD_URL', message: 'a' },
    { field: 'evidenceUrls[1]', code: 'NOT_HTTPS', message: 'b' },
  ]
  assert.match(validationErrorText(errors, zh), /；/)
  assert.ok(!validationErrorText(errors, en).includes('；'), '英文界面里不该出现全角分号')
  assert.match(validationErrorText(errors, en), /; /)
})

test('计划失败把 params 填进句子', () => {
  const params = { roundId: 'MKTC/GF', slot: 'LN3' }
  const failure = { code: 'slot-not-found', detail: `轮次 MKTC/GF 里没有槽位 LN3`, params }
  assert.match(planErrorText(failure, zh), /MKTC\/GF/)
  assert.match(planErrorText(failure, zh), /LN3/)
  assert.match(planErrorText(failure, en), /MKTC\/GF/)
  assert.match(planErrorText(failure, en), /LN3/)
  assert.ok(!CJK.test(planErrorText(failure, en)), '英文计划文案不该含中文')
})

