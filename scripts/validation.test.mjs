import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// R03:写入 GitHub 的 JSON 必须过运行时结构校验。
//
// 这个文件有两类用例:
//   ① 真实数据全量试跑 —— 防止"收紧校验"顺手把现有 50 场比赛挡在门外。
//      边界是先扫描真实数据才定的,所以每条放宽规则这里都有对应用例。
//   ② handler 级 —— 坏请求必须结构化 400 且**一次 GitHub 请求都不发**。
// 全部用内存 stub,不碰真实 GitHub。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  LIMITS,
  isHttpUrl,
  readJsonBody,
  validatePathId,
  validatePacksManifest,
  validateReferences,
  validateRefLadderEntries,
  validateTournament,
} = await import('../functions/api/_lib/validation.ts')
const { onRequestPost: createTournament } = await import('../functions/api/tournaments/index.ts')
const { onRequestPut: updateTournament, onRequestDelete: deleteTournament } = await import(
  '../functions/api/tournaments/[id].ts'
)
const { onRequestPost: batchSave } = await import('../functions/api/tournaments/batch.ts')
const { onRequestPut: putReferences } = await import('../functions/api/references.ts')
const { onRequestPut: putManifest } = await import('../functions/api/packs-manifest.ts')
const { onRequestPut: putLadder } = await import('../functions/api/ref-ladder.ts')

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url))

const readJson = (rel) => JSON.parse(readFileSync(`${DATA_DIR}${rel}`, 'utf-8'))
const b64 = (text) => Buffer.from(text, 'utf-8').toString('base64')

// ── 通用 stub ───────────────────────────────────────────────────────────────

const jsonRes = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data })

function makeRequest(body, { invalidJson = false } = {}) {
  return {
    json: async () => {
      if (invalidJson) throw new SyntaxError('Unexpected token < in JSON')
      return body
    },
    headers: { get: () => null },
  }
}

// 记录全部请求;未匹配到的路由直接抛错,这样"不该发请求"能被立刻发现。
function installFetch(routes) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const full = String(url)
    calls.push({ method, url: full, body: options.body ? JSON.parse(options.body) : null })
    const path = full.replace(/^https:\/\/api\.github\.com\/repos\/o\/r/, '')
    const route = routes.find((r) => r.method === method && path.startsWith(r.path))
    if (!route) throw new Error(`不该发出的请求: ${method} ${path}`)
    return typeof route.reply === 'function' ? route.reply(path) : route.reply
  }
  return {
    calls,
    restore: () => { globalThis.fetch = original },
  }
}

const env = { GITHUB_TOKEN: 'token', GITHUB_REPO: 'o/r', LADDER_KV: { put: async () => {} } }
const asUser = (role) => ({ uid: '1', username: 'tester', role })

const tournamentFixture = (id, extra = {}) => ({
  id,
  name: `Name ${id}`,
  abbreviation: 'AB',
  keyCount: 4,
  year: 2026,
  tags: [],
  rounds: [],
  customTypes: [],
  ...extra,
})

const withRoute = async (routes, fn) => {
  const fetch = installFetch(routes)
  try {
    return await fn(fetch)
  } finally {
    fetch.restore()
  }
}

// ── ① 真实数据全量试跑 ──────────────────────────────────────────────────────

test('R03 现有 50 场比赛全部通过校验（收紧边界不能误伤真实数据）', () => {
  const files = readdirSync(`${DATA_DIR}tournaments`).filter((f) => f.endsWith('.json'))
  assert.ok(files.length >= 50, `应当至少有 50 场比赛，实际 ${files.length}`)

  const failures = []
  const mismatched = []
  let rounds = 0
  let maps = 0
  for (const file of files) {
    const data = JSON.parse(readFileSync(`${DATA_DIR}tournaments/${file}`, 'utf-8'))
    const result = validateTournament(data)
    if (!result.ok) failures.push(`${file}: ${result.error}`)
    if (data.id !== file.replace('.json', '')) mismatched.push(file)
    rounds += Array.isArray(data.rounds) ? data.rounds.length : 0
    for (const round of data.rounds || []) maps += (round.maps || []).length
  }

  assert.deepEqual(failures, [], '真实数据必须全部通过')
  assert.ok(rounds > 300 && maps > 4000, `扫描量异常: rounds=${rounds} maps=${maps}`)
  // 2026-09-13 已修正唯一的文件名笔误(osu-mania-chinese-natrion-… → …national…),
  // 所以现在要求全库零不一致。PUT 侧仍保留兼容路径,但那只是防护网,不该再有数据用到。
  assert.deepEqual(mismatched, [], `文件名与内部 id 不一致: ${mismatched.join(', ')}`)
})

