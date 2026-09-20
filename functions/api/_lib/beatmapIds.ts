// osu! beatmapId / beatmapsetId 的占位值判读 —— 后端这一侧的实现。
//
// 为什么这里有一份"重复"的：`functions/`（Cloudflare Pages 打包）与 `src/`
//（Next 打包）是两条独立的构建，仓库里没有任何跨边界 import 的先例（把后端
// 依赖指向前端目录，一旦打包器不认就是整个 API 挂掉，代价太大）。这里沿用
// 仓库已有的做法 —— `_lib/tournamentId.ts` 的 MAX_TOURNAMENT_ID_LENGTH 与
// `_lib/validation.ts` 的 LIMITS.maxIdLength 也是两份，靠一个测试锁住一致。
// 见 `scripts/beatmap-ids.test.mjs` 的"前后端两份实现必须一致"。
//
// 口径（与 `src/lib/beatmapIds.ts` 完全一致）：**0 / 1 / 负数 / 非整数 / 非数字
// 一律视为不可用**（占位或未提交）。osu! 自身用 -1 表示未提交；0 与 1 是各类
// 转换器/模板的常见默认值。
//
// 为什么后端也要挡（而不是只在前端归一化）：MKTC 2025 那 36 张的 `.osz` 就在 R2 里，
// 「一键补全」正是读它们回填 name/BID 的（`/api/maps/meta`）。如果后端把 `1` 当有效
// setId 返回，前端补全就会把它**重新写回比赛 JSON** —— 清理脚本刚删掉的东西又被补上。

/** 小于等于这个值的 ID 一律当成占位/未提交（0、1、-1 都不可用）。 */
export const PLACEHOLDER_ID_MAX = 1

/** 判断一个 ID 能不能当"真实 ID"用。 */
export function isUsableBeatmapId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > PLACEHOLDER_ID_MAX
}

/** 能用的 id → 原样返回；占位/缺失 → null（调用方按"没有 id"处理）。 */
export function usableBeatmapId(value: unknown): number | null {
  return isUsableBeatmapId(value) ? value : null
}

export function usableBeatmapsetId(value: unknown): number | null {
  return isUsableBeatmapId(value) ? value : null
}

/**
 * 这个 `name` 到底有没有曲名信息?**等于槽位名就说明没有**（占位名）。
 *
 * 与 `src/lib/beatmapIds.ts` 逐字对齐的一份（`functions/` 与 `src/` 是两条独立构建）。
 * 用途:`/api/maps/meta` 回给前端的 `name` 只是原样转发,真正需要这个判断的是
 * 前端（暂存与提交两边都得看清占位名）。放这里是为了让镜像测试能锁住两份一致。
 *
 * ⚠️ 判据是 `name === slot`,**不 trim**、也不认"记号但不与 slot 同名"的写法
 * （ASC 2025 资格赛是 `slot: "ST1"` / `name: "SV1"`)。别在这里放宽 —— 后端这份
 * 只是给镜像测试用的锚,放宽会让两边口径漂开。
 *
 * 有一道 **slot 守卫**:`slot` 不是非空字符串时一律返回 `false`(没有可比对的槽位名),
 * 所以 `undefined === undefined` 那个坑不存在。与 `src/lib/beatmapIds.ts` 逐字对齐。
 */
export function isPlaceholderName(name: unknown, slot: unknown): boolean {
  if (typeof slot !== 'string' || slot === '') return false
  return name === slot
}
