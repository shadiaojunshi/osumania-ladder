import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchWithNetworkRetry, isNetworkFailure, isTransientStatus, withNetworkRetry } from '../src/lib/fetchRetry.ts'

// 起因(2026-09-14 站长反馈):一键下载上传时一批行同时报 "Failed to fetch",
// 手动重跑一次又全好了 —— 浏览器把"连接被重置/流中断"统一抛成 TypeError,
// 而下载路径当时完全没有重试。这个文件锁住新的重试语义。

const ok = (status = 200) => ({ ok: status >= 200 && status < 300, status })
const networkError = () => new TypeError('Failed to fetch')

function recorder(responses) {
  const calls = []
  const sleeps = []
  const fetchImpl = async () => {
    const next = responses[calls.length] ?? responses[responses.length - 1]
    calls.push(next)
    if (next instanceof Error) throw next
    return next
  }
  return { calls, sleeps, fetchImpl, sleep: async (ms) => { sleeps.push(ms) } }
}

test('网络层抛错会重试,成功即返回', async () => {
  const r = recorder([networkError(), networkError(), ok()])
  const res = await fetchWithNetworkRetry('/api/osu/download?setId=1', undefined, {
    fetchImpl: r.fetchImpl, sleep: r.sleep,
  })

  assert.equal(res.status, 200)
  assert.equal(r.calls.length, 3)
  assert.deepEqual(r.sleeps, [600, 1200], '退避按基数递增')
})

test('反复网络失败:尝试满次数后抛出(调用方据此判"网络中断")', async () => {
  const r = recorder([networkError()])
  await assert.rejects(
    () => fetchWithNetworkRetry('/x', undefined, { fetchImpl: r.fetchImpl, sleep: r.sleep, attempts: 3 }),
    (error) => isNetworkFailure(error),
  )
  assert.equal(r.calls.length, 3)
})

test('HTTP 错误一律不重试,交回调用方判断', async () => {
  const bad = recorder([ok(500)])
  const res = await fetchWithNetworkRetry('/x', undefined, { fetchImpl: bad.fetchImpl, sleep: bad.sleep })
  assert.equal(res.status, 500)
  assert.equal(bad.calls.length, 1, '5xx 不在这里重试(下载端点自带镜像重试)')

  const notFound = recorder([ok(404)])
  const res2 = await fetchWithNetworkRetry('/x', undefined, { fetchImpl: notFound.fetchImpl, sleep: notFound.sleep })
  assert.equal(res2.status, 404)
  assert.equal(notFound.calls.length, 1)
})

test('非网络类异常不重试(不掩盖真实错误)', async () => {
  const r = recorder([new Error('boom')])
  await assert.rejects(() => fetchWithNetworkRetry('/x', undefined, { fetchImpl: r.fetchImpl, sleep: r.sleep }))
  assert.equal(r.calls.length, 1)
})

test('attempts=1 时退化成单次调用', async () => {
  const r = recorder([networkError()])
  await assert.rejects(() => fetchWithNetworkRetry('/x', undefined, { fetchImpl: r.fetchImpl, sleep: r.sleep, attempts: 1 }))
  assert.equal(r.calls.length, 1)
  assert.deepEqual(r.sleeps, [])
})

test('分类辅助:isNetworkFailure 只认 TypeError,isTransientStatus 认 429/5xx', () => {
  assert.equal(isNetworkFailure(new TypeError('Failed to fetch')), true)
  assert.equal(isNetworkFailure(new Error('HTTP 500')), false)
  assert.equal(isNetworkFailure('Failed to fetch'), false)

  assert.equal(isTransientStatus(429), true)
  assert.equal(isTransientStatus(500), true)
  assert.equal(isTransientStatus(503), true)
  assert.equal(isTransientStatus(404), false)
  assert.equal(isTransientStatus(400), false)
})

// 下面两条盯的是"重试范围到底覆盖到哪一步":fetch 拿到响应头就返回了,
// 几十 MB 的包是在 res.blob() 里才传完的 —— 断流恰好最常发生在那里。
// 只重试 fetch 等于漏掉最常见的中断点,所以读取动作也要在同一层重试。
test('读响应体时断流会重发整个请求(而不是只重试拿到响应头那一步)', async () => {
  let requests = 0
  const sleeps = []
  // 模拟真实情形:fetch 成功返回(响应头到手),但 res.blob() 传到一半断流。
  const fakeFetch = async () => {
    requests += 1
    return {
      ok: true,
      status: 200,
      blob: async () => {
        if (requests === 1) throw new TypeError('network error')
        return { size: 42 }
      },
    }
  }

  const blob = await withNetworkRetry(async () => {
    const res = await fakeFetch()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.blob()
  }, { sleep: async (ms) => { sleeps.push(ms) } })

  assert.equal(requests, 2, '断流后必须重新发请求,不能拿着半截响应继续')
  assert.equal(blob.size, 42)
  assert.deepEqual(sleeps, [600])
})

test('读体阶段的 HTTP 错误照旧不重试(不会把 404 当成网络抖动反复重发)', async () => {
  let requests = 0
  await assert.rejects(
    () => withNetworkRetry(async () => {
      requests += 1
      const res = { ok: false, status: 404 }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    }, { sleep: async () => {} }),
    /HTTP 404/,
  )
  assert.equal(requests, 1)
})
