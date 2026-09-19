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
      if (entry.origin === 'fill' && isPresent(map, field)) {
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
 */
export function buildSlotBaseline(rounds: PatchRound[]): PatchMap {
  const baseline: PatchMap = new Map()
  for (const round of rounds) {
    for (const map of round.maps) {
      const name = map.name
      const beatmapId = map.beatmapId
      const beatmapsetId = map.beatmapsetId
      baseline.set(slotPatchKey(round.id, String(map.slot)), {
        name: typeof name === 'string' && name !== '' ? name : null,
        beatmapId: typeof beatmapId === 'number' ? beatmapId : null,
        beatmapsetId: typeof beatmapsetId === 'number' ? beatmapsetId : null,
      })
    }
  }
  return baseline
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
