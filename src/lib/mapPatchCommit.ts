// MapUploader 元数据补丁池的纯逻辑(不依赖 React,便于测试)。
//
// 分两层:
//   1. 单场比赛的池子(StagedPatchMap,key = `${roundId}/${slot}`)——本来就是按
//      "一份权威 JSON" 组织,applyStagedPatches 只认识一场比赛的 rounds。
//   2. 跨比赛分组(StagedGroups,key = tournamentId)——见文件末尾。
//      过去池子只属于"当前正在看的那场比赛",切比赛整池丢掉,于是必须一场一存;
//      现在按比赛分组攒着,最后统一走 POST /api/tournaments/batch,
//      N 场比赛仍然只有 1 次 commit / 1 次重建。
//
// 三条不变量:
//  1. 补丁来源分 fill / explicit:
//       fill      = 只是补 JSON 里"原本缺失"的字段(自动补全、上传回填)
//       explicit  = 用户明确指定(贴 BID 补传等),照写
//     提交时 fill 补丁遇到"远端已经有值"的字段要跳过 —— 否则会把别人刚填进去的值
//     无条件盖掉(与 R01 的编辑基准同一个原则)。
//  2. 提交用快照:只有"这次提交过、期间没被替换(对象同一)、且真的写进去了"的条目
//     才从池里移除;提交期间新加/改写的补丁必须保留。
//  3. 池里的 key 在权威 JSON 里找不到对应 slot 时,保留条目并报出来,
//     不擅自清池(applied=0 也一样),由用户手动清空。

// 扩展名必须写全:这个模块由 `scripts/map-patch-commit.test.mjs` 直接加载,
// 而 Node 的 ESM 解析器不会为省略扩展名的相对路径补 `.ts`(那个测试也没注册
// `_ts-extension-loader.mjs`,它只为 `functions/` 源码而设)。同目录的既有先例
// 也一样 —— 运行期 import 带 `.ts`,`import type` 才可以省。
import { isPlaceholderName, isUsableBeatmapId } from './beatmapIds.ts'

export interface MapPatch {
  name?: string | null
  beatmapId?: number | null
  beatmapsetId?: number | null
}

// key = `${roundId}/${slot}`
export type PatchMap = Map<string, MapPatch>

export type PatchOrigin = 'fill' | 'explicit'

export interface StagedPatch {
  patch: MapPatch
  origin: PatchOrigin
}

export type StagedPatchMap = Map<string, StagedPatch>

export interface PatchRound {
  id: string
  maps: Record<string, unknown>[]
}

const FIELDS = ['name', 'beatmapId', 'beatmapsetId'] as const
export type PatchField = (typeof FIELDS)[number]

function writeField(map: Record<string, unknown>, field: PatchField, value: unknown): void {
  if (value === null || value === undefined) delete map[field]
  else map[field] = value
}

function isPresent(map: Record<string, unknown>, field: PatchField): boolean {
  const value = map[field]
  return value !== undefined && value !== null && value !== ''
}

/**
 * 这个字段在**提交时**算不算"远端已经有值"（fill 补丁据此决定跳不跳）。
 *
 * 比 `isPresent` 多两条:`name` 等于槽位名时不算有值(占位名);`beatmapId` /
 * `beatmapsetId` 是占位 ID(0 / 1 / 负数)时**也不算有值**。
 *
 * 为什么 name 那条:全库有 214 处槽位的 `name` 与 `slot` 完全同名(`"name": "RC1"` 且
 * `"slot": "RC1"`,见 `isPlaceholderName`;2026-09-20 按 `data/tournaments/**`
 * 实测统计,4987 个槽位里带槽位记号的共 226 处 —— 另有 12 处是"记号但不与 slot
 * 同名"(ASC 2025 资格赛 8 处 `ST1`/`SV1` 那类、NMWC 2025 两处 `RC4`/`RC5`·`RC6`、
 * CN Cup 2025 两处 `ST4`/`RC4`·`DF`/`RC8`),那种这个判据够不到,
 * 见 `tournamentDiagnostics.ts` 里更宽的正则口径)。补全/手传回填发的都是 fill 补丁,
 * 而 `isPresent` 只看"非空"→ 占位名挡住了真曲名,**永远补不进去**,
 * 那些槽位会停在"半吊子"状态(BID 是真值、曲名仍是记号)。
 *
 * 为什么 ID 那条(2026-09-21 补):**同一个洞的另一半**。占位名修好之后,`beatmapId: 1`
 * 仍然被 `isPresent` 当成"有值",于是"占位 ID + 缺曲名"的槽位补得到名字、补不到 ID。
 * 判据必须与 `isUsableBeatmapId` 同口径 —— 那个函数存在的全部意义就是不让占位 ID
 * 当真实 ID 用(`/api/maps/meta` 靠它挡住"把 1 当有效 setId 返回、前端又写回 JSON")。
 * 全库当前 0 处(2026-09-18 清过 MKTC 那批 36 张),这里是防它复活,不是修存量。
 *
 * 注意这一条只管**提交时跳不跳**;删掉 R2 文件后要退回什么,是另一处判断
 * (见 `planFileDelete`),两者别混。
 */
