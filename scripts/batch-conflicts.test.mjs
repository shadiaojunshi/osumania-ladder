import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

import {
  evaluateBatchConflicts,
  headMovedConflicts,
  parseBatchItems,
  tournamentPath,
  treeToShaMap,
} from '../functions/api/_lib/batchConflicts.ts'

// Functions 源码用省略扩展名的相对 import(esbuild 打包),node 需要这个 loader 才能加载。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestPost } = await import('../functions/api/tournaments/batch.ts')

// R01:批量保存必须有编辑基准。全部用内存 stub,不碰真实 GitHub。
const user = { uid: '1', username: 'tester', role: 'admin' }
const env = { GITHUB_TOKEN: 'token', GITHUB_REPO: 'o/r', LADDER_KV: { put: async () => {} } }

const jsonRes = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
})

function makeRequest(body, { invalidJson = false } = {}) {
  return {
    json: async () => {
      if (invalidJson) throw new Error('Unexpected token')
      return body
    },
    headers: { get: () => null },
  }
}

function tournament(id) {
  return { id, name: id, abbreviation: id, keyCount: 4, year: 2026, rounds: [] }
}

// 记录所有请求,并按 method+path 路由到内存响应。
function installFetch(routes) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const full = String(url)
    const record = { method, url: full, body: options.body ? JSON.parse(options.body) : null }
    calls.push(record)
    const path = full.replace(/^https:\/\/api\.github\.com\/repos\/o\/r/, '')
    const route = routes.find((r) => r.method === method && path.startsWith(r.path))
    if (!route) throw new Error(`unexpected request: ${method} ${path}`)
    return typeof route.reply === 'function' ? route.reply(record, path) : route.reply
  }
  return {
    calls,
    restore: () => { globalThis.fetch = original },
    count: (method, pathStart) => calls.filter((c) => c.method === method && c.url.includes(pathStart)).length,
  }
}

const baseRoutes = ({ tree = [], truncated = false, refStatus = 200 } = {}) => [
  { method: 'GET', path: '/git/ref/heads/main', reply: jsonRes(200, { object: { sha: 'commit1' } }) },
  { method: 'GET', path: '/git/commits/commit1', reply: jsonRes(200, { tree: { sha: 'tree1' } }) },
  {
    method: 'GET',
    path: '/git/trees/tree1',
    reply: jsonRes(200, { tree, truncated }),
  },
  { method: 'POST', path: '/git/blobs', reply: (() => { let n = 0; return () => jsonRes(201, { sha: `blob-${++n}` }) })() },
  { method: 'POST', path: '/git/trees', reply: jsonRes(201, { sha: 'tree2' }) },
  { method: 'POST', path: '/git/commits', reply: jsonRes(201, { sha: 'commit2' }) },
  { method: 'PATCH', path: '/git/refs/heads/main', reply: jsonRes(refStatus, { object: { sha: 'commit2' } }) },
]

async function runBatch(body, { routes = baseRoutes(), invalidJson = false } = {}) {
  const fetch = installFetch(routes)
  try {
    const res = await onRequestPost({ request: makeRequest(body, { invalidJson }), env, data: { user } })
    const payload = await res.json()
    return { status: res.status, payload, fetch }
  } finally {
    fetch.restore()
  }
}

// ---------- 纯函数 ----------

test('R01 请求项必须显式带 baseSha,缺失不能当作新建', () => {
  assert.match(parseBatchItems({}).error, /items/)
  assert.match(parseBatchItems({ items: [] }).error, /没有要保存/)
  assert.match(parseBatchItems({ items: [{ id: 'a', tournament: tournament('a') }] }).error, /缺少 baseSha/)

  const ok = parseBatchItems({ items: [{ id: 'a', tournament: tournament('a'), baseSha: null }] })
  assert.ok(ok.items)
  assert.equal(ok.items[0].baseSha, null)

  assert.match(parseBatchItems({ items: [{ id: 'a', tournament: tournament('a'), baseSha: '' }] }).error, /baseSha/)
  assert.match(
    parseBatchItems({
      items: [
        { id: 'a', tournament: tournament('a'), baseSha: null },
        { id: 'a', tournament: tournament('a'), baseSha: null },
      ],
    }).error,
    /重复的 id/,
  )
})

