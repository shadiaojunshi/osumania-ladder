import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test from 'node:test'

// R04:键段/字段/档案/权威数据校验,以及上传与删除 handler 的实际行为。
// 全部用内存 stub(假 R2 + 桩 GitHub),不碰真实存储。
//
// 注意:mapKeys.ts 自己用了省略扩展名的相对 import,所以必须在 register 之后再**动态**
// import(静态 import 在该模块体执行前就解析完了,那时 loader 还没生效)。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  ARCHIVE_LIMITS,
  hasNsvSuffixAmbiguity,
  inspectOszTail,
  locateMapSlot,
  mapObjectKey,
  mapObjectPrefix,
  parseMapObjectKey,
  validateKeySegment,
  validateNsvFlag,
  validateRoundId,
  validateSlot,
} = await import('../functions/api/_lib/mapKeys.ts')
const { onRequestPost: uploadMap } = await import('../functions/api/maps/upload.ts')
const { onRequestPost: deleteMap } = await import('../functions/api/maps/delete.ts')

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

// 现有数据的真实槽位(含 '/'、'&'、'()')必须继续可用。
const REAL_SLOTS = ['RC1', 'TB', 'SHOWTB', 'FS/TB', 'GM(HR/SD)', 'GM(FL&EZ)']

async function makeOsz(entries = { 'map.osu': 'osu file format v14' }) {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(entries)) zip.file(name, content)
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return bytes
}

function tailOf(bytes, size = ARCHIVE_LIMITS.tailBytes) {
  return bytes.slice(Math.max(0, bytes.length - size))
}

function jsonRes(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data }
}

function makeFakeBucket() {
  const calls = { put: [], get: [], delete: [], list: [], head: [] }
  const store = new Map()
  return {
    calls,
    store,
    // R06 之后上传会先 head 再条件写:这里给出与真实 R2 一致的最小语义。
    async head(key) {
      calls.head.push(key)
      return store.has(key)
        ? { key, size: 1, etag: 'etag-fixed', httpMetadata: {}, customMetadata: {} }
        : null
    },
    async put(key, body, options) {
      calls.put.push({ key, options, isStream: typeof body?.getReader === 'function' })
      store.set(key, body)
      return {}
    },
    async get(key) {
      calls.get.push(key)
      return store.has(key) ? { body: 'BODY', httpMetadata: {}, customMetadata: {} } : null
    },
    async delete(key) {
      calls.delete.push(key)
      store.delete(key)
    },
    async list({ prefix }) {
      calls.list.push(prefix)
      return { objects: [], truncated: false }
    },
  }
}

// 桩掉 GitHub contents:把比赛 JSON 编码成 base64 塞进 content 字段(和真实响应一致)。
function installGithub(tournaments) {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    const id = decodeURIComponent(String(url).split('/data/tournaments/')[1] || '').replace(/\.json.*$/, '')
    if (!(id in tournaments)) return jsonRes(404, { message: 'Not Found' })
    const content = Buffer.from(JSON.stringify(tournaments[id]), 'utf8').toString('base64')
    return jsonRes(200, { content })
  }
  return { restore: () => { globalThis.fetch = original } }
}

const kv = { put: async () => {}, get: async () => null, list: async () => ({ keys: [] }), delete: async () => {} }
const user = (role) => ({ uid: '1', username: 'tester', role })

const tournament = (id, rounds) => ({ id, name: id, abbreviation: id, keyCount: 4, year: 2026, rounds })

function makeUploadRequest(fields) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue
    form.append(name, value)
  }
  return new Request('https://ladder.test/api/maps/upload', { method: 'POST', body: form })
}

