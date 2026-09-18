import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { readJsonBody } = await import('../functions/api/_lib/validation.ts')

test('缺少或伪造 Content-Length 不能绕过实际 UTF-8 字节上限', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    const r = await readJsonBody(new Request('https://test.local', { method: 'POST', headers, body: JSON.stringify({ text: '中'.repeat(30) }) }), 64)
    assert.equal(r.ok, false)
    assert.match(r.error, /字节上限/)
  }
})

test('分块流越过上限就取消读取，不能继续消耗整条请求', async () => {
  let cancelled = false
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(40)) },
    cancel() { cancelled = true },
  })
  const r = await readJsonBody({ body, json: async () => { throw new Error('must stream') } }, 64)
  assert.equal(r.ok, false)
  assert.equal(cancelled, true)
})

test('跨分块 UTF-8 JSON 在上限内正确解析', async () => {
  const bytes = new TextEncoder().encode('{"text":"中"}')
  const body = new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close() } })
  const r = await readJsonBody({ body, json: async () => null }, bytes.length)
  assert.deepEqual(r, { ok: true, value: { text: '中' } })
})
