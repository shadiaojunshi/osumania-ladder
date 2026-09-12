// 让 `node --test` 能加载 Functions 源码里「省略扩展名」的相对 import。
//
// Cloudflare Pages Functions 由 esbuild 打包,写法是 `import { x } from '../_lib/cors'`;
// Node 的 ESM 解析器要求显式扩展名,否则 ERR_MODULE_NOT_FOUND。
// 这个 loader 只处理相对路径、且没有扩展名的说明符:补 `.ts` 再试,失败就交回默认解析。
//
// 用法(在测试文件里,静态 import 之前):
//   import { register } from 'node:module'
//   register(new URL('./_ts-extension-loader.mjs', import.meta.url))
//   const { onRequestPost } = await import('../functions/api/tournaments/batch.ts')

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier)
  if (isRelative && !hasExtension) {
    try {
      return await nextResolve(`${specifier}.ts`, context)
    } catch {
      // 不是 .ts,交回默认解析(可能是目录 import 或别的扩展名)
    }
  }
  return nextResolve(specifier, context)
}
