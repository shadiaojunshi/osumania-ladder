/**
 * 天梯视图里「图的键型/难度值判读」与「键型筛选收敛」的唯一实现。
 *
 * 为什么搬到 lib：
 *   ① 原来 `isLnBased` / `getLnDiff` 与两个键型集合都写在 `LadderView.tsx` 里，
 *      而集合是**硬编码的字符串数组** —— 与 `realTypeCatalog.ts` 重复。新增一个 LN/HB
 *      键型时如果忘了同步这里，那张图在天梯上就不会被当作 LN 系处理（静默算错高度）。
 *      现在集合从键型目录推导，只有目录一处需要维护。
 *   ② 放到 lib 之后这些规则可以被 `node --test` 直接导入，能写测试和真实的几何模拟。
 *
 * 键型筛选（activeFilter = RC / LN / HB / SV / TB 之一）：
 *   生效时几何只反映该大类的图 —— 切 RC/LN/HB/TB 时框高与标题高度都会跟着变
 *   （以前筛选只做 dimmed，框高永远用整轮算）。
 *   例外：「该轮根本没有这个大类」时原样返回整轮数据。那种轮次本来就会被 dimmed，
 *   保留整轮区间能让列的高度节奏不乱跳（否则同一列会突然少掉几段）。
 */

// 扩展名必须写全：本文件会被 node --test 静态导入（见 MEMORY 里的约定）。
import { REAL_TYPES, PENDING_REAL_TYPE_BY_CATEGORY } from './realTypeCatalog.ts'
import { normalizeRealType } from './realType.ts'

export interface TypedMap {
  type: string
}

/**
 * 某个大类下的**具体**键型 id（排除该大类的 Pending 占位，如 PDLN / PDHB）。
 * Pending 是"还没决定"的待办标记，不是 LN/HB 族的一员 —— 排除它是为了保持既有行为。
 */
function realTypeIdsOf(category: 'LN' | 'HB'): Set<string> {
  const pending = PENDING_REAL_TYPE_BY_CATEGORY[category]
  return new Set(REAL_TYPES[category].map((t) => t.id).filter((id) => id !== pending))
}

/** LN 系的真实键型（从键型目录推导，不硬编码）。 */
export const LN_REAL_TYPES = realTypeIdsOf('LN')
/** HB 系的真实键型（从键型目录推导，不硬编码）。 */
export const HB_REAL_TYPES = realTypeIdsOf('HB')

/** 这张图是否算 LN 系（大类是 LN/HB，或具体键型属于 LN/HB 族）。 */
export function isLnBased(m: { type: string; realType: string }): boolean {
  const realType = normalizeRealType(m.realType)
  return m.type === 'LN' || m.type === 'HB' || LN_REAL_TYPES.has(realType) || HB_REAL_TYPES.has(realType)
}

/** LN 系取用于投影到 rf 轴的难度值（LN 大类直接读 difficulty，其余读 difficultyLn 再兜底）。 */
export function getLnDiff(m: { type: string; realType: string; difficulty: number; difficultyLn?: number }): number {
  if (m.type === 'LN') return m.difficulty
  const realType = normalizeRealType(m.realType)
  if (LN_REAL_TYPES.has(realType)) return m.difficultyLn || m.difficulty
  if (m.type === 'HB' || HB_REAL_TYPES.has(realType)) return m.difficultyLn || m.difficulty
  return m.difficulty
}

/**
 * @param maps 待收敛的图（通常是 `countableMaps(round.maps)` 的结果）
 * @param activeFilter 当前选中的大类，null = 不筛选
 */
export function scopeToFilter<T extends TypedMap>(maps: T[], activeFilter: string | null): T[] {
  if (!activeFilter) return maps
  const hit = maps.filter((m) => m.type === activeFilter)
  return hit.length > 0 ? hit : maps
}

export interface ProjectableMap {
  type: string
  realType: string
  difficulty: number
  difficultyLn?: number
}

