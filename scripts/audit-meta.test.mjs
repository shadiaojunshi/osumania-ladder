import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// R16：审计条目以前只按 `.length > 200` 截 detail，`target` 完全不设限。
// 批量保存把 `ids.join(',')` 当 target，比赛 id 一多 metadata 就超 KV 的 1024 字节上限，
// KV 拒写 → writeAudit 又是静默 catch → **整条审计消失且无人知道**。
// 现在：metadata 按 UTF-8 字节收缩 + 超限打 truncated 标记 + 完整正文留在 value 里，
// 且写失败会 console.error 报出来。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { buildAuditMetadata, getAuditEntry, listAudit, utf8Bytes, writeAudit } = await import(
  '../functions/api/_lib/audit.ts'
)

const META_LIMIT = 1024

/** 假 KV：像真 KV 一样校验 metadata 的 UTF-8 字节数，超了直接抛（真 KV 是 400 错误）。 */
function makeKv({ failPut = false } = {}) {
  const store = new Map()
  return {
    store,
    puts: [],
    async put(key, value, options = {}) {
      if (failPut) throw new Error('KV PUT failed (simulated quota)')
      const metaBytes = options.metadata ? utf8Bytes(JSON.stringify(options.metadata)) : 0
      if (metaBytes > META_LIMIT) {
        throw new Error(`KV PUT failed: metadata too large (${metaBytes} > ${META_LIMIT})`)
      }
      this.puts.push({ key, value, options, metaBytes })
      store.set(key, { value, options })
    },
    async list({ prefix, limit }) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit ?? 1000)
      return {
        keys: keys.map((name) => ({ name, metadata: store.get(name).options.metadata })),
        truncated: false,
        cursor: undefined,
      }
    },
    async get(key, type) {
      const hit = store.get(key)
      if (!hit) return null
      return type === 'json' ? JSON.parse(hit.value) : hit.value
    },
  }
}

const base = {
  actorUid: 'u1',
  actorName: '站长',
  action: 'tournament.batchUpdate',
  target: 'a-cup',
  detail: '保存了 1 场比赛',
}

test('R16 短条目不做任何收缩', () => {
  const meta = buildAuditMetadata({ ts: 1, ...base })
  assert.equal(meta.truncated, undefined, '没裁就不该有标记')
  assert.equal(meta.target, 'a-cup')
  assert.equal(meta.detail, '保存了 1 场比赛')
  assert.deepEqual(Object.keys(meta).sort(), ['action', 'actorName', 'actorUid', 'detail', 'target', 'ts'])
})

test('R16 超长 batch target 会被收缩到 KV metadata 上限内（字符数 ≠ 字节数）', () => {
  // 200 个比赛 id（每个 ~30 字符）→ 原来 target 单字段就 6000+ 字节，必被 KV 拒。
  const ids = Array.from({ length: 200 }, (_, i) => `tournament-with-a-long-name-${i}`)
  const meta = buildAuditMetadata({ ts: 1, ...base, target: ids.join(','), detail: '批量保存' })

  const bytes = utf8Bytes(JSON.stringify(meta))
  assert.ok(bytes <= 820, `metadata 必须落在安全线内（实际 ${bytes} 字节）`)
  assert.ok(bytes < META_LIMIT, '必须在 KV 的 1024 硬上限内')
  assert.equal(meta.truncated, true, '裁过就要有标记（前端据此提供"查看完整"）')
  assert.ok(meta.target.endsWith('…'), 'target 要留可读前缀 + 省略号')
  assert.ok(meta.target.startsWith('tournament-with-a-long-name-0'), '前缀要保留')
})

test('R16 中文按 UTF-8 字节算（200 汉字 = 600 字节仍放得下，400 汉字必须收）', () => {
  // 200 个汉字 = 600 字节：虽然字符数已到粗截断线，但总字节仍在上限内 → 不必再收。
  const fits = buildAuditMetadata({ ts: 1, ...base, detail: '中'.repeat(200) })
  assert.equal(fits.truncated, undefined)
  assert.equal(utf8Bytes(fits.detail), 600)

  // 400 个汉字 = 1200 字节，超过 1024 硬上限 → 必须收下来。
  const shrunk = buildAuditMetadata({ ts: 1, ...base, detail: '中'.repeat(400) })
  assert.equal(shrunk.truncated, true)
  assert.ok(utf8Bytes(JSON.stringify(shrunk)) <= 820)
  assert.ok(shrunk.detail.startsWith('中'), '前缀保持可读')
  assert.ok(shrunk.detail.endsWith('…'))
})

