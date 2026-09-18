import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// R14：这些端点在 GitHub 出错时过去一律降级成「空数据」——
// ref-ladder / packs-manifest 回 `{ entries: [] }` / 空清单，tournaments/[id] 把**所有**
// 失败都回 404。站长看到的是「标尺没了 / 包没了 / 这场比赛没了」，而真实原因可能是
// GITHUB_TOKEN 失效或限流。数据其实一份没少。
//
// 最要命的一条：**GitHub 对无权访问的私有仓库回 404 而不是 403** ——
// 「token 失效」与「文件真的不存在」在状态码上完全一样，所以 404 必须再探一下
// 仓库本身还看不看得见，不能直接当成「不存在」。
//（2026-11 token 到期时后台三个 tab 全空，就是这个原因。）
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { classifyGithubFailure, githubFetch } = await import('../functions/api/_lib/github.ts')
const { onRequestGet: getRefLadder } = await import('../functions/api/ref-ladder.ts')
const { onRequestGet: getPacksManifest } = await import('../functions/api/packs-manifest.ts')
const { onRequestGet: getTournament } = await import('../functions/api/tournaments/[id].ts')
const { onRequestGet: getTournamentList } = await import('../functions/api/tournaments/index.ts')
const { onRequestGet: getReferences } = await import('../functions/api/references.ts')

const REPO = 'owner/repo'
const env = { GITHUB_TOKEN: 'test-token', GITHUB_REPO: REPO }
const repoProbe = `https://api.github.com/repos/${REPO}`

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

/** GitHub Contents API 的单个文件响应：content 是 base64。 */
const contentFile = (obj, sha = 'sha-1') =>
  json({ content: Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'), sha })

/** 装一个可编程的假 fetch：routes 按顺序匹配，第一个命中的生效。 */
function installFetch(routes) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    for (const route of routes) {
      if (route.test(url)) return route.reply(url)
    }
    throw new Error(`unmocked fetch: ${url}`)
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

async function callGet(handler, { params = {}, request } = {}) {
  const res = await handler({
    request: request ?? new Request('https://x/api/test'),
    env,
    params,
    data: {},
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ---------- 分类函数 ----------

test('R14 classify：401 判为凭据失效且回 502（401 是「你没登录」的语义，不能被上游占用）', async () => {
  const f = await classifyGithubFailure(json({ message: 'Bad credentials' }, 401), env)
  assert.equal(f.status, 502)
  assert.equal(f.code, 'UPSTREAM_AUTH')
  assert.match(f.error, /GITHUB_TOKEN/)
})

test('R14 classify：403 且配额耗尽判为限流', async () => {
  const f = await classifyGithubFailure(
    json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' }),
    env,
  )
  assert.equal(f.status, 502)
  assert.equal(f.code, 'UPSTREAM_RATE_LIMIT')
})

test('R14 classify：429 一并判为限流', async () => {
  const f = await classifyGithubFailure(json({ message: 'slow down' }, 429), env)
  assert.equal(f.code, 'UPSTREAM_RATE_LIMIT')
})

test('R14 classify：403 但配额没用完 = 权限问题，不能报成限流', async () => {
  const f = await classifyGithubFailure(
    json({ message: 'Forbidden' }, 403, { 'x-ratelimit-remaining': '4999' }),
    env,
  )
  assert.equal(f.code, 'UPSTREAM_FORBIDDEN')
})

test('R14 classify：5xx 判为上游故障', async () => {
  const f = await classifyGithubFailure(json({ message: 'Server Error' }, 502), env)
  assert.equal(f.status, 502)
  assert.equal(f.code, 'UPSTREAM_ERROR')
})

test('R14 classify：404 + 仓库可见 = 文件真的不存在', async () => {
  const fake = installFetch([
    { test: (u) => u === repoProbe, reply: () => json({ full_name: REPO }) },
  ])
  try {
    const f = await classifyGithubFailure(json({ message: 'Not Found' }, 404), env)
    assert.equal(f.status, 404)
    assert.equal(f.code, 'NOT_FOUND')
  } finally {
    fake.restore()
  }
})

test('R14 classify：404 + 仓库也看不见 = token 失效（私有仓库被拒回 404 而非 403）', async () => {
  const fake = installFetch([
    { test: (u) => u === repoProbe, reply: () => json({ message: 'Not Found' }, 404) },
  ])
  try {
    const f = await classifyGithubFailure(json({ message: 'Not Found' }, 404), env)
    assert.equal(f.status, 502, '绝不能当成「文件不存在」')
    assert.equal(f.code, 'UPSTREAM_AUTH')
    assert.match(f.error, /GITHUB_TOKEN/)
  } finally {
    fake.restore()
  }
})

test('R14 classify：404 且探测请求本身失败 → 报上游故障，不伪装成「不存在」', async () => {
  const fake = installFetch([{ test: () => true, reply: () => json({ message: 'boom' }, 500) }])
  try {
    const f = await classifyGithubFailure(json({ message: 'Not Found' }, 404), env)
    assert.equal(f.status, 502)
    assert.equal(f.code, 'UPSTREAM_ERROR')
  } finally {
    fake.restore()
  }
})

test('R14 githubFetch：网络中断不抛异常，归到 UPSTREAM_UNREACHABLE', async () => {
  const fake = installFetch([
    {
      test: () => true,
      reply: () => {
        throw new Error('ECONNRESET')
      },
    },
  ])
  try {
    const res = await githubFetch('/contents/data/ref-ladder.json', env)
    assert.equal(res.ok, false)
    const f = await classifyGithubFailure(res, env)
    assert.equal(f.status, 502)
    assert.equal(f.code, 'UPSTREAM_UNREACHABLE')
  } finally {
    fake.restore()
  }
})

// ---------- 端点：不能再把上游故障伪装成空数据 ----------

test('R14 ref-ladder：token 失效回 502，不再回「空标尺」', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/ref-ladder.json'),
      reply: () => json({ message: 'Bad credentials' }, 401),
    },
  ])
  try {
    const { status, body } = await callGet(getRefLadder)
    assert.equal(status, 502)
    assert.equal(body.code, 'UPSTREAM_AUTH')
    assert.equal(body.data, undefined, '回了 { data: { entries: [] } } 的话站长看到就是「标尺被清空了」')
  } finally {
    fake.restore()
  }
})

test('R14 ref-ladder：404 但仓库不可见（token 失效）= 502，不能当空链', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/ref-ladder.json'),
      reply: () => json({ message: 'Not Found' }, 404),
    },
    { test: (u) => u === repoProbe, reply: () => json({ message: 'Not Found' }, 404) },
  ])
  try {
    const { status, body } = await callGet(getRefLadder)
    assert.equal(status, 502)
    assert.equal(body.code, 'UPSTREAM_AUTH')
  } finally {
    fake.restore()
  }
})

