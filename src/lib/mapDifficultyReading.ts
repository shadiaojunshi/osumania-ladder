// 单个谱面在某个 (大类, 字段) 下的"读数" —— 全站唯一实现。
//
// 字段口径（2026-09-17，R17）：
//   rf → map.difficulty
//   ln → **LN 类读 map.difficulty**（LN 图没有 difficultyLn，面难度就存在 difficulty 里）；
//        HB / TB 读 map.difficultyLn。
//
// 为什么必须集中：全库实测 —— LN 类 1205 张图 `difficultyLn` **全部为空**，
// 而 HB 有 470/882、TB 有 164/321 带 difficultyLn。所以"ln 字段一律读 difficultyLn"
// 这个写法会让 LN 的 **fallback 分支**（无显式汇总值时按图平均）永远取不到锚点
// （referenceData.getRefValue 就是漏了这一条）。注意影响面：全库 351 个 LN 轮次里
// 181 个有显式 typeDifficulties.LN.ln 兜住、另 170 个图上也没录 difficulty ——
// 所以修复前**没有一处真的受影响**，这是预防性修复（导入/新建数据漏填汇总值时才会踩到）。
// difficultyFit 的 ln-ln 维度当时单独打了补丁，两份实现就此分叉，这次合并成一处。
//
// 只负责"取一个正整数读数"，不做平均、不做小数位处理 —— 精度规则留给各调用方
// （报告明确要求不顺手改全站小数位）。

import type { BeatmapMeta } from './types'

export type DifficultyField = 'rf' | 'ln'

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function readMapDifficulty(
  map: Pick<BeatmapMeta, 'difficulty' | 'difficultyLn'>,
  type: string,
  field: DifficultyField,
): number | null {
  if (field === 'rf') return positive(map.difficulty)
  if (type === 'LN') {
    // LN 图正常只有 difficulty；万一将来有人给 LN 也填了 difficultyLn，
    // 也只在 difficulty 缺失时才用它，避免又退回"取不到值"。
    return positive(map.difficulty) ?? positive(map.difficultyLn)
  }
  return positive(map.difficultyLn)
}
