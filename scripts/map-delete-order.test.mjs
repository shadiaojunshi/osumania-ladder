import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// R07:软删除必须【副本 → 回收站记录 → 删原对象】,任何一步失败都不能让文件
// 变成"原件没了、也没有记录指向副本"的状态;重试要幂等。
// 全部内存 stub,可按需注入失败。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const { deleteOperationId, trashObjectKey } = await import('../functions/api/_lib/mapKeys.ts')
const { onRequestPost: deleteMap } = await import('../functions/api/maps/delete.ts')

const ORIGINAL = 'maps/t/r1/RC1.osz'

function makeBucket({ failCopy = false, failDeleteFor = [] } = {}) {
  const ops = []
  const store = new Map([[ORIGINAL, 'ORIGINAL-BYTES']])
  return {
    ops,
    store,
    async get(key) {
      ops.push(`r2.get:${key}`)
      return store.has(key)
        ? { body: `BODY:${key}`, httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: {}, etag: 'v1', size: 123 }
        : null
    },
    async put(key, body, options) {
      ops.push(`r2.put:${key}`)
      if (failCopy && key.startsWith('trash/')) throw new Error('R2 put failed')
      store.set(key, body)
      return {}
    },
    async delete(key) {
      ops.push(`r2.delete:${key}`)
      if (failDeleteFor.includes(key)) throw new Error('R2 delete failed')
      store.delete(key)
    },
    async list() { return { objects: [], truncated: false } },
  }
}

function makeKv({ failPut = false } = {}) {
  const store = new Map()
  const puts = []
  return {
    store,
    puts,
    async get(key, type) {
      const value = store.get(key)
      if (value === undefined) return null
      return type === 'json' ? JSON.parse(value) : value
    },
    async put(key, value, options) {
      if (failPut) throw new Error('KV put failed')
      puts.push({ key, options })
      store.set(key, value)
      return {}
    },
    async delete(key) { store.delete(key) },
    async list() { return { keys: [] } },
  }
}

// 审计日志也会写 KV,判断"有没有写回收站记录"时要把 audit: 前缀排除掉。
function trashPuts(kv) {
  return kv.puts.filter((p) => p.key.startsWith('trash:'))
}

async function callDelete({ bucket, kv }) {
  const res = await deleteMap({
    request: new Request('https://ladder.test/api/maps/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: 't', roundId: 'r1', slot: 'RC1' }),
    }),
    env: { GITHUB_TOKEN: 'x', GITHUB_REPO: 'o/r', LADDER_KV: kv, R2_BUCKET: bucket },
    data: { user: { uid: '1', username: 'admin', role: 'admin' } },
  })
  return { status: res.status, payload: await res.json() }
}

test('R07 成功路径的顺序是 副本 → 回收站记录 → 删原对象', async () => {
  const bucket = makeBucket()
  const kv = makeKv()
  const { status, payload } = await callDelete({ bucket, kv })

  assert.equal(status, 200)
  assert.equal(payload.trashed, true)
  assert.ok(payload.trashId, '响应要带回收站条目 id,便于 UI 提示与恢复')

  const copyAt = bucket.ops.findIndex((op) => op.startsWith('r2.put:trash/'))
  const kvAt = kv.puts.findIndex((p) => p.key.startsWith('trash:'))
  const deleteAt = bucket.ops.indexOf(`r2.delete:${ORIGINAL}`)

  assert.ok(copyAt >= 0 && kvAt >= 0 && deleteAt > copyAt, '删原对象必须是最后一步')
  assert.ok(kvAt >= 0, '回收站记录必须在删原对象之前写好')
  assert.equal(bucket.store.has(ORIGINAL), false, '成功后原对象已删除')
  assert.equal([...bucket.store.keys()].some((k) => k.startsWith('trash/')), true, '副本留着')
})

test('R07 副本写失败:原对象不动、不写记录、不删原件', async () => {
  const bucket = makeBucket({ failCopy: true })
  const kv = makeKv()
  const { status, payload } = await callDelete({ bucket, kv })

  assert.equal(status, 502)
  assert.equal(payload.code, 'TRASH_COPY_FAILED')
  assert.equal(bucket.store.has(ORIGINAL), true, '原对象必须完好')
  assert.deepEqual(bucket.ops.filter((op) => op.startsWith('r2.delete')), [], '没有任何删除动作')
  assert.deepEqual(trashPuts(kv), [], '不写回收站记录')
})

