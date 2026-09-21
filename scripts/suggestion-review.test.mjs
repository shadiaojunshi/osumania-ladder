import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestPost, onRequestGet } = await import('../functions/api/suggestions/index.ts')
const { checkDate, readState, itemKey } = await import('../functions/api/_lib/suggestions.ts')
const { beginSuggestionBatch, recordCandidate, recoverCandidate, finishSuggestionBatch, cancelSuggestionBatch } = await import('../functions/api/_lib/suggestionBatch.ts')
const { targetFingerprint } = await import('../src/lib/suggestions/fingerprint.ts')
const { applySuggestPlan } = await import('../src/lib/suggestions/apply.ts')
const { onRequestPost: saveBatch } = await import('../functions/api/tournaments/batch.ts')
const { planSuggestChange } = await import('../src/lib/suggestions/patch.ts')

function bucket() {
  const records = new Map(); let version = 0
  return {
    records,
    async get(key) {
      const value = records.get(key)
      return value ? { etag: value.etag, text: async () => value.body, json: async () => JSON.parse(value.body) } : null
    },
    async put(key, body, options) {
      const old = records.get(key), condition = options?.onlyIf
      if (condition?.etagDoesNotMatch === '*' && old) return null
      if (condition?.etagMatches && old?.etag !== condition.etagMatches) return null
      const value = { body: String(body), etag: String(++version) }; records.set(key, value)
      return { etag: value.etag }
    },
    async list({ prefix, limit }) { return { objects: [...records.keys()].filter(key => key.startsWith(prefix)).slice(0, limit).map(key => ({ key })), truncated: false } },
  }
}
const admin = { uid: '1', username: 'reviewer', role: 'admin' }
const tid = 'cup'
const tournament = { id: tid, name: 'Cup 比赛', abbreviation: 'CUP', year: 2026, keyCount: 4, rounds: [{ id: 'final', name: '决赛', abbreviation: 'F', order: 1, difficulty: { min: 2, max: 2, average: 2 }, typeDifficulties: { RC: { rf: 2 } }, maps: [{ slot: 'RC1', type: 'RC', realType: 'SS', name: 'Song', beatmapId: 1234, difficulty: 2 }] }] }

async function fixture() {
  const env = { GITHUB_TOKEN: 'test', GITHUB_REPO: 'test/repo', SUGGESTIONS: bucket(), SUGGESTION_REVIEWS: bucket() }
  const id = crypto.randomUUID(), date = '2026-09-21', draftId = crypto.randomUUID()
  const proposal = { kind: 'slot.difficulty', target: { tournamentId: tid, roundId: 'final', slot: 'RC1', beatmapId: 1234 }, value: { difficulty: 3 } }
  const submission = { schemaVersion: 1, clientRequestId: id, datasetVersion: 'test', baseFingerprint: await targetFingerprint(tournament, proposal.target), proposal }
  await env.SUGGESTIONS.put(itemKey(id, date), JSON.stringify({ id, receivedAt: date + 'T00:00:00.000Z', ipHash: 'private', submission }))
  const ref = { id, date, draftId, revision: 0 }
  const post = async (action, extra = {}, user = admin) => {
    const request = new Request('https://site/api/suggestions', { method: 'POST', body: JSON.stringify({ action, ref, ...extra }) })
    const response = await onRequestPost({ env, request, data: { user } })
    return { status: response.status, body: await response.json() }
  }
  return { env, ref, post }
}

function mockGithub(t, handler) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname
    if (handler) { const result = await handler(path, options, new URL(url)); if (result) return result }
    if (path.includes('/contents/')) return Response.json({ sha: 'a'.repeat(40), content: Buffer.from(JSON.stringify(tournament)).toString('base64') })
    throw new Error(`Unexpected GitHub call: ${path}`)
  }
  t.after(() => { globalThis.fetch = original })
}

test('review APIs reject anonymous, readonly and contributor users before accessing storage', async () => {
  const f = await fixture()
  for (const user of [undefined, { ...admin, role: 'readonly' }, { ...admin, role: 'contributor' }]) {
    const response = await onRequestGet({ env: f.env, request: new Request('https://site/api/suggestions'), data: { user } })
    assert.equal(response.status, user ? 403 : 401)
  }
})

