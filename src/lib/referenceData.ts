// 难度参考点纯函数。从 tournaments 数据算出某 (tournament, round, type, field) 的均值,
// 用于 DifficultyRefPicker 在用户编辑难度时插值出"参考点位置"。
//
// 设计上是 resolve-at-save: picker 算完直接落数字进 input,不在 slot 里存引用关系。
// 所以这里只导出 4 个纯函数,不做任何 React 状态管理。

import type { Tournament } from './types'

export type RefType = 'RC' | 'HB' | 'LN' | 'SV' | 'TB'
export type RefField = 'rf' | 'ln'

export interface RefRound {
  tournamentId: string
  tournamentAbbr: string
  year: number
  roundId: string
  roundAbbr: string
  roundOrder: number
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

  // 1) typeDifficulties 优先
  const td = round.typeDifficulties?.[type]
  if (td) {
    const v = td[field]
    if (typeof v === 'number' && v > 0) return v
  }

  // 2) fallback: 现场算 type 槽位的平均
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

// 列出所有"含目标 (type, field) 数据"的 round。供 picker 下拉选项用。
// 顺序:tournament 按 year desc 排,round 按 order asc。
export function listEligibleRounds(
  tournaments: Tournament[],
  type: RefType,
  field: RefField
): RefRound[] {
  const out: RefRound[] = []
  const sorted = [...tournaments].sort((a, b) => (b.year || 0) - (a.year || 0))
  for (const tn of sorted) {
    const rounds = [...tn.rounds].sort((a, b) => (a.order || 0) - (b.order || 0))
    for (const r of rounds) {
      if (getRefValue(tn, r.id, type, field) !== null) {
        out.push({
          tournamentId: tn.id,
          tournamentAbbr: tn.abbreviation || tn.id,
          year: tn.year || 0,
          roundId: r.id,
          roundAbbr: r.abbreviation || r.name || r.id,
          roundOrder: r.order || 0,
        })
      }
    }
  }
  return out
}

// 同比赛中,roundId 后下一个含 (type, field) 数据的 round。
// 用于 picker 选了 left round 后默认选 right。没有合适的下一轮返回 null。
export function nextRoundInTournament(
  tournament: Tournament,
  roundId: string,
  type: RefType,
  field: RefField
): RefRound | null {
  const rounds = [...tournament.rounds].sort((a, b) => (a.order || 0) - (b.order || 0))
  const idx = rounds.findIndex((r) => r.id === roundId)
  if (idx < 0) return null
  for (let i = idx + 1; i < rounds.length; i++) {
    const r = rounds[i]
    if (getRefValue(tournament, r.id, type, field) !== null) {
      return {
        tournamentId: tournament.id,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        year: tournament.year || 0,
        roundId: r.id,
        roundAbbr: r.abbreviation || r.name || r.id,
        roundOrder: r.order || 0,
      }
    }
  }
  return null
}

// 三等分插值:position=0/1/2/3 → 0%, 1/3, 2/3, 100%。
// 端点直接返回端点值,中间四舍五入到一位小数(跟 input step=0.5 协调)。
export function interpolate(left: number, right: number, position: 0 | 1 | 2 | 3): number {
  if (position === 0) return left
  if (position === 3) return right
  const v = left + (right - left) * (position / 3)
  return +v.toFixed(1)
}