test('R07 回收站记录写失败:原对象不动,并清掉没记录的副本', async () => {
  const bucket = makeBucket()
  const kv = makeKv({ failPut: true })
  const { status, payload } = await callDelete({ bucket, kv })

  assert.equal(status, 502)
  assert.equal(payload.code, 'TRASH_RECORD_FAILED')
  assert.equal(bucket.store.has(ORIGINAL), true, '原对象必须完好')
  const trashKeys = [...bucket.store.keys()].filter((k) => k.startsWith('trash/'))
  assert.deepEqual(trashKeys, [], '副本要清掉,不留没有记录的孤儿')
  assert.equal(bucket.ops.includes(`r2.delete:${ORIGINAL}`), false, '绝不能在记录写失败时删原对象')
})

test('R07 原对象删失败:副本与记录都在,可从回收站恢复', async () => {
  const bucket = makeBucket({ failDeleteFor: [ORIGINAL] })
  const kv = makeKv()
  const { status, payload } = await callDelete({ bucket, kv })

  assert.equal(status, 502)
  assert.equal(payload.code, 'DELETE_FAILED')
  assert.equal(payload.trashed, true)
  assert.ok(payload.trashId)
  assert.equal(bucket.store.has(ORIGINAL), true, '删不掉就留着,不能假装删了')
  const entryKey = [...kv.store.keys()].find((k) => k.startsWith('trash:'))
  assert.ok(entryKey, '回收站记录要在')
  const entry = JSON.parse(kv.store.get(entryKey))
  assert.equal(entry.originalKey, ORIGINAL)
  assert.ok(bucket.store.has(entry.restoreKey), '副本要在,恢复才有东西可搬')
})

test('R07 删除失败后重试:副本键与回收站条目都不重复', async () => {
  const bucket = makeBucket({ failDeleteFor: [ORIGINAL] })
  const kv = makeKv()

  const first = await callDelete({ bucket, kv })
  assert.equal(first.payload.trashed, true)

  // 第二次:原对象仍能读到(上一次没删掉),重试应复用同一 opId 与同一条记录
  const second = await callDelete({ bucket, kv })
  assert.equal(second.payload.trashId, first.payload.trashId, '重试复用同一条回收站记录')

  const trashEntries = [...kv.store.keys()].filter((k) => k.startsWith('trash:') && !k.startsWith('trashop:'))
  assert.equal(trashEntries.length, 1, '不能因为重试多造条目')
  const trashCopies = [...bucket.store.keys()].filter((k) => k.startsWith('trash/'))
  assert.equal(trashCopies.length, 1, '不能因为重试多造副本')
})

test('R07 原对象不存在:直接返回 trashed=false,不做任何写入', async () => {
  const bucket = makeBucket({ failDeleteFor: [] })
  bucket.store.delete(ORIGINAL)
  const kv = makeKv()
  const { status, payload } = await callDelete({ bucket, kv })

  assert.equal(status, 200)
  assert.equal(payload.trashed, false)
  assert.deepEqual(bucket.ops.filter((op) => op.startsWith('r2.put')), [])
  assert.deepEqual(trashPuts(kv), [])
})

test('R07 opId 由 key + 版本签名决定:同版本稳定,换版本会变', () => {
  const a = deleteOperationId(ORIGINAL, 'etag-1')
  assert.equal(a, deleteOperationId(ORIGINAL, 'etag-1'), '同一版本重试必须得到同一个 id')
  assert.notEqual(a, deleteOperationId(ORIGINAL, 'etag-2'), '重传后是新版本,应产生新 id')
  assert.notEqual(a, deleteOperationId('maps/t/r1/RC2.osz', 'etag-1'), '不同对象不同 id')
  assert.match(trashObjectKey(ORIGINAL, a), /^trash\/maps\/t\/r1\/RC1\.osz\./)
})