test('UTC date validation rejects rollover and invalid dates', () => {
  for (const value of ['2026-02-30', '2026-99-99', '../x', undefined]) assert.throws(() => checkDate(value))
  assert.equal(checkDate('2026-09-21'), '2026/09/21')
})

test('list strips IP hash; preview decodes UTF8 and detects dataset changes', async t => {
  mockGithub(t)
  const f = await fixture()
  const res = await onRequestGet({ env: f.env, request: new Request('https://site/api/suggestions?date=2026-09-21'), data: { user: admin } })
  assert.equal(res.status, 200)
  assert.equal(JSON.stringify(await res.json()).includes('private'), false)
  const preview = await f.post('preview')
  assert.equal(preview.body.tournament.name, tournament.name)
  assert.equal(preview.body.changedSinceSubmission, false)
})

test('文字反馈只能标记已处理，不能预览或暂存为比赛改动', async t => {
  const f = await fixture()
  const textId = crypto.randomUUID(), date = '2026-09-21', draftId = crypto.randomUUID()
  await f.env.SUGGESTIONS.put(itemKey(textId, date), JSON.stringify({
    id: textId,
    receivedAt: date + 'T00:00:00.000Z',
    ipHash: 'private',
    submission: { schemaVersion: 1, clientRequestId: crypto.randomUUID(), datasetVersion: 'test', baseFingerprint: 'text-feedback', proposal: { kind: 'text', message: '请复核这张谱面的难度。' } },
  }))
  const ref = { id: textId, date, draftId, revision: 0 }
  const post = async (action) => {
    const response = await onRequestPost({ env: f.env, request: new Request('https://site/api/suggestions', { method: 'POST', body: JSON.stringify({ action, ref }) }), data: { user: admin } })
    return { status: response.status, body: await response.json() }
  }
  assert.equal((await post('preview')).status, 400)
  assert.equal((await post('stage')).status, 400)
  assert.equal((await post('resolve')).status, 200)
  assert.equal((await post('resolve')).status, 409)
})

test('two reviewers stage same revision: only one CAS wins; stale preview cannot stage', async t => {
  mockGithub(t)
  const f = await fixture(), preview = (await f.post('preview')).body
  assert.equal((await f.post('stage', { planHash: 'stale' })).status, 409)
  const outcomes = await Promise.all([f.post('stage', { planHash: preview.planHash }), f.post('stage', { planHash: preview.planHash }, { ...admin, uid: '2' })])
  assert.deepEqual(outcomes.map(o => o.status).sort(), [200, 409])
  assert.equal(f.env.SUGGESTIONS.records.size, 1)
})

async function staged(t, handler) {
  mockGithub(t, handler)
  const f = await fixture(), preview = (await f.post('preview')).body
  const claim = await f.post('stage', { planHash: preview.planHash })
  const ref = { ...f.ref, revision: claim.body.review.revision }
  const data = structuredClone(tournament)
  assert.equal(applySuggestPlan({ draft: data, plan: preview.plan, suggestionId: ref.id, revision: ref.revision }).ok, true)
  return { ...f, ref, data, items: [{ id: tid, tournament: data, baseSha: preview.sha }] }
}

test('manual superseding values cannot be finalized or silently accepted into batch', async t => {
  const f = await staged(t)
  f.data.rounds[0].maps[0].difficulty = 4
  await assert.rejects(beginSuggestionBatch(f.env, admin, { id: crypto.randomUUID(), refs: [f.ref] }, f.items), /覆盖/)
  assert.equal((await readState(f.env, f.ref.id, f.ref.date)).state.batchId, undefined)
})

