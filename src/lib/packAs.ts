// 「临时归类到别的键型包」的唯一判读处。
//
// 背景（2026-09-21 站长要求）：
//   真实键型里有一部分**张数很少**。合包是"一个真实键型一个包"，于是那些冷门键型
//   会各自变成只有几张图的小包 —— 玩家看到"XX 包 4 张"根本不会下载，那些谱面等于
//   没被分发出去。站长的办法是：**暂时**把冷门键型的谱面塞进某个大包里凑数，但
//   **不改它的真实键型**（真实键型是数据分类，是长期资产，不能为了分发而歪曲）。
//
// 所以这是一个**只在合包时生效**的覆盖字段，落在比赛 JSON 的 `map.packAs`：
//   · 留空（字段缺席）→ 按 `realType` 正常进包
//   · 填了某个 realType → **合包时**把它放进那一个键型的包，`realType` 一个字不改
//
// 约定与 `difficultyCount.ts` 的 `excludeFromDifficulty` 完全同构：
//   默认不生效（字段缺席即正常归类）；取消时写回 undefined，JSON 里不落脏值。
//
// ⚠️ 三条铁律（改动这里的任何一条都要先想清楚）：
//   ① `packAs` **绝不**替代 `realType` 做任何非合包的判读 —— 键型浏览、冲突检测、
//      难度统计、身份报告一律继续看 `realType`。唯一例外是下面 packRealTypeFor。
//   ② 它是**临时**的：站长哪天认为该键型够多了，把字段清掉即可回到正常归类，
//      真实键型从头到尾没变过，不需要回改数据。
//   ③ 值必须是**真实存在的合包目标**（见 packAsTargetGroups）。写成空串/空白 = 没填，
//      不能当成"归到一个叫空字符串的包"；写成一个**不产出下载包的**键型（PDRC 等）
//      等于把这张图丢进黑洞 —— 哪个包都不进，而且没有任何报错。
//      这条靠 `scripts/pack-as.test.mjs` 对全库数据钉着（不是靠运行时兜底：
//      值只从下拉里来，真正的风险是手改 JSON / 将来某次改名留下的陈值，都是提交时就能挡的）。

import { normalizeRealType } from './realType.ts'
import { REAL_TYPES, type MapCategory, type RealTypeOption } from './realTypeCatalog.ts'

export interface PackAsAssignable {
  realType?: string
  packAs?: string
}

/**
 * 键型的**展示名** —— 包内标签 `[Inverse]` 里用的那一个。
 *
 * 取界面目录（`realTypeCatalog.ts`）的 `name`，去掉末尾那个与 id 相同的缩写码：
 * `'Inverse (IN)'` → `'Inverse'`。理由：这个前缀的作用是**告诉玩家"这张图其实是什么
 * 键型"**，而紧随其后的来源标签 `(PFC S3 ...)` 已经很长了；再带一个 `(IN)` 既冗余，
 * 又和站长给的例子（`[inverse]`）不一致。缩写码本身在界面上另有用途，不需要在这里重复。
 *
 * 目录里没有的键型（自定义 `customTypes`，如 `HB&SV`）原样返回 id —— 有名字总比空着强。
 */
export function realTypeDisplayName(realType: string): string {
  const id = String(realType ?? '')
  for (const list of Object.values(REAL_TYPES)) {
    for (const option of list) {
      if (option.id === id) {
        const suffix = ` (${id})`
        return option.name.endsWith(suffix) ? option.name.slice(0, -suffix.length) : option.name
      }
    }
  }
  return id
}

/**
 * `packAs` 下拉里该列出哪些键型 = **真的会产出下载包**的那些。
 *
 * 排除 Pending 分类队列（PDRC / PDLN / PDHB / PDEX）—— 它们只当分类队列、不进合包
 * （见 `scripts/generate-pack.js` 的 `PACK_EXCLUDED_REAL_TYPES`），把谱面临时归过去
 * 等于**哪个包都不进**，是个静默黑洞。PDSV 是刻意的例外：未分类的 SV 图仍需要可用的
 * 兜底包，所以它进合包，也就能当目标。
 *
 * ⚠️ 这份名单必须与 `scripts/generate-pack.js` 的 `PACK_EXCLUDED_REAL_TYPES` 保持一致。
 * 两边判的是同一件事，靠 `scripts/pack-as.test.mjs` 锁住。
 */
export const NON_PACK_REAL_TYPES = ['PDRC', 'PDLN', 'PDHB', 'PDEX'] as const

/** 可以当 `packAs` 目标的键型（按目录顺序，供下拉分组）。 */
export function packAsTargetGroups(): { category: MapCategory; options: RealTypeOption[] }[] {
  const excluded = new Set<string>(NON_PACK_REAL_TYPES)
  return (Object.keys(REAL_TYPES) as MapCategory[])
    .map((category) => ({
      category,
      options: REAL_TYPES[category].filter((option) => !excluded.has(option.id)),
    }))
    .filter((group) => group.options.length > 0)
}

/**
 * 这个值能不能当 `packAs` 用。空串、纯空白、非字符串一律当"没填"。
 * （与 `excludeFromDifficulty` 的 `!== true` 同构：只在**明确填了**的时候生效。）
 */
export function isValidPackAs(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 这张图**合包时**该进哪个键型的包。没填 packAs 就是它自己的 realType。 */
export function packRealTypeFor(map: PackAsAssignable): string {
  return isValidPackAs(map.packAs) ? map.packAs : String(map.realType ?? '')
}

/**
 * 这张图是不是被临时归类了（= 合包的包 ≠ 它真实的键型）。
 *
 * ⚠️ 比较走 `normalizeRealType`，不能直接比字符串：realType 里可能还留着历史别名
 * （`WC`），而 packAs 下拉给的是规范值（`LNWC`）—— 两者其实是同一个键型、进的是同一个包，
 * 按原始字符串比却会得出"借来的"，于是给一张**根本没过户**的图加上 `[LN Wildcard]` 前缀。
 * 前缀会改已发布的 Version 串，而谱面文件名是内容寻址的：改了就是断成绩。
 */
export function isPackAsOverridden(map: PackAsAssignable): boolean {
  if (!isValidPackAs(map.packAs)) return false
  return normalizeRealType(map.packAs) !== normalizeRealType(map.realType)
}

/**
 * 分组用：把一批谱面按**合包键型**归类。
 * 返回 Map<realType, T[]>，顺序按输入顺序（调用方自己排）。
 */
export function groupByPackRealType<T extends PackAsAssignable>(maps: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const map of maps) {
    const key = packRealTypeFor(map)
    const list = out.get(key)
    if (list) list.push(map)
    else out.set(key, [map])
  }
  return out
}