async function runUpload(fields, { env } = {}) {
  const bucket = env?.R2_BUCKET ?? makeFakeBucket()
  const res = await uploadMap({
    request: makeUploadRequest(fields),
    env: { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', LADDER_KV: kv, R2_BUCKET: bucket, ...env },
    data: { user: user('contributor') },
  })
  return { status: res.status, payload: await res.json(), bucket }
}

// ---------- 键段 ----------

test('R04 键段校验接受真实槽位,拒绝会破坏键结构的输入', () => {
  for (const slot of REAL_SLOTS) {
    const ok = validateSlot(slot)
    assert.equal(ok.ok, true, `${slot} 应被接受`)
    assert.equal(ok.value, slot, '不做 trim,键值原样保留')
  }

  for (const bad of ['', '.', '..', 'a/../b', 'a//b', 'a/', '\\x', 'bad\u0000slot', 'x'.repeat(41)]) {
    const res = validateSlot(bad)
    assert.equal(res.ok, false, `${JSON.stringify(bad)} 应被拒绝`)
  }

  assert.equal(validateRoundId('round-8').ok, true)
  assert.equal(validateRoundId('round-8/extra').ok, true, 'roundId 也可能带 /(与 slot 同一套规则)')
  assert.equal(validateRoundId(undefined).ok, false)
  assert.equal(validateKeySegment(42, { field: 'slot', maxLength: 40 }).ok, false, '非字符串直接拒绝')
})

test('R04 nsv 标志只认明确的真假', () => {
  for (const [input, expected] of [[undefined, false], [null, false], ['', false], ['0', false], ['false', false], ['1', true], ['true', true], ['TRUE', true]]) {
    const res = validateNsvFlag(input)
    assert.equal(res.ok, true, `nsv=${String(input)} 应被接受`)
    assert.equal(res.value, expected)
  }
  for (const bad of ['yes', 'nsv', '2', {}]) {
    assert.equal(validateNsvFlag(bad).ok, false, `nsv=${JSON.stringify(bad)} 应被拒绝`)
  }
})

test('R04 键构造/反解与 NSV 后缀歧义', () => {
  assert.equal(mapObjectKey('cet-2026', 'round-8', 'RC1', false), 'maps/cet-2026/round-8/RC1.osz')
  assert.equal(mapObjectKey('cet-2026', 'round-8', 'RC1', true), 'maps/cet-2026/round-8/RC1.nsv.osz')
  assert.equal(mapObjectPrefix('cet-2026'), 'maps/cet-2026/')
  assert.equal(
    mapObjectKey('t', 'r', 'FS/TB', false),
    'maps/t/r/FS/TB.osz',
    '含 / 的槽位照旧拼键,保证现有对象仍能被找到',
  )

  const main = mapObjectKey('t', 'r', 'GM(FL&EZ)', false)
  const nsv = mapObjectKey('t', 'r', 'GM(FL&EZ)', true)
  assert.deepEqual(parseMapObjectKey('t', main), { relative: 'r/GM(FL&EZ)', nsv: false })
  assert.deepEqual(parseMapObjectKey('t', nsv), { relative: 'r/GM(FL&EZ)', nsv: true })
  assert.equal(parseMapObjectKey('t', 'maps/other/r/X.osz'), null, '别的比赛的键不认')
  assert.equal(parseMapObjectKey('t', 'maps/t/r/X.txt'), null, '非 .osz 不认')

  assert.equal(hasNsvSuffixAmbiguity('X.nsv', false), true, '普通图 slot=X.nsv 会与 X 的 NSV 撞键')
  assert.equal(hasNsvSuffixAmbiguity('X.nsv', true), false, 'NSV 自己不会撞')
  assert.equal(hasNsvSuffixAmbiguity('X', false), false)
})

// ---------- 权威数据 ----------

test('R04 轮次/槽位必须存在且唯一,重复时报错而不是靠下标', () => {
  const ok = tournament('t', [{ id: 'r1', maps: [{ slot: 'RC1' }, { slot: 'FS/TB' }] }])
  assert.equal(locateMapSlot(ok, 'r1', 'RC1').ok, true)
  assert.equal(locateMapSlot(ok, 'r1', 'FS/TB').ok, true)
  assert.match(locateMapSlot(ok, 'r2', 'RC1').error, /没有轮次/)
  assert.match(locateMapSlot(ok, 'r1', 'RC9').error, /没有槽位/)
  assert.match(locateMapSlot({ id: 't' }, 'r1', 'RC1').error, /rounds/)
  assert.match(locateMapSlot(null, 'r1', 'RC1').error, /不可读/)

  const dupRound = tournament('t', [{ id: 'r1', maps: [] }, { id: 'r1', maps: [{ slot: 'RC1' }] }])
  assert.match(locateMapSlot(dupRound, 'r1', 'RC1').error, /重复/)

  const dupSlot = tournament('t', [{ id: 'r1', maps: [{ slot: 'RC1' }, { slot: 'RC1' }] }])
  assert.match(locateMapSlot(dupSlot, 'r1', 'RC1').error, /重复/)
})

// ---------- .osz 有限成本检查 ----------

test('R04 真 zip 通过检查,非法/截断/超限的档案被拒', async () => {
  const bytes = await makeOsz({ 'map.osu': 'osu file format v14', 'audio.mp3': 'x' })
  const ok = inspectOszTail(tailOf(bytes), bytes.length)
  assert.equal(ok.ok, true)
  assert.equal(ok.value.entries, 2)
  assert.equal(ok.value.centralDirectoryScanned, true)
  assert.ok(ok.value.declaredUncompressedBytes > 0)

  const garbage = new Uint8Array(4096).fill(7)
  assert.match(inspectOszTail(garbage, garbage.length).error, /不是有效的 zip/)
  assert.match(inspectOszTail(new Uint8Array(10), 10).error, /文件太小/)

  // 中央目录越界(声称的偏移超过文件大小)
  const truncated = tailOf(bytes)
  const eocd = findEocd(truncated)
  new DataView(truncated.buffer, truncated.byteOffset + eocd).setUint32(16, 0xfffffff0, true)
  assert.match(inspectOszTail(truncated, bytes.length).error, /越界/)

  // 条目数 0(总条目数在 EOCD 偏移 10)
  const zero = tailOf(bytes)
  new DataView(zero.buffer, zero.byteOffset + findEocd(zero)).setUint16(10, 0, true)
  assert.match(inspectOszTail(zero, bytes.length).error, /没有任何条目/)

  // 声明解压体积超限(改中央目录里第一条的 uncompressed size)
  const bomb = tailOf(bytes)
  const cd = findEocd(bomb)
  const cdOffset = new DataView(bomb.buffer, bomb.byteOffset + cd).getUint32(16, true)
  const windowStart = bytes.length - bomb.length
  const cdStart = cdOffset - windowStart
  assert.equal(bomb[cdStart], 0x50, '中央目录头应以 PK 开头')
  new DataView(bomb.buffer, bomb.byteOffset + cdStart).setUint32(24, 0xfffffff0, true)
  assert.match(inspectOszTail(bomb, bytes.length).error, /解压体积/)
})

function findEocd(bytes) {
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i
  }
  return -1
}

