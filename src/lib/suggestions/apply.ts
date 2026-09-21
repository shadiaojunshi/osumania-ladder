// 把一条建议的**变更计划**（`patch.ts` 的 `SuggestPlan`）落到比赛草稿上，并产出可追溯的
// `suggestionChanges` 记录。依据 docs/anonymous-feedback-and-abuse-plan.md 第 7 节。
//
// 四条刻意的设计：
//  ① 采纳改的是**草稿**（`StagedEntry.data`），不是权威文件。真正写回由「保存全部」的
//     `/api/tournaments/batch` 完成 —— N 条建议仍然只有 1 次 commit / 1 次构建。
//  ② 写进去的是**审核员看过的那个值**（`plan` 的 after），这里不重算。重算会让
//     "批准的 old→new" 与 "实际落盘的" 变成两件事。
//  ③ 逐字段记录 suggestionId / revision / before / after，而不是只记一串 ID ——
//     第 7 节第 4 条要求手改过的字段能把原建议标成 superseded。
//  ④ **先全校验再全写**：任一字段的当前值与 `before` 对不上就整条拒绝、一个字都不改。
//     审核员看到的前提已经不成立，应该回列表重新评估，而不是半写进去。
//
// 原对象被**就地修改**（与 `mapPatchCommit.applyStagedPatches` 同一个约定）—— 调用方负责
// 传草稿副本，别把状态里的对象直接递进来。

import { slotPatchKey } from '../mapPatchCommit.ts'
import { recalcDifficulty } from '../roundDifficulty.ts'
import type { BeatmapMeta, Tournament } from '../types.ts'
import type { SuggestChangeField, SuggestPlan } from './patch.ts'
import type { SuggestKind } from './types.ts'

export interface SuggestionChangeRecord {
  suggestionId: string
  /** 建议记录的 revision —— 采纳时它指的是哪一版（第 7 节第 4 条）。 */
  revision: number
  kind: SuggestKind
  /** `${roundId}/${slot}`；轮次级建议没有单一槽位时退化成 roundId。 */
  key: string
  roundId: string
  slot: string | null
  field: SuggestChangeField
  before: number | string
  after: number | string
  /**
   * `applied` = 这次真的写进去了；`already` = 草稿里已经是目标值了（可能另一条建议先采纳了
   * 同样的值）—— 两条都算这条建议已落地，但只有 applied 会改数据。
   */
  status: 'applied' | 'already'
}

export interface ApplyConflict {
  key: string
  field: SuggestChangeField
  /** 草稿里现在的值。 */
  current: unknown
  /** 建议书写的基准值（`before`）—— 对不上就说明草稿已被别处改过。 */
  expected: number | string
}

export type ApplyFailureCode = 'noop' | 'round-missing' | 'slot-missing' | 'slot-ambiguous' | 'superseded'

export type ApplySuggestResult =
  | { ok: true; records: SuggestionChangeRecord[]; roundDifficultyRecalculated: boolean }
  | { ok: false; code: ApplyFailureCode; detail: string; conflicts?: ApplyConflict[] }

/** 待写项：统一槽位级与整轮级，后面只走一条校验/写入路径。 */
interface PendingWrite {
  slot: string
  field: SuggestChangeField
  before: number | string
  after: number | string
}

function pendingWrites(plan: SuggestPlan): PendingWrite[] {
  if (plan.slot !== null) {
    return plan.changes.map((change) => ({
      slot: plan.slot as string,
      field: change.field,
      before: change.before,
      after: change.after,
    }))
  }
  return plan.roundChanges.map((change) => ({
    slot: change.slot,
    field: change.field,
    before: change.before,
    after: change.after,
  }))
}