test('cancelled pre-publication journal is terminal; next batch can use same reviewed draft', async t => {
  const f = await staged(t), input = { id: crypto.randomUUID(), refs: [f.ref] }
  const lease = await beginSuggestionBatch(f.env, admin, input, f.items)
  await cancelSuggestionBatch(f.env, lease)
  await assert.rejects(beginSuggestionBatch(f.env, admin, input, f.items), e => e.code === 'SUGGESTION_BATCH_CANCELLED')
  assert.ok(await beginSuggestionBatch(f.env, admin, { ...input, id: crypto.randomUUID() }, f.items))
})

test('response-loss recovery finalizes exact published candidate without creating commits', async t => {
  let published = false, writes = 0, publishedData
  const commit = 'b'.repeat(40), parent = 'c'.repeat(40)
  const f = await staged(t, (path, options, url) => {
    if (path.includes('/compare/')) return Response.json({ status: published ? 'ahead' : 'behind' })
    if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: parent } })
    if (path.endsWith('/git/refs/heads/main')) { writes++; assert.equal(JSON.parse(options.body).sha, commit); published = true; return Response.json({}) }
    if (url.searchParams.get('ref') === commit) return Response.json({ sha: 'd'.repeat(40), content: Buffer.from(JSON.stringify(publishedData)).toString('base64') })
  })
  publishedData = f.data
  const input = { id: crypto.randomUUID(), refs: [f.ref] }
  const lease = await beginSuggestionBatch(f.env, admin, input, f.items)
  await recordCandidate(f.env, lease, commit, parent, [{ id: tid, sha: 'd'.repeat(40) }])
  const replay = await beginSuggestionBatch(f.env, admin, input, f.items)
  const result = await recoverCandidate(f.env, admin, replay)
  assert.equal(result.commit, commit)
  assert.deepEqual(result.pendingSuggestions, [])
  assert.equal((await readState(f.env, f.ref.id, f.ref.date)).state.status, 'applied')
  await recoverCandidate(f.env, admin, replay)
  assert.equal(writes, 1)
  await assert.rejects(finishSuggestionBatch(f.env, { ...admin, uid: '2' }, input.id))
})

test('duplicate round IDs refuse a suggestion before touching draft', () => {
  const proposal = { kind: 'slot.realType', target: { tournamentId: tid, roundId: 'final', slot: 'RC1' }, value: 'CJ' }
  const result = planSuggestChange({ rounds: [tournament.rounds[0], tournament.rounds[0]], proposal })
  assert.equal(result.code, 'round-ambiguous')
})

test('release response loss is retryable and stale sources cannot release newer claims', async t => {
  const f = await staged(t)
  const release = () => f.post('release', { ref: f.ref })
  assert.equal((await release()).status, 200)
  assert.equal((await release()).status, 200)
  const state = (await readState(f.env, f.ref.id, f.ref.date)).state
  const preview = (await f.post('preview')).body
  const next = await f.post('stage', { ref: { ...f.ref, revision: state.revision, draftId: crypto.randomUUID() }, planHash: preview.planHash }, { ...admin, uid: '2' })
  assert.equal(next.status, 200)
  assert.equal((await release()).body.detached, true)
  assert.deepEqual((await readState(f.env, f.ref.id, f.ref.date)).state, next.body.review)
})

test('已忽略是终态：release 不能把它拉回 pending，stage 不能重新采纳', async t => {
  const f = await fixture()
  assert.equal((await f.post('ignore')).body.review.status, 'ignored')
  const ignored = (await readState(f.env, f.ref.id, f.ref.date)).state
  const current = { ...f.ref, revision: ignored.revision, draftId: ignored.draftId }
  // release 在终态上只做幂等（让浏览器能摘掉本地来源记录），状态一个字都不动 ——
  // 修之前这里返回的是 {status:'pending', revision:+1}，一次「取消关联」就静默撤销了忽略。
  assert.equal((await f.post('release', { ref: current })).status, 200)
  assert.deepEqual((await readState(f.env, f.ref.id, f.ref.date)).state, ignored, '被忽略的建议不能因为一次 release 回到待审核')
  // 重新采纳必须被拒：状态机里没有 ignored → staged 这条迁移。
  assert.equal((await f.post('stage', { ref: current, planHash: 'irrelevant' })).status, 409)
  assert.deepEqual((await readState(f.env, f.ref.id, f.ref.date)).state, ignored)
})

