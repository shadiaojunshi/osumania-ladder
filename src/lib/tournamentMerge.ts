import type { BeatmapMeta, Round, Tournament, TypeDifficulty } from './types'

// 保存冲突的三方合并:base = 打开编辑时的快照(editingBaseline), mine = 表单当前内容,
// theirs = 服务器最新。方案见 docs/superpowers/specs/2026-09-13-save-conflict-merge-design.md
//
// 两条不变量:
//   ① 只有"你确实没碰过"的字段才采用服务器的值;你碰过的一律保留你的。
//   ② 同一字段两边都改、且改得不一样时绝不自动选边 —— 记进 conflicts 交给人裁决。
//      带 conflicts 的 merged 不允许写进服务器。
//
// 为什么非要第三个参数 base:光比较 mine 和 theirs 分不清"你没改"和"你改成了恰好一样的值",
// 也就无法判断服务器那边的改动能不能直接采纳 —— 那正是这个功能要回答的问题。

export interface FieldConflict {
  /** 人可读定位,如 "Round of 32 · FU1 · name" */
  path: string
  roundId: string
  slot?: string
  field: string
  base: unknown
  mine: unknown
  theirs: unknown
}

export interface FollowNote {
  path: string
  /** 服务器上的新值;整轮/整槽位的新增用文字说明 */
  value: unknown
}

export interface MergeOutcome {
  merged: Tournament
  /** 你碰过没、自动采用了服务器值的字段 */
  followed: FollowNote[]
  conflicts: FieldConflict[]
}

interface Loc {
  roundId?: string
  /** 给人看的轮次标签(缩写在先) */
  roundLabel?: string
  slot?: string
  field: string
}

interface Ctx {
  followed: FollowNote[]
  conflicts: FieldConflict[]
}

// id 之外的可合并字段。id / rounds 由主函数单独处理。
const TOP_LEVEL_FIELDS = [
  'id',
  'name',
  'abbreviation',
  'forumUrl',
  'wikiUrl',
  'sheetUrl',
  'keyCount',
  'year',
  'priority',
] as const

// slot 是配对键,不参与合并;id 同理。
const ROUND_FIELDS = ['name', 'abbreviation', 'order', 'isQualifier', 'bestOf'] as const
const MAP_FIELDS = [
  'type',
  'realType',
  'name',
  'difficulty',
  'difficultyLn',
  'beatmapId',
  'beatmapsetId',
  'oszUrl',
] as const

/** 整体当一个值比较的顶层字段:不做集合级合并,免得"两边各加一个 tag"被猜成合并结果 */
const OPAQUE_FIELDS = ['tags', 'customTypes'] as const

export function mergeTournament(
  base: Tournament | null,
  mine: Tournament,
  theirs: Tournament,
): MergeOutcome {
  const ctx: Ctx = { followed: [], conflicts: [] }
  const merged = structuredClone(mine) as Tournament

  // 没有基准快照(新建、legacy 草稿)就无从判断哪边改了什么 —— 原样返回,由调用方走别的路。
  if (!base) return { merged, followed: ctx.followed, conflicts: ctx.conflicts }

  const mergedRaw = merged as unknown as Record<string, unknown>
  const baseRaw = base as unknown as Record<string, unknown>
  const mineRaw = mine as unknown as Record<string, unknown>
  const theirsRaw = theirs as unknown as Record<string, unknown>

  mergeFieldSet(mergedRaw, baseRaw, mineRaw, theirsRaw, TOP_LEVEL_FIELDS, {}, ctx)
  for (const field of OPAQUE_FIELDS) {
    assign(mergedRaw, field, mergeLeaf(baseRaw[field], mineRaw[field], theirsRaw[field], { field }, ctx))
  }
  merged.rounds = mergeRounds(base.rounds ?? [], mine.rounds ?? [], theirs.rounds ?? [], ctx)

  return { merged, followed: ctx.followed, conflicts: ctx.conflicts }
}

export type ConflictRecovery =
  | { action: 'retry'; tournament: Tournament; sha: string; followed: FollowNote[] }
  | { action: 'manual'; conflicts: FieldConflict[]; merged: Tournament }

// 收到 409(编辑基准过期)之后该怎么办。单独抽出来是因为它承载着整个功能的风险点 ——
// 「要不要替你拿合并结果去覆盖服务器」这个决定,比合计算法本身更值得盯:
// 它一旦放宽,静默覆盖就回来了。
export function planConflictRecovery(
  base: Tournament | null,
  mine: Tournament,
  theirs: Tournament,
  latestSha: string,
): ConflictRecovery {
  // 没有基准快照(legacy 草稿、新建)就没有三方依据 —— 退回人工,绝不拿猜的结果去覆盖。
  if (!base) return { action: 'manual', conflicts: [], merged: mine }

  const outcome = mergeTournament(base, mine, theirs)
  // 只要有一处真冲突就整份交给人处理:半自动地"合一部分、问一部分"更难讲清楚。
  if (outcome.conflicts.length > 0) {
    return { action: 'manual', conflicts: outcome.conflicts, merged: outcome.merged }
  }
  return { action: 'retry', tournament: outcome.merged, sha: latestSha, followed: outcome.followed }
}

