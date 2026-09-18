import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyPatches,
  applyStagedPatches,
  buildSlotBaseline,
  dropStagedSlot,
  entriesToClear,
  isCurrentRequest,
  mergeStagedPatch,
  slotPatchKey,
} from '../src/lib/mapPatchCommit.ts'

// R05:补丁池的纯逻辑。关键点:fill 补丁不覆盖远端已有的值;提交用快照,
// 提交期间新加/改写的补丁必须保留。

const rounds = () => ([
  {
    id: 'r1',
    maps: [
      { slot: 'A', type: 'RC' },
      { slot: 'B', type: 'RC', name: 'remote name', beatmapId: 777 },
    ],
  },
])

test('R05 mergeStagedPatch 逐字段合并,explicit 不会被后来的 fill 降级', () => {
  const first = mergeStagedPatch(undefined, { name: 'n1' }, 'fill')
  assert.equal(first.origin, 'fill')
  assert.deepEqual(first.patch, { name: 'n1' })

  const merged = mergeStagedPatch(first, { beatmapId: 12 }, 'explicit')
  assert.equal(merged.origin, 'explicit')
  assert.deepEqual(merged.patch, { name: 'n1', beatmapId: 12 })

  const notDowngraded = mergeStagedPatch(merged, { beatmapsetId: 34 }, 'fill')
  assert.equal(notDowngraded.origin, 'explicit')
  assert.deepEqual(notDowngraded.patch, { name: 'n1', beatmapId: 12, beatmapsetId: 34 })
})

test('R05 applyPatches(本地回显) 无条件写入并支持 null 删除', () => {
  const list = rounds()
  const patches = new Map([
    ['r1/A', { name: 'new A', beatmapId: 1 }],
    ['r1/B', { name: null }],
  ])
  assert.equal(applyPatches(list, patches), 2)
  assert.equal(list[0].maps[0].name, 'new A')
  assert.equal(list[0].maps[0].beatmapId, 1)
  assert.equal('name' in list[0].maps[1], false, 'null 表示删除该字段')
})

test('R05 fill 补丁不覆盖远端已有的值,只补缺口', () => {
  const list = rounds()
  const staged = new Map([
    ['r1/A', { patch: { name: 'fill A', beatmapId: 5 }, origin: 'fill' }],
    ['r1/B', { patch: { name: 'fill B', beatmapsetId: 9 }, origin: 'fill' }],
  ])

  const result = applyStagedPatches(list, staged)

  assert.equal(list[0].maps[0].name, 'fill A')
  assert.equal(list[0].maps[0].beatmapId, 5)
  assert.equal(list[0].maps[1].name, 'remote name', '远端已有 name → fill 不覆盖')
  assert.equal(list[0].maps[1].beatmapsetId, 9, '缺口字段照补')
  assert.deepEqual(result.appliedKeys.sort(), ['r1/A', 'r1/B'])
  assert.deepEqual(result.skippedRemote, [{ key: 'r1/B', fields: ['name'] }])
  assert.deepEqual(result.unmatchedKeys, [])
})

test('R05 explicit 补丁按用户意图覆盖,含 null 删除', () => {
  const list = rounds()
  const staged = new Map([
    ['r1/B', { patch: { name: 'mine', beatmapId: null }, origin: 'explicit' }],
  ])

  const result = applyStagedPatches(list, staged)

  assert.equal(list[0].maps[1].name, 'mine')
  assert.equal('beatmapId' in list[0].maps[1], false)
  assert.deepEqual(result.appliedKeys, ['r1/B'])
  assert.deepEqual(result.skippedRemote, [])
})

test('R05 池里的 key 在权威数据里找不到 → 报 unmatched 且不写', () => {
  const list = rounds()
  const staged = new Map([
    ['r9/Z', { patch: { name: 'ghost' }, origin: 'fill' }],
    ['r1/A', { patch: { name: 'ok' }, origin: 'fill' }],
  ])

  const result = applyStagedPatches(list, staged)

  assert.deepEqual(result.unmatchedKeys, ['r9/Z'])
  assert.deepEqual(result.appliedKeys, ['r1/A'])
})

test('R05 提交期间改写的补丁不会被清掉(快照 + 对象同一)', () => {
  const replaced = new Map([['r1/A', { patch: { name: 'v1' }, origin: 'fill' }]])
  const snapshot = new Map(replaced)

  // 提交期间用户又改了 r1/A(新对象)+ 新加 r1/B
  const current = new Map([
    ['r1/A', { patch: { name: 'v2' }, origin: 'fill' }],
    ['r1/B', { patch: { beatmapId: 2 }, origin: 'fill' }],
  ])

  assert.deepEqual(entriesToClear(snapshot, current, ['r1/A']), [], '被改写的条目要保留')
})

