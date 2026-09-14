import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test from 'node:test'

// R06:上传不再无条件覆盖(覆盖前先归档,写入用条件写),恢复默认只管"目标不存在"。
// 全部内存 stub,条件写按 R2 的语义模拟:条件不满足 → put 返回 null 且不存对象。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const { onRequestPost: uploadMap } = await import('../functions/api/maps/upload.ts')
const { onRequestPost: restoreTrash } = await import('../functions/api/trash/index.ts')
const { versionObjectKey } = await import('../functions/api/_lib/mapKeys.ts')

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const { validateTournament } = await import('../functions/api/_lib/validation.ts')


const OSZ = new Uint8Array(
  await new JSZip()
    .file('song.osu', ['osu file format v14', '[General]', 'Mode: 3', '[Metadata]', 'BeatmapID:777', '[HitObjects]', '64,192,1000,1,0,0:0:0:0:'].join('\n'))
    .generateAsync({ type: 'uint8array' }),
)

const ORIGINAL = 'maps/t/r1/RC1.osz'

// 假 bucket:支持 head / get / put(含 onlyIf 语义) / delete。
function makeBucket({ entries = [], failPutTo = [], failConditionalOnce = false } = {}) {
  let seq = 0
  const store = new Map(entries)
  const ops = []
  let conditionalFailuresLeft = failConditionalOnce ? 1 : 0
  const snapshot = (key, etag) => ({
    bytes: `BYTES:${key}`,
    etag,
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { originalName: `${key}.osz` },
  })
  return {
    store,
    ops,
    set(key, etag, extra = {}) { store.set(key, { ...snapshot(key, etag), ...extra }) },
    async head(key) {
      ops.push(`head:${key}`)
      const o = store.get(key)
      return o ? { key, size: 100, etag: o.etag, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata } : null
    },
    async get(key) {
      ops.push(`get:${key}`)
      const o = store.get(key)
      return o ? { body: o.bytes, etag: o.etag, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata } : null
    },
    async put(key, body, options = {}) {
      ops.push(`put:${key}${options.onlyIf ? ':conditional' : ''}`)
      if (failPutTo.some((prefix) => key.startsWith(prefix))) throw new Error('R2 put failed')
      const condition = options.onlyIf
      if (condition) {
        if (conditionalFailuresLeft > 0) {
          conditionalFailuresLeft -= 1
          return null
        }
        const existing = store.get(key)
        const ifNoneMatch = condition instanceof Headers ? condition.get('If-None-Match') : null
        if (ifNoneMatch === '*') {
          if (existing) return null
        } else if (typeof condition.etagMatches === 'string') {
          if (!existing || existing.etag !== condition.etagMatches) return null
        }
      }
      // 保存真实 body:归档/恢复的断言要比较内容本身(string 就是内容,流只记占位)。
      const bytes = typeof body === 'string' ? body : '[stream]'
      store.set(key, { ...snapshot(key, `etag-${++seq}`), bytes, httpMetadata: options.httpMetadata, customMetadata: options.customMetadata })
      return { key, etag: store.get(key).etag }
    },
    async delete(key) {
      ops.push(`delete:${key}`)
      store.delete(key)
    },
    async list() { return { objects: [], truncated: false } },
  }
}

function makeKv(seed = {}) {
  const store = new Map(Object.entries(seed))
  return {
    store,
    async get(key, type) {
      const value = store.get(key)
      if (value === undefined) return null
      return type === 'json' ? JSON.parse(value) : value
    },
    async put(key, value) { store.set(key, value); return {} },
    async delete(key) { store.delete(key) },
    async list() { return { keys: [] } },
  }
}

function installGithub(tournaments) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: (options.method || 'GET').toUpperCase(), body: options.body ? JSON.parse(options.body) : null })
    const path = String(url).replace(/^https:\/\/api\.github\.com\/repos\/o\/r/, '')
    const method = (options.method || 'GET').toUpperCase()
    if (tournaments.__status) return { ok: false, status: tournaments.__status, json: async () => ({ message: 'conflict' }) }
    // 写回(PUT)按成功处理;只有读取才按"这场比赛在不在仓库里"回答。
    if (method === 'PUT') return { ok: true, status: 200, json: async () => ({ content: { sha: 'written' } }) }
    const id = decodeURIComponent(path.split('/data/tournaments/')[1] || '').replace(/\.json.*$/, '')
    if (!(id in tournaments)) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) }
    return { ok: true, status: 200, json: async () => ({ content: Buffer.from(JSON.stringify(tournaments[id]), 'utf8').toString('base64') }) }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const tournamentFixture = {
  id: 't', name: 't', abbreviation: 't', keyCount: 4, year: 2026,
  rounds: [{
    id: 'r1', name: 'r1', abbreviation: 'r1', order: 1,
    difficulty: { min: 0, max: 0, average: 0 },
    maps: [{ slot: 'RC1', type: 'RC', realType: 'SS', difficulty: 0 }],
  }],
}

