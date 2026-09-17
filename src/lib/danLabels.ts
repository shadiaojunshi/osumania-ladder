// 段位(reform dan / ln dan)标签的唯一实现。
//
// 为什么单独一个文件:这段逻辑以前内联在 `HoverCard.tsx` 里,而那是个含 JSX + `@data` 别名导入的
// 组件文件 —— node --test 加载不了,于是"段位必须来自实际难度"这条规则一直没法被测试锁住。
// 这里不 import 任何运行时依赖(只 import type),等级表由调用方注入(组件注入 @data 的 JSON,
// 测试注入 fs 读出来的同一份 JSON),因此两侧用的是同一套规则。
//
// 取值口径(2026-09-16 站长反馈后确定):
//   ① 悬浮到**具体某个框** → 只认那张图自己的 `difficulty` / `difficultyLn`;
//   ② 否则该**键型**一档 → 先按图上现算的平均,再退到管理员填的 `typeDifficulties`;
//   ③ **绝不**用 `round.difficulty.average`(整轮所有图的平均)去冒充某个键型的段位 ——
//      TB 尤其明显(一轮里 TB 型图可能不止一张),这就是"悬浮 TB 看到的是平均难度"的成因。

import type { Round } from './types'

export interface DanLevel {
  id: string
  name: string
  numericValue: number
  color: string
}

export interface DanLevels {
  rf: DanLevel[]
  ln: DanLevel[]
}

/** 与 src/lib/difficultyCount 的 countableMaps 同口径:勾了"不参与难度统计"的图不算数。 */
function countable<T extends { excludeFromDifficulty?: boolean }>(maps: readonly T[]): T[] {
  return maps.filter((m) => m.excludeFromDifficulty !== true)
}

// 单张图的段位标签:只用它自己的 difficulty / difficultyLn。
// 图上没有值就返回空串 —— 绝不退化成"同键型平均"或"整轮平均"。
/** TB 的最后兜底:图上没值、管理员也没填汇总时,拿整轮平均
 *  (站长 2026-09-17:"TB 有实际难度的时候用实际难度,否则用平均难度")。
 *  整轮平均为 0 时返回空 —— 平均值本身就不存在,不该硬凑一个最低段位出来。 */
function tbRoundAverageLabel(round: Round, levels: DanLevels): string {
  const avg = round.difficulty?.average ?? 0
  return avg > 0 ? `~${rfDanName(avg, levels.rf)}` : ''
}


export function labelForSingleMap(map: Round['maps'][number], type: string, levels: DanLevels): string {
  const rf = map.difficulty > 0 ? map.difficulty : null
  const ln = (map.difficultyLn ?? 0) > 0 ? map.difficultyLn! : null
  if (type === 'TB' || type === 'HB') {
    const parts: string[] = []
    if (rf !== null) parts.push(rfDanName(rf, levels.rf))
    if (ln !== null) parts.push(lnDanName(ln, levels.ln))
    return parts.length > 0 ? `~${parts.join(' / ')}` : ''
  }
  if (type === 'LN') {
    const val = ln ?? rf
    return val !== null ? `~${lnDanName(val, levels.ln)}` : ''
  }
  return rf !== null ? `~${rfDanName(rf, levels.rf)}` : ''
}

