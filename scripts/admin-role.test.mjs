import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// R15：三处权限相关的毛病。
//
// ① `role in ROLE_RANK` 会把**原型链上的名字**当成合法 role：请求体里塞
//    `role: 'constructor'` 就能通过校验写进 KV。之后 resolveRole 返回这个非法值，
//    `ROLE_RANK[role] >= rank` 得到 NaN 比较 → false —— 等于**把这个管理员静默降级成
//    readonly**（还不报错）。改查自有属性。
// ② getAdminMap 返回的是缓存本体，调用方直接 `delete map[uid]` 再 putAdminMap：
//    put 失败就留下「内存里改了、KV 里没改」的假象。
// ③ uid/username 没验类型：`(uid ?? '').trim()` 遇到数字/对象直接抛，变成 500。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { isRole, hasRole, getAdminMap, putAdminMap, resolveRole, clearAdminMapCache } = await import(
  '../functions/api/_lib/auth.ts'
)
const { onRequestPost: postAdmin, onRequestDelete: deleteAdmin } = await import(
  '../functions/api/admins/index.ts'
)

const ADMINS_KEY = 'admins'

/** 假 KV：够用即可（get / put），put 可被切成失败。 */
function makeKv(raw = null) {
  return {
    stored: raw,
    puts: [],
    failPut: false,
    async get(key) {
      return key === ADMINS_KEY ? this.stored : null
    },
    async put(key, value) {
      if (this.failPut) throw new Error('KV PUT failed (simulated)')
      this.puts.push({ key, value })
      if (key === ADMINS_KEY) this.stored = value
    },
  }
}

const ENV = (kv) => ({ LADDER_KV: kv, SESSION_SECRET: 's', BOOTSTRAP_OWNER_UID: '1' })
const owner = { uid: '1', username: '站长', role: 'owner' }
const rec = (role, username = 'a') => ({ role, username, addedBy: 'x', addedAt: 'y' })