async function callUpload(bucket) {
  const form = new FormData()
  form.append('tournamentId', 't')
  form.append('roundId', 'r1')
  form.append('slot', 'RC1')
  form.append('file', new File([OSZ], 'x.osz'))
  const res = await uploadMap({
    request: new Request('https://ladder.test/api/maps/upload', { method: 'POST', body: form }),
    env: { GITHUB_TOKEN: 'x', GITHUB_REPO: 'o/r', LADDER_KV: makeKv(), R2_BUCKET: bucket },
    data: { user: { uid: '1', username: 'tester', role: 'contributor' } },
  })
  return { status: res.status, payload: await res.json() }
}

test('R06 首次上传:目标是空的 → 用"不存在才写"的条件写', async () => {
  const gh = installGithub({ t: tournamentFixture })
  try {
    const bucket = makeBucket()
    const { status, payload } = await callUpload(bucket)

    assert.equal(status, 200)
    assert.equal(payload.key, ORIGINAL)
    assert.equal(payload.archivedKey, null, '目标本来就是空的,没有旧版本可归档')
    assert.equal(bucket.store.has(ORIGINAL), true)
    assert.deepEqual([...bucket.store.keys()].filter((k) => k.startsWith('versions/')), [])
    assert.equal(bucket.ops.filter((op) => op === `put:${ORIGINAL}:conditional`).length, 1)
  } finally {
    gh.restore()
  }
})

test('R06 重传:先把旧对象归档到 versions/,再用 etag CAS 覆盖', async () => {
  const gh = installGithub({ t: tournamentFixture })
  try {
    const bucket = makeBucket({ entries: [[ORIGINAL, { bytes: 'OLD', etag: 'old-etag', httpMetadata: {}, customMetadata: {} }]] })
    const { status, payload } = await callUpload(bucket)

    assert.equal(status, 200)
    assert.ok(payload.archivedKey, '响应里要给出归档键')
    assert.equal(payload.archivedKey.startsWith('versions/'), true)
    assert.equal(payload.archivedKey, versionObjectKey(ORIGINAL, payload.archivedKey.split('.').pop()), '归档键由 key + opId 派生')

    const archived = bucket.store.get(payload.archivedKey)
    assert.ok(archived, '旧版本必须已经落到 versions/ 下')
    assert.equal(archived.bytes, 'OLD', '归档的是旧内容')
    assert.equal(archived.customMetadata.archivedFrom, ORIGINAL)

    // 归档必须发生在覆盖之前
    assert.ok(bucket.ops.indexOf(`put:${payload.archivedKey}`) < bucket.ops.indexOf(`put:${ORIGINAL}:conditional`))
    assert.notEqual(bucket.store.get(ORIGINAL).etag, 'old-etag', '目标已被新版本替换')
  } finally {
    gh.restore()
  }
})

test('R06 归档失败:不覆盖,目标保持原样', async () => {
  const gh = installGithub({ t: tournamentFixture })
  try {
    const bucket = makeBucket({
      entries: [[ORIGINAL, { bytes: 'OLD', etag: 'old-etag', httpMetadata: {}, customMetadata: {} }]],
      failPutTo: ['versions/'],
    })
    const { status, payload } = await callUpload(bucket)

    assert.equal(status, 502)
    assert.equal(payload.code, 'ARCHIVE_FAILED')
    assert.equal(bucket.store.get(ORIGINAL).etag, 'old-etag', '目标必须保持原样')
    assert.equal(bucket.ops.includes(`put:${ORIGINAL}:conditional`), false, '归档失败时绝不能继续覆盖')
  } finally {
    gh.restore()
  }
})

