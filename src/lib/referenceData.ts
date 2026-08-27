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

// 6 档位,以 anchor 为中心,按"真实轮位偏移"取值(DifficultyRefPicker 用):
//   anchorMinus = anchor - ⅓ 轮
//   anchor      = anchor 本身 (偏移 0)
//   anchorPlus  = anchor + ⅓ 轮
//   midHalf     = anchor + ½ 轮
//   nextMinus   = anchor + ⅔ 轮
//   next        = anchor + 1 轮
// 各档偏移值见 DifficultyRefPicker 的 POSITION_OFFSET;全走 sampleLadderAtPos,
// 超界线性外推,所以每档都有值(不再依赖 prev/next 是否存在)。
export type RefPosition =
  | 'anchorMinus'
  | 'anchor'
  | 'anchorPlus'
  | 'midHalf'
  | 'nextMinus'
  | 'next'

// 标尺一项:指向某比赛某轮。顺序由数组下标决定(易 → 难)。
// step = 本项比上一项难几个"标准轮"。第一项的 step 无意义(pos=0)。
// 缺省 1,即"和上一项之间差整整一轮"。
export interface LadderEntry {
  tournamentId: string
  roundId: string
  step?: number   // 可选,默认 1
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
  // 累计轮位坐标(第一项 pos=0,后续累加 step)。与 type/field 无关。
  pos: number
}

export interface BaseLadderRound {
  key: string
  tournamentId: string
  tournamentAbbr: string
  roundId: string
  roundAbbr: string
  roundName: string
  ladderIndex: number
  pos: number
  isFallback: boolean
  isSynthetic?: boolean
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
  return validLadderEntries(tournaments, entries).map(({ entry, tournament, round, pos }) => {
    const isExcluded =
      !!exclude && exclude.tournamentId === entry.tournamentId && exclude.roundId === entry.roundId
    const value = isExcluded ? null : getRefValue(tournament, entry.roundId, type, field)
    const tournamentAbbr = tournament.abbreviation || tournament.id
    const roundAbbr = round.abbreviation || round.name || round.id
    return {
      tournamentId: entry.tournamentId,
      tournamentAbbr,
      year: tournament.year || 0,
      roundId: entry.roundId,
      roundAbbr,
      label: `${tournamentAbbr} · ${roundAbbr}`,
      value,
      pos,
    }
  })
}

// ── 整轮快捷偏移(mwc±N)支持 ──────────────────────────────────
// 全局标尺基准比赛(MWC 4K)。整轮「参考」的 mwc±N 以此比赛的某轮为锚,
// N 为"格数",1 格 = 标尺相邻一项;符号即方向,正 = 更难(往 GF/标尺末尾走)。
export const MWC_LADDER_TOURNAMENT_ID = 'osumania-4k-world-cup-2025'

function isMwcTournament(tournament: Tournament): boolean {
  // Keep NMWC out: its abbreviation contains MWC but it is a different
  // competition and should not silently become the global MWC anchor.
  const identity = `${tournament.id} ${tournament.abbreviation || ''} ${tournament.name || ''}`
  return /\bMWC\b/i.test(identity) || /^osumania-4k-world-cup-\d{4}$/i.test(tournament.id)
}

function validLadderEntries(
  tournaments: Tournament[],
  entries: LadderEntry[]
): { entry: LadderEntry; rawIndex: number; pos: number; tournament: Tournament; round: Tournament['rounds'][number] }[] {
  const out: { entry: LadderEntry; rawIndex: number; pos: number; tournament: Tournament; round: Tournament['rounds'][number] }[] = []
  let pos = 0
  for (const [rawIndex, entry] of entries.entries()) {
    const tournament = tournaments.find((candidate) => candidate.id === entry.tournamentId)
    const round = tournament?.rounds.find((candidate) => candidate.id === entry.roundId)
    if (!tournament || !round) continue
    if (out.length > 0) {
      const step = typeof entry.step === 'number' && Number.isFinite(entry.step) && entry.step > 0 ? entry.step : 1
      pos += step
    }
    out.push({ entry, rawIndex, pos, tournament, round })
  }
  return out
}

