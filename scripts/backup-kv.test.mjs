import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// KV 备份脚本。纯逻辑 + **用假 fetch 测 Cloudflare API 交互**（本地不可能真调）。
//
// 重点：
//   ① 只备份该备份的（`admins` / `audit:` / `trash:`），短期过程数据（`trashop:`）不要；
//   ② `bulk/get` 只返回 JSON 值 —— 请求过但没返回的 key 必须记进 `failures`，不能悄悄吞；
//   ③ bulk 失败要能退化成逐个读，而不是整批丢掉；
//   ④ 轮转**只删标准形状**的快照键，手放的说明文件一律留着。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  KV_BACKUP_PREFIX,
  classifyKey,
  shouldBackup,
  dateString,
  snapshotObjectKey,
  snapshotDateOf,
  isExpired,
  chunk,
  buildSnapshot,
  expiredSnapshots,
  resolveExitCode,
  listAllKvKeys,
  bulkGetValues,
  pruneOldSnapshots,
} = await import('./backup-kv.mjs')

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-20T18:00:00.000Z')

// ---------------------------------------------------------------------------
// ① 该备份哪些 key
// ---------------------------------------------------------------------------

test('只备份三类 key；短期过程数据跳过', () => {
  assert.equal(classifyKey('admins'), 'admins')
  assert.equal(classifyKey('audit:123:abc'), 'audit')
  assert.equal(classifyKey('trash:t_1'), 'trash')

  assert.equal(classifyKey('trashop:op-1'), null, '幂等标记是短期过程数据，不必备份')
  assert.equal(classifyKey(''), null)
  assert.equal(classifyKey('adminss'), null, '前缀不是"以 admins 开头"，必须精确匹配')
  assert.equal(classifyKey('audit'), null, '没有冒号的不算审计条目')

  assert.equal(shouldBackup('admins'), true)
  assert.equal(shouldBackup('trashop:x'), false)
})

// ---------------------------------------------------------------------------
// ② 快照键与保留期
// ---------------------------------------------------------------------------

test('快照对象键按 UTC 日期命名', () => {
  assert.equal(dateString(NOW), '2026-09-20')
  assert.equal(snapshotObjectKey(NOW), `${KV_BACKUP_PREFIX}2026-09-20.json`)
  assert.equal(snapshotObjectKey(Date.parse('2026-09-20T23:59:59Z')), 'kv-snapshots/2026-09-20.json')
  assert.equal(snapshotObjectKey(Date.parse('2026-09-21T00:00:01Z')), 'kv-snapshots/2026-09-21.json')
})

test('只认标准形状的键 —— 手放的说明文件返回 null', () => {
  assert.equal(snapshotDateOf('kv-snapshots/2026-09-20.json'), '2026-09-20')
  assert.equal(snapshotDateOf('kv-snapshots/README.md'), null)
  assert.equal(snapshotDateOf('kv-snapshots/2026-09-20.json.bak'), null)
  assert.equal(snapshotDateOf('other/2026-09-20.json'), null)
  assert.equal(snapshotDateOf('kv-snapshots/2026-9-20.json'), null, '月份必须两位')
})

test('保留期判定：到点才过期，日期畸形一律不算过期', () => {
  assert.equal(isExpired('2026-09-19', NOW, 30), false)
  assert.equal(isExpired('2026-08-22', NOW, 30), false, '29.75 天，还没超过')
  assert.equal(isExpired('2026-08-21', NOW, 30), true, '30.75 天，已经超过（边界按超过算）')
  assert.equal(isExpired('2026-08-20', NOW, 30), true)
  assert.equal(isExpired('2026-06-01', NOW, 7), true)
  assert.equal(isExpired('', NOW, 30), false)
  assert.equal(isExpired('not-a-date', NOW, 30), false, '解析不出来就不删')
})