test('R06 并发重传只有一个成功:条件写失败返回 409', async () => {
  const gh = installGithub({ t: tournamentFixture })
  try {
    const overExisting = makeBucket({
      entries: [[ORIGINAL, { bytes: 'OLD', etag: 'old-etag', httpMetadata: {}, customMetadata: {} }]],
      failConditionalOnce: true,
    })
    const first = await callUpload(overExisting)
    assert.equal(first.status, 409)
    assert.equal(first.payload.code, 'UPLOAD_CONFLICT')
    assert.equal(overExisting.store.get(ORIGINAL).etag, 'old-etag', '抢输的一方不能改动目标')

    const overEmpty = makeBucket({ failConditionalOnce: true })
    const second = await callUpload(overEmpty)
    assert.equal(second.status, 409)
    assert.equal(second.payload.code, 'UPLOAD_CONFLICT')
    assert.equal(overEmpty.store.has(ORIGINAL), false, '新建竞态也不会留下对象')
  } finally {
    gh.restore()
  }
})

// ---------- 恢复 ----------

const TRASH_ID = '0000000000001-abc'
function mapTrashKv(entry, extra = {}) {
  const full = {
    id: TRASH_ID,
    kind: 'map',
    label: 't/r1/RC1',
    deletedAt: Date.now(),
    deletedByUid: '1',
    deletedByName: 'tester',
    originalKey: ORIGINAL,
    restoreKey: `trash/${ORIGINAL}.op1`,
    ...entry,
  }
  return makeKv({ [`trash:${TRASH_ID}`]: JSON.stringify(full), ...extra })
}

async function callRestore({ kv, bucket, env = {} }) {
  const res = await restoreTrash({
    request: new Request('https://ladder.test/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: TRASH_ID }),
    }),
    env: { GITHUB_TOKEN: 'x', GITHUB_REPO: 'o/r', LADDER_KV: kv, R2_BUCKET: bucket, ...env },
    data: { user: { uid: '1', username: 'admin', role: 'admin' } },
  })
  return { status: res.status, payload: await res.json() }
}

test('R06 恢复谱面:目标已存在 → 409 且不动任何东西', async () => {
  const kv = mapTrashKv()
  const bucket = makeBucket({
    entries: [
      [ORIGINAL, { bytes: 'OCCUPANT', etag: 'occ', httpMetadata: {}, customMetadata: {} }],
      [`trash/${ORIGINAL}.op1`, { bytes: 'BACKUP', etag: 'bak', httpMetadata: {}, customMetadata: {} }],
    ],
  })
  const { status, payload } = await callRestore({ kv, bucket })

  assert.equal(status, 409)
  assert.equal(payload.code, 'RESTORE_CONFLICT')
  assert.equal(bucket.store.get(ORIGINAL).bytes, 'OCCUPANT', '现有版本不能被覆盖')
  assert.equal(bucket.ops.includes(`put:${ORIGINAL}:conditional`), false)
  assert.ok(kv.store.has(`trash:${TRASH_ID}`), '回收站条目必须保留')
})

test('R06 恢复谱面:目标已存在但副本已清理 → 视为已恢复,清掉记录', async () => {
  const kv = mapTrashKv()
  const bucket = makeBucket({
    entries: [[ORIGINAL, { bytes: 'OCCUPANT', etag: 'occ', httpMetadata: {}, customMetadata: {} }]],
  })
  const { status, payload } = await callRestore({ kv, bucket })

  assert.equal(status, 200)
  assert.equal(payload.alreadyRestored, true)
  assert.equal(kv.store.has(`trash:${TRASH_ID}`), false, '陈旧记录要清掉,不然用户永远卡在 409')
})

test('R06 恢复谱面:目标为空 → 条件写 + 先清记录再删副本', async () => {
  const kv = mapTrashKv()
  const bucket = makeBucket({
    entries: [[`trash/${ORIGINAL}.op1`, { bytes: 'BACKUP', etag: 'bak', httpMetadata: {}, customMetadata: {} }]],
  })
  const { status, payload } = await callRestore({ kv, bucket })

  assert.equal(status, 200)
  assert.equal(payload.success, true)
  assert.equal(bucket.store.get(ORIGINAL).bytes, 'BACKUP')
  assert.equal(bucket.ops.includes(`put:${ORIGINAL}:conditional`), true, '恢复也要用条件写')
  assert.equal(kv.store.has(`trash:${TRASH_ID}`), false, '记录已清')
  assert.equal(bucket.store.has(`trash/${ORIGINAL}.op1`), false, '副本已删')
})