function hasRemoteValue(map: Record<string, unknown>, field: PatchField): boolean {
  if (!isPresent(map, field)) return false
  if (field === 'name' && isPlaceholderName(map[field], map.slot)) return false
  if (field !== 'name' && !isUsableBeatmapId(map[field])) return false
  return true
}

// 把新补丁并进已暂存的条目:字段逐个覆盖;来源取"更明确"的那个
// (一旦是 explicit,后面的 fill 不会把它降级回 fill)。
export function mergeStagedPatch(
  current: StagedPatch | undefined,
  patch: MapPatch,
  origin: PatchOrigin,
): StagedPatch {
  const merged: MapPatch = { ...(current?.patch || {}), ...patch }
  const nextOrigin: PatchOrigin =
    origin === 'explicit' || current?.origin === 'explicit' ? 'explicit' : 'fill'
  return { patch: merged, origin: nextOrigin }
}

// 本地回显:把补丁无条件写到前端 rounds 上,返回命中张数。不触网。
export function applyPatches(rounds: PatchRound[], patches: PatchMap): number {
  let applied = 0
  for (const round of rounds) {
    for (const map of round.maps) {
      const patch = patches.get(`${round.id}/${map.slot as string}`)
      if (!patch) continue
      applied++
      for (const field of FIELDS) {
        if (field in patch) writeField(map, field, patch[field])
      }
    }
  }
  return applied
}

export interface CommitResult {
  appliedKeys: string[]
  unmatchedKeys: string[]
  skippedRemote: { key: string; fields: PatchField[] }[]
}

// 把暂存补丁写进权威 JSON(就地修改)。
export function applyStagedPatches(rounds: PatchRound[], staged: StagedPatchMap): CommitResult {
  const index = new Map<string, Record<string, unknown>>()
  for (const round of rounds) {
    for (const map of round.maps) index.set(`${round.id}/${map.slot as string}`, map)
  }

  const result: CommitResult = { appliedKeys: [], unmatchedKeys: [], skippedRemote: [] }
  for (const [key, entry] of staged) {
    const map = index.get(key)
    if (!map) {
      result.unmatchedKeys.push(key)
      continue
    }
    let written = 0
    const skipped: PatchField[] = []
    for (const field of FIELDS) {
      if (!(field in entry.patch)) continue
      // fill 只补缺:远端已经有值就跳过,不覆盖别人的改动。
      // (占位名不算"有值" —— 见 hasRemoteValue;否则清空/补真名都会被永久跳过。)
      if (entry.origin === 'fill' && hasRemoteValue(map, field)) {
        skipped.push(field)
        continue
      }
      writeField(map, field, entry.patch[field])
      written++
    }
    if (skipped.length > 0) result.skippedRemote.push({ key, fields: skipped })
    if (written > 0) result.appliedKeys.push(key)
  }
  return result
}

// 成功后该从池里移除哪些 key:快照里提交过 + 期间没被替换 + 这次真的写进去了。
export function entriesToClear(
  snapshot: StagedPatchMap,
  current: StagedPatchMap,
  appliedKeys: Iterable<string>,
): string[] {
  const applied = new Set(appliedKeys)
  const clear: string[] = []
  for (const [key, entry] of snapshot) {
    if (!applied.has(key)) continue
    if (current.get(key) !== entry) continue // 提交期间被改写 → 保留
    clear.push(key)
  }
  return clear
}

// 请求归属守门:只有序号没被更新过(即还是当前那次切换)才算"仍然有效"。
export function isCurrentRequest(token: number, currentToken: number): boolean {
  return token === currentToken
}

/** 补丁池的 key:一处拼好,别在各调用点各拼一份。 */
export function slotPatchKey(roundId: string, slot: string): string {
  return `${roundId}/${slot}`
}

