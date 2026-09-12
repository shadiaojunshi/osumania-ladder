// 批量保存的「编辑基准」校验 —— 纯函数,不碰网络,便于测试。
//
// 背景:一次 batch 会把若干份完整 JSON 一次性写进仓库。若 A 从旧版本开始编辑、
// B 先保存了改动,A 提交时服务器读取的是"最新的 HEAD",于是 A 的旧 JSON 会把 B 的
// 改动整体覆盖掉。ref 更新的 force:false 只能挡住"读取 HEAD 之后"发生的竞争,
// 挡不住"B 已经保存完"的情况。
//
// 做法:每份草稿在读取时记下当时的 blob sha(baseSha),提交时对照**同一个固定 commit
// 的树**逐文件比对。全部通过才建 commit;任一冲突则整批不写。
// baseSha = null 表示"新建,预期不存在";该字段必须显式出现,不能省略
// (缺失不能当成新建,否则旧客户端会绕过校验)。

export type BatchConflictReason = 'modified' | 'missing' | 'exists' | 'head-moved'

export interface BatchItem {
  id: string
  tournament: Record<string, unknown>
  baseSha: string | null
}

export interface BatchConflict {
  id: string
  reason: BatchConflictReason
  expected: string | null
  actual: string | null
}

export interface TreeEntry {
  path?: unknown
  sha?: unknown
  type?: unknown
}

export const TOURNAMENT_DIR = 'data/tournaments'

export function tournamentPath(id: string): string {
  return `${TOURNAMENT_DIR}/${id}.json`
}

export interface BatchParseResult {
  items?: BatchItem[]
  error?: string
}

// 解析并校验请求体形状。baseSha 必须显式存在(null = 新建)。
export function parseBatchItems(payload: unknown): BatchParseResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: '请求体必须是 JSON 对象' }
  }
  const body = payload as { items?: unknown }
  if (!Array.isArray(body.items)) {
    return { error: '缺少 items 数组（每项需带 id / tournament / baseSha）' }
  }
  if (body.items.length === 0) return { error: '没有要保存的改动' }

  const items: BatchItem[] = []
  const seen = new Set<string>()
  for (const raw of body.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: 'items 里存在非对象项' }
    }
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      return { error: 'items 项缺少非空字符串 id' }
    }
    const id = item.id
    if (seen.has(id)) return { error: `items 里出现重复的 id: ${id}` }
    seen.add(id)
    if (!Object.prototype.hasOwnProperty.call(item, 'baseSha')) {
      return { error: `${id} 缺少 baseSha 字段：新建必须显式传 null，不能省略` }
    }
    const baseSha = item.baseSha
    if (baseSha !== null && (typeof baseSha !== 'string' || baseSha === '')) {
      return { error: `${id} 的 baseSha 必须是字符串或 null` }
    }
    const tournament = item.tournament
    if (!tournament || typeof tournament !== 'object' || Array.isArray(tournament)) {
      return { error: `${id} 缺少 tournament 对象` }
    }
    items.push({ id, tournament: tournament as Record<string, unknown>, baseSha })
  }
  return { items }
}

// 把 Git tree 条目转成 path -> blob sha。只收 blob,目录条目忽略。
export function treeToShaMap(entries: TreeEntry[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries || []) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha !== 'string') continue
    if (entry.type !== undefined && entry.type !== 'blob') continue
    map.set(entry.path, entry.sha)
  }
  return map
}

// 对照固定 commit 的树,列出所有冲突。返回空数组才允许写入。
// 注意:currentTree 里"查不到"必须区分「确实不存在」与「读取失败」——
// 读取失败要在调用方抛错,绝不能当成"文件不存在",否则新建会覆盖已有文件。
export function evaluateBatchConflicts(
  items: BatchItem[],
  currentTree: Map<string, string>,
): BatchConflict[] {
  const conflicts: BatchConflict[] = []
  for (const item of items) {
    const path = tournamentPath(item.id)
    const actual = currentTree.get(path) ?? null

    if (item.baseSha === null) {
      if (actual !== null) {
        conflicts.push({ id: item.id, reason: 'exists', expected: null, actual })
      }
      continue
    }
    if (actual === null) {
      conflicts.push({ id: item.id, reason: 'missing', expected: item.baseSha, actual: null })
      continue
    }
    if (actual !== item.baseSha) {
      conflicts.push({ id: item.id, reason: 'modified', expected: item.baseSha, actual })
    }
  }
  return conflicts
}

// ref 更新时发现 HEAD 已经动了(有人刚好在我们比对之后提交)。
// 返回冲突而不是"拿旧 JSON 换新 SHA 重试"。
export function headMovedConflicts(items: BatchItem[]): BatchConflict[] {
  return items.map((item) => ({
    id: item.id,
    reason: 'head-moved',
    expected: item.baseSha,
    actual: null,
  }))
}
