import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'

register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { readPlayerProfile, buildPlayerProfileCookie } = await import('../src/lib/playerProfile.ts')
const { createSessionToken, getSessionIdentity, getSessionUser } = await import('../functions/api/_lib/auth.ts')
const { onRequestGet: me } = await import('../functions/api/auth/me.ts')
const { onRequestPost: logout } = await import('../functions/api/auth/logout.ts')

const env = {
  SESSION_SECRET: 'test-only-secret', BOOTSTRAP_OWNER_UID: '42',
  LADDER_KV: { get() { throw new Error('Display-only identity must not read KV') } },
}

test('profile cookie safely round-trips names and expires with the session', () => {
  const profile = { uid: '42', username: '玩家;=猫 & dog', exp: 12345 }
  const cookie = buildPlayerProfileCookie(profile, 12000000)
  assert.deepEqual(readPlayerProfile(`unrelated=1; ${cookie}`, 12000000), profile)
  assert.equal(readPlayerProfile(cookie, 12345000), null)
  assert.match(cookie, /Secure; SameSite=Lax; Path=\/; Max-Age=345/)
  for (const raw of ['%', 'null', '{}', '{"uid":"../x","username":"x","exp":9999999999}']) {
    assert.equal(readPlayerProfile(`ladder_player=${raw}`), null)
  }
})

test('a forged display cookie cannot authenticate or grant a role', async () => {
  const fake = buildPlayerProfileCookie({ uid: '42', username: 'owner', exp: 9999999999 })
  const request = new Request('https://example.com/api/auth/me', { headers: { Cookie: fake } })
  assert.equal(await getSessionIdentity(request, env), null)
  assert.equal(await getSessionUser(request, env), null)
  const response = await me({ request, env })
  assert.equal((await response.json()).user, null)
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/)
})

test('existing signed sessions gain a display cookie without extending their expiry', async () => {
  const token = await createSessionToken('42', '玩家', env.SESSION_SECRET)
  const request = new Request('https://example.com/api/auth/me', { headers: { Cookie: `ladder_session=${token}` } })
  const identity = await getSessionIdentity(request, env)
  const response = await me({ request, env })
  const profile = readPlayerProfile(response.headers.get('Set-Cookie'))
  assert.deepEqual(profile, { uid: '42', username: '玩家', exp: identity.exp })
  assert.equal((await response.json()).user.role, 'owner')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.ok(!response.headers.get('Set-Cookie').includes(token))
})

test('logout clears both cookies', async () => {
  const cookies = (await logout()).headers.getSetCookie()
  assert.equal(cookies.length, 2)
  assert.ok(cookies.some((cookie) => cookie.startsWith('ladder_session=')))
  assert.ok(cookies.some((cookie) => cookie.startsWith('ladder_player=')))
  for (const cookie of cookies) assert.match(cookie, /Max-Age=0/)
})
