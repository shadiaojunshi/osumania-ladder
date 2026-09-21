import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestPost, onRequestGet } = await import('../functions/api/suggestions/index.ts')
const { checkDate, readState, itemKey } = await import('../functions/api/_lib/suggestions.ts')
const { beginSuggestionBatch, recordCandidate, recoverCandidate, finishSuggestionBatch, cancelSuggestionBatch, loadJournal } = await import('../functions/api/_lib/suggestionBatch.ts')
const { targetFingerprint } = await import('../src/lib/suggestions/fingerprint.ts')
const { applySuggestPlan } = await import('../src/lib/suggestions/apply.ts')
const { onRequestPost: saveBatch } = await import('../functions/api/tournaments/batch.ts')
const { planSuggestChange } = await import('../src/lib/suggestions/patch.ts')
const { planIdentity, planSatisfied } = await import('../src/lib/suggestions/review.ts')

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

// 动作清单只有一份（`types.ts`），服务端白名单从它派生、前端请求函数的参数类型也从它派生。
// 以前前端那份写的是 `'unstage'` —— 服务端从来不认（撤销暂存走 `release`），
// 而 `release` / `resolve` 两个真在用的动作反而没写进去。两边对不上没人发现，
// 是因为那个类型谁都没 import、参数一直是 `string`：拼错动作名能一路编译到线上。
test('审核动作清单两边一致：清单里的都认，清单外的（含 unstage）一律「审核动作无效」', async t => {
  mockGithub(t)
  const { SUGGEST_REVIEW_ACTIONS, SUGGEST_MUTATING_ACTIONS } = await import('../src/lib/suggestions/types.ts')
  assert.deepEqual([...SUGGEST_REVIEW_ACTIONS], ['preview', 'stage', 'ignore', 'release', 'resolve'], '动作词汇就是这个，改了就要同时想清楚服务端')
  // 这三条锁的是当年那份写错的类型：unstage 不在词表里，而 release / resolve 在。
  assert.equal(SUGGEST_REVIEW_ACTIONS.includes('unstage'), false, 'unstage 服务端从来不认（撤销暂存走 release）')
  assert.ok(SUGGEST_MUTATING_ACTIONS.includes('release') && SUGGEST_MUTATING_ACTIONS.includes('resolve'), 'release / resolve 是真在用的动作，不能漏')
  assert.equal(SUGGEST_MUTATING_ACTIONS.includes('preview'), false, 'preview 只读，不进改动白名单')
  const f = await fixture()
  assert.equal((await f.post('preview')).status, 200, '只读的 preview 照常可用（它不走白名单）')
  for (const action of SUGGEST_MUTATING_ACTIONS) {
    const res = await f.post(action)
    // 可以因别的理由被拒（400「此操作不适用于该反馈类型」/ 409 状态已变），
    // 但不能被判成"动作名不认识" —— 那说明白名单和清单漂移了。
    if (res.status === 400) assert.doesNotMatch(res.body.error, /审核动作无效/, `${action} 在清单里，不该被判动作无效`)
  }
  for (const action of ['unstage', 'preview ', 'IGNORE', 'stageAll', '']) {
    const res = await f.post(action)
    assert.equal(res.status, 400, `${JSON.stringify(action)} 不在清单里`)
    assert.match(res.body.error, /审核动作无效/)
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

// 列表原来是一条坏记录毒死整天：只要日期前缀下有 1 个对象读不成合法记录
// （schemaVersion 不认识 / receivedAt 与 key 日期不符 / 前缀下混进非 UUID 对象 /
// 被 lifecycle 删在 list 与 get 之间），整个队列返回 4xx/5xx，审核员什么都做不了，
// 也不知道是哪一条。现在逐条容错并单独报出来。
test('一条坏记录不再毒死整天队列：好记录照常返回，坏记录单独列出来', async t => {
  const f = await fixture()
  const date = '2026-09-21'
  const broken = crypto.randomUUID()
  await f.env.SUGGESTIONS.put(`suggest/items/${date.replaceAll('-', '/')}/${broken}.json`, JSON.stringify({ id: broken, receivedAt: `${date}T00:00:00.000Z`, submission: { schemaVersion: 99 } }))
  await f.env.SUGGESTIONS.put(`suggest/items/${date.replaceAll('-', '/')}/stray.txt`, 'not a suggestion')
  const res = await onRequestGet({ env: f.env, request: new Request(`https://site/api/suggestions?date=${date}`), data: { user: admin } })
  assert.equal(res.status, 200, '坏记录不能让整天队列失败')
  const body = await res.json()
  assert.deepEqual(body.items.map(item => item.id), [f.ref.id], '好记录必须照常在列表里')
  assert.deepEqual(body.unreadable.map(entry => entry.id).sort(), [broken, 'stray.txt'].sort(), '坏记录要逐条报出来，审核员才知道是哪几条')
  assert.equal(body.unreadable.every(entry => typeof entry.reason === 'string' && entry.reason.length > 0), true, '每条都要有原因')
})

// `changedSinceSubmission` 是"你提交时的看法可能已经过时"的提示，不是拦截。
// 它以前只被断言过 false 那一半，真正要守的是 true 那一半：
// ① 预览必须印**当前权威值**（before 用刚读到的 5，不是提交时的 2）；
// ② 值已经（被别人）改成建议值时要 changedSinceSubmission 与 noop **同时**为真，
//    审核员才敢直接忽略，而不是以为自己看的还是老数据。
test('提交后的数据变了：changedSinceSubmission 为真，且预览一律以当前权威值为准', async t => {
  const served = structuredClone(tournament)
  mockGithub(t, path => path.includes('/contents/') ? Response.json({ sha: 'a'.repeat(40), content: Buffer.from(JSON.stringify(served)).toString('base64') }) : undefined)
  const f = await fixture()
  served.rounds[0].maps[0].difficulty = 5
  const drifted = (await f.post('preview')).body
  assert.equal(drifted.changedSinceSubmission, true, '权威值变了必须说出来')
  assert.deepEqual(drifted.plan.changes, [{ field: 'difficulty', before: 5, after: 3 }], 'before 必须是刚读到的当前值')
  assert.equal(drifted.plan.noop, false)
  served.rounds[0].maps[0].difficulty = 3
  const settled = (await f.post('preview')).body
  assert.equal(settled.changedSinceSubmission, true)
  assert.equal(settled.plan.noop, true, 'noop 与 changedSinceSubmission 是两件事，这里必须同时为真')
  assert.equal((await f.post('stage', { planHash: settled.planHash })).status, 409, 'noop 的建议不许采纳')
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

// `planSatisfied` 问的是"这条建议还算不算数"这一个布尔问题。身份/槽位算不出来时的
// 答案必须是 false：旧实现直接调 `planIdentity`（它刻意不猜重复槽位、会抛），
// 异常一路冒到 `reviewFailure`，本该是 409「请先取消关联」的响应变成 500/503
// 「反馈服务暂时不可用」，审核员重试还是同一结果。
test('planSatisfied 永不抛：槽位/轮次被删改时算「不算数」，重复槽位也不许猜', () => {
  const plan = planSuggestChange({ rounds: tournament.rounds, proposal: { kind: 'slot.difficulty', target: { tournamentId: tid, roundId: 'final', slot: 'RC1' }, value: { difficulty: 3 } } })
  assert.equal(plan.ok, true)
  const state = { status: 'staged', revision: 1, plan, identity: planIdentity(tournament, plan) }
  const changed = structuredClone(tournament)
  changed.rounds[0].maps[0].difficulty = 3
  assert.equal(planSatisfied(changed, state), true, '值已符合时必须算「算数」（否则这条断言本身就是坏的）')
  changed.rounds[0].maps[0].difficulty = 2
  assert.equal(planSatisfied(changed, state), false, '值被手改掉 → 不算数')
  // 以下每一条旧实现都会**抛异常**（不是返回 false），所以每一条都是回归锁。
  const renamed = structuredClone(changed); renamed.rounds[0].maps[0].slot = 'RC2'
  assert.equal(planSatisfied(renamed, state), false, '槽位改名 = 找不到那个槽位')
  const removed = structuredClone(changed); removed.rounds[0].maps = []
  assert.equal(planSatisfied(removed, state), false, '槽位被删')
  const duplicated = structuredClone(changed); duplicated.rounds[0].maps.push({ ...duplicated.rounds[0].maps[0] })
  assert.equal(planSatisfied(duplicated, state), false, '重复槽位不许 `find` 取巧（与 planIdentity 同样的态度）')
  const noRound = structuredClone(changed); noRound.rounds = []
  assert.equal(planSatisfied(noRound, state), false, '轮次被删')
  const dupRound = structuredClone(changed); dupRound.rounds.push(structuredClone(dupRound.rounds[0]))
  assert.equal(planSatisfied(dupRound, state), false, '轮次重复')
  assert.equal(planSatisfied({ ...changed, id: 'other' }, state), false, '比赛身份不符')
  assert.equal(planSatisfied(changed, { status: 'pending', revision: 0 }), false, '还没采纳过（没有 plan）')
})

// 上面那条锁的是返回值，这条锁**审核员看到的东西**：槽位在审核期间被删掉之后，
// 保存必须是一个能照着做的 409，而不是 500「反馈服务暂时不可用」。
test('槽位被删后保存：409 + 点名编号，而不是 500/503', async t => {
  mockGithub(t)
  const f = await staged(t)
  f.data.rounds[0].maps = []
  const body = JSON.stringify({ items: f.items, suggestionBatch: { id: crypto.randomUUID(), refs: [f.ref] } })
  const res = await saveBatch({ env: f.env, data: { user: admin }, request: new Request('https://site/api/tournaments/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }) })
  const result = await res.json()
  assert.equal(res.status, 409, `应是可照着做的 409，实际 ${res.status} ${JSON.stringify(result)}`)
  assert.match(result.error, /覆盖/)
  assert.ok(result.error.includes(f.ref.id), '整批拒绝时必须点名是哪条建议，否则审核员无从下手')
})

// 审核状态记录**存在但形状不对**（缺 revision / status 不认识 / 根本不是对象）时，
// 旧实现把它当普通状态用：缺 revision 的记录永远过不了 `state.revision !== ref.revision`
// 那道 CAS 守卫，于是任何动作都是 409「建议已更新或正在发布，请刷新」—— 刷新永远不会变好，
// 这条建议永久卡死，而审核员看到的原因还是编的。现在直接说"记录损坏"。
test('审核状态记录损坏：说是记录坏了，而不是 409「请刷新」', async () => {
  const f = await fixture()
  const key = `suggest/reviews/${f.ref.date.replaceAll('-', '/')}/${f.ref.id}.json`
  for (const body of ['null', '42', '"pending"', '[]', '{}', '{"status":"pending"}', '{"revision":0}', '{"status":"weird","revision":0}', '{"status":"applied","revision":-1}', '{"status":"applied"}', '{"status":"applied","revision":1.5}']) {
    await f.env.SUGGESTION_REVIEWS.put(key, body)
    await assert.rejects(readState(f.env, f.ref.id, f.ref.date), e => e.status === 422 && /记录损坏/.test(e.message), `${body} 应被判为损坏`)
  }
  // 完整记录照常可读：别把正常状态一起判坏。
  await f.env.SUGGESTION_REVIEWS.put(key, JSON.stringify({ status: 'staged', revision: 2, reviewerUid: '1' }))
  assert.equal((await readState(f.env, f.ref.id, f.ref.date)).state.revision, 2)
  // HTTP 层报的就是这个原因，不是那句假的"请刷新"。
  await f.env.SUGGESTION_REVIEWS.put(key, '{"status":"pending"}')
  const res = await f.post('ignore')
  assert.equal(res.status, 422, JSON.stringify(res.body))
  assert.match(res.body.error, /记录损坏/)
  assert.doesNotMatch(res.body.error, /请刷新/)
})

// 上一条让「读审核状态」多了一种抛法，而 `releaseBatchClaims` 是在 catch 里被调的：
// 它一抛就会把真正的失败原因（哪条建议被手改覆盖）盖成"记录损坏"，审核员就查错方向。
// 顺带确认批次墓碑仍然写下了 —— 否则修好冲突后重试会撞上"该批次仍在处理中"。
test('取消批次时逐条容错：另一条记录损坏不能盖掉真正的失败原因', async t => {
  mockGithub(t)
  const f = await staged(t)
  const broken = { ...f.ref, id: crypto.randomUUID(), revision: 0 }
  await f.env.SUGGESTION_REVIEWS.put(`suggest/reviews/${f.ref.date.replaceAll('-', '/')}/${broken.id}.json`, '{"status":"pending"}')
  f.data.rounds[0].maps[0].difficulty = 4
  const id = crypto.randomUUID()
  await assert.rejects(beginSuggestionBatch(f.env, admin, { id, refs: [f.ref, broken] }, f.items), /覆盖/)
  assert.equal((await loadJournal(f.env, id)).journal.cancelled, true, '批次要留下终态墓碑，不然审核员修好后重试会撞上"仍在处理中"')
  assert.equal((await readState(f.env, f.ref.id, f.ref.date)).state.batchId, undefined, '能读的那条照常释放关联')
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