// ---------- 上传 handler ----------

test('R04 上传:file 不是文件时 400 且不写任何对象', async () => {
  const gh = installGithub({ t: tournament('t', [{ id: 'r1', maps: [{ slot: 'RC1' }] }]) })
  try {
    const { status, payload, bucket } = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'RC1', file: 'not a file',
    })
    assert.equal(status, 400)
    assert.equal(payload.code, 'INVALID_FILE')
    assert.deepEqual(bucket.calls.put, [])
  } finally {
    gh.restore()
  }
})

test('R04 上传:坏键段/坏 nsv/非法 id 都在拼键前被拒', async () => {
  const gh = installGithub({ t: tournament('t', [{ id: 'r1', maps: [{ slot: 'RC1' }] }]) })
  try {
    const bytes = await makeOsz()
    const file = new File([bytes], 'x.osz')

    const badSlot = await runUpload({ tournamentId: 't', roundId: 'r1', slot: '../etc', file })
    assert.equal(badSlot.status, 400)
    assert.equal(badSlot.payload.code, 'INVALID_SLOT')

    const badRound = await runUpload({ tournamentId: 't', roundId: '..', slot: 'RC1', file })
    assert.equal(badRound.payload.code, 'INVALID_ROUND_ID')

    const badNsv = await runUpload({ tournamentId: 't', roundId: 'r1', slot: 'RC1', file, nsv: 'maybe' })
    assert.equal(badNsv.payload.code, 'INVALID_NSV')

    const badId = await runUpload({ tournamentId: '../escape', roundId: 'r1', slot: 'RC1', file })
    assert.equal(badId.payload.code, 'INVALID_TOURNAMENT')

    assert.deepEqual(badSlot.bucket.calls.put, [])
    assert.deepEqual(badNsv.bucket.calls.put, [])
  } finally {
    gh.restore()
  }
})