test('R06 恢复谱面:竞态下条件写失败 → 409,副本与记录都保留', async () => {
  const kv = mapTrashKv()
  const bucket = makeBucket({
    entries: [[`trash/${ORIGINAL}.op1`, { bytes: 'BACKUP', etag: 'bak', httpMetadata: {}, customMetadata: {} }]],
    failConditionalOnce: true,
  })
  const { status, payload } = await callRestore({ kv, bucket })

  assert.equal(status, 409)
  assert.equal(payload.code, 'RESTORE_CONFLICT')
  assert.equal(bucket.store.has(ORIGINAL), false)
  assert.ok(bucket.store.has(`trash/${ORIGINAL}.op1`), '副本要保留')
  assert.ok(kv.store.has(`trash:${TRASH_ID}`), '记录要保留')
})

test('R06 恢复谱面:副本真的没了且目标为空 → 404 而不是假装成功', async () => {
  const kv = mapTrashKv()
  const bucket = makeBucket()
  const { status, payload } = await callRestore({ kv, bucket })
  assert.equal(status, 404)
  assert.equal(payload.code, 'RESTORE_SOURCE_MISSING')
})

test('R06 恢复比赛:不带 sha 创建,撞名翻成 409 RESTORE_CONFLICT', async () => {
  const entry = {
    id: TRASH_ID,
    kind: 'tournament',
    label: 't',
    deletedAt: Date.now(),
    deletedByUid: '1',
    deletedByName: 'tester',
    payload: JSON.stringify(tournamentFixture),
  }
  const kv = makeKv({ [`trash:${TRASH_ID}`]: JSON.stringify(entry) })
  const bucket = makeBucket()

  // 目标已存在 → GitHub 返回 422
  const ghConflict = installGithub({ __status: 422 })
  try {
    const { status, payload } = await callRestore({ kv, bucket })
    assert.equal(status, 409)
    assert.equal(payload.code, 'RESTORE_CONFLICT')
    const put = ghConflict.calls.find((c) => c.method === 'PUT')
    assert.equal(put.body.sha, undefined, '创建/恢复都不该带 sha —— 带了就等于允许覆盖')
    assert.ok(kv.store.has(`trash:${TRASH_ID}`), '冲突时保留回收站条目')
  } finally {
    ghConflict.restore()
  }

  // 目标不存在 → 正常创建
  const ghOk = installGithub({})
  try {
    const kv2 = makeKv({ [`trash:${TRASH_ID}`]: JSON.stringify(entry) })
    const { status } = await callRestore({ kv: kv2, bucket })
    assert.equal(status, 200)
    assert.equal(kv2.store.has(`trash:${TRASH_ID}`), false, '成功后清记录')
  } finally {
    ghOk.restore()
  }
})

// 恢复比赛要走同一套 validator,fixture 必须真的合法(否则测的是 400 而不是冲突路径)。
test('R06 测试用的比赛 fixture 本身通过 validateTournament', () => {
  const result = validateTournament(tournamentFixture)
  assert.equal(result.ok, true, result.ok ? '' : result.error)
})

test('R06 恢复谱面:目标占位者是别人重传的(etag 不同) → 409,不谎报"已恢复"', async () => {
  const kv = mapTrashKv({ originalEtag: 'original-etag' })
  const bucket = makeBucket({
    entries: [[ORIGINAL, { bytes: 'OTHER', etag: 'other-etag', httpMetadata: {}, customMetadata: {} }]],
  })
  const { status, payload } = await callRestore({ kv, bucket })

  assert.equal(status, 409)
  assert.equal(payload.code, 'RESTORE_CONFLICT')
  assert.match(payload.error, /内容与回收站副本不同/)
  assert.ok(kv.store.has(`trash:${TRASH_ID}`), '记录必须保留,等人来处理')
})

test('R06 恢复谱面:目标占位者与副本内容一致(就是原来那份) → 视为已恢复并清记录', async () => {
  const kv = mapTrashKv({ originalEtag: 'same-etag' })
  const bucket = makeBucket({
    entries: [[ORIGINAL, { bytes: 'SAME', etag: 'same-etag', httpMetadata: {}, customMetadata: {} }]],
  })
  const { status, payload } = await callRestore({ kv, bucket })

  assert.equal(status, 200)
  assert.equal(payload.alreadyRestored, true)
  assert.equal(kv.store.has(`trash:${TRASH_ID}`), false)
})

test('R06 普通与 NSV 的版本归档互不串键', () => {
  const main = versionObjectKey('maps/t/r1/RC1.osz', 'op1')
  const nsv = versionObjectKey('maps/t/r1/RC1.nsv.osz', 'op1')
  assert.notEqual(main, nsv, '归档键由完整对象键派生,普通与 NSV 天然隔离')
  assert.equal(main.startsWith('versions/'), true)
  assert.equal(nsv.startsWith('versions/'), true)
})
