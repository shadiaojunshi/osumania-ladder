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

/**
 * `value` 是不是一个合法 role。
 *
 * 必须查**自有属性**：`value in ROLE_RANK` 对 'constructor' / 'toString' / 'valueOf' /
 * '__proto__' 这些原型链上的名字也返回 true —— 请求体里塞一个 `role: 'constructor'`
 * 就能通过校验写进 KV。之后 resolveRole 返回这个非法值，`ROLE_RANK[role] >= rank`
 * 得到 NaN 比较 → false，等于**把这个管理员静默降级成 readonly**（还不报错）。
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROLE_RANK, value)
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

// 5 秒 isolate 内存缓存，防失控请求把 KV 配额打爆。
//
// 一致性边界（别再声称"所有节点最多 5 秒生效"）：这 5 秒只是**本 isolate 内**的读缓存 TTL。
// Cloudflare KV 本身是最终一致的，官方给的全球传播上界是 **60 秒**，所以一次撤权在别的
// 边缘节点上最多可能延迟约 60s + 5s。需要「立即生效」的强一致协调得换 Durable Object
// （见 PROJECT-REVIEW R15）。
let adminMapCache: { value: AdminMap; expiresAt: number } | null = null
const ADMIN_MAP_TTL_MS = 5_000

/**
 * 把 KV 里读出来的原始对象净化成 AdminMap：
 * - 非法 role 的条目降级成 readonly（= 不授予任何权限），并留下诊断日志；
 *   一处脏数据不该让整个名单失效，更不该把非法值继续喂给 hasRole。
 * - 其余字段补类型兜底，免得下游 `.trim()` / 比较时炸。
 */
function sanitizeAdminMap(parsed: unknown): AdminMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: AdminMap = {}
  for (const [uid, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    if (!isRole(rec.role)) {
      console.error('[auth] INVALID_ROLE_IN_KV', { uid, roleType: typeof rec.role })
      continue // readonly = 不在名单里
    }
    if (rec.role === 'readonly') continue
    out[uid] = {
      role: rec.role,
      username: typeof rec.username === 'string' ? rec.username : uid,
      addedBy: typeof rec.addedBy === 'string' ? rec.addedBy : '',
      addedAt: typeof rec.addedAt === 'string' ? rec.addedAt : '',
    }
  }
  return out
}

/**
 * 读管理员名单。**返回副本**：调用方拿到后会直接 `delete map[uid]` / `map[uid] = rec`
 * 再 putAdminMap，返回缓存本体的话，一旦 put 失败就会留下「内存里改了、KV 里没改」的假象。
 */
export async function getAdminMap(env: AuthEnv): Promise<AdminMap> {
  const now = Date.now()
  if (adminMapCache && adminMapCache.expiresAt > now) {
    return { ...adminMapCache.value }
  }
  const raw = await env.LADDER_KV.get(ADMINS_KEY)
  let value: AdminMap = {}
  if (raw) {
    try {
      value = sanitizeAdminMap(JSON.parse(raw))
    } catch {
      value = {}
    }
  }
  adminMapCache = { value, expiresAt: now + ADMIN_MAP_TTL_MS }
  return { ...value }
}

/**
 * 写整份名单。
 *
 * 已知边界（R15，未修）：这里是「读整份 → 改 → 写整份」，两个并发的权限变更会互相覆盖
 *（后写的赢）。实际影响极小 —— 只有站长在后台改权限时才会触发，两次点击之间隔着一次
 * KV 往返。要真正可靠得换成 Durable Object 之类的强一致协调；
 * 只把名单拆成「每 UID 一个 key」解决不了同 UID 竞争。
 */
export async function putAdminMap(env: AuthEnv, map: AdminMap): Promise<void> {
  const snapshot = { ...map }
  // 先落 KV，成功了才更新缓存 —— 写失败时缓存保持旧值，
  // 不能出现「缓存说他是 admin、KV 里其实没写进去」。
  await env.LADDER_KV.put(ADMINS_KEY, JSON.stringify(snapshot))
  adminMapCache = { value: snapshot, expiresAt: Date.now() + ADMIN_MAP_TTL_MS }
}

/**
 * 丢掉 isolate 内的名单缓存，下一次读取重新打 KV。
 * 权限变更后想立刻生效、以及测试要一个确定的起点时用。
 */
export function clearAdminMapCache(): void {
  adminMapCache = null
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
  // 纵深防御：SessionUser.role 来自 resolveRole，理论上已经被净化过，
  // 但这里再挡一次，杜绝「非法 role 被当成某个档位」的可能。
  if (!isRole(user.role)) return false
  return ROLE_RANK[user.role] >= ROLE_RANK[min]
}