test('R04 上传:非 zip、TSV 后缀歧义、未知槽位、重复槽位都不写', async () => {
  const dupSlot = tournament('t', [{ id: 'r1', maps: [{ slot: 'RC1' }, { slot: 'RC1' }] }])
  const gh = installGithub({
    t: tournament('t', [{ id: 'r1', maps: [{ slot: 'RC1' }] }]),
    dup: dupSlot,
  })
  try {
    const notZip = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'RC1', file: new File([new Uint8Array(2048).fill(3)], 'x.osz'),
    })
    assert.equal(notZip.payload.code, 'INVALID_ARCHIVE')

    const bytes = await makeOsz()
    const ambiguous = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'RC1.nsv', file: new File([bytes], 'x.osz'),
    })
    assert.equal(ambiguous.payload.code, 'SLOT_SUFFIX_CONFLICT')

    const unknown = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'NOPE', file: new File([bytes], 'x.osz'),
    })
    assert.equal(unknown.payload.code, 'UNKNOWN_SLOT')
    assert.deepEqual(unknown.bucket.calls.put, [])

    const dup = await runUpload({
      tournamentId: 'dup', roundId: 'r1', slot: 'RC1', file: new File([bytes], 'x.osz'),
    })
    assert.equal(dup.payload.code, 'UNKNOWN_SLOT')
    assert.match(dup.payload.error, /重复/)
    assert.deepEqual(dup.bucket.calls.put, [])

    for (const res of [notZip, ambiguous, unknown, dup]) {
      assert.deepEqual(res.bucket.calls.put, [], `${res.payload.code} 时不能写对象`)
    }
  } finally {
    gh.restore()
  }
})

test('R04 上传:合法请求写成正确的键(ReadableStream 照旧)', async () => {
  const gh = installGithub({ t: tournament('t', [{ id: 'r1', maps: [{ slot: 'FS/TB' }] }]) })
  try {
    const bytes = await makeOsz()
    const main = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'FS/TB', file: new File([bytes], 'x.osz'),
    })
    assert.equal(main.status, 200)
    assert.equal(main.payload.key, 'maps/t/r1/FS/TB.osz')
    assert.equal(main.bucket.calls.put.length, 1)
    assert.equal(main.bucket.calls.put[0].key, 'maps/t/r1/FS/TB.osz')
    assert.equal(main.bucket.calls.put[0].isStream, true, '上传体仍是 ReadableStream')

    const nsv = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'FS/TB', file: new File([bytes], 'x.osz'), nsv: '1',
    })
    assert.equal(nsv.payload.key, 'maps/t/r1/FS/TB.nsv.osz')
    assert.notEqual(main.payload.key, nsv.payload.key, '普通与 NSV 键不冲突')
  } finally {
    gh.restore()
  }
})

