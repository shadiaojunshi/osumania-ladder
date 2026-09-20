// 包在清单/桶里的**稳定键**（不带内容哈希），以及「镜像是否还没同步」的判读。
//
// 为什么单独一个模块：这个键的拼法同时出现在几处 ——
//   · `scripts/pack-publish.js`：`findOrphanObjects` 用它判孤儿、`buildManifestPacks` 用它写
//     `pendingMirrors`；
//   · `scripts/generate-pack.js`：旧对象键的历史形态；
//   · 下载页：靠它判断「这个包的 Drive 镜像是不是旧内容」。
// 前两处在 `scripts/`（CommonJS）、前端在 `src/lib`，跨边界不能互相 import —— 所以这里给出
// 前端这一侧的实现，并由 `scripts/pack-mirrors.test.mjs` 断言它与 `pack-publish.js` 的产物一致
// （与 `suggestions/validation.ts` / `functions/api/_lib/validation.ts` 的镜像锁同一个做法）。

/**
 * `SS_1.osz` 形态的包键。
 *
 * 与 `scripts/pack-publish.js` 的 `` `${realType}_${part || 1}.osz` `` 同规则 ——
 * `part` 缺席（单包）按 1 算。
 *
 * ⚠️ **不带内容哈希**。带哈希的是 R2 的 `objectKey`（`SS_1.a1b2c3d4.osz`），那是另一个概念：
 * 对象键随内容变，这个包键永远不变。别把两者混用。
 */
export function packMirrorKey(realType: string, part?: number | null): string {
  return `${realType}_${part || 1}.osz`
}

/**
 * 这个包的镜像是不是还没同步。
 *
 * 清单顶层的 `pendingMirrors` 记的是「内容已经更新、但 Drive 那边还是上一版」的包；
 * 由 `upload-to-gdrive.js` 在真正上传成功后逐个划掉（只增不减，见 R10 加固）。
 *
 * 它的用途就是让**下载页**能如实标注 —— 光写清单不显示，等于没做。
 */
export function isMirrorPending(
  pendingMirrors: readonly string[] | undefined,
  realType: string,
  part?: number | null,
): boolean {
  if (!pendingMirrors || pendingMirrors.length === 0) return false
  return pendingMirrors.includes(packMirrorKey(realType, part))
}

/**
 * 读清单顶层的 `pendingMirrors`。**永不抛异常**：字段缺失、形状不对（手工改坏、旧清单）
 * 一律当空数组 —— 下载页不该因为一个可选字段坏掉就整页崩。
 */
export function readPendingMirrors(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}