test('轮转只删过期的标准形状键', () => {
  const keys = [
    'kv-snapshots/2026-09-20.json', // 今天
    'kv-snapshots/2026-09-01.json', // 19 天前
    'kv-snapshots/2026-07-01.json', // 超期
    'kv-snapshots/README.md', // 非标准形状 → 留着
    'maps/x.osz', // 别的前缀 → 根本不看
  ]
  assert.deepEqual(expiredSnapshots(keys, NOW, 30), ['kv-snapshots/2026-07-01.json'])
  assert.deepEqual(expiredSnapshots(keys, NOW, 7), [
    'kv-snapshots/2026-07-01.json',
    'kv-snapshots/2026-09-01.json',
  ])
})

test('chunk 分片：能整除与不能整除都对', () => {
  assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]])
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]])
  assert.deepEqual(chunk([], 2), [])
})

// ---------------------------------------------------------------------------
// ③ 快照内容
// ---------------------------------------------------------------------------

test('快照内容：按类计数 + 显式记录读不到的 key', () => {
  const snap = buildSnapshot({
    items: {
      admins: { u1: { role: 'admin' } },
      'audit:1:a': { action: 'x' },
      'audit:2:b': { action: 'y' },
      'trash:t1': { kind: 'map' },
    },
    missing: ['audit:3:c'],
    nowMs: NOW,
    namespaceId: 'ns-1',
  })
  assert.equal(snap.schemaVersion, 1)
  assert.equal(snap.exportedAt, '2026-09-20T18:00:00.000Z')
  assert.equal(snap.namespaceId, 'ns-1')
  assert.deepEqual(snap.counts, { admins: 1, audit: 2, trash: 1 })
  assert.deepEqual(snap.failures, ['audit:3:c'], '有洞就要写出来，恢复时得能看见')
  assert.deepEqual(snap.items.admins, { u1: { role: 'admin' } })
})

test('快照内容：读全时 failures 为空数组', () => {
  const snap = buildSnapshot({ items: { admins: {} }, nowMs: NOW, namespaceId: 'ns' })
  assert.deepEqual(snap.failures, [])
  assert.deepEqual(snap.counts, { admins: 1, audit: 0, trash: 0 })
})

// ---------------------------------------------------------------------------
// ④ Cloudflare API（假 fetch）
// ---------------------------------------------------------------------------

/** 造一个 Response 形状的桩 —— cfFetch 会读 res.ok 与 await res.json()。 */
function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body }
}

test('列举 KV keys：自带分页，把 cursor 用完为止', async () => {
  const calls = []
  const pages = [
    { success: true, result: { keys: [{ name: 'admins' }, { name: 'audit:1' }], cursor: 'c1' } },
    { success: true, result: { keys: [{ name: 'trash:t1' }], cursor: '' } },
  ]
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization })
    return jsonResponse(pages[calls.length - 1])
  }
  const keys = await listAllKvKeys({
    accountId: 'acc', namespaceId: 'ns', token: 'tok', fetchImpl, log: { log() {} },
  })
  assert.deepEqual(keys, ['admins', 'audit:1', 'trash:t1'])
  assert.equal(calls.length, 2, '有 cursor 就必须继续翻页')
  assert.match(calls[0].url, /\/accounts\/acc\/storage\/kv\/namespaces\/ns\/keys\?limit=1000/)
  assert.match(calls[1].url, /cursor=c1/)
  assert.equal(calls[0].auth, 'Bearer tok')
})

test('批量取值：请求过但没返回的 key 记进 missing（bulk/get 只回 JSON 值）', async () => {
  const fetchImpl = async (url, init) => {
    assert.match(url, /bulk\/get$/)
    assert.equal(init.method, 'POST')
    const sent = JSON.parse(init.body).keys
    assert.deepEqual(sent, ['admins', 'audit:1', 'trash:t1'])
    // 服务端只回了两个 —— trash:t1 是"列到了却读不到"。
    return jsonResponse({ success: true, result: { values: { admins: { a: 1 }, 'audit:1': { b: 2 } } } })
  }
  const { values, missing } = await bulkGetValues({
    accountId: 'acc', namespaceId: 'ns', token: 'tok',
    keys: ['admins', 'audit:1', 'trash:t1'], fetchImpl, log: { warn() {} },
  })
  assert.deepEqual(Object.keys(values).sort(), ['admins', 'audit:1'])
  assert.deepEqual(missing, ['trash:t1'])
})

