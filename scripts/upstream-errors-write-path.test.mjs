import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test from 'node:test'

// R14 复查：`_lib/github.ts` 的失败分类当时只接到 6 个读取端点，
// **上传（maps/upload）与批量保存（tournaments/batch）没接上** —— 而它们恰好是
// 最容易撞上凭据问题的写路径：
//   ① upload 读权威比赛 JSON 时按 404 直判「比赛 X 不存在」—— 而 GitHub 对
//      **无权访问的私有仓库**回 404 而不是 403，"token 失效"与"文件没了"状态码一样。
//      站长看到的是"这场比赛不存在"，会以为数据被删了去重传，真正的原因看不到；
//      而且前端把 4xx 当**确定性失败**（不重试），所以连重试的机会都没有。
//   ② batch 链路上的上游故障（凭据/限流/5xx）过去只有一句「HTTP xxx」的 500。
// 这个文件锁住这两条路径现在与其它端点同一套语义。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestPost: uploadMap } = await import('../functions/api/maps/upload.ts')
const { onRequestPost: batchUpdate } = await import('../functions/api/tournaments/batch.ts')
const { onRequestPut: putTournament, onRequestDelete: deleteTournament } = await import(
  '../functions/api/tournaments/[id].ts'
)
const { onRequestPut: putReferences } = await import('../functions/api/references.ts')
const { onRequestPut: putPacksManifest } = await import('../functions/api/packs-manifest.ts')

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

const REPO = 'o/r'
const REPO_PROBE = `https://api.github.com/repos/${REPO}`
const contentsPath = (id) => `/contents/data/tournaments/${id}.json`

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

/** 可编程假 fetch：routes 先匹配者生效；未匹配一律抛（暴露意外的请求）。 */
function installFetch(routes) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    const method = (options.method || 'GET').toUpperCase()
    calls.push({ method, url })
    for (const route of routes) {
      if (route.method && route.method !== method) continue
      if (!url.includes(route.match)) continue
      return route.reply(calls.length)
    }
    throw new Error(`unmocked fetch: ${method} ${url}`)
  }
  return {
    calls,
    countUrl: (fragment) => calls.filter((c) => c.url.includes(fragment)).length,
    // 注意:每个 GitHub 请求的 URL 都以 `/repos/o/r` 开头,所以"仓库探测"必须**精确匹配**
    // 整个 URL(探测是唯一不带路径后缀的那一个),用 includes 会把所有请求都算进去。
    countProbe: () => calls.filter((c) => c.url === REPO_PROBE).length,
    // 带方法计数:'/git/trees' 也会匹配读树的 '/git/trees/t1',所以断言"有没有写"必须带方法。
    count: (method, fragment) =>
      calls.filter((c) => c.method === method && c.url.includes(fragment)).length,
    restore() { globalThis.fetch = original },
  }
}

const kv = { put: async () => {}, get: async () => null, list: async () => ({ keys: [] }), delete: async () => {} }

function makeBucket() {
  const puts = []
  const store = new Map()
  return {
    puts,
    async head(key) { return store.has(key) ? { key, size: 1, etag: 'e' } : null },
    async put(key, body, options) { puts.push({ key, options }); store.set(key, true); return { key, etag: 'e' } },
    async get() { return null },
    async delete() {},
  }
}

async function makeOsz() {
  const bytes = await new JSZip()
    .file('song.osu', 'osu file format v14\n\n[Metadata]\nTitle:T\n')
    .generateAsync({ type: 'uint8array' })
  return bytes
}

async function runUpload({ tournamentId = 't', bucket = makeBucket() } = {}) {
  const form = new FormData()
  form.append('tournamentId', tournamentId)
  form.append('roundId', 'r1')
  form.append('slot', 'RC1')
  form.append('file', new File([await makeOsz()], 'x.osz'))
  const res = await uploadMap({
    request: new Request('https://ladder.test/api/maps/upload', { method: 'POST', body: form }),
    env: { GITHUB_TOKEN: 't', GITHUB_REPO: REPO, LADDER_KV: kv, R2_BUCKET: bucket },
    data: { user: { uid: '1', username: 'tester', role: 'contributor' } },
  })
  return { status: res.status, payload: await res.json().catch(() => null), bucket }
}

// ---------- 上传路径 ----------

