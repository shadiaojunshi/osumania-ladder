// 难度参考点纯函数。从 tournaments 数据算出某 (tournament, round, type, field) 的均值,
// 用于 DifficultyRefPicker 在用户编辑难度时插值出"参考点位置"。
//
// 设计上是 resolve-at-save: picker 算完直接落数字进 input,不在 slot 里存引用关系。
// 所以这里只导出纯函数,不做任何 React 状态管理。

import type { Tournament } from './types'

export type RefType = 'RC' | 'HB' | 'LN' | 'SV' | 'TB'
export type RefField = 'rf' | 'ln'

// 6 档位:左外推 / 左 / 左+1/3 / 加½轮 / 右-1/3 / 右
// leftMinus / rightMinus 在没有 right 时不可选(因为外推/插值都需要 right)
export type RefPosition =
  | 'leftMinus'
  | 'left'
  | 'leftPlus'
  | 'midHalf'
  | 'rightMinus'
  | 'right'

export interface RefRound {
  tournamentId: string
  tournamentAbbr: string
  year: number
  roundId: string
  roundAbbr: string
  roundOrder: number
  isQualifier: boolean
}

// 找单个 round 在该 (type, field) 下的均值。
// 优先取 round.typeDifficulties[type][field](管理员显式录入),
// fallback 到该 round 中 type 谱面的 difficulty / difficultyLn 平均。
// 两条路都拿不到非零数返回 null。
export function getRefValue(
  tournament: Tournament,
  roundId: string,
  type: RefType,
  field: RefField
): number | null {
  const round = tournament.rounds.find((r) => r.id === roundId)
  if (!round) return null

  const td = round.typeDifficulties?.[type]
  if (td) {
    const v = td[field]
    if (typeof v === 'number' && v > 0) return v
  }

  const slots = round.maps.filter((m) => m.type === type)
  if (slots.length === 0) return null
  const diffs: number[] = []
  for (const m of slots) {
    const v = field === 'rf' ? m.difficulty : m.difficultyLn
    if (typeof v === 'number' && v > 0) diffs.push(v)
  }
  if (diffs.length === 0) return null
  return +(diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(1)
}

// 列出"含目标 (type, field) 数据,且非资格赛"的 round。
// whitelist 非空时只返回 id 在白名单里的比赛;白名单空数组按"全部"处理(回退方案,
// 防止白名单还没配置时 picker 完全无可选)。
// 顺序:tournament 按 year desc 排,round 按 order asc。
export function listEligibleRounds(
  tournaments: Tournament[],
  type: RefType,
  field: RefField,
  whitelist: Set<string> | null
): RefRound[] {
  const out: RefRound[] = []
  const useWhitelist = whitelist && whitelist.size > 0
  const sorted = [...tournaments].sort((a, b) => (b.year || 0) - (a.year || 0))
  for (const tn of sorted) {
    if (useWhitelist && !whitelist!.has(tn.id)) continue
    const rounds = [...tn.rounds].sort((a, b) => (a.order || 0) - (b.order || 0))
    for (const r of rounds) {
      if (r.isQualifier) continue
      if (getRefValue(tn, r.id, type, field) === null) continue
      out.push({
        tournamentId: tn.id,
        tournamentAbbr: tn.abbreviation || tn.id,
        year: tn.year || 0,
        roundId: r.id,
        roundAbbr: r.abbreviation || r.name || r.id,
        roundOrder: r.order || 0,
        isQualifier: false,
      })
    }
  }
  return out
}

// 基于 left 自动找右锚点:
//   1) 同比赛中 order 严格大于 left.order、非资格、有数据、值更高的最近一轮
//   2) 找不到再退而求其次:同比赛中 order 大于 left、非资格、有数据(允许同值)
//   3) 还没有就返回 null,表示没有合适的右锚点
// JSON 里 order 偶尔不连续(比如缺 RO16 直接 SF),按 order 升序遍历,自然处理。
export function findAutoRightAnchor(
  tournament: Tournament,
  leftRoundId: string,
  type: RefType,
  field: RefField
): { roundId: string; roundAbbr: string; value: number } | null {
  const rounds = [...tournament.rounds].sort((a, b) => (a.order || 0) - (b.order || 0))
  const leftIdx = rounds.findIndex((r) => r.id === leftRoundId)
  if (leftIdx < 0) return null
  const leftRound = rounds[leftIdx]
  const leftVal = getRefValue(tournament, leftRound.id, type, field)
  if (leftVal === null) return null

  // 第一遍:严格更高
  for (let i = leftIdx + 1; i < rounds.length; i++) {
    const r = rounds[i]
    if (r.isQualifier) continue
    const v = getRefValue(tournament, r.id, type, field)
    if (v === null) continue
    if (v > leftVal) {
      return { roundId: r.id, roundAbbr: r.abbreviation || r.name || r.id, value: v }
    }
  }
  // 第二遍:允许同值,只要后面就行
  for (let i = leftIdx + 1; i < rounds.length; i++) {
    const r = rounds[i]
    if (r.isQualifier) continue
    const v = getRefValue(tournament, r.id, type, field)
    if (v === null) continue
    return { roundId: r.id, roundAbbr: r.abbreviation || r.name || r.id, value: v }
  }
  return null
}

// 6 档位插值。所有非端点档保留一位小数,跟 input step=0.5 协调。
export function interpolateAt(
  left: number,
  right: number,
  position: RefPosition
): number {
  const span = right - left
  let v: number
  switch (position) {
    case 'leftMinus':
      v = left - span / 3
      break
    case 'left':
      return left
    case 'leftPlus':
      v = left + span / 3
      break
    case 'midHalf':
      v = (left + right) / 2
      break
    case 'rightMinus':
      v = right - span / 3
      break
    case 'right':
      return right
  }
  return +v.toFixed(1)
}