test('批量取值：bulk 整批失败 → 退化成逐个读，不整批丢掉', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push(url)
    if (/bulk\/get$/.test(url)) return jsonResponse({ success: false, errors: [{ code: 1000, message: 'boom' }] }, false, 500)
    if (/values\/admins$/.test(url)) return jsonResponse({ success: true, result: { a: 1 } })
    return jsonResponse({ success: true, result: null }, true, 200) // 单个读拿到 null = 没这个键
  }
  const { values, missing } = await bulkGetValues({
    accountId: 'acc', namespaceId: 'ns', token: 'tok',
    keys: ['admins', 'audit:gone'], fetchImpl, log: { warn() {} },
  })
  assert.deepEqual(values, { admins: { a: 1 } })
  assert.deepEqual(missing, ['audit:gone'])
  assert.ok(seen.some((u) => /values\/admins$/.test(u)), '应该退化成逐个 GET /values/{key}')
})

test('批量取值：超过 100 个 key 要分多批', async () => {
  const batches = []
  const fetchImpl = async (url, init) => {
    const sent = JSON.parse(init.body).keys
    batches.push(sent.length)
    return jsonResponse({ success: true, result: { values: Object.fromEntries(sent.map((k) => [k, 1])) } })
  }
  const keys = Array.from({ length: 250 }, (_, i) => `audit:${i}`)
  const { values, missing } = await bulkGetValues({
    accountId: 'acc', namespaceId: 'ns', token: 'tok', keys, fetchImpl, log: { warn() {} },
  })
  assert.deepEqual(batches, [100, 100, 50], 'bulk/get 上限 100')
  assert.equal(Object.keys(values).length, 250)
  assert.deepEqual(missing, [])
})

test('轮转：列举 + 只删过期的，删除失败计数但不抛', async () => {
  const deleted = []
  const s3 = {
    send: async (cmd) => {
      const name = cmd.constructor.name
      if (name === 'ListObjectsV2Command') {
        return {
          Contents: [
            { Key: 'kv-snapshots/2026-09-20.json' },
            { Key: 'kv-snapshots/2026-07-01.json' },
            { Key: 'kv-snapshots/README.md' },
          ],
        }
      }
      if (name === 'DeleteObjectCommand') {
        if (cmd.input.Key.includes('07-01')) throw new Error('nope')
        deleted.push(cmd.input.Key)
      }
      return {}
    },
  }
  const r = await pruneOldSnapshots({ s3, bucket: 'b', nowMs: NOW, retentionDays: 30, log: { log() {}, warn() {} } })
  assert.equal(r.listed, 3)
  assert.equal(r.expired, 1)
  assert.equal(r.failed, 1, '删除失败要被计数（决定退出码）')
})

// ---------------------------------------------------------------------------
// ⑤ 退出码
// ---------------------------------------------------------------------------

test('退出码：列举失败 / 有缺失 key / 轮转失败 都算非零', () => {
  assert.equal(resolveExitCode({ listFailed: false, missing: [], prune: null }), 0)
  assert.equal(resolveExitCode({ listFailed: true, missing: [] }), 1)
  assert.equal(resolveExitCode({ listFailed: false, missing: ['x'] }), 1, '快照有洞要让流水线红')
  assert.equal(resolveExitCode({ listFailed: false, missing: [], prune: { failed: 1 } }), 1)
  assert.equal(resolveExitCode({ listFailed: false, missing: [], prune: { failed: 0 } }), 0)
})