export function buildDifficultyLabel(
  round: Round,
  scope: { activeFilter?: string | null; type?: string; slot?: string },
  levels: DanLevels,
): string {
  const type = scope.type || scope.activeFilter
  const td = round.typeDifficulties

  // 悬浮到**具体某个框**时,段位只来自那张图的实际值(TB 尤其重要:以前只能整型聚合,
  // 于是"悬浮 TB 看到的是平均难度")。
  // 2026-09-17 站长补充规则:一轮里只有**一张** TB 时才用它的实际难度;**两张及以上回到平均**
  // (拆框只是显示分开,段位仍按该键型的平均给)。
  // 找不到对应槽位(或槽位名其实是键型名)时退回下面的聚合口径,不要显示成空。
  if (type && scope.slot) {
    const sameType = countable(round.maps).filter((m) => m.type === type)
    if (sameType.length === 1) {
      const single = labelForSingleMap(sameType[0], type, levels)
      if (single) return single
      // 这张图上没有实际难度 → 落到下面的"平均"兜底(站长要求),不在这里返回空。
    } else if (type !== 'TB') {
      const exact = sameType.find((m) => (m.slot || m.type) === scope.slot)
      if (exact) {
        const single = labelForSingleMap(exact, type, levels)
        if (single) return single
      }
    }
  }

  // 先按**图上现算**的值出段位:这是框高用的同一份数据(见 LadderView 的 adjustedAvg),
  // 也让悬浮卡与框不会各说各话。typeDifficulties 只是汇总缓存,会随数据改动过期 ——
  // 曾经的表现:CET GF TB 实际 rf16.2/ln17.2,缓存里还是 15.3/16.4,
  // 于是框高按实际值画、悬浮卡按旧缓存显示 ε/ε+，看起来就是"显示的段位偏低一档"。
  if (type) {
    const live = liveLabelForType(round, type, levels)
    if (live) return live
  }

  if (type && td?.[type]) {
    const entry = td[type]
    if (type === 'LN') {
      const val = entry.ln ?? entry.rf
      return val ? `~${lnDanName(val, levels.ln)}` : ''
    }
    // HB / TB 都是 rf + ln 双段:两侧各出一个分档标签(如 ~ε+/ζ- / LN16-/16)。
    if (type === 'HB' || type === 'TB') {
      const rfVal = entry.rf
      const lnVal = entry.ln
      const parts: string[] = []
      if (rfVal) parts.push(rfDanName(rfVal, levels.rf))
      if (lnVal) parts.push(lnDanName(lnVal, levels.ln))
      if (parts.length > 0) return `~${parts.join(' / ')}`
      return type === 'TB' ? tbRoundAverageLabel(round, levels) : ''
    }
    const val = entry.rf
    return val ? `~${rfDanName(val, levels.rf)}` : ''
  }

  if (type === 'LN') {
    const diffs = countable(round.maps).filter((m) => m.type === 'LN').map((m) => m.difficulty).filter((d) => d > 0)
    if (diffs.length === 0) return ''
    return `~${lnDanName(diffs.reduce((s, d) => s + d, 0) / diffs.length, levels.ln)}`
  }
  if (type === 'RC' || type === 'SV') {
    const diffs = countable(round.maps).filter((m) => m.type === type).map((m) => m.difficulty).filter((d) => d > 0)
    if (diffs.length === 0) return ''
    return `~${rfDanName(diffs.reduce((s, d) => s + d, 0) / diffs.length, levels.rf)}`
  }
  if (type === 'HB') {
    const typeMaps = countable(round.maps).filter((m) => m.type === 'HB')
    const rfs = typeMaps.map((m) => m.difficulty).filter((d) => d > 0)
    const lns = typeMaps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0)
    const parts: string[] = []
    if (rfs.length > 0) parts.push(rfDanName(rfs.reduce((s, d) => s + d, 0) / rfs.length, levels.rf))
    if (lns.length > 0) parts.push(lnDanName(lns.reduce((s, d) => s + d, 0) / lns.length, levels.ln))
    return parts.length > 0 ? `~${parts.join(' / ')}` : ''
  }
  if (type === 'TB') {
    // 一轮两张及以上 TB(或悬浮的不是具体框)走这里:按该键型的**平均**给段位(站长 2026-09-17)。
    // 只统计有值的图(0 不参与平均);全都没值时退到整轮平均,再没有就不显示。
    const typeMaps = countable(round.maps).filter((m) => m.type === 'TB')
    const rfs = typeMaps.map((m) => m.difficulty).filter((d) => d > 0)
    const lns = typeMaps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0)
    const parts: string[] = []
    if (rfs.length > 0) parts.push(rfDanName(rfs.reduce((s, d) => s + d, 0) / rfs.length, levels.rf))
    if (lns.length > 0) parts.push(lnDanName(lns.reduce((s, d) => s + d, 0) / lns.length, levels.ln))
    if (parts.length > 0) return `~${parts.join(' / ')}`
    return tbRoundAverageLabel(round, levels)
  }

  // 无 hoveredType / activeFilter 时的默认 fallback:
  //   按 type 分成 rf 桶(RC/SV + HB.difficulty) 和 ln 桶(LN.difficulty + HB.difficultyLn)。
  //   TB 完全排除。桶为空就不显示对应段位;两边都空就什么都不显示。
  //   避免 o!mln4 那种只有 LN+TB 的比赛显示 rf 段位。
  const rfBucket: number[] = []
  const lnBucket: number[] = []
  for (const m of countable(round.maps)) {
    if (m.type === 'TB') continue
    if (m.type === 'LN') {
      if (m.difficulty > 0) lnBucket.push(m.difficulty)
    } else if (m.type === 'HB') {
      if (m.difficulty > 0) rfBucket.push(m.difficulty)
      if (m.difficultyLn && m.difficultyLn > 0) lnBucket.push(m.difficultyLn)
    } else {
      // RC / SV / SPECIAL — 存 rf 值
      if (m.difficulty > 0) rfBucket.push(m.difficulty)
    }
  }
  const parts: string[] = []
  if (rfBucket.length > 0) {
    const avg = rfBucket.reduce((s, d) => s + d, 0) / rfBucket.length
    parts.push(rfDanName(avg, levels.rf))
  }
  if (lnBucket.length > 0) {
    const avg = lnBucket.reduce((s, d) => s + d, 0) / lnBucket.length
    parts.push(lnDanName(avg, levels.ln))
  }
  return parts.length > 0 ? `~${parts.join(' / ')}` : ''
}