test('actual batch saves two suggestions with one commit; partial finalize and response-loss retry never republish', async t => {
  let published = false, commits = 0, refWrites = 0, publishedData
  const commit = 'b'.repeat(40), parent = 'c'.repeat(40), blob = 'd'.repeat(40)
  const f = await staged(t, (path, options, url) => {
    if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: published ? commit : parent } })
    if (path.endsWith(`/git/commits/${parent}`)) return Response.json({ tree: { sha: 'base-tree' } })
    if (path.endsWith('/git/trees/base-tree')) return Response.json({ tree: [{ path: 'data/tournaments/cup.json', type: 'blob', sha: 'a'.repeat(40) }] })
    if (path.endsWith('/git/blobs')) { publishedData = JSON.parse(JSON.parse(options.body).content); return Response.json({ sha: blob }) }
    if (path.endsWith('/git/trees')) return Response.json({ sha: 'new-tree' })
    if (path.endsWith('/git/commits')) { commits++; return Response.json({ sha: commit }) }
    if (path.endsWith('/git/refs/heads/main')) { refWrites++; published = true; return Response.json({}) }
    if (path.includes('/compare/')) return Response.json({ status: published ? 'identical' : 'behind' })
    if (url.searchParams.get('ref') === commit) return Response.json({ sha: blob, content: Buffer.from(JSON.stringify(publishedData)).toString('base64') })
  })
  f.env.LADDER_KV = { put: async () => {} }
  const second = { ...f.ref, id: crypto.randomUUID(), revision: 0 }
  const proposal = { kind: 'slot.realType', target: { tournamentId: tid, roundId: 'final', slot: 'RC1', beatmapId: 1234 }, value: 'CJ' }
  await f.env.SUGGESTIONS.put(itemKey(second.id, second.date), JSON.stringify({ id: second.id, receivedAt: second.date + 'T00:00:00.000Z', submission: { schemaVersion: 1, clientRequestId: second.id, datasetVersion: 'test', baseFingerprint: await targetFingerprint(tournament, proposal.target), proposal } }))
  const preview = (await f.post('preview', { ref: second })).body
  const stagedSecond = await f.post('stage', { ref: second, planHash: preview.planHash })
  assert.equal(stagedSecond.status, 200)
  second.revision = stagedSecond.body.review.revision
  assert.equal(applySuggestPlan({ draft: f.data, plan: preview.plan, suggestionId: second.id, revision: second.revision }).ok, true)
  assert.equal(commits, 0, 'reviewing never writes GitHub')
  assert.equal(refWrites, 0)
  const batchId = crypto.randomUUID()
  const body = JSON.stringify({ items: f.items, suggestionBatch: { id: batchId, refs: [f.ref, second] } })
  const originalPut = f.env.SUGGESTION_REVIEWS.put
  let failedOnce = false
  f.env.SUGGESTION_REVIEWS.put = async (key, value, options) => {
    if (!failedOnce && key.includes(second.id) && JSON.parse(value).status === 'applied') { failedOnce = true; throw new Error('temporary R2 outage') }
    return originalPut(key, value, options)
  }
  const save = async () => {
    const res = await saveBatch({ env: f.env, data: { user: admin }, request: new Request('https://site/api/tournaments/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }) })
    const result = await res.json()
    assert.equal(res.status, 200, JSON.stringify(result))
    return result
  }
  const first = await save()
  assert.deepEqual(first.pendingSuggestions, [second.id])
  assert.equal((await readState(f.env, f.ref.id, f.ref.date)).state.status, 'applied')
  const retry = await save()
  assert.equal(retry.commit, first.commit)
  assert.deepEqual(retry.pendingSuggestions, [])
  assert.equal((await readState(f.env, second.id, second.date)).state.status, 'applied')
  assert.deepEqual((await finishSuggestionBatch(f.env, admin, batchId)).pending, [])
  assert.equal(commits, 1)
  assert.equal(refWrites, 1)
})