test('R03 现有 references / packs-manifest / ref-ladder 通过校验', () => {
  const references = validateReferences(readJson('references.json'))
  assert.equal(references.ok, true, references.ok ? '' : references.error)

  const manifest = validatePacksManifest(readJson('packs-manifest.json'))
  assert.equal(manifest.ok, true, manifest.ok ? '' : manifest.error)

  const ladder = validateRefLadderEntries(readJson('ref-ladder.json').entries)
  assert.equal(ladder.ok, true, ladder.ok ? '' : ladder.error)
  assert.ok(ladder.ok && ladder.value.length > 0)
})

// ── ② 刻意放宽的边界（都有真实数据依据） ─────────────────────────────────────

test('R03 放宽边界：空 name/缩写、缺省 name、含 / 与 &() 的 slot、纯文本 URL 都要能过', () => {
  // admin 表单 addRound 默认就写 name:'' / abbreviation:''
  const withEmptyRoundText = validateTournament(tournamentFixture('relax-one', {
    rounds: [{ id: 'round-1', name: '', abbreviation: '', order: 1, maps: [] }],
  }))
  assert.equal(withEmptyRoundText.ok, true, withEmptyRoundText.ok ? '' : withEmptyRoundText.error)

  const loose = validateTournament(tournamentFixture('relax-two', {
    // 5 条真实 URL 字段是纯文本标题，不能做协议校验
    sheetUrl: 'Tourney Method - 4 Digit osu!mania World Cup 2023 - Tourney Method',
    rounds: [{
      id: 'round-8-f',
      name: '',
      abbreviation: '',
      order: 8,
      difficulty: { min: 0, max: 0, average: 0 },
      typeDifficulties: { RC: {}, HB: {}, LN: {}, SV: {}, FCJ: { rf: 12.5 } },
      maps: [
        // 真实数据里就有 'ACC/HR1'、'FS/TB'、'GM(FL&EZ)'
        { slot: 'ACC/HR1', type: 'RC', realType: 'TC', difficulty: 0 },
        { slot: 'FS/TB', type: 'TB', realType: 'MNTB', difficulty: 0, name: '' },
        // 2 个真实槽位没有 name 字段；114 个是空串 —— 都不能硬补假值
        { slot: 'GM(FL&EZ)', type: 'RC', realType: 'GM', difficulty: 0, beatmapId: 123, beatmapsetId: 456 },
      ],
    }],
    customTypes: [{ id: 'FCJ', name: 'Finger Control Jack' }],
  }))
  assert.equal(loose.ok, true, loose.ok ? '' : loose.error)

  // 0 难度是"未填写"的约定，不能判错
  const zero = validateTournament(tournamentFixture('relax-zero', {
    rounds: [{ id: 'r1', name: '', abbreviation: '', order: 1, maps: [{ slot: 'RC1', type: 'RC', realType: 'TC', difficulty: 0 }] }],
  }))
  assert.equal(zero.ok, true, zero.ok ? '' : zero.error)
})

test('R03 未知扩展字段与自定义键型原样保留', () => {
  const input = tournamentFixture('keep-extras', {
    someFutureField: { nested: [1, 2, 3] },
    rounds: [{
      id: 'r1',
      name: 'Q',
      abbreviation: 'Q',
      order: 1,
      maps: [],
      typeDifficulties: { WEIRDTYPE: { rf: 1.5, custom: 2 } },
      extraRoundField: 'keep me',
    }],
    customTypes: [{ id: 'XX', name: 'Custom', parentType: 'RC', color: '#fff', extra: true }],
  })
  const result = validateTournament(input)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.someFutureField.nested.length, 3)
  assert.equal(result.value.rounds[0].extraRoundField, 'keep me')
  assert.equal(result.value.rounds[0].typeDifficulties.WEIRDTYPE.custom, 2)
  assert.equal(result.value.customTypes[0].extra, true)
})

// ── ③ 明确拒绝的形状 ────────────────────────────────────────────────────────

