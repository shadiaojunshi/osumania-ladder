import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { register } from 'node:module'
import test from 'node:test'

// 下载页要读 `pendingMirrors` 才能如实标注「这个包的镜像还是上一版」。
//
// 这个测试的主要价值是**镜像锁**：包键（`SS_1.osz`）的拼法一边在 `scripts/pack-publish.js`
// （CommonJS），一边在 `src/lib/packMirrors.ts`（前端），两边不能互相 import。
// 所以这里直接拿 `buildManifestPacks` 的**真实产物**去比对前端的拼法 ——
// 任何一边改了规则，这个测试立刻红。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const require = createRequire(import.meta.url)
const { buildManifestPacks, STATUS_OK } = require('../scripts/pack-publish.js')

const { packMirrorKey, isMirrorPending, readPendingMirrors } = await import('../src/lib/packMirrors.ts')

/** 造一条"内容变了"的 typeResult（objectKey 与上一版不同 → 需要同步镜像）。 */
function typeResult(realType, part, objectKey) {
  return {
    realType,
    status: STATUS_OK,
    packs: [
      {
        realType,
        name: part ? `${realType} Pack ${part}` : `${realType} Pack`,
        part,
        objectKey,
        mapCount: 10,
        totalMaps: 10,
        sizeMB: 100,
        links: { r2: `https://r2.example/${objectKey}` },
      },
    ],
  }
}

test('镜像锁：pendingMirrors 的键与 packMirrorKey 逐字一致（多包）', () => {
  const oldManifest = {
    packs: [
      {
        realType: 'TB', part: 2, objectKey: 'TB_2.old00000.osz',
        links: { r2: 'https://r2.example/TB_2.old00000.osz', googleDrive: 'https://drive.example/TB_2' },
        gdriveFileId: 'G2', gdriveObjectKey: 'TB_2.old00000.osz',
      },
    ],
  }
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [typeResult('TB', 2, 'TB_2.new11111.osz')],
    oldManifest,
    today: '2026-09-20',
  })
  assert.deepEqual(pendingMirrors, [packMirrorKey('TB', 2)])
  assert.equal(isMirrorPending(pendingMirrors, 'TB', 2), true)
  assert.equal(isMirrorPending(pendingMirrors, 'TB', 1), false)
})

test('镜像锁：part 缺席（单包）在两侧都按 1', () => {
  const oldManifest = {
    packs: [
      {
        realType: 'SS', objectKey: 'SS_1.old00000.osz',
        links: { r2: 'https://r2.example/SS_1.old00000.osz', googleDrive: 'https://drive.example/SS_1' },
        gdriveFileId: 'G1', gdriveObjectKey: 'SS_1.old00000.osz',
      },
    ],
  }
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [typeResult('SS', undefined, 'SS_1.new11111.osz')],
    oldManifest,
    today: '2026-09-20',
  })
  assert.deepEqual(pendingMirrors, ['SS_1.osz'])
  assert.equal(packMirrorKey('SS'), 'SS_1.osz')
  assert.equal(packMirrorKey('SS', undefined), 'SS_1.osz')
  assert.equal(packMirrorKey('SS', null), 'SS_1.osz')
  assert.equal(packMirrorKey('SS', 0), 'SS_1.osz', '0 也按 1 —— 与 pack-publish 的 `part || 1` 同规则')
})

test('镜像锁：内容没变（objectKey 相同）不会产生待同步标记', () => {
  const same = 'SS_1.same0000.osz'
  const oldManifest = {
    packs: [
      {
        realType: 'SS', objectKey: same,
        links: { r2: `https://r2.example/${same}`, googleDrive: 'https://drive.example/SS_1' },
        gdriveFileId: 'G1', gdriveObjectKey: same,
      },
    ],
  }
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [typeResult('SS', undefined, same)],
    oldManifest,
    today: '2026-09-20',
  })
  assert.deepEqual(pendingMirrors, [])
  assert.equal(isMirrorPending(pendingMirrors, 'SS'), false)
})

test('镜像锁：Drive 上还是旧内容键 → 要标记（这才是"未同步"的本义）', () => {
  const oldManifest = {
    packs: [
      {
        realType: 'SS', objectKey: 'SS_1.old00000.osz',
        links: { r2: 'https://r2.example/SS_1.old00000.osz', googleDrive: 'https://drive.example/SS_1' },
        gdriveFileId: 'G1', gdriveObjectKey: 'SS_1.old00000.osz',
      },
    ],
  }
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [typeResult('SS', undefined, 'SS_1.new11111.osz')],
    oldManifest,
    today: '2026-09-20',
  })
  assert.deepEqual(pendingMirrors, ['SS_1.osz'], '内容换了，镜像还指着旧文件')
})

test('镜像锁：历史条目没有 gdriveObjectKey → 保守标记（宁可让 Drive 核对一次）', () => {
  const oldManifest = {
    packs: [
      {
        realType: 'SS', objectKey: 'SS_1.cur00000.osz',
        links: { r2: 'https://r2.example/SS_1.cur00000.osz', googleDrive: 'https://drive.example/SS_1' },
        gdriveFileId: 'G1',
        // 刻意不写 gdriveObjectKey —— 固定键时代留下的条目。
      },
    ],
  }
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [typeResult('SS', undefined, 'SS_1.cur00000.osz')],
    oldManifest,
    today: '2026-09-20',
  })
  assert.deepEqual(pendingMirrors, ['SS_1.osz'])
})

test('镜像锁：包下线后它的标记不残留', () => {
  const { pendingMirrors } = buildManifestPacks({
    typeResults: [],
    oldManifest: { packs: [], pendingMirrors: ['GONE_1.osz', 'SS_1.osz'] },
    today: '2026-09-20',
  })
  assert.deepEqual(pendingMirrors, [], '清单里已经没有这个包了，标记也没意义')
})

test('isMirrorPending：没有清单字段 / 空数组都不算待同步', () => {
  assert.equal(isMirrorPending(undefined, 'SS'), false)
  assert.equal(isMirrorPending([], 'SS'), false)
  assert.equal(isMirrorPending(['SS_1.osz'], 'SS'), true)
})

test('readPendingMirrors：字段缺失或形状不对一律当空数组（不能让下载页崩）', () => {
  assert.deepEqual(readPendingMirrors(undefined), [])
  assert.deepEqual(readPendingMirrors(null), [])
  assert.deepEqual(readPendingMirrors('oops'), [])
  assert.deepEqual(readPendingMirrors({ a: 1 }), [])
  assert.deepEqual(readPendingMirrors(['SS_1.osz', '', 42, null, 'JS_2.osz']), ['SS_1.osz', 'JS_2.osz'])
})
