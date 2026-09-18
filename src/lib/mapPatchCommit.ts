// MapUploader 元数据补丁池的纯逻辑(不依赖 React,便于测试)。
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