async function callAdmin(handler, { body, user = owner, env, method = 'POST' }) {
  const request = new Request('https://x/api/admins', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await handler({ request, env, data: { user }, params: {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ---------- isRole ----------

test('R15 isRole：拒绝原型链上的名字（这些过去都能通过 `role in ROLE_RANK`）', () => {
  for (const bad of [
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ]) {
    assert.equal(isRole(bad), false, `${bad} 必须被拒绝`)
  }
})

test('R15 isRole：非字符串 / 空串 / 大小写不符也拒绝', () => {
  for (const bad of ['', 'Owner', 'ADMIN', 'readonly ', 'admin\n', 1, null, undefined, {}, [], ['admin'], true]) {
    assert.equal(isRole(bad), false, `${JSON.stringify(bad)} 必须被拒绝`)
  }
})

test('R15 isRole：四个合法角色通过', () => {
  for (const ok of ['readonly', 'contributor', 'admin', 'owner']) {
    assert.equal(isRole(ok), true, `${ok} 应该合法`)
  }
})

test('R15 hasRole：role 非法时不给任何权限（NaN 比较不成立，不会误判成 owner）', () => {
  assert.equal(hasRole({ uid: '2', username: 'x', role: 'constructor' }, 'contributor'), false)
  assert.equal(hasRole({ uid: '2', username: 'x', role: '__proto__' }, 'readonly'), false)
  assert.equal(hasRole(null, 'readonly'), false)
  assert.equal(hasRole({ uid: '2', username: 'x', role: 'owner' }, 'admin'), true)
})

// ---------- getAdminMap / putAdminMap ----------

test('R15 KV 里已有非法 role：那条按 readonly 处理，合法条目不受影响，且留下诊断', async () => {
  const kv = makeKv(
    JSON.stringify({
      '2': rec('constructor', '攻击者'),
      '3': rec('admin', '好人'),
    }),
  )
  clearAdminMapCache()
  const logged = []
  const originalError = console.error
  console.error = (...args) => logged.push(args)
  try {
    const map = await getAdminMap(ENV(kv))
    assert.equal(map['2'], undefined, '非法 role 的条目必须被剔除')
    assert.equal(map['3'].role, 'admin', '同一次读取里的合法条目不能被连累')
    assert.equal(await resolveRole(ENV(kv), '2'), 'readonly')
    assert.equal(await resolveRole(ENV(kv), '3'), 'admin')
    assert.ok(
      logged.some((args) => args[0] === '[auth] INVALID_ROLE_IN_KV'),
      '要留下不含敏感信息的诊断日志',
    )
  } finally {
    console.error = originalError
  }
})

test('R15 getAdminMap 返回副本：调用方改了不会污染缓存', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  await putAdminMap(ENV(kv), { '2': rec('admin') })

  const first = await getAdminMap(ENV(kv))
  delete first['2']
  first['9'] = rec('owner', '偷偷加的人')

  const second = await getAdminMap(ENV(kv))
  assert.deepEqual(Object.keys(second), ['2'], '缓存不该被调用方的修改影响')
  assert.equal(second['9'], undefined)
})

test('R15 KV 写失败后角色不变（不留「内存改了、KV 没改」的假象）', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  await putAdminMap(ENV(kv), { '2': rec('admin') })

  kv.failPut = true
  await assert.rejects(() => putAdminMap(ENV(kv), { '2': rec('readonly') }))

  const after = await getAdminMap(ENV(kv))
  assert.equal(after['2'].role, 'admin', 'put 失败后原角色必须不变')
  assert.equal(await resolveRole(ENV(kv), '2'), 'admin')
})

test('R15 clearAdminMapCache：清掉后重新打 KV', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  await putAdminMap(ENV(kv), { '2': rec('admin') })
  kv.stored = JSON.stringify({ '2': rec('owner') })
  clearAdminMapCache()
  assert.equal((await getAdminMap(ENV(kv)))['2'].role, 'owner', '应从 KV 重读而不是用旧缓存')
})

// ---------- handlers ----------

test('R15 POST：role=constructor 被 400 拒绝，绝不写进 KV', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const { status, body } = await callAdmin(postAdmin, {
    body: { uid: '2', username: 'x', role: 'constructor' },
    env: ENV(kv),
  })
  assert.equal(status, 400)
  assert.match(body.error, /role/)
  assert.equal(kv.puts.filter((p) => p.key === ADMINS_KEY).length, 0, '不能落库')
})

test('R15 POST：uid 是数字时回 400，不再抛成 500', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const { status } = await callAdmin(postAdmin, {
    body: { uid: 12345, username: 'x', role: 'admin' },
    env: ENV(kv),
  })
  assert.equal(status, 400)
})

test('R15 POST：username 不是字符串时按空处理，不抛', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const { status } = await callAdmin(postAdmin, {
    body: { uid: '2', username: { evil: true }, role: 'admin' },
    env: ENV(kv),
  })
  assert.equal(status, 200)
  assert.equal(JSON.parse(kv.stored)['2'].username, '2', '缺名字就退回 uid')
})

test('R15 POST：请求体不是 JSON 时回 400', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const request = new Request('https://x/api/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  })
  const res = await postAdmin({ request, env: ENV(kv), data: { user: owner }, params: {} })
  assert.equal(res.status, 400)
})

test('R15 POST：合法请求照常写入', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const { status } = await callAdmin(postAdmin, {
    body: { uid: '2', username: '新人', role: 'contributor' },
    env: ENV(kv),
  })
  assert.equal(status, 200)
  assert.equal(JSON.parse(kv.stored)['2'].role, 'contributor')
})

test('R15 bootstrap owner 不可被改动或移除', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const byPost = await callAdmin(postAdmin, {
    body: { uid: '1', username: 'x', role: 'admin' },
    env: ENV(kv),
  })
  assert.equal(byPost.status, 403)
  const byDelete = await callAdmin(deleteAdmin, {
    body: { uid: '1' },
    env: ENV(kv),
    method: 'DELETE',
  })
  assert.equal(byDelete.status, 403)
})

test('R15 DELETE：uid 不是字符串时回 400，不抛', async () => {
  const kv = makeKv()
  clearAdminMapCache()
  const { status } = await callAdmin(deleteAdmin, {
    body: { uid: 999 },
    env: ENV(kv),
    method: 'DELETE',
  })
  assert.equal(status, 400)
})
