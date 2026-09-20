// `round.difficulty`（min / max / average）的**收数规则唯一实现**。
//
// 从 `src/components/admin/RoundEditor.tsx` 的 `recalcDifficulty` 原样抽出，计算一字不改。
// 抽出的理由与 `roundReference.ts` / `realTypeCatalog.ts` 是同一件事：反馈建议采纳时也要
// 重算 summary（整轮参考会改一批谱面的难度，单张难度建议也会），而审核侧的纯逻辑在 `src/lib`，
// 不能 import 带 OAuth/KV 的后台组件 —— 规则留在组件里必然长出第二份，然后两边慢慢漂移。
//
// 收数规则（与界面上的口径一致）：
//   · 勾了 `excludeFromDifficulty` 的图**整张不进** min/max/average（见 difficultyCount.ts）；
//   · **TB 不参与**本轮统计（它的 rf/ln 双刻度来自参考线，不作为 round-level 数字）；
//   · **HB** 有 rf/ln 两个刻度：两侧都填取 `rf + (ln - rf) * 2/3` 当一个数据点，
//     只有一侧就用那一侧，两侧都是 0 则跳过；
//   · 其余（RC / LN / SV / SPECIAL）取 `difficulty > 0`。

import { countableMaps, type DifficultyCountable } from './difficultyCount.ts'
import type { RoundDifficulty } from './types.ts'

/** `recalcDifficulty` 需要的最小形状：`RoundEditor` 的 ExtendedMap 与纯 JSON 谱面都满足。 */
export interface RoundDifficultyMapLike extends DifficultyCountable {
  type?: unknown
  difficulty?: unknown
  difficultyLn?: unknown
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function recalcDifficulty(maps: readonly RoundDifficultyMapLike[]): RoundDifficulty {
  if (maps.length === 0) return { min: 0, max: 0, average: 0 }
  const points: number[] = []
  for (const m of countableMaps(maps)) {
    if (m.type === 'TB') continue
    if (m.type === 'HB') {
      const rf = num(m.difficulty) > 0 ? num(m.difficulty) : 0
      const ln = num(m.difficultyLn) > 0 ? num(m.difficultyLn) : 0
      // 双值偏 ln 2/3；单侧就用那侧；都空跳过。
      if (rf > 0 && ln > 0) points.push(rf + (ln - rf) * (2 / 3))
      else if (rf > 0) points.push(rf)
      else if (ln > 0) points.push(ln)
    } else {
      if (num(m.difficulty) > 0) points.push(num(m.difficulty))
    }
  }
  if (points.length === 0) return { min: 0, max: 0, average: 0 }
  const min = +Math.min(...points).toFixed(2)
  const max = +Math.max(...points).toFixed(2)
  const average = +(points.reduce((sum, d) => sum + d, 0) / points.length).toFixed(2)
  return { min, max, average }
}
