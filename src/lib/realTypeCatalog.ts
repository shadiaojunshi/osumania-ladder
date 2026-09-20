// 键型目录:大类 → 真实键型(realType)列表,以及各大类的"默认键型"。
//
// 为什么单独一个文件:这张表以前内联在 `MapSlotEditor.tsx` 里,而那是个含 JSX 的组件文件,
// node --test 加载不了 → 目录本身(尤其"默认键型"这条规则)没法被测试锁住。
// 这里不 import 任何东西(没有 React、没有 @data 别名),因此可被测试直接导入。
//
// 约定(2026-09-15 站长要求):
//   ① 每个大类都有自己的 Pending 键型 PD*(RC→PDRC / LN→PDLN / HB→PDHB / SV→PDSV / 特殊→PDEX);
//   ② 新建谱面、改大类、批量导入时的**默认 realType 一律是 Pending**,而不是该大类里
//      排在最前面的那个真实键型(SS / HB1 / RE / SV1)——以前默认成第一个键型,导致
//      没改下拉的谱面全被当成 SS/HB1/RE,数据里混进一堆看不出错的误标。
//   ③ 只有填写者手动选择时才写入具体键型(含"蓝色模板按钮"一键套用标准池)。

export type MapCategory = 'RC' | 'LN' | 'HB' | 'SV' | 'TB' | 'SPECIAL'

/**
 * 标准大类（不含 SPECIAL）。顺序 = 界面上的大类分组顺序。
 * 与 `functions` 侧无关；JSON 里的 `type` 字段只有落在这五个里才算标准大类。
 */
export const STANDARD_MAP_CATEGORIES = ['RC', 'LN', 'HB', 'SV', 'TB'] as const
export type StandardMapCategory = (typeof STANDARD_MAP_CATEGORIES)[number]

/**
 * 从 JSON 的 `type`（或编辑器的 `category`）取大类。
 * 不在标准五类里的一律归 `SPECIAL`（跨大类自定义池，如 `HB&SV`）。
 * 唯一实现：浏览表格、整轮参考、导入诊断都走这里，避免各自写一份 `includes` 判断。
 */
export function categoryOfRaw(raw: unknown): MapCategory {
  const value = String(raw ?? '')
  return (STANDARD_MAP_CATEGORIES as readonly string[]).includes(value)
    ? (value as StandardMapCategory)
    : 'SPECIAL'
}

export interface RealTypeOption {
  id: string
  name: string
}

export const REAL_TYPES: Record<MapCategory, RealTypeOption[]> = {
  RC: [
    { id: 'SS', name: 'Stream (SS)' },
    { id: 'JS', name: 'Jumpstream (JS)' },
    { id: 'SA', name: 'Stamina (SA)' },
    { id: 'CJ', name: 'Chordjack (CJ)' },
    { id: 'SJ', name: 'Jackspeed (SJ)' },
    { id: 'FCJ', name: 'Finger Control Jack (FCJ)' },
    { id: 'MX', name: 'Rcmix (MX)' },
    { id: 'DP', name: 'Dump (DP)' },
    { id: 'ADP', name: 'Accurate dump (ADP)' },
    { id: 'STC', name: 'Streamtech (STC)' },
    { id: 'MTC', name: 'Minijacktech (MTC)' },
    { id: 'SATC', name: 'Stamina tech (SATC)' },
    { id: 'JTC', name: 'Jackmained tech (JTC)' },
    { id: 'WTC', name: 'Wild tech (WTC)' },
    { id: 'TC', name: 'Tech (TC)' },
    { id: 'ORC', name: 'Otherrice (ORC)' },
    { id: 'PDRC', name: 'Pending RC (PDRC)' },
  ],
  HB: [
    { id: 'HB1', name: 'Speed/Generic (HB1)' },
    { id: 'HB2', name: 'Mid-tempo/Jack/Shield (HB2)' },
    { id: 'HB3', name: 'Technical (HB3)' },
    { id: 'HB4', name: 'Wildcard (HB4)' },
    { id: 'HB5', name: 'Old-school (HB5)' },
    { id: 'RCmainHB', name: 'RC-main Hybrid (RCmainHB)' },
    { id: 'LNmainHB', name: 'LN-main Hybrid (LNmainHB)' },
    { id: 'MXHB', name: 'Mixed HB (MXHB)' },
    { id: 'MNTB', name: 'Mini Tiebreaker (MNTB)' },
    { id: 'OHB', name: 'OtherHybrid (OHB)' },
    { id: 'PDHB', name: 'Pending HB (PDHB)' },
  ],
  LN: [
    { id: 'RE', name: 'Release (RE)' },
    { id: 'CO', name: 'Coordination (CO)' },
    { id: 'TE', name: 'Timinghell (TE)' },
    { id: 'DE', name: 'Density (DE)' },
    { id: 'JW', name: 'Jacky Wildcard LN (JW)' },
    { id: 'SW', name: 'Speedy Wildcard LN (SW)' },
    { id: 'LNMX', name: 'LN Mixed (LNMX)' },
    { id: 'LNWC', name: 'LN Wildcard (LNWC)' },
    { id: 'LNTC', name: 'Technical LN (LNTC)' },
    { id: 'IN', name: 'Inverse (IN)' },
    { id: 'LNWL', name: 'LNwall (LNWL)' },
    { id: 'OLN', name: 'Other LN (OLN)' },
    { id: 'PDLN', name: 'Pending LN (PDLN)' },
  ],
  SV: [
    { id: 'SV1', name: 'Pattern (SV1)' },
    { id: 'SV2', name: 'Rhythm (SV2)' },
    { id: 'SI', name: 'Sightread (SI)' },
    { id: 'ME', name: 'Memorization (ME)' },
    { id: 'SVMX', name: 'SVMix (SVMX)' },
    { id: 'GM', name: 'Gimmick (GM)' },
    { id: 'PDSV', name: 'Pending SV (PDSV)' },
  ],
  TB: [
    { id: 'TB', name: 'Tiebreaker' },
  ],
  // 特殊槽位(跨大类混合,如 HB&SV)可以挂任意大类的键型,PDEX 是它自己的"待分类"。
  SPECIAL: [
    { id: 'PDEX', name: 'Pending Special (PDEX)' },
  ],
}