/** 读谱面上某个字段的当前值，口径与 patch.ts 一致（难度缺值记 0，键型记空串）。 */
function readField(map: BeatmapMeta, field: SuggestChangeField): number | string {
  if (field === 'realType') return typeof map.realType === 'string' ? map.realType : ''
  const value = (map as unknown as Record<string, unknown>)[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function writeField(map: BeatmapMeta, field: SuggestChangeField, value: number | string): void {
  if (field === 'realType') {
    map.realType = String(value)
    return
  }
  // 难度字段：`difficultyLn` 允许落 0（数据里本来就有 0 = 没有值）。
  ;(map as unknown as Record<string, unknown>)[field] = value
}

export function applySuggestPlan({
  draft,
  plan,
  suggestionId,
  revision,
}: {
  draft: Tournament
  plan: SuggestPlan
  suggestionId: string
  revision: number
}): ApplySuggestResult {
  if (plan.noop) {
    return { ok: false, code: 'noop', detail: '这条建议与当前数据没有差异，没有可采纳的改动' }
  }

  const rounds = draft.rounds.filter((item) => item.id === plan.roundId)
  if (draft.id !== plan.tournamentId || rounds.length > 1) return { ok: false, code: 'superseded', detail: '比赛或轮次身份发生变化' }
  const round = rounds[0]
  if (!round) {
    return { ok: false, code: 'round-missing', detail: `草稿里没有轮次 ${plan.roundId}` }
  }

  const writes = pendingWrites(plan)
  if (writes.length === 0) {
    return { ok: false, code: 'noop', detail: '变更计划里没有任何字段' }
  }

  // ---- 第一遍：全部定位 + 校验，不改任何东西 ----
  const conflicts: ApplyConflict[] = []
  const resolved: { map: BeatmapMeta; write: PendingWrite; status: 'applied' | 'already' }[] = []

  for (const write of writes) {
    const hits = round.maps.filter((item) => item.slot === write.slot)
    if (hits.length === 0) {
      return { ok: false, code: 'slot-missing', detail: `轮次 ${round.id} 里没有槽位 ${write.slot}` }
    }
    if (hits.length > 1) {
      // draft 与算 plan 时已经不是同一份数据了（槽位被复制过）—— 不猜哪一张。
      return {
        ok: false,
        code: 'slot-ambiguous',
        detail: `轮次 ${round.id} 里有 ${hits.length} 张 ${write.slot}，无法确定改哪一张`,
      }
    }
    const map = hits[0]
    const current = readField(map, write.field)
    const key = slotPatchKey(round.id, write.slot)
    if (current === write.after) {
      resolved.push({ map, write, status: 'already' })
      continue
    }
    if (current !== write.before) {
      conflicts.push({ key, field: write.field, current, expected: write.before })
      continue
    }
    resolved.push({ map, write, status: 'applied' })
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: 'superseded',
      detail: `草稿里已有 ${conflicts.length} 处与提交时不一致的改动，整条未采纳`,
      conflicts,
    }
  }

  // ---- 第二遍：真正写入 ----
  const records: SuggestionChangeRecord[] = []
  let touchedDifficulty = false
  for (const { map, write, status } of resolved) {
    if (status === 'applied') {
      writeField(map, write.field, write.after)
      if (write.field !== 'realType') touchedDifficulty = true
    }
    records.push({
      suggestionId,
      revision,
      kind: plan.kind,
      key: slotPatchKey(round.id, write.slot),
      roundId: round.id,
      slot: write.slot,
      field: write.field,
      before: write.before,
      after: write.after,
      status,
    })
  }

  // 改过任何难度就重算本轮 summary（与编辑器逐图改难度同一个口径）。
  if (touchedDifficulty) {
    round.difficulty = recalcDifficulty(round.maps)
    // Clear only affected summary overrides: reopening the editor must not
    // redistribute a newly reviewed per-map difficulty back to the old average.
    const td = structuredClone(round.typeDifficulties ?? {})
    for (const { map, write } of resolved) {
      if (write.field === 'realType') continue
      const axis = write.field === 'difficultyLn' || map.type === 'LN' ? 'ln' : 'rf'
      if (td[map.type]) delete td[map.type][axis]
    }
    round.typeDifficulties = td
  }

  return { ok: true, records, roundDifficultyRecalculated: touchedDifficulty }
}