test('R04 上传:比赛不存在返回 404,上游失败返回 502', async () => {
  const gh = installGithub({})
  try {
    const bytes = await makeOsz()
    const missing = await runUpload({
      tournamentId: 'ghost', roundId: 'r1', slot: 'RC1', file: new File([bytes], 'x.osz'),
    })
    assert.equal(missing.status, 404)
    assert.equal(missing.payload.code, 'TOURNAMENT_NOT_FOUND')
    assert.deepEqual(missing.bucket.calls.put, [])
  } finally {
    gh.restore()
  }

  const original = globalThis.fetch
  globalThis.fetch = async () => jsonRes(500, { message: 'boom' })
  try {
    const bytes = await makeOsz()
    const broken = await runUpload({
      tournamentId: 't', roundId: 'r1', slot: 'RC1', file: new File([bytes], 'x.osz'),
    })
    assert.equal(broken.status, 502)
    assert.equal(broken.payload.code, 'UPSTREAM_ERROR')
    assert.deepEqual(broken.bucket.calls.put, [])
  } finally {
    globalThis.fetch = original
  }
})

// ---------- 与真实数据兼容 ----------

test('R04 全库真实 (比赛/轮次/槽位) 全部通过新规则,且无键碰撞', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = path.join(process.cwd(), 'data', 'tournaments')
  const rejected = []
  const collisions = []
  let slots = 0

  for (const file of fs.readdirSync(dir)) {
    const tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const idCheck = validateKeySegment(tournament.id, { field: 'tournamentId', maxLength: 128 })
    if (!idCheck.ok) rejected.push(`${file}: tournamentId ${idCheck.error}`)
    const keys = new Set()
    for (const round of tournament.rounds || []) {
      const roundCheck = validateRoundId(round.id)
      if (!roundCheck.ok) rejected.push(`${file} ${round.id}: ${roundCheck.error}`)
      for (const map of round.maps || []) {
        slots++
        const slotCheck = validateSlot(map.slot)
        if (!slotCheck.ok) rejected.push(`${file} ${round.id} ${map.slot}: ${slotCheck.error}`)
        if (hasNsvSuffixAmbiguity(map.slot, false)) rejected.push(`${file} ${round.id} ${map.slot}: NSV 后缀歧义`)
        for (const nsv of [false, true]) {
          const key = mapObjectKey(tournament.id, round.id, map.slot, nsv)
          if (keys.has(key)) collisions.push(key)
          keys.add(key)
        }
      }
    }
  }

  assert.ok(slots > 4000, `应扫到全部真实槽位(实际 ${slots})`)
  assert.deepEqual(rejected, [], '现有数据必须全部通过键段校验')
  assert.deepEqual(collisions, [], '现有数据不得出现键碰撞')
})

// ---------- 删除 handler ----------

test('R04 删除:坏键段不触达 R2;合法请求用共享键规则', async () => {
  const badBucket = makeFakeBucket()
  const bad = await deleteMap({
    request: new Request('https://ladder.test/api/maps/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: 't', roundId: 'r1', slot: 'a/../../b' }),
    }),
    env: { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', LADDER_KV: kv, R2_BUCKET: badBucket },
    data: { user: user('admin') },
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).code, 'INVALID_SLOT')
  assert.deepEqual(badBucket.calls.get, [], '坏键段不得触达 R2')

  const bucket = makeFakeBucket()
  bucket.store.set('maps/t/r1/RC1.osz', 'BODY')
  const ok = await deleteMap({
    request: new Request('https://ladder.test/api/maps/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: 't', roundId: 'r1', slot: 'RC1', nsv: false }),
    }),
    env: { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', LADDER_KV: kv, R2_BUCKET: bucket },
    data: { user: user('admin') },
  })
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).trashed, true)
  assert.deepEqual(bucket.calls.get, ['maps/t/r1/RC1.osz'])
  assert.equal(bucket.calls.put[0].key.startsWith('trash/maps/t/r1/RC1.osz.'), true)
  assert.deepEqual(bucket.calls.delete, ['maps/t/r1/RC1.osz'])
})