/**
 * 记录"存档里"每个 slot 的 name / beatmapId / beatmapsetId —— **字段总是存在**,
 * 本来没有的记为 null(应用时等于把该字段删掉)。
 *
 * 用途(站长 2026-09-17 反馈):上传页删掉某个 slot 的 .osz 之后,该 slot 的本地回显与
 * 暂存补丁**都要退回存档值**。否则会出现:
 *   手传 → 从文件里读出 name/BID(暂存 + 回显)→ 删掉文件 → 行上仍显示那份**已删除**
 *   文件的信息,而且保存时还会把它写进 JSON;之后再补传,看到的仍是"先前那份信息"。
 *
 * ⚠️ 这里**照原样记**,不做占位名判读 —— 判读属于"回滚时要不要显示",归 `planFileDelete`。
 * 理由有二:
 *   · **一律记 null 会把空名与占位名混成一种。** 两者含义不同:占位名的槽位大概率有
 *     R2 文件(补全能补出真名),空名则可能压根没传过。基准丢了这层区分,补全候选、
 *     统计、以后任何"这槽位到底缺什么"的判断都少一份依据。
 *   · 基准是**存档的忠实快照**,不是加工过的视图。加工过的视图只该有一处(回滚时)。
 */
export function buildSlotBaseline(rounds: PatchRound[]): PatchMap {
  const baseline: PatchMap = new Map()
  for (const round of rounds) {
    for (const map of round.maps) {
      baseline.set(slotPatchKey(round.id, String(map.slot)), readSlotInfo(map))
    }
  }
  return baseline
}

/** 从权威数据里读一个 slot 的信息(字段总是存在,本来没有的记 null)。 */
function readSlotInfo(map: Record<string, unknown>): MapPatch {
  const name = map.name
  const beatmapId = map.beatmapId
  const beatmapsetId = map.beatmapsetId
  return {
    name: typeof name === 'string' && name !== '' ? name : null,
    beatmapId: typeof beatmapId === 'number' ? beatmapId : null,
    beatmapsetId: typeof beatmapsetId === 'number' ? beatmapsetId : null,
  }
}

/**
 * 删掉 R2 文件之后,这个 slot 的**暂存与回显**各该怎么办。
 *
 * 这是站长 2026-09-20 反馈的「小字」bug 的落点,单独抽出来就是为了能测:
 *
 *   贴一个不存在的 BID 让 osu 报 not found → 点确定 → 清空补丁
 *   `{name:null, beatmapId:null, beatmapsetId:null}` 以 **explicit** 进池,
 *   行上的小字(那条错谱面的曲名)消失 → **再去 R2 删那个 .osz**。
 *
 * 删文件时的旧行为是"无条件丢掉该 slot 的暂存条目、回显退回存档值",于是:
 *   · 用户刚下的 explicit 清空**被一起丢掉**;
 *   · 回显退回**存档值** —— 而存档里那条正是错谱面的曲名/占位名(`"RC1"`)。
 *   → **小字又回来**(站长反馈的路径)。
 *
 * 判据是"这份信息从哪儿来",不是"值长什么样":
 *   · `fill` = 上传时从那个 .osz 的 `[Metadata]` 里读出来的 → **与文件同寿**,
 *     文件删了就丢池 + 退回存档值(R32 修的就是这条)。
 *   · `explicit` = 用户明确指定的(贴 BID 补传、清空旧信息)→ 与那个文件无关,
 *     **留着**,回显也照它显示。用户刚说的话不能因为删了个文件就被推翻。
 *
 * 存档值里若是**占位名**(`name === slot`,如 `"RC1"`),退回时记成空 —— 它当初也是
 * 从那个 .osz 里读出来的,而且槽位名上方已经显示过了,再当曲名挂一遍没有信息量。
 * **占位 ID**(0/1/负数)同理退回成空:那些数字不是"这槽位的 BID",是模板默认值,
 * 挂回行上只会让人以为这里有张真图(`isUsableBeatmapId` 的同一口径)。
 * 判读放在这里、不放进 `buildSlotBaseline`,理由见上面那段 —— 基准是存档的忠实快照。
 */
export interface FileDeletePlan {
  /** 池里这条要不要丢。 */
  dropStaged: boolean
  /** 回显要改成什么;`null` = 不动(照池里那份显示)。 */
  rollback: MapPatch | null
}