test('R01 基准比对:一致通过,被改/被删/撞名全部算冲突', () => {
  const tree = treeToShaMap([
    { path: 'data/tournaments/CET.json', sha: 'sha-cet', type: 'blob' },
    { path: 'data/tournaments/SWM2.json', sha: 'sha-swm2', type: 'blob' },
    { path: 'data/tournaments', sha: 'tree-dir', type: 'tree' },
  ])

  const unaffected = evaluateBatchConflicts(
    [{ id: 'CET', tournament: tournament('CET'), baseSha: 'sha-cet' }],
    tree,
  )
  assert.deepEqual(unaffected, [], '基准一致且其它文件变动不影响本文件')

  const modified = evaluateBatchConflicts(
    [{ id: 'CET', tournament: tournament('CET'), baseSha: 'sha-old' }],
    tree,
  )
  assert.deepEqual(modified, [{ id: 'CET', reason: 'modified', expected: 'sha-old', actual: 'sha-cet' }])

  const missing = evaluateBatchConflicts(
    [{ id: 'GONE', tournament: tournament('GONE'), baseSha: 'sha-x' }],
    tree,
  )
  assert.equal(missing[0].reason, 'missing')

  const createOk = evaluateBatchConflicts(
    [{ id: 'NEW', tournament: tournament('NEW'), baseSha: null }],
    tree,
  )
  assert.deepEqual(createOk, [], '新建且不存在 → 通过')

  const nameTaken = evaluateBatchConflicts(
    [{ id: 'CET', tournament: tournament('CET'), baseSha: null }],
    tree,
  )
  assert.deepEqual(nameTaken, [{ id: 'CET', reason: 'exists', expected: null, actual: 'sha-cet' }])

  assert.equal(headMovedConflicts([{ id: 'CET' }])[0].reason, 'head-moved')
})

// ---------- handler ----------

test('R01 基准冲突返回 409,且一个文件都不写', async () => {
  const fetch = installFetch(baseRoutes({
    tree: [{ path: 'data/tournaments/CET.json', sha: 'sha-new', type: 'blob' }],
  }))
  try {
    const res = await onRequestPost({
      request: makeRequest({
        items: [{ id: 'CET', tournament: tournament('CET'), baseSha: 'sha-old' }],
        summary: 'test',
      }),
      env,
      data: { user },
    })
    const payload = await res.json()

    assert.equal(res.status, 409)
    assert.equal(payload.code, 'EDIT_CONFLICT')
    assert.equal(payload.conflicts.length, 1)
    assert.equal(payload.conflicts[0].reason, 'modified')
    assert.equal(fetch.count('POST', '/git/blobs'), 0, '冲突时不创建 blob')
    assert.equal(fetch.count('POST', '/git/trees'), 0, '冲突时不创建 tree')
    assert.equal(fetch.count('POST', '/git/commits'), 0, '冲突时不创建 commit')
    assert.equal(fetch.count('PATCH', '/git/refs/heads/main'), 0, '冲突时不更新 ref')
  } finally {
    fetch.restore()
  }
})

test('R01 一次提交里含冲突文件时其它文件也不写', async () => {
  const { status, payload, fetch } = await runBatch({
    items: [
      { id: 'CET', tournament: tournament('CET'), baseSha: 'sha-cet' },
      { id: 'SWM2', tournament: tournament('SWM2'), baseSha: 'sha-stale' },
    ],
  }, {
    routes: baseRoutes({
      tree: [
        { path: 'data/tournaments/CET.json', sha: 'sha-cet', type: 'blob' },
        { path: 'data/tournaments/SWM2.json', sha: 'sha-swm2', type: 'blob' },
      ],
    }),
  })

  assert.equal(status, 409)
  assert.deepEqual(payload.conflicts.map((c) => c.id), ['SWM2'])
  assert.equal(fetch.count('POST', '/git/blobs'), 0)
})

test('R01 新建撞名也算冲突', async () => {
  const { status, payload } = await runBatch({
    items: [{ id: 'CET', tournament: tournament('CET'), baseSha: null }],
  }, {
    routes: baseRoutes({ tree: [{ path: 'data/tournaments/CET.json', sha: 'sha-cet', type: 'blob' }] }),
  })
  assert.equal(status, 409)
  assert.equal(payload.conflicts[0].reason, 'exists')
})

