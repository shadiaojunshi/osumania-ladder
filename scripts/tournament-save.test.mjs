import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// R02:单文件保存要返回新的 blob sha,新建成功后前端才能转入编辑模式
// (连续保存走 PUT、不再拿旧 sha 覆盖)。全部用内存 stub,不碰真实 GitHub。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestPost: createTournament } = await import('../functions/api/tournaments/index.ts')
const { onRequestPut: updateTournament } = await import('../functions/api/tournaments/[id].ts')

const jsonRes = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
})

function makeRequest(body) {
  return {
    json: async () => body,
    headers: { get: () => null },
  }
}

function installFetch(reply) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const record = {
      method: (options.method || 'GET').toUpperCase(),
      url: String(url),
      body: options.body ? JSON.parse(options.body) : null,
    }
    calls.push(record)
    return reply(record)
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const envFor = () => ({ GITHUB_TOKEN: 'token', GITHUB_REPO: 'o/r', LADDER_KV: { put: async () => {} } })
const user = (role) => ({ uid: '1', username: 'tester', role })

const tournament = (id) => ({ id, name: id, abbreviation: id, keyCount: 4, year: 2026, rounds: [] })

test('R02 PUT 成功时把 GitHub 返回的新 blob sha 交回前端,并原样带上编辑基准', async () => {
  const fetch = installFetch(() => jsonRes(200, { content: { sha: 'blob-after-update' } }))
  try {
    const res = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ tournament: tournament('cet-2026'), sha: 'blob-before' }),
      env: envFor(),
      data: { user: user('admin') },
    })
    const payload = await res.json()

    assert.equal(res.status, 200)
    assert.equal(payload.success, true)
    assert.equal(payload.id, 'cet-2026')
    assert.equal(payload.sha, 'blob-after-update', '必须回传新 sha,否则连续保存会一直用旧 sha')

    assert.equal(fetch.calls.length, 1)
    assert.equal(fetch.calls[0].method, 'PUT')
    assert.equal(fetch.calls[0].body.sha, 'blob-before', '乐观锁基准要原样透传给 GitHub')
    const decoded = JSON.parse(Buffer.from(fetch.calls[0].body.content, 'base64').toString('utf8'))
    assert.equal(decoded.id, 'cet-2026')
  } finally {
    fetch.restore()
  }
})

test('R02 PUT 权限不足与坏数据在触碰 GitHub 之前就被拦住', async () => {
  const fetch = installFetch(() => jsonRes(200, {}))
  try {
    const forbidden = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ tournament: tournament('cet-2026'), sha: 's' }),
      env: envFor(),
      data: { user: user('readonly') },
    })
    assert.equal(forbidden.status, 403)

    const dupRound = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({
        tournament: { ...tournament('cet-2026'), rounds: [{ id: 'r1', maps: [] }, { id: 'r1', maps: [] }] },
        sha: 's',
      }),
      env: envFor(),
      data: { user: user('admin') },
    })
    assert.equal(dupRound.status, 400)
    assert.match((await dupRound.json()).error, /重复的 round id/)

    assert.equal(fetch.calls.length, 0, '被拦下的请求不该发到 GitHub')
  } finally {
    fetch.restore()
  }
})

test('R02 PUT 的 GitHub 错误按原状态码透传', async () => {
  const fetch = installFetch(() => jsonRes(409, { message: 'sha does not match' }))
  try {
    const res = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ tournament: tournament('cet-2026'), sha: 'stale' }),
      env: envFor(),
      data: { user: user('admin') },
    })
    assert.equal(res.status, 409)
    const payload = await res.json()
    assert.equal(payload.error, 'Failed to update')
    assert.match(JSON.stringify(payload.details), /sha does not match/)
  } finally {
    fetch.restore()
  }
})

test('R02 POST 新建成功后返回 blob sha(前端据此转入编辑模式)', async () => {
  const fetch = installFetch(() => jsonRes(201, { content: { sha: 'blob-created' } }))
  try {
    const res = await createTournament({
      request: makeRequest(tournament('new-cup')),
      env: envFor(),
      data: { user: user('contributor') },
    })
    const payload = await res.json()

    assert.equal(res.status, 200)
    assert.equal(payload.success, true)
    assert.equal(payload.id, 'new-cup')
    assert.equal(payload.sha, 'blob-created')

    assert.equal(fetch.calls[0].method, 'PUT')
    assert.match(fetch.calls[0].url, /\/contents\/data\/tournaments\/new-cup\.json$/)
    assert.equal(fetch.calls[0].body.sha, undefined, '新建不带 sha(服务端要求目标不存在)')
  } finally {
    fetch.restore()
  }
})

test('R02 POST 缺 id 或权限不足时不调用 GitHub', async () => {
  const fetch = installFetch(() => jsonRes(200, {}))
  try {
    const noId = await createTournament({
      request: makeRequest({ name: 'x' }),
      env: envFor(),
      data: { user: user('owner') },
    })
    assert.equal(noId.status, 400)
    assert.match((await noId.json()).error, /Missing tournament id/)

    const forbidden = await createTournament({
      request: makeRequest(tournament('new-cup')),
      env: envFor(),
      data: { user: user('readonly') },
    })
    assert.equal(forbidden.status, 403)
    assert.equal(fetch.calls.length, 0)
  } finally {
    fetch.restore()
  }
})

test('R02 GitHub 响应缺少 sha 时返回 null 而不是报错', async () => {
  const fetch = installFetch(() => jsonRes(200, { content: {} }))
  try {
    const res = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ tournament: tournament('cet-2026'), sha: 's' }),
      env: envFor(),
      data: { user: user('admin') },
    })
    const payload = await res.json()
    assert.equal(res.status, 200)
    assert.equal(payload.sha, null, '前端拿到 null 时不会推进基准,但仍保持可编辑')
  } finally {
    fetch.restore()
  }
})
