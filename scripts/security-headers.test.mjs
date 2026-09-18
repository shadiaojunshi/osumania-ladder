// R21：后台安全头与写请求 Origin 边界。
//
// 三块断言：
//   1. `_headers` 的语法与内容（只限后台页、必须有 frame-ancestors/X-Frame-Options、
//      **不得出现会破坏 Next 静态站内联启动脚本的 script-src/default-src**）；
//   2. `_middleware.ts` 的写请求 Origin 闸门（同源放行、跨站写 403、非浏览器客户端放行、
//      读请求不走闸门、未登录仍是 401 —— 顺序不能把 401 变成 403）；
//   3. API 响应一律 `Cache-Control: private, no-store`，且允许调用方覆盖；
//      同时锁住"刻意保留的差异"（/api/osu/raw 的谱面文本是 private, no-cache）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8')

// ---------- 1. public/_headers ----------

/** 极简 `_headers` 解析：返回 [{ paths: string[], headers: [name, value][] }]。 */
function parseHeadersFile(text) {
  const rules = []
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/')) throw new Error(`非法路径行（必须以 / 开头）: ${JSON.stringify(line)}`)
      current = { paths: line.split(/\s+/), headers: [] }
      rules.push(current)
      continue
    }
    if (!current) throw new Error(`头部行出现在任何路径行之前: ${JSON.stringify(line)}`)
    const idx = line.indexOf(':')
    if (idx < 0) throw new Error(`头部行缺少冒号: ${JSON.stringify(line)}`)
    const name = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (!name || !value) throw new Error(`头部行不完整: ${JSON.stringify(line)}`)
    current.headers.push([name, value])
  }
  return rules
}

test('public/_headers：语法可解析，规则都挂在 / 开头的路径上', () => {
  const rules = parseHeadersFile(read('public/_headers'))
  assert.ok(rules.length > 0, '不能是空文件')
  for (const rule of rules) {
    assert.ok(rule.headers.length > 0, `路径 ${rule.paths.join(' ')} 没有任何头部`)
  }
})

test('public/_headers：后台页必须禁止被嵌入（frame-ancestors + X-Frame-Options）', () => {
  const rules = parseHeadersFile(read('public/_headers'))
  for (const target of ['/admin', '/admin.html']) {
    const rule = rules.find((r) => r.paths.includes(target))
    assert.ok(rule, `缺少 ${target} 的规则`)
    const map = Object.fromEntries(rule.headers.map(([k, v]) => [k.toLowerCase(), v]))
    assert.equal(map['x-frame-options'], 'DENY', `${target} 缺少 X-Frame-Options: DENY`)
    assert.match(map['content-security-policy'] ?? '', /frame-ancestors 'none'/, `${target} 缺少 frame-ancestors`)
  }
})

test('public/_headers：CSP 只能有 frame-ancestors（script-src/default-src 会破坏静态站）', () => {
  const rules = parseHeadersFile(read('public/_headers'))
  const cspValues = rules
    .flatMap((r) => r.headers)
    .filter(([name]) => name.toLowerCase() === 'content-security-policy')
    .map(([, value]) => value)
  assert.ok(cspValues.length > 0, '至少要在后台页上声明 frame-ancestors')
  for (const value of cspValues) {
    assert.ok(
      !/script-src|default-src|style-src|connect-src|img-src|object-src/i.test(value),
      `这里只允许 frame-ancestors，完整 CSP 要单独部署验证：${value}`,
    )
  }
})

test('public/_headers：范围只限后台页（不顺手给全站加 X-Frame-Options）', () => {
  const rules = parseHeadersFile(read('public/_headers'))
  assert.deepEqual(
    rules.flatMap((r) => r.paths).sort(),
    ['/admin', '/admin.html'],
    '给全站加头的影响面太大，本项只处理后台页',
  )
})

// ---------- 2. 写请求 Origin 闸门 ----------

const { isAllowedWriteOrigin, isWriteMethod } = await import('../functions/api/_middleware.ts')

const req = (method, origin, url = 'https://osumania-ladder.pages.dev/api/references') => {
  const headers = new Headers()
  if (origin !== undefined) headers.set('Origin', origin)
  return new Request(url, { method, headers })
}

test('isWriteMethod：只认 POST/PUT/PATCH/DELETE', () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'put']) assert.equal(isWriteMethod(m), true, m)
  for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) assert.equal(isWriteMethod(m), false, m)
})

test('isAllowedWriteOrigin：同源放行、跨站拒绝、无 Origin 放行、null 拒绝', () => {
  const same = req('PUT', 'https://osumania-ladder.pages.dev')
  assert.equal(isAllowedWriteOrigin(same), true)
  assert.equal(isAllowedWriteOrigin(req('PUT', 'https://evil.example')), false)
  assert.equal(isAllowedWriteOrigin(req('PUT', 'http://osumania-ladder.pages.dev')), false, '端口/协议不同也得看 host')
  assert.equal(isAllowedWriteOrigin(req('PUT', undefined)), true, 'curl/脚本不带 Origin')
  assert.equal(isAllowedWriteOrigin(req('PUT', 'null')), false, '沙箱 iframe / file:// 不能当同源')
  assert.equal(isAllowedWriteOrigin(req('PUT', 'not a url')), false)
})