// 主档 = numericValue 落在整数上(α=11、β=12、rf10=10...)。副档 = ±0.3 偏移档(α+/α-)。
function isMajorLevel(v: number): boolean {
  return Math.abs(v - Math.round(v)) < 0.05
}

// 分档:给一个数值返回它落在哪个"纯档"或"双档"。levels 按 numericValue 降序。
//   每档纯档半宽:主档朝任意邻档 ±0.10;副档朝 0.4 间隔邻档 ±0.10、朝 0.3 间隔主档 ±0.05。
//   落在某档纯档内 → primary=该档,secondary=null;
//   落在两纯档之间 → primary=低档、secondary=高档(显示"低/高")。
// 该规则精确复现手排的分档表(10.9-11.1=α、10.75-10.89=α-/α、11.25-11.4=α+ ...)。
export function danBand(
  diff: number,
  levels: DanLevel[]
): { primary: DanLevel; secondary: DanLevel | null } {
  if (diff >= levels[0].numericValue) return { primary: levels[0], secondary: null }
  const last = levels[levels.length - 1]
  if (diff <= last.numericValue) return { primary: last, secondary: null }
  let hi = levels[0]
  let lo = last
  for (let i = 0; i < levels.length - 1; i++) {
    if (levels[i].numericValue >= diff && levels[i + 1].numericValue <= diff) {
      hi = levels[i]
      lo = levels[i + 1]
      break
    }
  }
  const gap = hi.numericValue - lo.numericValue
  const half = (lvl: DanLevel) =>
    gap >= 0.35 ? 0.1 : isMajorLevel(lvl.numericValue) ? 0.1 : 0.05
  let hLo = half(lo)
  let hHi = half(hi)
  // 极小 gap(intro 区)兜底:纯档不重叠,退化到三等分。
  if (hLo + hHi >= gap) {
    hLo = gap / 3
    hHi = gap / 3
  }
  if (diff <= lo.numericValue + hLo) return { primary: lo, secondary: null }
  if (diff >= hi.numericValue - hHi) return { primary: hi, secondary: null }
  return { primary: lo, secondary: hi }
}

// 从比赛的谱面字段现算这个键型的段位标签;没有可用数值时返回 null(交给 typeDifficulties 兜底)。
// 取值口径与 LadderView 的框高一致:RC/SV 用 difficulty;LN 用 difficulty(存的就是 ln 值);
// HB/TB 两侧各有:rf 用 difficulty、ln 用 difficultyLn。
export function liveLabelForType(round: Round, type: string, levels: DanLevels): string | null {
  const maps = countable(round.maps).filter((m) => m.type === type)
  if (maps.length === 0) return null
  const avgOf = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const rfAvg = avgOf(maps.map((m) => m.difficulty).filter((d) => d > 0))
  const lnAvg = avgOf(maps.map((m) => m.difficultyLn ?? 0).filter((d) => d > 0))

  if (type === 'TB' || type === 'HB') {
    const parts: string[] = []
    if (rfAvg !== null) parts.push(rfDanName(rfAvg, levels.rf))
    if (lnAvg !== null) parts.push(lnDanName(lnAvg, levels.ln))
    return parts.length > 0 ? `~${parts.join(' / ')}` : null
  }
  if (type === 'LN') {
    const val = lnAvg ?? rfAvg
    return val !== null ? `~${lnDanName(val, levels.ln)}` : null
  }
  return rfAvg !== null ? `~${rfDanName(rfAvg, levels.rf)}` : null
}

export function rfDanName(diff: number, rfLevels: DanLevel[]): string {
  const { primary, secondary } = danBand(diff, rfLevels)
  return secondary ? `${primary.name}/${secondary.name}` : primary.name
}

export function lnDanName(diff: number, lnLevels: DanLevel[]): string {
  const { primary, secondary } = danBand(diff, lnLevels)
  const label = secondary ? `${primary.name}/${secondary.name}` : primary.name
  return `LN${label}`
}