test('R14 ref-ladder：仓库可见但文件还没建 = 合法的空链（200）', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/ref-ladder.json'),
      reply: () => json({ message: 'Not Found' }, 404),
    },
    { test: (u) => u === repoProbe, reply: () => json({ full_name: REPO }) },
  ])
  try {
    const { status, body } = await callGet(getRefLadder)
    assert.equal(status, 200)
    assert.deepEqual(body.data.entries, [])
    assert.equal(body.sha, null)
  } finally {
    fake.restore()
  }
})

test('R14 ref-ladder：正常路径不变（entries + sha 照常返回，且不多打一次探测）', async () => {
  const entries = [{ tournamentId: 'mwc', roundId: 'qf' }]
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/ref-ladder.json'),
      reply: () => contentFile({ entries }, 'sha-abc'),
    },
  ])
  try {
    const { status, body } = await callGet(getRefLadder)
    assert.equal(status, 200)
    assert.deepEqual(body.data.entries, entries)
    assert.equal(body.sha, 'sha-abc')
    assert.deepEqual(fake.calls, ['https://api.github.com/repos/owner/repo/contents/data/ref-ladder.json'])
  } finally {
    fake.restore()
  }
})

test('R14 packs-manifest：token 失效回 502，不再回「空清单」', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/packs-manifest.json'),
      reply: () => json({ message: 'Bad credentials' }, 401),
    },
  ])
  try {
    const { status, body } = await callGet(getPacksManifest)
    assert.equal(status, 502)
    assert.equal(body.code, 'UPSTREAM_AUTH')
    assert.equal(body.manifest, undefined, '回了空 manifest 的话站长看到就是「一个包都没有」')
  } finally {
    fake.restore()
  }
})

test('R14 单场比赛：token 失效回 502，不再伪装成 404「这场比赛不存在」', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/tournaments/cup.json'),
      reply: () => json({ message: 'Bad credentials' }, 401),
    },
  ])
  try {
    const { status, body } = await callGet(getTournament, { params: { id: 'cup' } })
    assert.equal(status, 502)
    assert.equal(body.code, 'UPSTREAM_AUTH')
  } finally {
    fake.restore()
  }
})

test('R14 单场比赛：真的不存在仍是 404（原有语义保留）', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/tournaments/cup.json'),
      reply: () => json({ message: 'Not Found' }, 404),
    },
    { test: (u) => u === repoProbe, reply: () => json({ full_name: REPO }) },
  ])
  try {
    const { status, body } = await callGet(getTournament, { params: { id: 'cup' } })
    assert.equal(status, 404)
    assert.equal(body.code, 'NOT_FOUND')
  } finally {
    fake.restore()
  }
})

test('R14 比赛列表：token 失效回 502，不再把 GitHub 的 401 透传给前端（那会显示成「你没登录」）', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/tournaments'),
      reply: () => json({ message: 'Bad credentials' }, 401),
    },
  ])
  try {
    const { status, body } = await callGet(getTournamentList)
    assert.equal(status, 502)
    assert.equal(body.code, 'UPSTREAM_AUTH')
    assert.notEqual(status, 401)
  } finally {
    fake.restore()
  }
})

test('R14 比赛列表：正常路径仍返回数组（前端靠 Array.isArray 判断）', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/tournaments'),
      reply: () =>
        json([
          { name: 'a-cup.json', sha: 's1' },
          { name: 'README.md', sha: 's2' },
        ]),
    },
  ])
  try {
    const { status, body } = await callGet(getTournamentList)
    assert.equal(status, 200)
    assert.ok(Array.isArray(body), `列表端点必须回数组，实际 ${JSON.stringify(body)}`)
    assert.deepEqual(body, [{ id: 'a-cup', sha: 's1' }])
  } finally {
    fake.restore()
  }
})

test('R14 参考点：token 失效回 502，不再透传 GitHub 的状态码', async () => {
  const fake = installFetch([
    {
      test: (u) => u.includes('/contents/data/references.json'),
      reply: () => json({ message: 'Bad credentials' }, 401),
    },
  ])
  try {
    const { status, body } = await callGet(getReferences)
    assert.equal(status, 502)
    assert.equal(body.code, 'UPSTREAM_AUTH')
  } finally {
    fake.restore()
  }
})