test('R05 只有"本次提交过 + 未被改写 + 真写进去"的条目才清出池子', () => {
  const untouched = { patch: { name: 'x' }, origin: 'fill' }
  const snapshot = new Map([['r1/A', untouched], ['r1/B', untouched]])
  const current = new Map([['r1/A', untouched], ['r1/B', untouched]])

  assert.deepEqual(entriesToClear(snapshot, current, ['r1/A']), ['r1/A'])
  assert.deepEqual(entriesToClear(snapshot, current, ['r1/A', 'r1/B']).sort(), ['r1/A', 'r1/B'])
  assert.deepEqual(entriesToClear(snapshot, current, []), [], '没写进去的条目不能清')
})

test('R05 请求令牌:只有仍是最新那次切换才算数', () => {
  assert.equal(isCurrentRequest(3, 3), true)
  assert.equal(isCurrentRequest(3, 4), false)
})

// ---------- 删除文件后的回滚（站长 2026-09-17 反馈）----------
// 现象:手传一个文件 → 删掉它 → 再用 BID 补传,行上显示的还是"先前那份信息"。
// 根因:手传时从 .osu 读出的 name/BID 会同时进"暂存池"和"本地回显",而删除只清了
// 文件与勾选 —— 池里那条补丁和回显都留着,于是行上一直是那份**已删除文件**的信息,
// 保存时还会把它写进 JSON。修法:删除主文件时丢掉该 slot 的暂存条目,并把回显退回存档值。

test('删除回滚:buildSlotBaseline 记录存档值,缺席的字段记为 null', () => {
  const baseline = buildSlotBaseline(rounds())
  assert.deepEqual(baseline.get('r1/A'), { name: null, beatmapId: null, beatmapsetId: null })
  assert.deepEqual(baseline.get('r1/B'), { name: 'remote name', beatmapId: 777, beatmapsetId: null })
})

test('删除回滚:把 baseline 应用回去 = 空字段被清掉、存档里有的值原样恢复', () => {
  const data = rounds()
  // 手传带来的回显
  applyPatches(data, new Map([['r1/A', { name: 'uploaded title', beatmapId: 111, beatmapsetId: 222 }]]))
  assert.equal(data[0].maps[0].name, 'uploaded title')

  const key = slotPatchKey('r1', 'A')
  applyPatches(data, new Map([[key, buildSlotBaseline(rounds()).get(key)]]))
  assert.equal('name' in data[0].maps[0], false, '存档里没有 name → 回滚后应被删掉')
  assert.equal('beatmapId' in data[0].maps[0], false)
  assert.equal('beatmapsetId' in data[0].maps[0], false)

  // 存档里本来有值的 slot 不被清空
  const keyB = slotPatchKey('r1', 'B')
  applyPatches(data, new Map([[keyB, buildSlotBaseline(rounds()).get(keyB)]]))
  assert.equal(data[0].maps[1].name, 'remote name')
  assert.equal(data[0].maps[1].beatmapId, 777)
})

test('删除回滚:dropStagedSlot 丢掉条目且不动其它条目(没有该 key 时返回原对象)', () => {
  const staged = new Map([
    ['r1/A', { patch: { name: 'stale' }, origin: 'fill' }],
    ['r1/B', { patch: { name: 'keep' }, origin: 'explicit' }],
  ])
  const after = dropStagedSlot(staged, 'r1/A')
  assert.deepEqual([...after.keys()], ['r1/B'])
  assert.equal(staged.has('r1/A'), true, '原 map 不被就地修改')
  assert.equal(dropStagedSlot(after, 'r1/MISSING'), after, '没有该 key 时返回同一个对象(跳过重渲染)')
})

test('删除回滚:完整时序 —— 手传 → 删除 → BID 补传后,池里与原样的都是**新**信息', () => {
  const data = rounds()
  const baseline = buildSlotBaseline(rounds())
  let staged = new Map()
  const key = slotPatchKey('r1', 'A')

  // 1) 手传:从 .osu 读出的元数据以 fill 进池 + 回显
  staged = new Map([[key, mergeStagedPatch(undefined, { name: 'old title', beatmapId: 111, beatmapsetId: 222 }, 'fill')]])
  applyPatches(data, new Map([[key, { name: 'old title', beatmapId: 111, beatmapsetId: 222 }]]))

  // 2) 删除该文件:丢池里的条目 + 回显退回存档值
  staged = dropStagedSlot(staged, key)
  applyPatches(data, new Map([[key, baseline.get(key)]]))
  assert.equal(staged.has(key), false, '那份补丁是刚从已删除文件里读出来的,不能留着')
  assert.equal('name' in data[0].maps[0], false, '行上不该再显示已删除文件的信息')

  // 3) BID 补传:新信息以 explicit 进池(照写,不受 fill 的"不覆盖"限制)
  staged = new Map([[key, mergeStagedPatch(staged.get(key), { name: 'new title', beatmapId: 999, beatmapsetId: 888 }, 'explicit')]])
  const result = applyStagedPatches(data, staged)
  assert.deepEqual(result.appliedKeys, [key])
  assert.equal(data[0].maps[0].name, 'new title', '补传后的信息必须覆盖旧值')
  assert.equal(data[0].maps[0].beatmapId, 999)
  assert.equal(data[0].maps[0].beatmapsetId, 888)
})
