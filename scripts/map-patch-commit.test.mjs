import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyPatches,
  applyStagedPatches,
  entriesToClear,
  isCurrentRequest,
  mergeStagedPatch,
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