/**
 * 各大类的默认(待分类)键型。
 * PDSV 是刻意**仍然进下载栏**的那个(未定类的 SV 图也需要一个可用的兜底包);
 * PDRC/PDLN/PDHB/PDEX 只当分类队列,不进合包(见 scripts/generate-pack.js)。
 */
export const PENDING_REAL_TYPE_BY_CATEGORY: Partial<Record<MapCategory, string>> = {
  RC: 'PDRC',
  LN: 'PDLN',
  HB: 'PDHB',
  SV: 'PDSV',
  SPECIAL: 'PDEX',
}

export const CATEGORY_COLORS: Record<string, string> = {
  RC: '#3b82f6',
  HB: '#8b5cf6',
  LN: '#6366f1',
  SV: '#f59e0b',
  TB: '#ef4444',
  SPECIAL: '#10b981',
}

/**
 * 新建谱面 / 切换大类时的默认 realType:
 * 优先该大类的 Pending 键型,没有 Pending 的大类(TB)才退回列表里第一个。
 * `fallback` 用于两边都没有的极端情况(保留原值,不写空串)。
 */
export function defaultRealTypeFor(category: MapCategory, fallback = ''): string {
  const pending = PENDING_REAL_TYPE_BY_CATEGORY[category]
  if (pending) return pending
  const first = REAL_TYPES[category]?.[0]?.id
  return first ?? fallback
}

// ---------------------------------------------------------------------------
// 难度刻度
// ---------------------------------------------------------------------------
//
// 从 `MapSlotEditor.tsx` 原样移到 lib（组件继续 re-export，行为不变）。
// 移出来的理由与键型目录相同:反馈建议的补丁逻辑(`src/lib/suggestions/patch.ts`)也要用它,
// 而公开反馈页不能 import 带 OAuth/KV 的后台组件 —— 规则留在组件里就会长出第二份实现,
// 「单刻度 / 双刻度」一旦两边漂移,审核页显示的和真正写进去的就不是一回事。

export const DIFFICULTY_FIELD_RF = 'difficulty' as const
export const DIFFICULTY_FIELD_LN = 'difficultyLn' as const
export type DifficultyField = typeof DIFFICULTY_FIELD_RF | typeof DIFFICULTY_FIELD_LN

/**
 * 该大类是否用**双刻度**:
 *   HB / TB / SPECIAL → `difficulty` 是 rf、`difficultyLn` 是 ln(两个输入框);
 *   RC / LN / SV       → 只有一个 `difficulty`。
 */
export function needsDualDifficulty(category: MapCategory): boolean {
  return category === 'HB' || category === 'TB' || category === 'SPECIAL'
}

/**
 * 该大类**实际会写**的难度字段(顺序 = 界面上输入框的顺序)。
 * 用途:让"建议值里给了这个字段但该大类不认"能被显式拒绝,而不是静默丢掉。
 */
export function difficultyFieldsFor(category: MapCategory): readonly DifficultyField[] {
  return needsDualDifficulty(category)
    ? [DIFFICULTY_FIELD_RF, DIFFICULTY_FIELD_LN]
    : [DIFFICULTY_FIELD_RF]
}

/**
 * 下拉框可选项。
 * 普通大类只看自己的列表;**特殊槽位**跨大类——列出所有大类的键型(带 `group` 便于分组),
 * 这样特殊图既能挂 HB1 这类具体键型,也能用 PDEX 表示"还没定"。
 */
export function realTypeOptionsFor(category: MapCategory): (RealTypeOption & { group?: MapCategory })[] {
  if (category === 'SPECIAL') {
    return (Object.keys(REAL_TYPES) as MapCategory[]).flatMap((cat) =>
      REAL_TYPES[cat].map((type) => ({ ...type, group: cat })),
    )
  }
  return REAL_TYPES[category] || []
}
