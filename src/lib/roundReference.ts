// 整轮「参考」的**唯一实现**（后台编辑器 / 公开反馈页 / 审核预览 三边共用纯逻辑）。
//
// 从 `src/components/admin/RoundEditor.tsx` 的 `applyRoundRef` 原样抽出，行为一字不改：
//
//   ① 同一个大类里的**每一张**谱面都被写成同一个值 —— 整轮参考是"把这一轮拉平到参考线"，
//      不是逐图微调。所以它必然会覆盖手改的差异，审核页必须把受影响的槽位全列出来。
//   ② `> 0` 才写。0 = **这一项不动**（不是"改成 0"）—— 六个值全 0 就是一条空建议。
//   ③ **SV 与 SPECIAL 有意不碰**：SV 的难度刻度跟 RC/LN/HB/TB 不是一个量纲（见
//      `RoundRefPicker` 的注释），SPECIAL 是跨大类的自定义池，没有对应的参考线。
//   ④ TB 不参与 round.difficulty 统计，但**要写** —— 它的 rf/ln 双刻度仍然来自参考。
//
// 为什么不把这些留在组件里：公开反馈页是静态导出的匿名页，不能 import 带 OAuth/KV 依赖的
// 编辑器组件（见 docs/anonymous-feedback-and-abuse-plan.md 第 8 节）。放进 `src/lib` 后，
// 后台编辑器与公开页调的是同一个函数，不存在"两套实现漂移"。

import {
  resolveLadder,
  sampleLadderAtPos,
  type LadderEntry,
  type RefField,
  type RefType,
} from './referenceData.ts'
import { categoryOfRaw, type MapCategory, type StandardMapCategory } from './realTypeCatalog.ts'
import type { Tournament } from './types.ts'

export const ROUND_REF_KEYS = ['rc', 'hbRf', 'hbLn', 'ln', 'tbRf', 'tbLn'] as const
export type RoundRefKey = (typeof ROUND_REF_KEYS)[number]

/** 六个非 SV 值。0 = 该项不动。 */
export interface RoundRefValues {
  rc: number
  hbRf: number
  hbLn: number
  ln: number
  tbRf: number
  tbLn: number
}

/**
 * 六个值 → 参考标尺上的读法。`label` 是给界面用的短标签。
 * 顺序 = `RoundRefPicker` 预览格的显示顺序，也是 `ROUND_REF_KEYS` 的顺序。
 */
export const ROUND_REF_FIELDS: readonly {
  key: RoundRefKey
  type: RefType
  field: RefField
  label: string
}[] = [
  { key: 'rc', type: 'RC', field: 'rf', label: 'RC' },
  { key: 'hbRf', type: 'HB', field: 'rf', label: 'HB(rf)' },
  { key: 'hbLn', type: 'HB', field: 'ln', label: 'HB(ln)' },
  { key: 'ln', type: 'LN', field: 'ln', label: 'LN' },
  { key: 'tbRf', type: 'TB', field: 'rf', label: 'TB(rf)' },
  { key: 'tbLn', type: 'TB', field: 'ln', label: 'TB(ln)' },
]

export function emptyRoundRefValues(): RoundRefValues {
  return { rc: 0, hbRf: 0, hbLn: 0, ln: 0, tbRf: 0, tbLn: 0 }
}

// ---------------------------------------------------------------------------
// 大类判定
// ---------------------------------------------------------------------------

/** JSON 里的 `type` 只有标准五类算大类，其余（含自定义池）一律当 SPECIAL。 */
export { STANDARD_MAP_CATEGORIES, categoryOfRaw } from './realTypeCatalog.ts'
export type { StandardMapCategory } from './realTypeCatalog.ts'

/**
 * 取谱面的大类。编辑器对象带 `category`（用户可能刚改过大类，**优先级更高**），
 * 纯 JSON 对象只有 `type`。两者都缺 → SPECIAL（和 TournamentForm.roundToMeta 同规则）。
 */
export function refCategoryOf(map: { category?: unknown; type?: unknown } | null | undefined): MapCategory {
  if (!map) return 'SPECIAL'
  if (map.category !== undefined && map.category !== null) return categoryOfRaw(map.category)
  return categoryOfRaw(map.type)
}

/** 会写难度的大类。SV / SPECIAL 不在其中。 */
export function isRoundRefCategory(category: string): category is StandardMapCategory {
  return category === 'RC' || category === 'LN' || category === 'HB' || category === 'TB'
}

// ---------------------------------------------------------------------------
// 六个值 → 谱面
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export interface RoundRefMapLike {
  slot?: unknown
  category?: unknown
  type?: unknown
  difficulty?: number
  difficultyLn?: number
}

/**
 * 把六个值写到谱面上。**纯函数**：不认识的字段原样保留，没被改动的项**返回同一个对象引用**
 * （调用方用引用比较就能判断"这张图没动"，也避免无谓的 React 重渲染）。
 *
 * 与 `RoundEditor.applyRoundRef` 的 switch 结果**逐字段等价**，只是把 `map.category` 换成
 * `refCategoryOf(map)` —— 编辑器行为不变（它有 category），纯 JSON 对象也能直接用。
 * 唯一的差别是 HB/TB 在"两个刻度都不写"时提前返回原对象（原来会无条件展开一次，
 * 结果 deep-equal 但引用不同；这里收紧成真正的 no-op）。
 */