test('上传：凭据失效（contents 404 + 仓库也看不见）→ 502 UPSTREAM_AUTH，不再报「比赛不存在」', async () => {
  const fetch = installFetch([
    { method: 'GET', match: contentsPath('t'), reply: () => json({ message: 'Not Found' }, 404) },
    { match: REPO_PROBE, reply: () => json({ message: 'Not Found' }, 404) },
  ])
  try {
    const { status, payload, bucket } = await runUpload()
    assert.equal(status, 502, '凭据问题必须 502（不是 4xx：4xx 会被前端当成确定性失败、连重试都不做）')
    assert.equal(payload.code, 'UPSTREAM_AUTH')
    assert.match(payload.error, /凭据|token/i)
    assert.equal(/不存在/.test(payload.error), false, '绝不能再说"比赛不存在"——数据并没有被删')
    assert.deepEqual(bucket.puts, [], '校验没过，一个对象都不能写')
  } finally {
    fetch.restore()
  }
})

test('上传：仓库可见但文件真不存在 → 仍是 404 TOURNAMENT_NOT_FOUND（原有语义保留）', async () => {
  const fetch = installFetch([
    { method: 'GET', match: contentsPath('ghost'), reply: () => json({ message: 'Not Found' }, 404) },
    { match: REPO_PROBE, reply: () => json({ full_name: REPO }) },
  ])
  try {
    const { status, payload, bucket } = await runUpload({ tournamentId: 'ghost' })
    assert.equal(status, 404)
    assert.equal(payload.code, 'TOURNAMENT_NOT_FOUND')
    assert.match(payload.error, /不存在/)
    assert.deepEqual(bucket.puts, [])
  } finally {
    fetch.restore()
  }
})

test('上传：限流与网络中断各归各的码，且都是 502', async () => {
  const limited = installFetch([
    {
      method: 'GET',
      match: contentsPath('t'),
      reply: () => json({ message: 'rate limited' }, 403, { 'x-ratelimit-remaining': '0' }),
    },
  ])
  try {
    const { status, payload } = await runUpload()
    assert.equal(status, 502)
    assert.equal(payload.code, 'UPSTREAM_RATE_LIMIT')
    assert.equal(limited.countProbe(), 0, '限流不需要探测仓库')
  } finally {
    limited.restore()
  }

  const offline = installFetch([])
  try {
    const { status, payload, bucket } = await runUpload()
    assert.equal(status, 502)
    assert.equal(payload.code, 'UPSTREAM_UNREACHABLE')
    assert.deepEqual(bucket.puts, [])
  } finally {
    offline.restore()
  }
})

test('上传：正常路径照旧，且不多打探测请求', async () => {
  const fetch = installFetch([
    {
      method: 'GET',
      match: contentsPath('t'),
      reply: () =>
        json({
          content: Buffer.from(JSON.stringify({ id: 't', rounds: [{ id: 'r1', maps: [{ slot: 'RC1' }] }] })).toString('base64'),
        }),
    },
  ])
  try {
    const { status, payload, bucket } = await runUpload()
    assert.equal(status, 200, JSON.stringify(payload))
    assert.equal(bucket.puts.length, 1)
    assert.equal(fetch.countProbe(), 0, '正常路径不该多一次仓库探测')
  } finally {
    fetch.restore()
  }
})

// ---------- 批量保存路径 ----------

const tournament = (id) => ({ id, name: id, abbreviation: id, keyCount: 4, year: 2026, rounds: [] })

const batchRoutes = (extra = []) => [
  { method: 'GET', match: '/git/ref/heads/main', reply: () => json({ object: { sha: 'c1' } }) },
  { method: 'GET', match: '/git/commits/c1', reply: () => json({ tree: { sha: 't1' } }) },
  { method: 'GET', match: '/git/trees/t1', reply: () => json({ tree: [], truncated: false }) },
  { method: 'POST', match: '/git/blobs', reply: () => json({ sha: 'b1' }, 201) },
  { method: 'POST', match: '/git/trees', reply: () => json({ sha: 't2' }, 201) },
  { method: 'POST', match: '/git/commits', reply: () => json({ sha: 'c2' }, 201) },
  { method: 'PATCH', match: '/git/refs/heads/main', reply: () => json({ object: { sha: 'c2' } }) },
  ...extra,
]