// ---------- 单值规则 ----------

// 三方规则表的实现,全库合并都是它。
function mergeLeaf(base: unknown, mine: unknown, theirs: unknown, loc: Loc, ctx: Ctx): unknown {
  if (eq(mine, theirs)) return mine
  if (eq(mine, base)) {
    // 你没碰过这个字段 → 采用服务器值(服务器的改动发生在你打开之后,本来就是更新的)
    ctx.followed.push({ path: locPath(loc), value: theirs })
    return theirs
  }
  if (eq(theirs, base)) return mine
  ctx.conflicts.push({
    path: locPath(loc),
    roundId: loc.roundId ?? '',
    slot: loc.slot,
    field: loc.field,
    base,
    mine,
    theirs,
  })
  return mine
}

/** 键序无关的深比较 */
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => eq(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // undefined 与"字段缺失"等价 —— 这正是想要的语义:{name: undefined} 在 JSON 里就是 {}。
    const keys = new Set([...definedKeys(a), ...definedKeys(b)])
    for (const key of keys) if (!eq(a[key], b[key])) return false
    return true
  }
  return false
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assign(target: Record<string, unknown>, field: string, value: unknown): void {
  // undefined 与缺失等价:统一删键,别留下 JSON 里看不见但会参与后续比较的脏值。
  if (value === undefined) delete target[field]
  else target[field] = value
}

function mergeFieldSet(
  merged: Record<string, unknown>,
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
  fields: readonly string[],
  loc: Omit<Loc, 'field'>,
  ctx: Ctx,
): void {
  for (const field of fields) {
    assign(merged, field, mergeLeaf(base[field], mine[field], theirs[field], { ...loc, field }, ctx))
  }
}

function mergeFields(
  base: Record<string, unknown> | undefined,
  mine: Record<string, unknown> | undefined,
  theirs: Record<string, unknown> | undefined,
  loc: Loc,
  ctx: Ctx,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(mine ?? {}) }
  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(mine ?? {}),
    ...Object.keys(theirs ?? {}),
  ])
  for (const key of keys) {
    assign(merged, key, mergeLeaf(base?.[key], mine?.[key], theirs?.[key], { ...loc, field: `${loc.field}.${key}` }, ctx))
  }
  return merged
}

function locPath(loc: Loc): string {
  return [loc.roundLabel ?? loc.roundId, loc.slot, loc.field].filter(Boolean).join(' · ')
}

function roundLabel(round: Round): string {
  return round.abbreviation || round.name || round.id
}

// ---------- rounds ----------

// 按 id 配对(不是数组下标):服务器在中间插一轮不会让后面全部错位。
// 数据里 51 个文件 / 352 轮的 round.id 均无重复;同 id 出现多次时按出现顺序逐个配对。
function mergeRounds(base: Round[], mine: Round[], theirs: Round[], ctx: Ctx): Round[] {
  const baseGroups = groupBy(base, (round) => round.id)
  const theirsGroups = groupBy(theirs, (round) => round.id)
  const cursor = new Map<string, number>()
  const claimed = new Set<Round>()
  const result: Round[] = []

  for (const mineRound of mine) {
    const nth = cursor.get(mineRound.id) ?? 0
    cursor.set(mineRound.id, nth + 1)
    const baseRound = baseGroups.get(mineRound.id)?.[nth]
    const theirsRound = theirsGroups.get(mineRound.id)?.[nth]

    if (!theirsRound) {
      // 服务器上没有这一轮了。base 里也没有 = 是你新加的,留着;
      // base 里有 = 服务器删掉了它,不能悄悄复活 —— 记成冲突让人定夺。
      if (baseRound) {
        ctx.conflicts.push({
          path: roundLabel(mineRound),
          roundId: mineRound.id,
          field: '(整轮)',
          base: baseRound,
          mine: mineRound,
          theirs: undefined,
        })
      }
      result.push(structuredClone(mineRound))
      continue
    }
    claimed.add(theirsRound)
    result.push(mergeRound(baseRound, mineRound, theirsRound, ctx))
  }

  // 服务器独有的轮次(别处新增的)要带上,否则你这次保存会把它抹掉。
  for (const theirsRound of theirs) {
    if (claimed.has(theirsRound)) continue
    result.push(structuredClone(theirsRound))
    ctx.followed.push({ path: roundLabel(theirsRound), value: '(服务器新增的轮次)' })
  }
  return result
}

