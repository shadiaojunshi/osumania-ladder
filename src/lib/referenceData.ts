// 难度参考点纯函数。从 tournaments 数据算出某 (tournament, round, type, field) 的均值,
// 用于 DifficultyRefPicker 在用户编辑难度时插值出"参考点位置"。
//
// 设计上是 resolve-at-save: picker 算完直接落数字进 input,不在 slot 里存引用关系。
// 所以这里只导出纯函数,不做任何 React 状态管理。

import type { Tournament } from './types'

export type RefType = 'RC' | 'HB' | 'LN' | 'SV' | 'TB'
export type RefField = 'rf' | 'ln'

// 6 档位,以 anchor 为中心:
//   anchorMinus = anchor - (anchor - prev) / 3      用 anchor 和 prev
//   anchor      = anchor 本身
//   anchorPlus  = anchor + (next - anchor) / 3      用 anchor 和 next
//   midHalf     = (anchor + next) / 2               用 anchor 和 next
//   nextMinus   = next - (next - anchor) / 3        用 anchor 和 next
//   next        = next 本身
// anchorMinus 需要 prev,其余 5 档需要 next。anchor 单独无依赖。
export type RefPosition =
  | 'anchorMinus'
  | 'anchor'
  | 'anchorPlus'
  | 'midHalf'
  | 'nextMinus'
  | 'next'

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
// whitelist 非空时只返回 id 在白名单里的比赛;白名单空数组按"全部"处理。
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

// 锚点上下文:对一个 (tournament, anchor) 找到 prev/next 邻接轮。
// prev = order 严格小于 anchor 的最近一个非资格赛、有该 (type,field) 数据的轮
// next = order 严格大于 anchor 的最近一个非资格赛、有该 (type,field) 数据的轮
// 找不到对应字段就返回 null。
export interface AnchorContext {
  anchor: { roundId: string; roundAbbr: string; value: number }
  prev: { roundId: string; roundAbbr: string; value: number } | null
  next: { roundId: string; roundAbbr: string; value: number } | null
}

export function findAnchorContext(
  tournament: Tournament,
  anchorRoundId: string,
  type: RefType,
  field: RefField
): AnchorContext | null {
  const rounds = [...tournament.rounds].sort((a, b) => (a.order || 0) - (b.order || 0))
  const anchorIdx = rounds.findIndex((r) => r.id === anchorRoundId)
  if (anchorIdx < 0) return null
  const anchorRound = rounds[anchorIdx]
  const anchorVal = getRefValue(tournament, anchorRound.id, type, field)
  if (anchorVal === null) return null

  const findAdjacent = (
    range: Iterable<typeof rounds[number]>
  ): AnchorContext['prev'] => {
    for (const r of range) {
      if (r.isQualifier) continue
      const v = getRefValue(tournament, r.id, type, field)
      if (v === null) continue
      return { roundId: r.id, roundAbbr: r.abbreviation || r.name || r.id, value: v }
    }
    return null
  }

  // prev: 倒着扫 anchorIdx-1 ... 0
  const prev = findAdjacent(
    (function* () {
      for (let i = anchorIdx - 1; i >= 0; i--) yield rounds[i]
    })()
  )
  // next: 正着扫 anchorIdx+1 ... end
  const next = findAdjacent(
    (function* () {
      for (let i = anchorIdx + 1; i < rounds.length; i++) yield rounds[i]
    })()
  )

  return {
    anchor: {
      roundId: anchorRound.id,
      roundAbbr: anchorRound.abbreviation || anchorRound.name || anchorRound.id,
      value: anchorVal,
    },
    prev,
    next,
  }
}

// 6 档插值。各档需要的依赖:
//   anchorMinus → prev (用 anchor 和 prev 算)
//   anchor      → 无 (直接 anchor.value)
//   anchorPlus  → next (用 anchor 和 next 算)
//   midHalf     → next (用 anchor 和 next 算)
//   nextMinus   → next (用 anchor 和 next 算)
//   next        → next (直接 next.value)
// 依赖缺失时返回 null,UI 据此 disable 对应档位。
export function interpolateAnchored(
  ctx: AnchorContext,
  position: RefPosition
): number | null {
  const a = ctx.anchor.value
  switch (position) {
    case 'anchorMinus': {
      if (!ctx.prev) return null
      const v = a - (a - ctx.prev.value) / 3
      return +v.toFixed(1)
    }
    case 'anchor':
      return a
    case 'anchorPlus': {
      if (!ctx.next) return null
      const v = a + (ctx.next.value - a) / 3
      return +v.toFixed(1)
    }
    case 'midHalf': {
      if (!ctx.next) return null
      const v = (a + ctx.next.value) / 2
      return +v.toFixed(1)
    }
    case 'nextMinus': {
      if (!ctx.next) return null
      const v = ctx.next.value - (ctx.next.value - a) / 3
      return +v.toFixed(1)
    }
    case 'next':
      return ctx.next ? ctx.next.value : null
  }
}