test('R16 极端长的 actorName / ip 也能收下来，不会把 metadata 撑爆', () => {
  const meta = buildAuditMetadata({
    ts: 1,
    ...base,
    actorName: '名'.repeat(500),
    detail: '长'.repeat(500),
    target: 'x'.repeat(500),
    ip: '1'.repeat(300),
  })
  const bytes = utf8Bytes(JSON.stringify(meta))
  assert.ok(bytes <= 820, `实际 ${bytes}`)
  assert.equal(meta.truncated, true)
  assert.equal(meta.ts, 1, '数值字段不能被裁')
  assert.equal(meta.action, 'tournament.batchUpdate', 'action 是列表渲染必需的,优先保留')
})

test('R16 writeAudit：KV 会拒超限 metadata，但收缩后的条目能写进去且 value 保留全文', async () => {
  const kv = makeKv()
  const ids = Array.from({ length: 300 }, (_, i) => `cup-${i}`)
  const fullTarget = ids.join(',')
  await writeAudit(kv, { ...base, target: fullTarget, detail: '批量' })

  assert.equal(kv.puts.length, 1, '应该写成功（以前会静默丢失）')
  const { value, options } = kv.puts[0]
  const stored = JSON.parse(value)
  assert.equal(stored.target, fullTarget, 'KV value 必须是完整正文')
  assert.ok(options.metadata.truncated === true)
  assert.ok(utf8Bytes(JSON.stringify(options.metadata)) < META_LIMIT)
})

test('R16 writeAudit：KV 写失败不抛出，但会留下可观察的诊断日志', async () => {
  const kv = makeKv({ failPut: true })
  const errors = []
  const original = console.error
  console.error = (...args) => errors.push(args)
  try {
    await writeAudit(kv, { ...base, detail: 'x'.repeat(50) })
  } finally {
    console.error = original
  }
  assert.equal(errors.length, 1, '不能静默吞掉')
  assert.equal(errors[0][0], '[audit] AUDIT_WRITE_FAILED')
  const payload = errors[0][1]
  assert.equal(payload.action, base.action)
  assert.equal(typeof payload.error, 'string')
  // 只记与排查相关的长度信息,不能把 token / 请求头带进日志。
  assert.deepEqual(Object.keys(payload).sort(), ['action', 'detailChars', 'error', 'targetChars'])
})

test('R16 listAudit 带出 key，且能按 key 取完整正文', async () => {
  const kv = makeKv()
  const longTarget = Array.from({ length: 300 }, (_, i) => `cup-${i}`).join(',')
  await writeAudit(kv, { ...base, target: longTarget })

  const entries = await listAudit(kv, 10)
  assert.equal(entries.length, 1)
  assert.ok(entries[0].key.startsWith('audit:'), '列表条目要带 KV key')
  assert.equal(entries[0].truncated, true, '列表里是摘要')
  assert.notEqual(entries[0].target, longTarget)

  const full = await getAuditEntry(kv, entries[0].key)
  assert.equal(full.target, longTarget, '按 key 能取回全文')
})

test('R16 getAuditEntry 只认 audit: 前缀，不会变成任意 KV 读取器', async () => {
  const kv = makeKv()
  kv.store.set('secret:token', { value: 'sensitive', options: {} })
  assert.equal(await getAuditEntry(kv, 'secret:token'), null)
  assert.equal(await getAuditEntry(kv, `audit:${'x'.repeat(300)}`), null, '超长 key 直接拒绝')
  assert.equal(await getAuditEntry(kv, 'audit:missing'), null)
})

test('R16 旧数据（没有 metadata）仍能列出，并补上 key', async () => {
  const kv = makeKv()
  const legacy = { ts: 123, ...base }
  kv.store.set('audit:0000000000001:old', { value: JSON.stringify(legacy), options: {} })
  // listAudit 有 5s 的 isolate 内存缓存（按 limit 分键）—— 每个用例用不同 limit，
  // 免得读到前一个用例的缓存（那是 isolate 级共享状态，不是被测逻辑的问题）。
  const entries = await listAudit(kv, 13)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].ts, 123)
  assert.equal(entries[0].key, 'audit:0000000000001:old')
})