test('R03 拒绝非对象 / null / 字符串 / 数组 / rounds 字符串 / 坏数字', () => {
  for (const bad of [null, undefined, 'a string', 42, [], true]) {
    assert.equal(validateTournament(bad).ok, false, `${JSON.stringify(bad)} 不该通过`)
  }
  const roundsString = validateTournament(tournamentFixture('bad-1', { rounds: 'round-1' }))
  assert.equal(roundsString.ok, false)
  assert.match(roundsString.error, /rounds 必须是数组/)

  const nonFinite = validateTournament(tournamentFixture('bad-2', {
    rounds: [{ id: 'r1', name: '', abbreviation: '', order: 1, maps: [{ slot: 'RC1', type: 'RC', realType: 'TC', difficulty: Number.POSITIVE_INFINITY }] }],
  }))
  assert.equal(nonFinite.ok, false)
  assert.match(nonFinite.error, /有限数字/)

  const nanDifficulty = validateTournament(tournamentFixture('bad-3', {
    rounds: [{ id: 'r1', name: '', abbreviation: '', order: 1, maps: [{ slot: 'RC1', type: 'RC', realType: 'TC', difficulty: 'hard' }] }],
  }))
  assert.equal(nanDifficulty.ok, false)
})

test('R03 拒绝重复 round id 与轮内重复 slot', () => {
  const dupRounds = validateTournament(tournamentFixture('dup-1', {
    rounds: [
      { id: 'round-8', name: 'A', abbreviation: 'A', order: 1, maps: [] },
      { id: 'round-8', name: 'B', abbreviation: 'B', order: 2, maps: [] },
    ],
  }))
  assert.equal(dupRounds.ok, false)
  assert.match(dupRounds.error, /重复的 round id/)

  const dupSlots = validateTournament(tournamentFixture('dup-2', {
    rounds: [{
      id: 'r1',
      name: '',
      abbreviation: '',
      order: 1,
      maps: [
        { slot: 'RC1', type: 'RC', realType: 'TC', difficulty: 0 },
        { slot: 'RC1', type: 'RC', realType: 'TC', difficulty: 0 },
      ],
    }],
  }))
  assert.equal(dupSlots.ok, false)
  assert.match(dupSlots.error, /slot 与本轮其它谱面重复/)
})

test('R03 ID 必须是安全单段标识（挡住路径穿越）', () => {
  for (const bad of ['../outside', 'folder/name', '..', 'a b', 'a%2Fb', 'a\\b', '-leading', '']) {
    assert.equal(validatePathId(bad).ok, false, `${bad} 不该通过`)
  }
  // 混合大小写与数字、连字符都是现有约定
  for (const good of ['cet-2026', 'gbc-2025-spring-A-and-B', 'CET', 'a1']) {
    assert.equal(validatePathId(good).ok, true, `${good} 应当通过`)
  }
})

test('R03 references / manifest / ladder 的坏形状被拒绝', () => {
  assert.equal(validateReferences({ points: 'nope' }).ok, false)
  assert.equal(validateReferences({ points: [{ label: 'x', difficulty: 1, type: 'weird' }] }).ok, false)
  assert.equal(validateReferences({ points: [{ label: '', difficulty: 1 }] }).ok, false)
  assert.equal(validateReferences({ points: [{ label: 'x', difficulty: 'NaN' }] }).ok, false)

  assert.equal(validatePacksManifest([]).ok, false)
  assert.equal(validatePacksManifest({ packs: 'nope', lastGenerated: 'x' }).ok, false)
  // 下载链接必须是 http(s)
  assert.equal(validatePacksManifest({
    lastGenerated: '2026-01-01T00:00:00.000Z',
    packs: [{
      realType: 'TC', name: 'p', part: 1, mapCount: 1, totalMaps: 1, lastUpdated: '2026-01-01',
      links: { r2: 'javascript:alert(1)' },
    }],
  }).ok, false)
  assert.equal(isHttpUrl('https://example.com/a.osz'), true)
  assert.equal(isHttpUrl('javascript:alert(1)'), false)

  assert.equal(validateRefLadderEntries('nope').ok, false)
  // 旧实现会把这些静默丢掉然后返回成功
  assert.equal(validateRefLadderEntries([{ tournamentId: 'cet-2026' }]).ok, false)
  assert.equal(validateRefLadderEntries([{ roundId: 'round-1' }]).ok, false)
  // step 超范围也是错误,不再静默降级为默认 1
  assert.equal(validateRefLadderEntries([{ tournamentId: 'cet-2026', roundId: 'round-1', step: 99 }]).ok, false)
  assert.equal(validateRefLadderEntries([{ tournamentId: 'cet-2026', roundId: 'round-1', step: 1 }]).ok, true)
})

test('R03 readJsonBody 把坏 JSON 变成失败对象而不是抛异常', async () => {
  const bad = await readJsonBody(makeRequest(null, { invalidJson: true }))
  assert.equal(bad.ok, false)
  assert.match(bad.error, /不是合法 JSON/)

  const tooBig = await readJsonBody({
    json: async () => ({}),
    headers: { get: () => String(LIMITS.maxJsonBodyBytes + 1) },
  })
  assert.equal(tooBig.ok, false)
  assert.match(tooBig.error, /超过/)
})

