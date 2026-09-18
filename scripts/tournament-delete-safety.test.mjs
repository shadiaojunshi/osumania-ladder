import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestDelete } = await import('../functions/api/tournaments/[id].ts')
const originalPayload = '{"id":"t","name":"删除前的比赛","rounds":[]}'

async function run({ readStatus = 200, storedSha = 'sha-1', backupFails = false, deleteStatus = 200, role = 'admin' } = {}) {
  const events = []
  const backups = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, options = {}) => {
    const method = options.method ?? 'GET'
    events.push(method)
    return new Response(JSON.stringify(method === 'GET'
      ? { sha: storedSha, content: Buffer.from(originalPayload).toString('base64') }
      : { message: 'sha does not match' }), { status: method === 'GET' ? readStatus : deleteStatus })
  }
  try {
    const response = await onRequestDelete({
      params: { id: 't' },
      request: new Request('https://ladder.test/api/tournaments/t', { method: 'DELETE', body: JSON.stringify({ sha: 'sha-1' }) }),
      env: { GITHUB_TOKEN: 'test', GITHUB_REPO: 'o/r', LADDER_KV: {
        async put(key, value) {
          if (!key.startsWith('trash:')) return
          events.push('BACKUP')
          if (backupFails) throw new Error('quota exhausted')
          backups.push(JSON.parse(value))
        },
      } },
      data: { user: { uid: '42', username: 'editor', role } },
    })
    return { status: response.status, body: await response.json(), events, backups }
  } finally { globalThis.fetch = originalFetch }
}

test('删除前必须先持久备份读取到的同一版本，完整保留 UTF-8 JSON', async () => {
  const r = await run()
  assert.equal(r.status, 200)
  assert.deepEqual(r.events, ['GET', 'BACKUP', 'DELETE'])
  assert.equal(r.backups[0].payload, originalPayload)
  assert.equal(r.body.trashId, r.backups[0].id)
})

test('回收站写入失败时绝不发送 DELETE', async () => {
  const r = await run({ backupFails: true })
  assert.equal(r.status, 503)
  assert.equal(r.body.code, 'BACKUP_FAILED')
  assert.deepEqual(r.events, ['GET', 'BACKUP'])
})

test('读取失败时绝不发送 DELETE', async () => {
  const r = await run({ readStatus: 401 })
  assert.equal(r.status, 502)
  assert.deepEqual(r.events, ['GET'])
})

test('编辑基准过期时不备份错误版本、不删除', async () => {
  const r = await run({ storedSha: 'sha-new' })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'EDIT_CONFLICT')
  assert.deepEqual(r.events, ['GET'])
})

test('备份后发生并发修改，DELETE 冲突且安全副本仍保留', async () => {
  const r = await run({ deleteStatus: 409 })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'EDIT_CONFLICT')
  assert.equal(r.backups[0].payload, originalPayload)
})

test('contributor 无权删除，也不读取 GitHub', async () => {
  const r = await run({ role: 'contributor' })
  assert.equal(r.status, 403)
  assert.deepEqual(r.events, [])
})
