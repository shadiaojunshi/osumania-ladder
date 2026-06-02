// Session auth + role-based authorization, backed by Cloudflare KV.
//
// Design:
// - osu! OAuth issues us a verified osu user id + username (see osu.ts).
// - We mint a signed, HttpOnly session cookie (HMAC-SHA256 over a JSON payload).
//   The cookie carries ONLY identity (uid/username) + expiry, never the role.
// - Role is looked up from KV on every request, so a demotion takes effect
//   immediately rather than waiting for the cookie to expire.
// - BOOTSTRAP_OWNER_UID is always treated as `owner`, even if KV is empty/wiped,
//   so you can never lock yourself out.

export type Role = 'readonly' | 'contributor' | 'admin' | 'owner'

export const ROLE_RANK: Record<Role, number> = {
  readonly: 0,
  contributor: 1,
  admin: 2,
  owner: 3,
}

export interface SessionUser {
  uid: string
  username: string
  role: Role
}

export interface AuthEnv {
  LADDER_KV: KVNamespace
  SESSION_SECRET: string
  BOOTSTRAP_OWNER_UID: string
}

export interface AdminRecord {
  role: Exclude<Role, 'readonly'>
  username: string
  addedBy: string
  addedAt: string
}

export type AdminMap = Record<string, AdminRecord>

const ADMINS_KEY = 'admins'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const COOKIE_NAME = 'ladder_session'

// ---------- base64url helpers ----------

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const encoder = new TextEncoder()

// ---------- HMAC signing ----------

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return bytesToBase64Url(new Uint8Array(sig))
}

// Constant-time-ish comparison via re-verification through Web Crypto.
async function verify(data: string, signature: string, secret: string): Promise<boolean> {
  const key = await importKey(secret)
  let sigBytes: Uint8Array<ArrayBuffer>
  try {
    sigBytes = base64UrlToBytes(signature)
  } catch {
    return false
  }
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data))
}

// ---------- session token ----------

interface TokenPayload {
  uid: string
  username: string
  iat: number
  exp: number
}

export async function createSessionToken(
  uid: string,
  username: string,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: TokenPayload = {
    uid,
    username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await sign(body, secret)
  return `${body}.${signature}`
}

async function parseSessionToken(token: string, secret: string): Promise<TokenPayload | null> {
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!(await verify(body, signature, secret))) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  if (!payload.uid) return null
  return payload
}

// ---------- cookie helpers ----------

export function buildSessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ')
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

// ---------- admin list (KV) ----------

export async function getAdminMap(env: AuthEnv): Promise<AdminMap> {
  const raw = await env.LADDER_KV.get(ADMINS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as AdminMap
  } catch {
    return {}
  }
}

export async function putAdminMap(env: AuthEnv, map: AdminMap): Promise<void> {
  await env.LADDER_KV.put(ADMINS_KEY, JSON.stringify(map))
}

export async function resolveRole(env: AuthEnv, uid: string): Promise<Role> {
  if (uid && uid === env.BOOTSTRAP_OWNER_UID) return 'owner'
  const map = await getAdminMap(env)
  return map[uid]?.role ?? 'readonly'
}

// ---------- main entry: who is calling ----------

export async function getSessionUser(
  request: Request,
  env: AuthEnv,
): Promise<SessionUser | null> {
  const token = readCookie(request, COOKIE_NAME)
  if (!token) return null
  const payload = await parseSessionToken(token, env.SESSION_SECRET)
  if (!payload) return null
  const role = await resolveRole(env, payload.uid)
  return { uid: payload.uid, username: payload.username, role }
}

export function hasRole(user: SessionUser | null, min: Role): boolean {
  if (!user) return false
  return ROLE_RANK[user.role] >= ROLE_RANK[min]
}