/**
 * round 视图几何/统计**唯一**的取值口径：把一批图投影到 rf 轴并剔掉不该进的。
 *
 * 规则（与框高、颜色、段位共用，改这里等于三处一起改）：
 *   · TB 不进（TB 只画红条，不参与框高/颜色）；
 *   · LN 系（LN/HB 或 LN/HB 族的真实键型）取 `getLnDiff - rfLnOffset`，
 *     rf 系的取 `difficulty`；
 *   · 投影后 <= 0 视为"这张图没有可用难度"，丢弃。
 *
 * 抽出来是为了"切 RC/LN/HB/TB 时框高与标题一起变"这件事能被测试锁住 ——
 * 以前这段算在 React 组件里，node --test 完全碰不到。
 */
export function projectedDifficulties(
  maps: ProjectableMap[],
  activeFilter: string | null,
  rfLnOffset: number,
): number[] {
  const diffs: number[] = []
  for (const m of scopeToFilter(maps, activeFilter)) {
    if (m.type === 'TB') continue
    if (isLnBased(m)) {
      const d = getLnDiff(m) - rfLnOffset
      if (d > 0) diffs.push(d)
    } else if (m.difficulty > 0) {
      diffs.push(m.difficulty)
    }
  }
  return diffs
}

export interface RoundTitleSource {
  /** 存量整轮难度；`average` = 后台填的 `round.difficulty.average`。 */
  difficulty: { average: number }
  /** 存量分键型难度（后台填的 `round.typeDifficulties[大类]`）。 */
  typeDifficulties?: Record<string, { rf?: number; ln?: number }>
}

/**
 * 标题该画在哪个难度高度。**先存量平均，再逐图平均**（2026-09-19 站长定稿）。
 *
 * 两个来源都收窄到当前键型，所以切 RC/LN/HB/TB 时标题位置会跟着变：
 *   · 有键型筛选 → 存量用 `typeDifficulties[当前大类]`，按该大类的投影轴取
 *     （scope 全是 LN 系 → 用 ln 轴再减 rfLnOffset，否则用 rf 轴）；
 *   · 无筛选 → 存量用整轮 `average`（整轮平均就是"不筛"的口径）；
 *   · 存量为空/为 0（全库 141/385 轮如此）→ 逐图平均（与框高同一口径）。
 *
 * 返回 null = 两个来源都没有，调用方退到难度区间中点。
 * 注意：混合键型轮次用的是"整轮平均"，可能落在框外 —— 调用方负责夹进框内。
 */
export function resolveTitleAvg(
  round: RoundTitleSource,
  maps: ProjectableMap[],
  activeFilter: string | null,
  rfLnOffset: number,
): number | null {
  const scope = scopeToFilter(maps, activeFilter)
  const diffs = projectedDifficulties(maps, activeFilter, rfLnOffset)
  const computedAvg = diffs.length > 0 ? diffs.reduce((sum, d) => sum + d, 0) / diffs.length : null

  const nonTb = maps.filter((m) => m.type !== 'TB')
  const roundIsLn = nonTb.length > 0 && nonTb.every((m) => isLnBased(m))
  const storedRoundAvg = round.difficulty.average > 0
    ? round.difficulty.average - (roundIsLn ? rfLnOffset : 0)
    : null

  const scopeIsLn = scope.length > 0 && scope.every((m) => isLnBased(m))
  let storedTypeAvg: number | null = null
  if (activeFilter) {
    const td = round.typeDifficulties?.[activeFilter]
    const raw = td ? (scopeIsLn ? (td.ln ?? td.rf) : (td.rf ?? td.ln)) : undefined
    if (raw && raw > 0) storedTypeAvg = scopeIsLn ? raw - rfLnOffset : raw
  }

  return (activeFilter ? storedTypeAvg : storedRoundAvg) ?? computedAvg
}