test('R01 全部通过时返回每个文件的新 blob sha,并以非强制方式更新 ref', async () => {
  const { status, payload, fetch } = await runBatch({
    items: [
      { id: 'CET', tournament: tournament('CET'), baseSha: 'sha-cet' },
      { id: 'NEW', tournament: tournament('NEW'), baseSha: null },
    ],
    summary: 'Batch test',
  }, {
    routes: baseRoutes({ tree: [{ path: 'data/tournaments/CET.json', sha: 'sha-cet', type: 'blob' }] }),
  })

  assert.equal(status, 200)
  assert.equal(payload.success, true)
  assert.equal(payload.count, 2)
  assert.deepEqual(payload.files.map((f) => f.id), ['CET', 'NEW'])
  assert.ok(payload.files.every((f) => typeof f.sha === 'string' && f.sha.length > 0))

  const commitCall = fetch.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/commits'))
  assert.deepEqual(commitCall.body.parents, ['commit1'], 'commit parent 必须是比对用的基准 commit')
  const refCall = fetch.calls.find((c) => c.method === 'PATCH')
  assert.equal(refCall.body.force, false, 'ref 更新必须非强制')
  assert.equal(refCall.body.sha, 'commit2')
})

test('R01 HEAD 在比对之后被推进 → 409 head-moved,不重试', async () => {
  const { status, payload, fetch } = await runBatch({
    items: [{ id: 'CET', tournament: tournament('CET'), baseSha: 'sha-cet' }],
  }, {
    routes: [
      ...baseRoutes({
        tree: [{ path: 'data/tournaments/CET.json', sha: 'sha-cet', type: 'blob' }],
        refStatus: 422,
      }),
    ],
  })

  assert.equal(status, 409)
  assert.equal(payload.code, 'EDIT_CONFLICT')
  assert.equal(payload.conflicts[0].reason, 'head-moved')
  assert.equal(fetch.count('PATCH', '/git/refs/heads/main'), 1, '不重试')
})

test('R01 树被截断时退回逐文件读取,读取失败不当成"文件不存在"', async () => {
  const fetch = installFetch([
    ...baseRoutes({ truncated: true }),
    {
      method: 'GET',
      path: '/contents/data/tournaments/CET.json',
      reply: (() => { let n = 0; return () => jsonRes(200, { sha: 'sha-cet' }) }) (),
    },
    { method: 'GET', path: '/contents/data/tournaments/NEW.json', reply: jsonRes(404, { message: 'Not Found' }) },
  ])
  try {
    const okRes = await onRequestPost({
      request: makeRequest({
        items: [
          { id: 'CET', tournament: tournament('CET'), baseSha: 'sha-cet' },
          { id: 'NEW', tournament: tournament('NEW'), baseSha: null },
        ],
      }),
      env,
      data: { user },
    })
    assert.equal(okRes.status, 200)
    assert.equal(fetch.count('GET', '/contents/data/tournaments/'), 2)
  } finally {
    fetch.restore()
  }

  const broken = installFetch([
    ...baseRoutes({ truncated: true }),
    { method: 'GET', path: '/contents/data/tournaments/CET.json', reply: jsonRes(500, { message: 'boom' }) },
  ])
  try {
    const res = await onRequestPost({
      request: makeRequest({ items: [{ id: 'CET', tournament: tournament('CET'), baseSha: 'sha-cet' }] }),
      env,
      data: { user },
    })
    assert.equal(res.status, 500, '读取基准失败必须报错')
    assert.equal(broken.count('POST', '/git/blobs'), 0, '读取失败绝不能继续写')
  } finally {
    broken.restore()
  }
})

test('R01 旧格式与坏请求体一律 400,不触碰 GitHub', async () => {
  const legacy = await runBatch({ changes: { CET: tournament('CET') }, summary: 'x' })
  assert.equal(legacy.status, 400)
  assert.equal(legacy.payload.code, 'INVALID_BATCH')
  assert.equal(legacy.fetch.calls.length, 0)

  const noBase = await runBatch({ items: [{ id: 'CET', tournament: tournament('CET') }] })
  assert.equal(noBase.status, 400)
  assert.match(noBase.payload.error, /baseSha/)
  assert.equal(noBase.fetch.calls.length, 0)

  const badJson = await runBatch(null, { invalidJson: true })
  assert.equal(badJson.status, 400)
  assert.equal(badJson.payload.code, 'INVALID_BATCH')

  const badRoundIds = await runBatch({
    items: [{
      id: 'CET',
      baseSha: null,
      tournament: { ...tournament('CET'), rounds: [{ id: 'r1', maps: [] }, { id: 'r1', maps: [] }] },
    }],
  })
  assert.equal(badRoundIds.status, 400)
  assert.match(badRoundIds.payload.error, /重复的 round id/)
  assert.equal(badRoundIds.fetch.calls.length, 0)
})

test('R01 tournamentPath 只落在 data/tournaments 下', () => {
  assert.equal(tournamentPath('cet-2026'), 'data/tournaments/cet-2026.json')
})