// 返回当前可用 MWC 系列的轮次；若标尺里完全没有 MWC，则返回所有有效轮次作为托底。
// pos 使用与 resolveLadder 相同的有效条目坐标，避免删除旧轮次后偏移错位。
export function baseLadderRounds(
  tournaments: Tournament[],
  entries: LadderEntry[],
  baseTournamentId: string = MWC_LADDER_TOURNAMENT_ID
): BaseLadderRound[] {
  const valid = validLadderEntries(tournaments, entries)
  if (valid.length === 0) return []

  // Prefer the configured current MWC when it still has ladder entries.
  // If an admin removes those rounds, select the available MWC series with
  // the most entries (latest year breaks ties). This keeps partial MWC
  // ladders usable without requiring a data migration.
  const preferred = valid.filter((item) => item.entry.tournamentId === baseTournamentId)
  let selectedTournamentId: string | null = preferred.length > 0 ? baseTournamentId : null
  if (!selectedTournamentId) {
    const counts = new Map<string, { count: number; year: number }>()
    for (const item of valid) {
      if (!isMwcTournament(item.tournament)) continue
      const current = counts.get(item.tournament.id)
      counts.set(item.tournament.id, {
        count: (current?.count ?? 0) + 1,
        year: Math.max(current?.year ?? 0, item.tournament.year || 0),
      })
    }
    selectedTournamentId = [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].year - a[1].year || a[0].localeCompare(b[0]))[0]?.[0] ?? null
  }

  const isFallback = selectedTournamentId === null
  const selected = isFallback
    ? valid
    : valid.filter((item) => item.entry.tournamentId === selectedTournamentId)

  const resolved: BaseLadderRound[] = selected.map((item) => {
    const tournamentAbbr = item.tournament.abbreviation || item.tournament.id
    const roundAbbr = item.round.abbreviation || item.round.name || item.round.id
    return {
      key: `${item.tournament.id}::${item.round.id}`,
      tournamentId: item.tournament.id,
      tournamentAbbr,
      roundId: item.round.id,
      roundAbbr,
      roundName: item.round.name || roundAbbr,
      ladderIndex: item.rawIndex, // 保留旧字段语义
      pos: item.pos,
      isFallback,
    }
  })

  // GF is commonly treated as one standard round after F. If an admin removes
  // only the MWC GF pool, keep it available as a virtual anchor so the picker
  // can still show "MWC GF + 0" and sample at F.pos + 1.
  if (!isFallback) {
    const hasGf = resolved.some((item) => item.roundAbbr.trim().toUpperCase() === 'GF')
    const fIndex = resolved.findIndex((item) => item.roundAbbr.trim().toUpperCase() === 'F')
    if (!hasGf && fIndex >= 0) {
      const f = resolved[fIndex]
      resolved.splice(fIndex + 1, 0, {
        key: `${f.tournamentId}::__synthetic-gf__`,
        tournamentId: f.tournamentId,
        tournamentAbbr: f.tournamentAbbr,
        roundId: '__synthetic-gf__',
        roundAbbr: 'GF',
        roundName: 'Grand Finals',
        ladderIndex: f.ladderIndex,
        pos: f.pos + 1,
        isFallback: false,
        isSynthetic: true,
      })
    }
  }

  return resolved
}

// 按真实轮位坐标(pos)取值:以 basePos 为原点、offset 为"标准轮数",
// 在有数据的点之间按 pos 线性插值。超出两端时用末段斜率线性外推。
// 注意:旧函数 sampleLadderAtOffset 按下标插值;此函数按 pos 插值,
//   当所有 step=1 时两者等价。
// 外推结果 clamp 到 ≥ 0(难度不为负)。
export function sampleLadderAtPos(
  ladder: RefLadderRound[],
  basePos: number,
  offset: number
): number | null {
  const points: { p: number; v: number }[] = []
  for (const r of ladder) {
    if (r.value !== null) points.push({ p: r.pos, v: r.value })
  }
  if (points.length === 0) return null

  const target = basePos + offset

  // 区间插值
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    if (target >= a.p && target <= b.p) {
      const t = (target - a.p) / (b.p - a.p)
      return Math.max(0, +(a.v + (b.v - a.v) * t).toFixed(2))
    }
  }

  // 低端外推:用最低两点斜率
  if (target < points[0].p) {
    if (points.length === 1) return Math.max(0, +points[0].v.toFixed(2))
    const a = points[0], b = points[1]
    const slope = b.p !== a.p ? (b.v - a.v) / (b.p - a.p) : 0
    return Math.max(0, +(a.v + slope * (target - a.p)).toFixed(2))
  }

  // 高端外推:用最高两点斜率
  const last = points[points.length - 1]
  if (points.length === 1) return Math.max(0, +last.v.toFixed(2))
  const prev = points[points.length - 2]
  const slope = last.p !== prev.p ? (last.v - prev.v) / (last.p - prev.p) : 0
  return Math.max(0, +(last.v + slope * (target - last.p)).toFixed(2))
}

// 向后兼容别名:旧代码按"下标格数"调用时行为不变(step 全 1 时 pos=index)。
// 新代码应直接用 sampleLadderAtPos。
export function sampleLadderAtOffset(
  ladder: RefLadderRound[],
  baseIndex: number,
  offset: number
): number | null {
  // baseIndex 对应 ladder[baseIndex].pos;若该项不存在则 fallback 到 baseIndex 自身
  const basePos = ladder[baseIndex]?.pos ?? baseIndex
  return sampleLadderAtPos(ladder, basePos, offset)
}
