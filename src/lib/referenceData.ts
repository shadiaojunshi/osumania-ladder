// 难度参考点纯函数。从 tournaments 数据算出某 (tournament, round, type, field) 的均值,
// 用于 DifficultyRefPicker 在用户编辑难度时插值出"参考点位置"。
//
// 设计上是 resolve-at-save: picker 算完直接落数字进 input,不在 slot 里存引用关系。
// 所以这里只导出纯函数,不做任何 React 状态管理。
//
// v4: prev/next 不再在单个比赛内找相邻轮,而是从一条全局有序「难度标尺」(ref-ladder)
// 上取。标尺是管理员手排的 (tournamentId, roundId) 链,易 → 难,可跨比赛。
// 锚点候选 = 标尺上有该 (type,field) 数据的项;prev/next = 标尺上前后最近的有数据项。

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

// 标尺一项:指向某比赛某轮。顺序由数组下标决定(易 → 难)。
export interface LadderEntry {
  tournamentId: string
  roundId: string
}

// 标尺一项解析后的完整信息。value 为该 (type,field) 下的均值,拿不到则 null。
export interface RefLadderRound {
  tournamentId: string
  tournamentAbbr: string
  year: number
  roundId: string
  roundAbbr: string
  // 跨比赛展示用的组合标签,例如 "MWC2025 · GF"
  label: string
  value: number | null
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

// 把标尺链按当前 (type,field) 解析成有序的 RefLadderRound 列表。
// 保留 value=null 的项(它们仍占位,只是不能当锚点),
// 这样 prev/next 扫描能正确跳过它们落到下一个有数据的项。
// excludeRoundId/excludeTournamentId 命中的项 value 强制置 null(防自引用)。
export function resolveLadder(
  tournaments: Tournament[],
  entries: LadderEntry[],
  type: RefType,
  field: RefField,
  exclude?: { tournamentId: string; roundId: string }
): RefLadderRound[] {
  const out: RefLadderRound[] = []
  for (const e of entries) {
    const tn = tournaments.find((t) => t.id === e.tournamentId)
    if (!tn) continue
    const round = tn.rounds.find((r) => r.id === e.roundId)
    if (!round) continue
    const isExcluded =
      !!exclude && exclude.tournamentId === e.tournamentId && exclude.roundId === e.roundId
    const value = isExcluded ? null : getRefValue(tn, e.roundId, type, field)
    const tournamentAbbr = tn.abbreviation || tn.id
    const roundAbbr = round.abbreviation || round.name || round.id
    out.push({
      tournamentId: e.tournamentId,
      tournamentAbbr,
      year: tn.year || 0,
      roundId: e.roundId,
      roundAbbr,
      label: `${tournamentAbbr} · ${roundAbbr}`,
      value,
    })
  }
  return out
}

// 锚点上下文:在解析后的标尺上,对某个下标 anchorIndex 找 prev/next。
// prev = 下标更小一侧最近的、value 非 null 的项
// next = 下标更大一侧最近的、value 非 null 的项
// anchorIndex 自身必须 value 非 null,否则返回 null。
export interface AnchorContext {
  anchor: { label: string; roundAbbr: string; value: number }
  prev: { label: string; roundAbbr: string; value: number } | null
  next: { label: string; roundAbbr: string; value: number } | null
}

export function findAnchorContext(
  ladder: RefLadderRound[],
  anchorIndex: number
): AnchorContext | null {
  const a = ladder[anchorIndex]
  if (!a || a.value === null) return null

  let prev: AnchorContext['prev'] = null
  for (let i = anchorIndex - 1; i >= 0; i--) {
    if (ladder[i].value !== null) {
      prev = { label: ladder[i].label, roundAbbr: ladder[i].roundAbbr, value: ladder[i].value! }
      break
    }
  }
  let next: AnchorContext['next'] = null
  for (let i = anchorIndex + 1; i < ladder.length; i++) {
    if (ladder[i].value !== null) {
      next = { label: ladder[i].label, roundAbbr: ladder[i].roundAbbr, value: ladder[i].value! }
      break
    }
  }

  return {
    anchor: { label: a.label, roundAbbr: a.roundAbbr, value: a.value },
    prev,
    next,
  }
}

// ── 整轮快捷偏移(mwc±N)支持 ──────────────────────────────────
// 全局标尺基准比赛(MWC 4K)。整轮「参考」的 mwc±N 以此比赛的某轮为锚,
// N 为"格数",1 格 = 标尺相邻一项;符号即方向,正 = 更难(往 GF/标尺末尾走)。
export const MWC_LADDER_TOURNAMENT_ID = 'osumania-4k-world-cup-2025'

// 标尺上属于基准比赛(MWC)的各轮,带它们在 entries 中的真实下标。
// 用于「基准: MWC QF」的自动匹配 / 手选下拉。
export function baseLadderRounds(
  tournaments: Tournament[],
  entries: LadderEntry[],
  baseTournamentId: string = MWC_LADDER_TOURNAMENT_ID
): { roundId: string; roundAbbr: string; roundName: string; ladderIndex: number }[] {
  const out: { roundId: string; roundAbbr: string; roundName: string; ladderIndex: number }[] = []
  entries.forEach((e, idx) => {
    if (e.tournamentId !== baseTournamentId) return
    const tn = tournaments.find((t) => t.id === e.tournamentId)
    const round = tn?.rounds.find((r) => r.id === e.roundId)
    if (!round) return
    out.push({
      roundId: e.roundId,
      roundAbbr: round.abbreviation || round.name || round.id,
      roundName: round.name || round.abbreviation || round.id,
      ladderIndex: idx,
    })
  })
  return out
}

// 分段线性插值:在解析后的 ladder(可能含 null)上,以 baseIndex 为原点、
// offset 为格数,取该 (type,field) 的插值。只在 value 非 null 的点之间按
// "标尺下标"线性插;target 落在数据两端之外则 clamp(不外推)。
// 整数 offset 落在有数据的项上 → 直接返回该项值。
export function sampleLadderAtOffset(
  ladder: RefLadderRound[],
  baseIndex: number,
  offset: number
): number | null {
  const points: { i: number; v: number }[] = []
  ladder.forEach((r, i) => {
    if (r.value !== null) points.push({ i, v: r.value })
  })
  if (points.length === 0) return null
  const target = baseIndex + offset
  if (target <= points[0].i) return points[0].v
  if (target >= points[points.length - 1].i) return points[points.length - 1].v
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    if (target >= a.i && target <= b.i) {
      const t = (target - a.i) / (b.i - a.i)
      return +(a.v + (b.v - a.v) * t).toFixed(2)
    }
  }
  return points[points.length - 1].v
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