export function planFileDelete(
  entry: StagedPatch | undefined,
  baseline: MapPatch | undefined,
  slot: string,
): FileDeletePlan {
  if (entry?.origin === 'explicit') return { dropStaged: false, rollback: null }
  const info = baseline ?? {}
  return {
    dropStaged: entry !== undefined,
    rollback: {
      name: typeof info.name === 'string' && info.name !== '' && !isPlaceholderName(info.name, slot) ? info.name : null,
      beatmapId: isUsableBeatmapId(info.beatmapId) ? info.beatmapId : null,
      beatmapsetId: isUsableBeatmapId(info.beatmapsetId) ? info.beatmapsetId : null,
    },
  }
}

/**
 * 剔除某个 slot 在池里的条目(删除文件时用)。
 * 返回**同一个对象**表示没变化 —— 方便 `setState(prev => dropStagedSlot(prev, key) === prev ? prev : ...)`
 * 这种写法跳过无意义的重渲染。
 */
export function dropStagedSlot(staged: StagedPatchMap, key: string): StagedPatchMap {
  if (!staged.has(key)) return staged
  const next = new Map(staged)
  next.delete(key)
  return next
}

// ---------- 跨比赛分组(2026-09-19 站长反馈)----------
//
// 为什么要有这一层:池子原来只属于"当前选中的比赛" —— 换一场比赛就整池清空
// (旧 loadTournament 里的 setPendingPatches(new Map())),所以想改十场比赛的元数据
// 就得存十次,每次都是一次 commit + 一次 Pages 重建。
//
// 现在暂存按比赛分组,换比赛/刷新都不丢,最后一次提交:
//   读取每场权威 JSON + blob sha(R01 编辑基准)→ 各自 applyStagedPatches
//   → 一个 POST /api/tournaments/batch = 1 次 commit。

/** key = tournamentId,value = 那场比赛的补丁池(Map<`roundId/slot`, StagedPatch>)。 */
export type StagedGroups = Map<string, StagedPatchMap>

function samePatch(a: MapPatch, b: MapPatch): boolean {
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
}

/** 两条暂存是否等价(用来保住对象同一 —— entriesToClear 靠它判断"期间有没有被改写")。 */
export function sameStagedPatch(a: StagedPatch | undefined, b: StagedPatch | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.origin === b.origin && samePatch(a.patch, b.patch)
}

/**
 * 把一批补丁并进某场比赛的分组。
 * 没有任何实际变化时返回**同一个对象**(方便 setState 跳过无意义重渲染);
 * 没变化的条目保留原对象引用(提交快照的同一性判定依赖这一点)。
 */
export function stageIntoGroups(
  groups: StagedGroups,
  tournamentId: string,
  patches: PatchMap,
  origin: PatchOrigin = 'fill',
): StagedGroups {
  if (!tournamentId || patches.size === 0) return groups
  const nextStaged = new Map(groups.get(tournamentId) || [])
  let changed = false
  for (const [key, patch] of patches) {
    // 空补丁没有任何字段可写,进池只会变成一条永远写不进去的 unmatched。
    if (Object.keys(patch).length === 0) continue
    const previous = nextStaged.get(key)
    const merged = mergeStagedPatch(previous, patch, origin)
    if (sameStagedPatch(previous, merged)) continue
    nextStaged.set(key, merged)
    changed = true
  }
  if (!changed) return groups
  const next = new Map(groups)
  next.set(tournamentId, nextStaged)
  return next
}

/** 所有比赛合计的暂存条数(dirty 判定与文案用)。 */
export function countStagedGroups(groups: StagedGroups): number {
  let total = 0
  for (const staged of groups.values()) total += staged.size
  return total
}

/** 有内容的比赛 id(按 Map 插入序 = 攒进来的先后)。 */
export function stagedTournamentIds(groups: StagedGroups): string[] {
  const ids: string[] = []
  for (const [id, staged] of groups) {
    if (staged.size > 0) ids.push(id)
  }
  return ids
}

/** 分组里的暂存条目 → 本地回显用的纯补丁表(丢掉 origin)。 */
export function stagedPatchMap(staged: StagedPatchMap | undefined): PatchMap {
  const out: PatchMap = new Map()
  if (!staged) return out
  for (const [key, entry] of staged) out.set(key, entry.patch)
  return out
}