async function runBatch(routes) {
  const fetch = installFetch(routes)
  try {
    const res = await batchUpdate({
      request: {
        json: async () => ({ items: [{ id: 'CET', tournament: tournament('CET'), baseSha: null }], summary: 'x' }),
        headers: { get: () => null },
      },
      env: { GITHUB_TOKEN: 't', GITHUB_REPO: REPO, LADDER_KV: kv },
      data: { user: { uid: '1', username: 'tester', role: 'admin' } },
    })
    return { status: res.status, payload: await res.json().catch(() => null), fetch }
  } finally {
    fetch.restore()
  }
}

test('批量：读分支引用就 404 且仓库不可见（凭据失效）→ 502 UPSTREAM_AUTH，一个 blob 都不建', async () => {
  const { status, payload, fetch } = await runBatch([
    { method: 'GET', match: '/git/ref/heads/main', reply: () => json({ message: 'Not Found' }, 404) },
    { match: REPO_PROBE, reply: () => json({ message: 'Not Found' }, 404) },
    ...batchRoutes(),
  ])
  assert.equal(status, 502)
  assert.equal(payload.code, 'UPSTREAM_AUTH')
  assert.equal(fetch.count('POST', '/git/blobs'), 0, '上游故障时不能开始写')
  assert.equal(fetch.count('PATCH', '/git/refs/heads/main'), 0, '更不能推 ref')
})

test('批量：读分支引用 401 → 502 UPSTREAM_AUTH（不再是一句 HTTP 401 的 500）', async () => {
  const { status, payload, fetch } = await runBatch([
    { method: 'GET', match: '/git/ref/heads/main', reply: () => json({ message: 'Bad credentials' }, 401) },
    ...batchRoutes(),
  ])
  assert.equal(status, 502)
  assert.equal(payload.code, 'UPSTREAM_AUTH')
  assert.match(payload.error, /凭据|token/i)
  assert.equal(fetch.count('POST', '/git/blobs'), 0)
})

test('批量：建 blob 时被限流 → 502 UPSTREAM_RATE_LIMIT，且不建 tree/commit/不推 ref', async () => {
  const { status, payload, fetch } = await runBatch([
    {
      method: 'POST',
      match: '/git/blobs',
      reply: () => json({ message: 'rate limited' }, 403, { 'x-ratelimit-remaining': '0' }),
    },
    ...batchRoutes(),
  ])
  assert.equal(status, 502)
  assert.equal(payload.code, 'UPSTREAM_RATE_LIMIT')
  assert.equal(fetch.count('POST', '/git/trees'), 0, '不能建 tree')
  assert.equal(fetch.count('POST', '/git/commits'), 0, '不能建 commit')
  assert.equal(fetch.count('PATCH', '/git/refs/heads/main'), 0, '不能推 ref')
})

test('批量：正常路径仍是 200 success（分类没有改变成功分支，也没多打探测）', async () => {
  const { status, payload, fetch } = await runBatch(batchRoutes())
  assert.equal(status, 200, JSON.stringify(payload))
  assert.equal(payload.success, true)
  assert.equal(fetch.countProbe(), 0)
})

// ---------- 其余四处写路径（同一 bug 类的收尾）----------
// 这些端点的失败分支过去是 `jsonResponse({ ... }, res.status)`：GitHub 的 401 会被原样
// 透传成 HTTP 401，而 401 在本站的语义是「你没登录」——站长会去重新登录，
// 而真实原因是后台的 GITHUB_TOKEN 失效。现在与其它端点统一成 502 + code。

const VALID_TOURNAMENT = {
  id: 't',
  name: 't',
  abbreviation: 't',
  keyCount: 4,
  year: 2026,
  rounds: [
    {
      id: 'r1',
      name: 'r1',
      abbreviation: 'r1',
      order: 1,
      difficulty: { min: 0, max: 0, average: 0 },
      maps: [{ slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 0 }],
    },
  ],
}

