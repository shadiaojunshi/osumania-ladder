// 一条建议 → 数据变更的**纯逻辑**：定位目标、算 old→new、判断可写性、与已有暂存比冲突。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 的 §5（类型契约）与 §7（接入暂存）：
//   ① 审核页必须看到"old → new"以及**整轮参考会波及的全部槽位**，不能只说一句"已应用"；
//   ② 目标定位**不猜**：不用 `roundIndex || fallback` 碰运气 —— 轮次 id 找不到、槽位不存在、
//      槽位在轮内不唯一、BID 与快照对不上，四种情况分别报出来，交给人选；
//   ③ 建议里给了该大类**不认**的字段要显式拒绝（RC 给 `difficultyLn`），不能静默丢掉；
//   ④ 冲突比较只看"已有暂存对同一字段写了不同的值"——值相同就是同一条，合并来源即可。
//
// 这里**不碰** JSON、不碰网络、不知道 `MapPatch` 的形状：只产出一个结构化的变更计划，
// 由调用方（后台审核 UI / 暂存层）决定怎么落。这样公开页与后台审核共用同一套判定。

import { isUsableBeatmapId } from '../beatmapIds.ts'
import {
  difficultyFieldsFor,
  needsDualDifficulty,
  type DifficultyField,
  type MapCategory,
} from '../realTypeCatalog.ts'
import { normalizeRealType } from '../realType.ts'
import {
  describeRoundRefChanges,
  refCategoryOf,
  type RoundRefChange,
  type RoundRefMapLike,
} from '../roundReference.ts'
import type { SuggestDifficultyValue, SuggestProposal } from './types.ts'

/** 建议能改的字段。`realType` 是槽位键型；两个难度字段按大类决定用哪个（见 realTypeCatalog）。 */
export type SuggestChangeField = 'realType' | DifficultyField

export interface SuggestMapLike extends RoundRefMapLike {
  realType?: unknown
  beatmapId?: unknown
  beatmapsetId?: unknown
}

