// R19：纯静态预览服务器的路由映射与越界拒绝。
//
// 两部分：
//   1. staticCandidates 是纯函数，逐条断言映射规则；
//   2. 真起一个 http server（指向临时目录里的 fixture）打几次请求，
//      确认候选顺序、content-type、404 与目录穿越都按预期工作。
//
// 用临时目录而不是 out/：out/ 是 .gitignore 里的构建产物，CI / 干净 checkout
// 下不存在。临时目录不删除（本环境的批量删除守卫会拦，且 %TEMP% 本来就是
// 系统托管的临时区）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createStaticServer, staticCandidates } from './serve-static.mjs'

// fetch() 会在客户端就把 /../ 规范化掉，测不到"服务端收到裸 .. 怎么办"。
// 所以穿越用例走 http.request，path 原样发出。
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('staticCandidates：根路径与查询串都落到 index.html', () => {
  assert.deepEqual(staticCandidates('/'), ['index.html'])
  assert.deepEqual(staticCandidates('/?a=1#b'), ['index.html'])
  assert.deepEqual(staticCandidates(''), ['index.html'])
})

test('staticCandidates：无扩展名的路由先试 <route>.html（Next 静态导出的形状）', () => {
  assert.deepEqual(staticCandidates('/admin'), ['admin.html', 'admin/index.html'])
  assert.deepEqual(staticCandidates('/admin/'), ['admin.html', 'admin/index.html'])
  assert.deepEqual(staticCandidates('/a/b'), ['a/b.html', 'a/b/index.html'])
  assert.deepEqual(staticCandidates('/_not-found'), ['_not-found.html', '_not-found/index.html'])
})

test('staticCandidates：带扩展名的当成静态文件原样取', () => {
  assert.deepEqual(staticCandidates('/admin.html'), ['admin.html'])
  assert.deepEqual(staticCandidates('/_next/static/chunks/main.js'), ['_next/static/chunks/main.js'])
  assert.deepEqual(staticCandidates('/favicon.ico'), ['favicon.ico'])
})

test('staticCandidates：多余的 / 与 . 段被规范化，不影响映射', () => {
  assert.deepEqual(staticCandidates('//admin//'), ['admin.html', 'admin/index.html'])
  assert.deepEqual(staticCandidates('/./admin'), ['admin.html', 'admin/index.html'])
})

test('staticCandidates：目录穿越一律拒绝（含编码形式）', () => {
  for (const bad of [
    '/../etc/passwd',
    '/../../secret.json',
    '/a/../../b',
    '/a/%2e%2e/b',
    '/%2e%2e%2fsecret',
    '..%2fsecret',
    '/..',
  ]) {
    assert.deepEqual(staticCandidates(bad), [], `应拒绝: ${bad}`)
  }
})

test('staticCandidates：反斜杠、NUL、坏百分号编码一律拒绝', () => {
  assert.deepEqual(staticCandidates('/a\\b'), [])
  assert.deepEqual(staticCandidates('/%5Cwindows'), [])
  assert.deepEqual(staticCandidates('/%00'), [])
  assert.deepEqual(staticCandidates('/%zz'), [])
})

test('静态服务器：路由映射 / content-type / 404 / 穿越拒绝（真实请求）', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mania-static-'))
  mkdirSync(path.join(dir, '_next', 'static', 'chunks'), { recursive: true })
  writeFileSync(path.join(dir, 'index.html'), '<h1>home</h1>')
  writeFileSync(path.join(dir, 'admin.html'), '<h1>admin</h1>')
  writeFileSync(path.join(dir, '404.html'), '<h1>custom not found</h1>')
  writeFileSync(path.join(dir, '_next', 'static', 'chunks', 'main.js'), 'console.log(1)')
  writeFileSync(path.join(dir, 'admin.txt'), 'rsc payload')

  const server = createStaticServer({ outDir: dir })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`

  const home = await fetch(`${base}/`)
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-type') ?? '', /^text\/html/)
  assert.equal(await home.text(), '<h1>home</h1>')

  // 无扩展名路由 → admin.html（而不是 admin/index.html）
  const admin = await fetch(`${base}/admin`)
  assert.equal(admin.status, 200)
  assert.equal(await admin.text(), '<h1>admin</h1>')

  const js = await fetch(`${base}/_next/static/chunks/main.js`)
  assert.equal(js.status, 200)
  assert.match(js.headers.get('content-type') ?? '', /^text\/javascript/)

  const txt = await fetch(`${base}/admin.txt`)
  assert.equal(txt.status, 200)
  assert.match(txt.headers.get('content-type') ?? '', /^text\/plain/)
  assert.equal(await txt.text(), 'rsc payload')

  // 不存在 → 用 out/404.html
  const missing = await fetch(`${base}/no-such-page`)
  assert.equal(missing.status, 404)
  assert.equal(await missing.text(), '<h1>custom not found</h1>')

  // 目录穿越不能读到 fixture 之外的东西（原样发裸 .. ，不给客户端规范化）
  const port = server.address().port
  const escaped = await rawGet(port, '/../package.json')
  assert.equal(escaped.status, 404, '穿越请求必须 404')
  assert.equal(escaped.body, '<h1>custom not found</h1>')

  // 编码形式的穿越走 fetch 也拦得住
  const encoded = await fetch(`${base}/%2e%2e/package.json`)
  assert.equal(encoded.status, 404)
})