function jsonRequest(body, url = 'https://x/api/test') {
  return new Request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function callWrite(handler, { request, env = {}, data = {}, params = {} }) {
  const res = await handler({
    request,
    env: { GITHUB_TOKEN: 't', GITHUB_REPO: REPO, LADDER_KV: kv, ...env },
    data: { user: { uid: '1', username: 'tester', role: 'admin' }, ...data },
    params,
  })
  return { status: res.status, payload: await res.json().catch(() => null) }
}

test('PUT 单场比赛：上游 401 → 502 UPSTREAM_AUTH（过去会透传成 401「你没登录」）', async () => {
  const fetch = installFetch([
    { method: 'PUT', match: contentsPath('t'), reply: () => json({ message: 'Bad credentials' }, 401) },
  ])
  try {
    const { status, payload } = await callWrite(putTournament, {
      request: jsonRequest({ tournament: VALID_TOURNAMENT, sha: 'sha-1' }),
      params: { id: 't' },
    })
    assert.equal(status, 502)
    assert.equal(payload.code, 'UPSTREAM_AUTH')
    assert.match(payload.error, /凭据|token/i)
  } finally {
    fetch.restore()
  }
})

test('PUT 单场比赛：GitHub 409 仍是 409 EDIT_CONFLICT（分类不能吃掉原有的冲突语义）', async () => {
  const fetch = installFetch([
    { method: 'PUT', match: contentsPath('t'), reply: () => json({ message: 'sha does not match' }, 409) },
  ])
  try {
    const { status, payload } = await callWrite(putTournament, {
      request: jsonRequest({ tournament: VALID_TOURNAMENT, sha: 'stale' }),
      params: { id: 't' },
    })
    assert.equal(status, 409)
    assert.equal(payload.code, 'EDIT_CONFLICT')
    assert.equal(fetch.count('PUT', contentsPath('t')), 1)
  } finally {
    fetch.restore()
  }
})

test('PUT 单场比赛：正常保存仍是 200（含 sha 回传）', async () => {
  const fetch = installFetch([
    {
      method: 'PUT',
      match: contentsPath('t'),
      reply: () => json({ content: { sha: 'sha-2' } }),
    },
  ])
  try {
    const { status, payload } = await callWrite(putTournament, {
      request: jsonRequest({ tournament: VALID_TOURNAMENT, sha: 'sha-1' }),
      params: { id: 't' },
    })
    assert.equal(status, 200, JSON.stringify(payload))
    assert.equal(payload.success, true)
    assert.equal(payload.sha, 'sha-2')
  } finally {
    fetch.restore()
  }
})

test('DELETE 单场比赛：上游 401 → 502 UPSTREAM_AUTH，且不写回收站', async () => {
  const fetch = installFetch([
    {
      method: 'GET',
      match: contentsPath('t'),
      reply: () => json({ content: Buffer.from('{}').toString('base64') }),
    },
    { method: 'DELETE', match: contentsPath('t'), reply: () => json({ message: 'Bad credentials' }, 401) },
  ])
  try {
    const { status, payload } = await callWrite(deleteTournament, {
      request: jsonRequest({ sha: 'sha-1' }),
      params: { id: 't' },
    })
    assert.equal(status, 502)
    assert.equal(payload.code, 'UPSTREAM_AUTH')
  } finally {
    fetch.restore()
  }
})

test('PUT references：上游 401 → 502 UPSTREAM_AUTH；正常写入仍 200', async () => {
  const bad = installFetch([
    { method: 'PUT', match: '/contents/data/references.json', reply: () => json({ message: 'Bad credentials' }, 401) },
  ])
  try {
    const { status, payload } = await callWrite(putReferences, {
      request: jsonRequest({ references: { points: [] }, sha: 'sha-1' }),
    })
    assert.equal(status, 502)
    assert.equal(payload.code, 'UPSTREAM_AUTH')
  } finally {
    bad.restore()
  }

  const ok = installFetch([
    { method: 'PUT', match: '/contents/data/references.json', reply: () => json({ content: { sha: 'sha-9' } }) },
  ])
  try {
    const { status, payload } = await callWrite(putReferences, {
      request: jsonRequest({ references: { points: [] }, sha: 'sha-1' }),
    })
    assert.equal(status, 200, JSON.stringify(payload))
    assert.equal(payload.success, true)
  } finally {
    ok.restore()
  }
})

test('PUT packs-manifest：被限流 → 502 UPSTREAM_RATE_LIMIT（不是 403）', async () => {
  const fetch = installFetch([
    {
      method: 'PUT',
      match: '/contents/data/packs-manifest.json',
      reply: () => json({ message: 'rate limited' }, 403, { 'x-ratelimit-remaining': '0' }),
    },
  ])
  try {
    const { status, payload } = await callWrite(putPacksManifest, {
      request: jsonRequest({ manifest: { lastGenerated: '2026-09-17', packs: [] }, sha: 'sha-1' }),
    })
    assert.equal(status, 502)
    assert.equal(payload.code, 'UPSTREAM_RATE_LIMIT')
  } finally {
    fetch.restore()
  }
})