function mergeRound(base: Round | undefined, mine: Round, theirs: Round, ctx: Ctx): Round {
  const merged = structuredClone(mine)
  // 你新加的轮次没有基准可比 —— 原样保留。
  if (!base) return merged

  const mergedRaw = merged as unknown as Record<string, unknown>
  const loc = { roundId: mine.id, roundLabel: roundLabel(mine) }

  mergeFieldSet(
    mergedRaw,
    base as unknown as Record<string, unknown>,
    mine as unknown as Record<string, unknown>,
    theirs as unknown as Record<string, unknown>,
    ROUND_FIELDS,
    loc,
    ctx,
  )
  merged.difficulty = mergeFields(
    base.difficulty as unknown as Record<string, unknown>,
    mine.difficulty as unknown as Record<string, unknown>,
    theirs.difficulty as unknown as Record<string, unknown>,
    { ...loc, field: 'difficulty' },
    ctx,
  ) as unknown as Round['difficulty']
  // 走 assign:合并结果为空时要删键,不能留下 typeDifficulties: undefined
  // (JSON 看不见它,但深比较看得见,会污染后续的相等判断)。
  assign(mergedRaw, 'typeDifficulties', mergeTypeDifficulties(base.typeDifficulties, mine.typeDifficulties, theirs.typeDifficulties, loc, ctx))
  merged.maps = mergeMaps(base.maps ?? [], mine.maps ?? [], theirs.maps ?? [], loc, ctx)
  return merged
}

function mergeTypeDifficulties(
  base: Record<string, TypeDifficulty> | undefined,
  mine: Record<string, TypeDifficulty> | undefined,
  theirs: Record<string, TypeDifficulty> | undefined,
  loc: Omit<Loc, 'field'>,
  ctx: Ctx,
): Record<string, TypeDifficulty> | undefined {
  if (!base && !mine && !theirs) return mine
  const merged: Record<string, TypeDifficulty> = {}
  const types = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(mine ?? {}),
    ...Object.keys(theirs ?? {}),
  ])
  for (const type of types) {
    const dims = mergeFields(
      base?.[type] as unknown as Record<string, unknown> | undefined,
      mine?.[type] as unknown as Record<string, unknown> | undefined,
      theirs?.[type] as unknown as Record<string, unknown> | undefined,
      { ...loc, field: `typeDifficulties.${type}` },
      ctx,
    )
    // mine 里本来就有的键,即使合并后为空也要留着 —— `{}` 和"缺失"不是一回事,
    // 原数据里就有 `SV: {}` 这种占位,删掉它会让自比产生差异。
    if (Object.keys(dims).length > 0 || mine?.[type] !== undefined) {
      merged[type] = dims as unknown as TypeDifficulty
    }
  }
  return Object.keys(merged).length > 0 ? merged : mine
}

// ---------- maps ----------

// 按 slot 配对,理由同 rounds。
function mergeMaps(base: BeatmapMeta[], mine: BeatmapMeta[], theirs: BeatmapMeta[], loc: Omit<Loc, 'field'>, ctx: Ctx): BeatmapMeta[] {
  const baseGroups = groupBy(base, (map) => map.slot)
  const theirsGroups = groupBy(theirs, (map) => map.slot)
  const cursor = new Map<string, number>()
  const claimed = new Set<BeatmapMeta>()
  const result: BeatmapMeta[] = []

  for (const mineMap of mine) {
    const nth = cursor.get(mineMap.slot) ?? 0
    cursor.set(mineMap.slot, nth + 1)
    const baseMap = baseGroups.get(mineMap.slot)?.[nth]
    const theirsMap = theirsGroups.get(mineMap.slot)?.[nth]

    if (!theirsMap) {
      if (baseMap) {
        ctx.conflicts.push({
          path: locPath({ ...loc, slot: mineMap.slot, field: '(整槽)' }),
          roundId: loc.roundId ?? '',
          slot: mineMap.slot,
          field: '(整槽)',
          base: baseMap,
          mine: mineMap,
          theirs: undefined,
        })
      }
      result.push(structuredClone(mineMap))
      continue
    }
    claimed.add(theirsMap)
    result.push(mergeMap(baseMap, mineMap, theirsMap, loc, ctx))
  }

  for (const theirsMap of theirs) {
    if (claimed.has(theirsMap)) continue
    result.push(structuredClone(theirsMap))
    ctx.followed.push({ path: locPath({ ...loc, slot: theirsMap.slot, field: '' }), value: '(服务器新增的谱面)' })
  }
  return result
}

function mergeMap(base: BeatmapMeta | undefined, mine: BeatmapMeta, theirs: BeatmapMeta, loc: Omit<Loc, 'field'>, ctx: Ctx): BeatmapMeta {
  const merged = structuredClone(mine)
  if (!base) return merged
  mergeFieldSet(
    merged as unknown as Record<string, unknown>,
    base as unknown as Record<string, unknown>,
    mine as unknown as Record<string, unknown>,
    theirs as unknown as Record<string, unknown>,
    MAP_FIELDS,
    { ...loc, slot: mine.slot },
    ctx,
  )
  return merged
}

// ---------- 工具 ----------

function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of list) {
    const id = key(item)
    const bucket = groups.get(id)
    if (bucket) bucket.push(item)
    else groups.set(id, [item])
  }
  return groups
}
