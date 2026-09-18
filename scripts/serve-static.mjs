#!/usr/bin/env node
// 纯静态预览服务器（R19）。
//
// 为什么需要它：next.config.js 是 `output: 'export'`（纯静态导出），
// `next start` 在这种模式下没有意义 —— 它要的是 `.next` 的服务端产物，
// 静态导出下会直接报错。所以 `npm start` 改成伺服 `out/`。
//
// ⚠️ 这个脚本**不含后端**：`/api/*` 是 Cloudflare Pages Functions，
// `next dev` 与本脚本都不 serve（fetch 必 404）。要连后端联调请用
// `npm run dev:api`（wrangler pages dev，需要 .dev.vars 放密钥）。
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
}

// 纯函数：请求路径 → 候选相对路径（按优先级，相对 out/）。
//
// Next 静态导出把路由写成 `<route>.html`（**不是** `<route>/index.html`），
// 所以 `/admin` 要先试 `admin.html`，再退到 `admin/index.html`。
// 返回空数组 = 这个路径不该被伺服（越界 / 控制字符 / 反斜杠）。
export function staticCandidates(rawUrlPath) {
  // 刻意手工解析，不用 `new URL(raw, base)`：
  //   1. 以 `//` 开头的路径会被当成协议相对 URL，第一段会被当作 host 吃掉
  //      （`//admin//` 的 pathname 变成 `/`，路由直接丢了）；
  //   2. URL 解析器会静默把 `..` 和 `\` 规范化掉 —— 安全判断就"看不见"它们了。
  // 手工解析后这些形式会原样出现在 segments 里，由下面显式拒绝。
  const raw = String(rawUrlPath ?? '')
  const cut = raw.search(/[?#]/)
  const pathPart = cut === -1 ? raw : raw.slice(0, cut)
  let decoded
  try {
    decoded = decodeURIComponent(pathPart)
  } catch {
    return []
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return []
  const segments = decoded.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.some((s) => s === '..')) return []
  if (segments.length === 0) return ['index.html']
  const joined = segments.join('/')
  if (path.extname(segments[segments.length - 1])) return [joined]
  return [`${joined}.html`, `${joined}/index.html`]
}

export function createStaticServer({ outDir = OUT_DIR } = {}) {
  return createServer((req, res) => {
    const candidates = staticCandidates(req.url || '/')
    let file = null
    for (const rel of candidates) {
      const abs = path.resolve(outDir, rel)
      // 双保险：解析后必须仍在 out/ 之内（纯函数已经挡过一次）。
      if (!abs.startsWith(outDir + path.sep)) continue
      if (existsSync(abs) && statSync(abs).isFile()) {
        file = abs
        break
      }
    }

    if (!file) {
      const notFound = path.join(outDir, '404.html')
      if (existsSync(notFound)) {
        res.writeHead(404, { 'content-type': MIME['.html'] })
        createReadStream(notFound).pipe(res)
      } else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('404 Not Found')
      }
      return
    }

    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      // 本地预览不缓存，免得改完看不到新内容。
      'cache-control': 'no-store',
    })
    createReadStream(file).pipe(res)
  })
}

const isMain =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  if (!existsSync(OUT_DIR)) {
    console.error('[serve-static] 找不到 out/ —— 请先跑 `npm run build`（静态导出产物在 out/）。')
    process.exit(1)
  }
  const port = Number(process.env.PORT) || 3000
  const server = createStaticServer()
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[serve-static] 端口 ${port} 已被占用，换一个：PORT=3001 npm start`)
    } else {
      console.error('[serve-static]', err)
    }
    process.exit(1)
  })
  server.listen(port, () => {
    console.log(`[serve-static] 纯静态预览：http://localhost:${port}`)
    console.log('  只伺服 out/（静态导出产物），不含 /api —— 后端是 Pages Functions。')
    console.log('  要连后端联调：npm run dev:api（wrangler pages dev，需 .dev.vars）')
  })
}
