// 难度数值的阈值 —— admin 编辑界面里所有难度输入共用这一套数字。
//
// 为什么要有:手填难度最容易发生的是多按一个 0(19 → 190)。所以:
//   - 超过 DIFFICULTY_MAX 直接拒绝写入(而不是悄悄截断成 25 —— 那会把一个明显的
//     笔误变成一个看起来合理的错数据);
//   - 超过 DIFFICULTY_WARN_ABOVE 只提示,不拦,值仍然存得下。
// 阈值不是拍的:现有全库(50 场 / 345 轮 / 4429 个槽位)里最大难度是 17,
// difficultyLn 最大 17.2,没有任何真实数据落在 18 以上,所以两个阈值都不会误伤。
//
// 注意:functions/api/_lib/validation.ts 里有同一组常量(前后端不能互相 import),
// scripts/difficulty-limits.test.mjs 会断言两边相等,改的时候一起改。

export const DIFFICULTY_MAX = 25
export const DIFFICULTY_WARN_ABOVE = 18

export type DifficultyLevel = 'ok' | 'warn' | 'over'

export function classifyDifficulty(value: number): DifficultyLevel {
  // 非有限值(空输入解析成 NaN 等)不在这里判,交给各字段自己的「必须是数字」校验。
  if (!Number.isFinite(value)) return 'ok'
  if (value > DIFFICULTY_MAX) return 'over'
  if (value > DIFFICULTY_WARN_ABOVE) return 'warn'
  return 'ok'
}

// 输入框里手打的文本是否应该被接受。空串表示"清空该字段",一律接受。
export function shouldAcceptDifficultyInput(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed === '') return true
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return true // 让字段自己处理非法数字
  return value <= DIFFICULTY_MAX
}

// 展示用:整数不带小数点,小数最多两位。
export function formatDifficulty(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

export interface OutOfRangeDifficulty {
  key: string
  value: number
  level: DifficultyLevel
}

// 从一组「键 → 难度」里挑出越界的项。用于在编辑区顶部汇总提示。
// 参数故意收 object 而不是 Record:调用方传进来的多是带具体字段名的类型,
// 没有索引签名,直接当 Record 传会被 tsc 拒绝。
export function collectOutOfRange(values: object): OutOfRangeDifficulty[] {
  const out: OutOfRangeDifficulty[] = []
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'number') continue
    const level = classifyDifficulty(value)
    if (level !== 'ok') out.push({ key, value, level })
  }
  return out
}

export function formatOutOfRange(list: OutOfRangeDifficulty[]): string {
  return list.map((item) => `${item.key} ${formatDifficulty(item.value)}`).join('、')
}