/** 丢掉某场比赛某个 slot 的条目(删除 .osz 后的回滚用)。空组会被顺手摘掉。 */
export function dropSlotFromGroups(groups: StagedGroups, tournamentId: string, key: string): StagedGroups {
  const staged = groups.get(tournamentId)
  if (!staged || !staged.has(key)) return groups
  const nextStaged = dropStagedSlot(staged, key)
  const next = new Map(groups)
  if (nextStaged.size === 0) next.delete(tournamentId)
  else next.set(tournamentId, nextStaged)
  return next
}

/** 清空某场比赛的暂存;不传 id = 清空全部。没有变化时返回同一个对象。 */
export function clearStagedGroups(groups: StagedGroups, tournamentId?: string): StagedGroups {
  if (tournamentId === undefined) return groups.size === 0 ? groups : new Map()
  if (!groups.has(tournamentId)) return groups
  const next = new Map(groups)
  next.delete(tournamentId)
  return next
}

/**
 * 提交成功后清池 —— 逐场比赛套用单场规则(entriesToClear):
 * 只有"本次提交过 + 期间没被改写 + 真的写进去了"的条目才移除。
 * 因此需要传入**每场比赛各自**的 appliedKeys(哪场没写进去就整场留着)。
 * 没有任何变化时返回 current 本身。
 */
export function clearCommittedGroups(
  snapshot: StagedGroups,
  current: StagedGroups,
  appliedByTournament: Map<string, string[]>,
): StagedGroups {
  let next: StagedGroups | null = null
  for (const [id, snap] of snapshot) {
    const applied = appliedByTournament.get(id)
    if (!applied || applied.length === 0) continue
    const now = current.get(id)
    if (!now) continue
    const clear = entriesToClear(snap, now, applied)
    if (clear.length === 0) continue
    const nextStaged = new Map(now)
    for (const key of clear) nextStaged.delete(key)
    next = next ?? new Map(current)
    if (nextStaged.size === 0) next.delete(id)
    else next.set(id, nextStaged)
  }
  return next ?? current
}

// ---------- 持久化(localStorage)----------
//
// 站长 2026-09-19:暂存要能"跨比赛",那它就不能活在一个组件的 useState 里 ——
// 切 tab 会卸载组件、刷新会清空,于是又变成"必须一个比赛存一次"。
// 这里给出可 JSON 化的形状 + 读取时的清洗(手工改坏 storage / 旧版本残留都不能
// 让上传页崩掉)。

/** 可 JSON 化的暂存形状:tournamentId -> (`roundId/slot` -> 暂存条目)。 */
export type StagedGroupsJson = Record<string, Record<string, StagedPatch>>

export function serializeStagedGroups(groups: StagedGroups): StagedGroupsJson {
  const out: StagedGroupsJson = {}
  for (const id of stagedTournamentIds(groups)) {
    const staged = groups.get(id) as StagedPatchMap
    const entries: Record<string, StagedPatch> = {}
    for (const [key, entry] of staged) {
      entries[key] = { patch: { ...entry.patch }, origin: entry.origin }
    }
    out[id] = entries
  }
  return out
}

/** 单条补丁的清洗:只认 name(string|null) / beatmapId、beatmapsetId(有限数|null)。 */
function readPatch(value: unknown): MapPatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const patch: MapPatch = {}
  let seen = false
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) continue
    const v = raw[field]
    if (v === null) {
      patch[field] = null
      seen = true
      continue
    }
    if (field === 'name') {
      if (typeof v !== 'string') return null
      patch.name = v
      seen = true
      continue
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    patch[field] = v
    seen = true
  }
  return seen ? patch : null
}

/**
 * 读取持久化暂存。**永不抛异常**:形状不对的条目逐条丢掉,坏掉的整份当空。
 * origin 只认 'explicit',其余一律 'fill' —— 猜错的代价必须是"不覆盖远端"。
 */
export function parseStagedGroups(raw: unknown): StagedGroups {
  const groups: StagedGroups = new Map()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return groups
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const staged: StagedPatchMap = new Map()
    for (const [key, entryRaw] of Object.entries(value as Record<string, unknown>)) {
      if (!key) continue
      if (!entryRaw || typeof entryRaw !== 'object' || Array.isArray(entryRaw)) continue
      const entry = entryRaw as { patch?: unknown; origin?: unknown }
      const patch = readPatch(entry.patch)
      if (!patch) continue
      staged.set(key, { patch, origin: entry.origin === 'explicit' ? 'explicit' : 'fill' })
    }
    if (staged.size > 0) groups.set(id, staged)
  }
  return groups
}