export interface SuggestRoundLike {
  id: string
  /** 轮次名（有就给审核页显示上下文）。 */
  name?: unknown
  abbreviation?: unknown
  maps: SuggestMapLike[]
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 谱面**可信**的 BID。占位值（0 / 1 / 负数 / 非整数）一律当"没有 ID"——
 * 见 `beatmapIds.ts`：MKTC 2025 有 36 张转换来的图写着 `BeatmapSetID:1`，
 * 拿它当身份会把不同的歌判成同一张。
 */
function mapBeatmapId(value: unknown): number | null {
  // 刻意**不做** `Number(value)` 那种宽容转换（与 validation.ts 的"不猜"同一个原则）：
  // JSON 里的 BID 本来就该是 number，是字符串说明这份数据有问题 ——
  // 那就按"没有 ID"处理，退化到人工确认，而不是替它猜一个出来。
  return isUsableBeatmapId(value) ? value : null
}

function slotOf(map: SuggestMapLike): string {
  return str(map.slot)
}

// ---------------------------------------------------------------------------
// ① 定位
// ---------------------------------------------------------------------------

export type LocateFailureCode =
  | 'round-ambiguous'
  | 'round-not-found'
  | 'slot-required'
  | 'slot-not-found'
  | 'slot-ambiguous'
  | 'beatmap-mismatch'

export interface LocateCandidate {
  index: number
  slot: string
  beatmapId: number | null
}

/**
 * 失败信息里**给文案用的插值值**（键名与 `errorText.ts` 的模板一一对应）。
 *
 * 为什么 `detail` 之外还要单独给一份结构化的值：`detail` 是**中文诊断原文**
 * （服务端/日志/测试用），而玩家看到的是按码选出的本地化句子。只照 `detail` 翻译的话，
 * 「轮次 X 里没有槽位 Y」里的 X/Y 就没法填进英文句子里了 —— 要么丢信息，要么把中文夹进去。
 */
export type SuggestErrorParams = Record<string, string | number>

export type LocateResult =
  | {
      ok: true
      roundIndex: number
      /** 轮次级建议（round.reference）没有具体槽位，为 -1。 */
      mapIndex: number
      round: SuggestRoundLike
      map: SuggestMapLike | null
      /** 轮次级建议没有单一类别，为 null —— 它是"不适用"，不是"SPECIAL"。 */
      category: MapCategory | null
    }
  | {
      ok: false
      code: LocateFailureCode
      detail: string
      params?: SuggestErrorParams
      candidates?: LocateCandidate[]
    }

/**
 * 在权威数据里定位建议的目标。
 *
 * BID 的角色：提案里的 `target.beatmapId` 是**提交时看到的快照**，只用来核对
 * "还是不是同一张图"。它不参与授权判断（真正的核对是"读 GitHub 当前文件 + 在这里比对"）。
 */
export function locateSuggestTarget(
  rounds: readonly SuggestRoundLike[],
  proposal: SuggestProposal,
): LocateResult {
  const matches = rounds.filter((item) => item.id === proposal.target.roundId)
  if (matches.length > 1) return { ok: false, code: 'round-ambiguous', detail: '轮次 ID 重复，请先修复比赛数据' }
  const round = matches[0]
  if (!round) {
    return {
      ok: false,
      code: 'round-not-found',
      detail: `轮次 ${proposal.target.roundId} 不在当前数据里`,
      params: { roundId: proposal.target.roundId },
    }
  }
  const roundIndex = rounds.indexOf(round)

  // 轮次级建议：只定位到轮次。
  if (proposal.kind === 'round.reference') {
    return { ok: true, roundIndex, mapIndex: -1, round, map: null, category: null }
  }

  const wantedSlot = String(proposal.target.slot || '')
  if (!wantedSlot) {
    return { ok: false, code: 'slot-required', detail: `${proposal.kind} 必须带 slot` }
  }

  const hits = round.maps
    .map((map, index) => ({ map, index }))
    .filter((item) => slotOf(item.map) === wantedSlot)
  if (hits.length === 0) {
    return {
      ok: false,
      code: 'slot-not-found',
      detail: `轮次 ${round.id} 里没有槽位 ${wantedSlot}`,
      params: { roundId: round.id, slot: wantedSlot },
    }
  }

  const candidates = (list: typeof hits): LocateCandidate[] =>
    list.map((item) => ({ index: item.index, slot: slotOf(item.map), beatmapId: mapBeatmapId(item.map.beatmapId) }))

  // 提案快照里的 BID：占位值等于"没带"（见 mapBeatmapId）。
  const wantedBid = mapBeatmapId(proposal.target.beatmapId)

  if (hits.length === 1) {
    const only = hits[0]
    const actual = mapBeatmapId(only.map.beatmapId)
    // 快照说"是这张图"、而当前数据说不是（或反过来）→ 图被换过，要人工看。
    if (wantedBid !== null && actual !== wantedBid) {
      return {
        ok: false,
        code: 'beatmap-mismatch',
        detail: `槽位 ${wantedSlot} 现在的 BID 是 ${actual ?? '（无/占位）'}，与提交时的 ${wantedBid} 对不上`,
        params: { slot: wantedSlot },
        candidates: candidates(hits),
      }
    }
    return {
      ok: true,
      roundIndex,
      mapIndex: only.index,
      round,
      map: only.map,
      category: refCategoryOf(only.map),
    }
  }

  // 轮内同槽位多于一张（历史数据里出现过）→ 只能靠 BID 消歧，且必须唯一。
  if (wantedBid === null) {
    return {
      ok: false,
      code: 'slot-ambiguous',
      detail: `轮次 ${round.id} 里有 ${hits.length} 张 ${wantedSlot}，且建议没带可用的 BID，无法确定改哪一张`,
      params: { roundId: round.id, slot: wantedSlot, hits: hits.length },
      candidates: candidates(hits),
    }
  }
  const matched = hits.filter((item) => mapBeatmapId(item.map.beatmapId) === wantedBid)
  if (matched.length !== 1) {
    return {
      ok: false,
      code: 'beatmap-mismatch',
      detail: `槽位 ${wantedSlot} 有 ${hits.length} 张，其中 BID 等于 ${wantedBid} 的有 ${matched.length} 张`,
      params: { slot: wantedSlot },
      candidates: candidates(hits),
    }
  }
  const target = matched[0]
  return {
    ok: true,
    roundIndex,
    mapIndex: target.index,
    round,
    map: target.map,
    category: refCategoryOf(target.map),
  }
}

// ---------------------------------------------------------------------------
// ② 变更计划
// ---------------------------------------------------------------------------

export interface SuggestFieldChange {
  /** 建议要写的字段。 */
  field: SuggestChangeField
  before: number | string
  after: number | string
}

export interface SuggestPlan {
  ok: true
  kind: SuggestProposal['kind']
  tournamentId: string
  roundId: string
  /** 轮次级为 null。 */
  slot: string | null
  /**
   * 槽位级：该槽位**当前**的大类 —— 判定难度刻度的依据（键型转换不改大类，见下）。
   * 轮次级：null（一条整轮建议横跨 RC/HB/LN/TB，没有单一类别可报）。
   */
  category: MapCategory | null
  /** 该大类是否双刻度 —— 界面上要显示两个难度框。 */
  dual: boolean
  /** 槽位级：落在这张图上的字段（轮次级为空数组）。 */
  changes: SuggestFieldChange[]
  /** 整轮级：逐槽位逐字段的全部影响（槽位级为空数组）。 */
  roundChanges: RoundRefChange[]
  /** 整轮级：受影响的槽位（去重、保持原顺序）。 */
  affectedSlots: string[]
  /** 没有任何实际变化（建议值与当前值相同，或整轮六个值都写 0）。 */
  noop: boolean
}

export type SuggestPlanFailureCode =
  | LocateFailureCode
  | 'field-not-applicable'
  | 'no-fields'
  | 'reference-mismatch'
  | 'empty-reference'

export interface SuggestPlanError {
  code: SuggestPlanFailureCode
  detail: string
  /** 文案插值值；见 `SuggestErrorParams`。 */
  params?: SuggestErrorParams
  errors?: { field: string; message: string }[]
}

export type SuggestPlanResult = SuggestPlan | ({ ok: false } & SuggestPlanError)

/**
 * 算出"采纳这条建议会改到什么"。
 *
 * **键型只改 `realType`，不动 `type`（大类）** —— 与后台浏览器现有的键型转换
 * （`admin/page.tsx` 的 `handleStageMapChange`）保持一致。大类要变属于另一个动作
 * （`MapSlotEditor.handleCategoryChange` 会连带改 `type` 与默认键型），不在建议范围内。
 */
export function planSuggestChange({
  rounds,
  proposal,
}: {
  rounds: readonly SuggestRoundLike[]
  proposal: SuggestProposal
}): SuggestPlanResult {
  const located = locateSuggestTarget(rounds, proposal)
  if (!located.ok) return located

  const base = {
    kind: proposal.kind,
    tournamentId: proposal.target.tournamentId,
    roundId: proposal.target.roundId,
  }

  if (proposal.kind === 'round.reference') {
    // 选中的参考轮必须就是这条建议的目标轮 —— 否则"看到的预览"和"算出来的值"不是一回事。
    if (
      proposal.reference.tournamentId !== proposal.target.tournamentId ||
      proposal.reference.roundId !== proposal.target.roundId
    ) {
      return {
        ok: false,
        code: 'reference-mismatch',
        detail: `参考来源 ${proposal.reference.tournamentId}/${proposal.reference.roundId} 与目标 ${proposal.target.tournamentId}/${proposal.target.roundId} 不一致`,
        params: {
          reference: `${proposal.reference.tournamentId}/${proposal.reference.roundId}`,
          target: `${proposal.target.tournamentId}/${proposal.target.roundId}`,
        },
      }
    }
    const roundChanges = describeRoundRefChanges(located.round.maps, proposal.value)
    const affectedSlots: string[] = []
    const seen = new Set<string>()
    for (const change of roundChanges) {
      if (seen.has(change.slot)) continue
      seen.add(change.slot)
      affectedSlots.push(change.slot)
    }
    return {
      ok: true,
      ...base,
      slot: null,
      category: null,
      dual: false,
      changes: [],
      roundChanges,
      affectedSlots,
      noop: roundChanges.length === 0,
    }
  }

  const map = located.map
  if (!map) {
    // round.reference 在上面已经 return；走到这里说明定位结果与建议类型不一致（不该发生）。
    return { ok: false, code: 'slot-required', detail: '槽位级建议没有定位到具体谱面' }
  }
  const slot = slotOf(map)
  // 大类在这里现算（而不是用 locate 的返回值）：`refCategoryOf` 是 O(1) 纯函数，
  // 而且它天然返回非空的 `MapCategory` —— 省掉一次 `as` 断言。
  const category = refCategoryOf(map)

  if (proposal.kind === 'slot.realType') {
    const before = normalizeRealType(str(map.realType))
    const after = normalizeRealType(String(proposal.value))
    return {
      ok: true,
      ...base,
      slot,
      category,
      dual: needsDualDifficulty(category),
      changes: [{ field: 'realType', before, after }],
      roundChanges: [],
      affectedSlots: [],
      noop: before === after,
    }
  }

  // slot.difficulty：先按大类过滤可用字段 —— 不给 RC 写 `difficultyLn`，也不给 HB 只认 rf。
  // 输出顺序固定走 `difficultyFieldsFor`（rf 在前），**不跟随 `Object.keys(value)`**：
  // 否则同一条建议的 changes 顺序会随提交方的键序变化，审核页的 old→new 列表会莫名重排。
  const allowed = difficultyFieldsFor(category)
  const value = proposal.value as SuggestDifficultyValue
  const present = Object.keys(value)
  const usable = allowed.filter((field) => present.includes(field))
  const rejected = present.filter((field) => !(allowed as readonly string[]).includes(field))
  if (rejected.length > 0) {
    return {
      ok: false,
      code: 'field-not-applicable',
      detail: `${category} 只用 ${allowed.join(' / ')}，这条建议却给了 ${rejected.join(' / ')}`,
      params: { category, allowed: allowed.join(' / '), rejected: rejected.join(' / ') },
      errors: rejected.map((field) => ({
        field,
        message: `${category} 不写 ${field}`,
      })),
    }
  }
  if (usable.length === 0) {
    return { ok: false, code: 'no-fields', detail: '难度建议至少要给一个该大类适用的字段' }
  }

  const changes: SuggestFieldChange[] = []
  let noop = true
  for (const field of usable) {
    const before = num(map[field as keyof SuggestMapLike])
    const after = num(value[field])
    if (before !== after) noop = false
    changes.push({ field, before, after })
  }
  return {
    ok: true,
    ...base,
    slot,
    category,
    dual: needsDualDifficulty(category),
    changes,
    roundChanges: [],
    affectedSlots: [],
    noop,
  }
}

// ---------------------------------------------------------------------------
// ③ 与已有暂存比较
// ---------------------------------------------------------------------------

/** key = `${roundId}/${slot}`，value = 该槽位已知的待写入字段。 */
export type PendingChangeMap = ReadonlyMap<string, Record<string, unknown>>

export interface SuggestConflict {
  slot: string
  field: SuggestChangeField
  /** 暂存里已有的值。 */
  pending: unknown
  /** 这条建议要写的值。 */
  proposed: unknown
}

export interface PendingComparison {
  /** 同一字段、不同值 —— 不能直接覆盖，要人工决定。 */
  conflicts: SuggestConflict[]
  /** 同一字段、同一个值 —— 这条建议与暂存是同一条，合并来源即可。 */
  identical: SuggestConflict[]
}

export function compareWithPending(pending: PendingChangeMap, plan: SuggestPlan): PendingComparison {
  const conflicts: SuggestConflict[] = []
  const identical: SuggestConflict[] = []
  const check = (slot: string, field: SuggestChangeField, proposed: unknown) => {
    const entry = pending.get(`${plan.roundId}/${slot}`)
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, field)) return
    const item: SuggestConflict = { slot, field, pending: entry[field], proposed }
    if (entry[field] === proposed) identical.push(item)
    else conflicts.push(item)
  }

  for (const change of plan.changes) {
    if (plan.slot !== null) check(plan.slot, change.field, change.after)
  }
  for (const change of plan.roundChanges) {
    check(change.slot, change.field, change.after)
  }
  return { conflicts, identical }
}