test('isAllowedWriteOrigin：预览域名（同 host）与 allowlist 都放行', () => {
  const preview = req('POST', 'https://abc123.osumania-ladder.pages.dev', 'https://abc123.osumania-ladder.pages.dev/api/tournaments')
  assert.equal(isAllowedWriteOrigin(preview), true, '预览部署是同源请求，必须放行')

  const external = req('POST', 'https://ladder-tool.example')
  assert.equal(isAllowedWriteOrigin(external), false)
  assert.equal(isAllowedWriteOrigin(external, 'https://ladder-tool.example'), true)
  assert.equal(isAllowedWriteOrigin(external, ' https://other.example , https://ladder-tool.example '), true)
  assert.equal(isAllowedWriteOrigin(external, 'garbage'), false, 'allowlist 里有坏项不能让所有源都放行')
})

const { onRequest } = await import('../functions/api/_middleware.ts')

function context(request, { allowlist } = {}) {
  let nextCalled = false
  const ctx = {
    request,
    env: { LADDER_KV: {}, SESSION_SECRET: 'x', WRITE_ORIGIN_ALLOWLIST: allowlist },
    data: {},
    next: async () => {
      nextCalled = true
      return new Response('downstream', { status: 200 })
    },
  }
  return { ctx, wasNext: () => nextCalled }
}

test('中间件：跨站写请求 403 BAD_ORIGIN，且不进入下游', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { ctx, wasNext } = context(req(method, 'https://evil.example'))
    const res = await onRequest(ctx)
    assert.equal(res.status, 403, method)
    assert.equal((await res.clone().json()).code, 'BAD_ORIGIN')
    assert.equal(wasNext(), false)
  }
})

test('中间件：同源写请求放行到会话检查 —— 没 cookie 仍是 401（不是 403）', async () => {
  const { ctx, wasNext } = context(req('PUT', 'https://osumania-ladder.pages.dev'))
  const res = await onRequest(ctx)
  assert.equal(res.status, 401)
  assert.equal((await res.clone().json()).code, 'NO_SESSION')
  assert.equal(wasNext(), false, '没登录不该进下游')
})

test('中间件：不带 Origin 的非浏览器写请求不进 403 通道（照常 401）', async () => {
  const { ctx } = context(req('PUT', undefined))
  const res = await onRequest(ctx)
  assert.equal(res.status, 401)
})

test('中间件：读请求不走 Origin 闸门（GET 跨站也是 401，不是 403）', async () => {
  const { ctx } = context(req('GET', 'https://evil.example'))
  const res = await onRequest(ctx)
  assert.equal(res.status, 401)
})

test('中间件：OPTIONS 预检仍返回 204', async () => {
  const { ctx } = context(req('OPTIONS', 'https://evil.example'))
  const res = await onRequest(ctx)
  assert.equal(res.status, 204)
})

test('中间件：allowlist 配了才放行那个源', async () => {
  const cross = req('POST', 'https://ladder-tool.example')
  assert.equal((await onRequest(context(cross).ctx)).status, 403)
  assert.equal((await onRequest(context(cross, { allowlist: 'https://ladder-tool.example' }).ctx)).status, 401)
})

// ---------- 3. 缓存头 ----------

const { jsonResponse, noContent } = await import('../functions/api/_lib/cors.ts')

test('契约：JSON / 204 响应一律 private, no-store', () => {
  assert.equal(jsonResponse({ ok: true }).headers.get('cache-control'), 'private, no-store')
  assert.equal(jsonResponse({ error: 'x' }, 400).headers.get('cache-control'), 'private, no-store')
  assert.equal(noContent().headers.get('cache-control'), 'private, no-store')
})

test('契约：调用方可以覆盖缓存头（保留刻意的差异）', () => {
  const res = jsonResponse({ ok: true }, 200, { 'Cache-Control': 'private, no-cache' })
  assert.equal(res.headers.get('cache-control'), 'private, no-cache')
})

test('契约：/api/osu/raw 的谱面文本仍是 private, no-cache（不被 no-store 收拢）', () => {
  const raw = read('functions/api/osu/raw.ts')
  assert.match(raw, /'Cache-Control': 'private, no-cache'/, '谱面文本有自己的缓存语义，别一起改掉')
  const download = read('functions/api/osu/download.ts')
  assert.match(download, /Content-Disposition/, '附件下载的响应差异要保留')
})

test('契约：写路径的中间件先过 Origin 再过会话（源码顺序断言）', () => {
  const mw = read('functions/api/_middleware.ts')
  const originAt = mw.indexOf('isAllowedWriteOrigin(request')
  const sessionAt = mw.indexOf('getSessionUser(request, env)')
  assert.ok(originAt > 0 && sessionAt > 0)
  assert.ok(originAt < sessionAt, 'Origin 检查必须在会话解析之前')
})
