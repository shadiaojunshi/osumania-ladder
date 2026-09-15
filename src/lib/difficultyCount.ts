// "不参与难度统计"的唯一判断处。
//
// 背景(2026-09-15 站长要求):一轮里某些图(如表演曲/凑数图)的难度不该计入
//   ① 本轮 / 该键型的难度平均值;
//   ② ladder 框高(时间线里那条柱子的高度)。
// 勾选入口在每轮编辑页的每个槽位行上,落在比赛 JSON 的 map.excludeFromDifficulty。
//
// 约定:**默认参与**。字段缺席或 false 都算参与,只有显式 true 才排除 ——
// 这样老数据不用迁移,取消勾选时把字段清成 undefined 即可(JSON 里不落脏值)。

export interface DifficultyCountable {
  excludeFromDifficulty?: boolean
}

export function countsForDifficulty(map: DifficultyCountable): boolean {
  return map.excludeFromDifficulty !== true
}

/** 取参与统计的谱面(顺序不变)。所有求平均值/极值的地方都该先过这一层。 */
export function countableMaps<T extends DifficultyCountable>(maps: readonly T[]): T[] {
  return maps.filter(countsForDifficulty)
}