// ── ④ handler 级：坏请求必须 400 且 0 次 GitHub 请求 ─────────────────────────

test('R03 create 拒绝 ../outside 等越界 id,且不触碰 GitHub', async () => {
  await withRoute([], async (fetch) => {
    for (const badId of ['../outside', 'folder/name', '..']) {
      const res = await createTournament({
        request: makeRequest(tournamentFixture(badId)),
        env,
        data: { user: asUser('contributor') },
      })
      assert.equal(res.status, 400, `${badId} 必须 400`)
      assert.equal((await res.json()).code, 'INVALID_TOURNAMENT')
    }
    // 缺 id 保留原文案
    const noId = await createTournament({
      request: makeRequest({ name: 'x' }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(noId.status, 400)
    assert.match((await noId.json()).error, /Missing tournament id/)

    // rounds 是字符串过去会被写进仓库
    const roundsString = await createTournament({
      request: makeRequest(tournamentFixture('bad-rounds', { rounds: 'round-1' })),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(roundsString.status, 400)

    assert.equal(fetch.calls.length, 0, '被拦下的请求一次 GitHub 请求都不该发')
  })
})

test('R03 create 接受合法数据并把 id 写进正确路径', async () => {
  await withRoute([
    { method: 'PUT', path: '/contents/data/tournaments/', reply: jsonRes(201, { content: { sha: 'blob-1' } }) },
  ], async (fetch) => {
    const res = await createTournament({
      request: makeRequest(tournamentFixture('MixedCase-Cup')),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(res.status, 200)
    assert.equal(fetch.calls.length, 1)
    assert.match(fetch.calls[0].url, /\/contents\/data\/tournaments\/MixedCase-Cup\.json$/)
  })
})

test('R03 PUT 坏 JSON / 缺 sha / 形状错误都是 400,不触碰 GitHub', async () => {
  await withRoute([], async (fetch) => {
    const badJson = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest(null, { invalidJson: true }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(badJson.status, 400, '坏 JSON 不能变成 500')

    const noSha = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ tournament: tournamentFixture('cet-2026') }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(noSha.status, 400)
    assert.match((await noSha.json()).error, /缺少编辑基准 sha/)

    const badId = await updateTournament({
      params: { id: '../outside' },
      request: makeRequest({ tournament: tournamentFixture('../outside'), sha: 's' }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(badId.status, 400)

    const noTournament = await updateTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ sha: 's' }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(noTournament.status, 400)

    assert.equal(fetch.calls.length, 0)
  })
})

test('R03 PUT 拒绝把 A 比赛的数据写进 B 比赛的文件', async () => {
  await withRoute([
    {
      method: 'GET',
      path: '/contents/data/tournaments/other-cup.json',
      reply: jsonRes(200, { content: b64(JSON.stringify({ id: 'other-cup' })) }),
    },
  ], async (fetch) => {
    const res = await updateTournament({
      params: { id: 'other-cup' },
      request: makeRequest({ tournament: tournamentFixture('cet-2026'), sha: 's' }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'ID_MISMATCH')
    // 只发了那一次探测请求,没有写
    assert.equal(fetch.calls.filter((c) => c.method === 'PUT').length, 0)
  })
})

test('R03 PUT 的兼容路径:已经是「文件名≠内部 id」的文件还能继续保存', async () => {
  // 真实数据里那个唯一的不一致实例(osu-mania-chinese-natrion-… 文件名笔误)已于
  // 2026-09-13 改名修正,所以这里用 stub 构造同样的情形来锁兼容路径:
  // 规则是"不允许制造新的不一致,但允许继续保存已经是这种状态的",否则那场比赛会被永久锁死。
  const legacyFileId = 'osu-mania-chinese-natrion-cup-4k-2026-rebirth'
  const legacyInnerId = 'osu-mania-chinese-national-cup-4k-2026-rebirth'
  await withRoute([
    {
      method: 'GET',
      path: `/contents/data/tournaments/${legacyFileId}.json`,
      reply: jsonRes(200, { content: b64(JSON.stringify({ id: legacyInnerId, rounds: [] })) }),
    },
    { method: 'PUT', path: `/contents/data/tournaments/${legacyFileId}.json`, reply: jsonRes(200, { content: { sha: 'new' } }) },
  ], async (fetch) => {
    const res = await updateTournament({
      params: { id: legacyFileId },
      request: makeRequest({ tournament: tournamentFixture(legacyInnerId), sha: 'old' }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(res.status, 200, '历史不一致文件必须还能保存,否则等于把这场比赛锁死')
    assert.equal(fetch.calls.filter((c) => c.method === 'PUT').length, 1)
  })
})

test('R03 DELETE 需要 path id 与 sha,但不要求 body.id 也不看 round 数据好坏', async () => {
  await withRoute([
    { method: 'GET', path: '/contents/data/tournaments/cet-2026.json', reply: jsonRes(200, { sha: 's', content: b64('{}') }) },
    { method: 'DELETE', path: '/contents/data/tournaments/cet-2026.json', reply: jsonRes(200, {}) },
  ], async (fetch) => {
    // 坏 round 数据(rounds 是字符串)不阻止删除
    const res = await deleteTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({ sha: 's', tournament: { rounds: 'broken' } }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(res.status, 200)
    assert.equal(fetch.calls.filter((c) => c.method === 'DELETE').length, 1)
  })

  await withRoute([], async (fetch) => {
    const noSha = await deleteTournament({
      params: { id: 'cet-2026' },
      request: makeRequest({}),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(noSha.status, 400)
    const badId = await deleteTournament({
      params: { id: '../outside' },
      request: makeRequest({ sha: 's' }),
      env,
      data: { user: asUser('admin') },
    })
    assert.equal(badId.status, 400)
    assert.equal(fetch.calls.length, 0)
  })
})

test('R03 batch 逐项做 schema 校验,一项坏就整批 400 且零写入', async () => {
  await withRoute([], async (fetch) => {
    const res = await batchSave({
      request: makeRequest({
        items: [
          { id: 'good-cup', tournament: tournamentFixture('good-cup'), baseSha: 'sha-1' },
          { id: 'bad-cup', tournament: tournamentFixture('bad-cup', { rounds: 'round-1' }), baseSha: 'sha-2' },
        ],
      }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(res.status, 400)
    const payload = await res.json()
    assert.equal(payload.code, 'INVALID_BATCH')
    assert.match(payload.error, /bad-cup/)
    assert.equal(fetch.calls.length, 0)
  })
})

test('R03 batch 限制项数与 summary 长度', async () => {
  await withRoute([], async (fetch) => {
    const many = Array.from({ length: LIMITS.maxBatchItems + 1 }, (_, i) => ({
      id: `cup-${i}`,
      tournament: tournamentFixture(`cup-${i}`),
      baseSha: null,
    }))
    const tooMany = await batchSave({
      request: makeRequest({ items: many }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(tooMany.status, 400)
    assert.match((await tooMany.json()).error, /最多提交/)

    const longSummary = await batchSave({
      request: makeRequest({
        items: [{ id: 'cup-1', tournament: tournamentFixture('cup-1'), baseSha: null }],
        summary: 'x'.repeat(LIMITS.maxSummaryLength + 1),
      }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(longSummary.status, 400)
    assert.match((await longSummary.json()).error, /summary 最多/)

    assert.equal(fetch.calls.length, 0)
  })
})

test('R03 references / manifest / ref-ladder 的 PUT 拦截坏形状', async () => {
  await withRoute([], async (fetch) => {
    const badRefs = await putReferences({
      request: makeRequest({ references: { points: 'nope' }, sha: 's' }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(badRefs.status, 400)

    const noShaRefs = await putReferences({
      request: makeRequest({ references: { points: [] } }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(noShaRefs.status, 400)

    const badManifest = await putManifest({
      request: makeRequest({ manifest: { packs: 'nope', lastGenerated: 'x' }, sha: 's' }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(badManifest.status, 400)

    // 旧的 ref-ladder 会把非法项丢掉并照常返回 200
    const badLadder = await putLadder({
      request: makeRequest({ entries: [{ tournamentId: 'cet-2026' }], sha: 's' }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(badLadder.status, 400)
    assert.match((await badLadder.json()).error, /roundId/)

    assert.equal(fetch.calls.length, 0)
  })

  // 合法数据仍然要能保存
  await withRoute([
    { method: 'PUT', path: '/contents/data/ref-ladder.json', reply: jsonRes(200, {}) },
  ], async (fetch) => {
    const ok = await putLadder({
      request: makeRequest({ entries: [{ tournamentId: 'cet-2026', roundId: 'round-1' }], sha: 's' }),
      env,
      data: { user: asUser('contributor') },
    })
    assert.equal(ok.status, 200)
    const saved = JSON.parse(Buffer.from(fetch.calls[0].body.content, 'base64').toString('utf8'))
    assert.deepEqual(saved.entries, [{ tournamentId: 'cet-2026', roundId: 'round-1' }])
  })
})