export function applyRoundRefToMaps<T extends RoundRefMapLike>(maps: readonly T[], v: RoundRefValues): T[] {
  return maps.map((map) => {
    switch (refCategoryOf(map)) {
      case 'RC':
        return v.rc > 0 ? { ...map, difficulty: v.rc } : map
      case 'HB':
        if (v.hbRf <= 0 && v.hbLn <= 0) return map
        return {
          ...map,
          ...(v.hbRf > 0 ? { difficulty: v.hbRf } : {}),
          ...(v.hbLn > 0 ? { difficultyLn: v.hbLn } : {}),
        }
      case 'LN':
        return v.ln > 0 ? { ...map, difficulty: v.ln } : map
      case 'TB':
        if (v.tbRf <= 0 && v.tbLn <= 0) return map
        return {
          ...map,
          ...(v.tbRf > 0 ? { difficulty: v.tbRf } : {}),
          ...(v.tbLn > 0 ? { difficultyLn: v.tbLn } : {}),
        }
      default:
        // SV 与自定义 SPECIAL 池**有意不动**。
        return map
    }
  })
}

/** 六个值里真正会写的那些键（`> 0`）。编辑器用它决定 `_typeDiffs` 与锁定标记。 */
export function roundRefWriteSet(v: RoundRefValues): RoundRefKey[] {
  return ROUND_REF_KEYS.filter((key) => num(v[key]) > 0)
}

export function roundRefIsEmpty(v: RoundRefValues): boolean {
  return roundRefWriteSet(v).length === 0
}

export interface RoundRefChange {
  slot: string
  category: MapCategory
  field: 'difficulty' | 'difficultyLn'
  before: number
  after: number
}

/**
 * 「点了这条建议会改到什么」的完整清单 —— 审核页必须显示它。
 * 通过**实际应用一次再逐字段比对**得出，所以永远不会和 `applyRoundRefToMaps` 漂移。
 */
export function describeRoundRefChanges<T extends RoundRefMapLike>(
  maps: readonly T[],
  v: RoundRefValues,
): RoundRefChange[] {
  const next = applyRoundRefToMaps(maps, v)
  const out: RoundRefChange[] = []
  for (let i = 0; i < maps.length; i++) {
    const before = maps[i]
    const after = next[i]
    if (before === after) continue
    const slot = String(after.slot ?? before.slot ?? '')
    const category = refCategoryOf(after)
    const rfBefore = num(before.difficulty)
    const rfAfter = num(after.difficulty)
    if (rfBefore !== rfAfter) {
      out.push({ slot, category, field: 'difficulty', before: rfBefore, after: rfAfter })
    }
    const lnBefore = num(before.difficultyLn)
    const lnAfter = num(after.difficultyLn)
    if (lnBefore !== lnAfter) {
      out.push({ slot, category, field: 'difficultyLn', before: lnBefore, after: lnAfter })
    }
  }
  return out
}

/** 受影响的槽位（去重、保持原顺序）。给审核列表做摘要用。 */
export function roundRefAffectedSlots<T extends RoundRefMapLike>(maps: readonly T[], v: RoundRefValues): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const change of describeRoundRefChanges(maps, v)) {
    if (seen.has(change.slot)) continue
    seen.add(change.slot)
    out.push(change.slot)
  }
  return out
}

// ---------------------------------------------------------------------------
// 参考标尺 → 六个值
// ---------------------------------------------------------------------------

/**
 * 从**静态**参考标尺算出六个值（公开页唯一允许的取值方式）。
 *
 * 与 `RoundRefPicker` 的 `preview` 完全同构：逐字段 `resolveLadder` → `sampleLadderAtPos`，
 * 取不到的字段记 0（= 该项不动）。公开页不能调 `fetchLadder()`（那是需要鉴权的
 * `/api/ref-ladder`，匿名访问会 401 并白耗 Functions 额度），改成用构建时随包发布的
 * `data/ref-ladder.json` + `src/lib/referenceData.ts` 的纯计算。
 */
export function computeRoundRefValues({
  tournaments,
  entries,
  basePos,
  offset,
  exclude,
}: {
  tournaments: Tournament[]
  entries: LadderEntry[]
  basePos: number
  offset: number
  exclude?: { tournamentId: string; roundId: string }
}): RoundRefValues {
  const result = emptyRoundRefValues()
  if (!Number.isFinite(basePos) || !Number.isFinite(offset)) return result
  for (const f of ROUND_REF_FIELDS) {
    const ladder = resolveLadder(tournaments, entries, f.type, f.field, exclude)
    const value = sampleLadderAtPos(ladder, basePos, offset)
    result[f.key] = value ?? 0
  }
  return result
}

/** 展示用：`RC 5.20 · HB(rf) 4.80 · …`，0 的项显示为 `—`。 */
export function formatRoundRefValues(v: RoundRefValues): string {
  return ROUND_REF_FIELDS
    .map((f) => `${f.label} ${num(v[f.key]) > 0 ? num(v[f.key]).toFixed(2) : '—'}`)
    .join(' · ')
}

/** 六个值是否逐项相等（审核页判断"参考数据后来被更新过没有"）。 */
export function sameRoundRefValues(a: RoundRefValues, b: RoundRefValues): boolean {
  return ROUND_REF_KEYS.every((key) => num(a[key]) === num(b[key]))
}
