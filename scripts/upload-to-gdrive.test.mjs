import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  assertNonEmptyPacks,
  collectReferencedFileIds,
  computeOrphans,
  deleteOrphans,
  isAlreadySharedError,
  runDriveSync,
} = require('./upload-to-gdrive.js')

// R09:Drive 上传失败不得删除仍被引用的旧包。
// 这些用例只用内存里的 fake Drive,不接触真实凭据 / R2 / GitHub。
const noDelay = async () => {}

function httpError(code, message, reason) {
  const err = new Error(message)
  err.code = code
  if (reason) err.errors = [{ reason }]
  return err
}

// 假 Drive:update 按 fileId 失败 / 404,list 返回预设文件,permissions 按需报错。
function makeFakeDrive({ failIds = new Set(), missingIds = new Set(), existingNames = {}, permissionError = null } = {}) {
  const calls = { update: [], create: [], delete: [], list: [], permissions: [] }
  let createdSeq = 0
  const drive = {
    files: {
      update: async ({ fileId }) => {
        calls.update.push(fileId)
        if (missingIds.has(fileId)) throw httpError(404, 'File not found')
        if (failIds.has(fileId)) throw httpError(503, 'backendError: upload failed')
        return { data: { id: fileId } }
      },
      create: async ({ requestBody }) => {
        calls.create.push(requestBody.name)
        createdSeq += 1
        return { data: { id: `created-${createdSeq}` } }
      },
      list: async ({ q }) => {
        calls.list.push(q)
        for (const [name, id] of Object.entries(existingNames)) {
          if (q.includes(name)) return { data: { files: [{ id, name }] } }
        }
        return { data: { files: [] } }
      },
      delete: async ({ fileId }) => {
        calls.delete.push(fileId)
        return {}
      },
    },
    permissions: {
      create: async ({ fileId }) => {
        calls.permissions.push(fileId)
        if (permissionError) throw permissionError
        return {}
      },
    },
  }
  return { drive, calls }
}

// getBody 工厂:每次调用返回一个可辨认的新流对象。
function makeBodyFactory() {
  const bodies = []
  let seq = 0
  return {
    bodies,
    factory: () => () => {
      seq += 1
      const body = { stream: seq }
      bodies.push(body)
      return body
    },
  }
}

test('R09 单包上传失败时不清理任何孤儿文件', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive({ failIds: new Set(['old-ss1']) })
  const packs = [{ realType: 'SS', part: 1, gdriveFileId: 'old-ss1' }]
  const prevPacks = [{ realType: 'SS', part: 1, gdriveFileId: 'old-ss1' }]

  const result = await runDriveSync({
    drive, packs, prevPacks, makeBody: packed.factory, log: silentLog(), delay: noDelay,
  })

  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].fileName, 'SS_1.osz')
  assert.deepEqual(result.orphans, [])
  assert.deepEqual(calls.delete, [])
})

test('R09 失败包继承的旧 fileId 仍算被引用,不会判为孤儿', async () => {
  const packed = makeBodyFactory()
  const { drive } = makeFakeDrive({ failIds: new Set(['old-dp1']) })
  const packs = [{ realType: 'DP', part: 1, gdriveFileId: 'old-dp1' }]

  const result = await runDriveSync({
    drive, packs, prevPacks: [{ realType: 'DP', part: 1, gdriveFileId: 'old-dp1' }],
    makeBody: packed.factory, log: silentLog(), delay: noDelay,
  })

  assert.equal(result.failed.length, 1)
  assert.ok(result.referencedIds.has('old-dp1'), '失败包的旧 fileId 应仍在保留集合里')
  assert.deepEqual(result.orphans, [])
})

test('R09 全部成功时才把目标 manifest 不再引用的旧文件判为孤儿', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive()
  // generate-pack 会把旧 fileId 带进新 manifest,因此 SS_1 走原地 update(不产生新文件)
  const packs = [{ realType: 'SS', part: 1, gdriveFileId: 'old-ss1' }]
  const prevPacks = [
    { realType: 'SS', part: 1, gdriveFileId: 'old-ss1' }, // 仍被引用 → 不算孤儿
    { realType: 'SJ', part: 1, gdriveFileId: 'old-sj1' }, // 目标已无此类型 → 孤儿
    { realType: 'SJ', part: 1, gdriveFileId: 'old-sj1' }, // 重复 → 去重
  ]

  const result = await runDriveSync({
    drive, packs, prevPacks, makeBody: packed.factory, log: silentLog(), delay: noDelay,
  })

  assert.deepEqual(result.failed, [])
  assert.equal(packs[0].gdriveFileId, 'old-ss1', '原地更新沿用旧 fileId')
  assert.deepEqual(result.orphans, [{ id: 'old-sj1', label: 'SJ_1' }])

  await deleteOrphans(drive, result.orphans, silentLog())
  assert.deepEqual(calls.delete, ['old-sj1'])
})

test('R09 旧对象被新 fileId 取代时按真孤儿处理', async () => {
  const packed = makeBodyFactory()
  const { drive } = makeFakeDrive()
  // 新 manifest 没继承旧 fileId(如 part 重编号),旧对象确实不再被任何 pack 引用
  const packs = [{ realType: 'SS', part: 2 }]
  const result = await runDriveSync({
    drive, packs, prevPacks: [{ realType: 'SS', part: 2, gdriveFileId: 'stale-ss2' }],
    makeBody: packed.factory, log: silentLog(), delay: noDelay,
  })
  assert.deepEqual(result.orphans, [{ id: 'stale-ss2', label: 'SS_2' }])
})

test('R09 旧 fileId 404 后回退上传会重新取流(两条独立流)', async () => {
  const packed = makeBodyFactory()
  const { drive } = makeFakeDrive({ missingIds: new Set(['gone-1']) })
  const packs = [{ realType: 'MX', part: 1, gdriveFileId: 'gone-1' }]

  const result = await runDriveSync({
    drive, packs, prevPacks: [{ realType: 'MX', part: 1, gdriveFileId: 'gone-1' }],
    makeBody: packed.factory, log: silentLog(), delay: noDelay,
  })

  assert.deepEqual(result.failed, [])
  assert.equal(packs[0].gdriveFileId, 'created-1')
  assert.equal(packed.bodies.length, 2, '404 回退必须重新取一条新流')
  assert.notEqual(packed.bodies[0], packed.bodies[1])
})

test('R09 权限 400 非 alreadyExists 视为失败,alreadyExists 视为成功', async () => {
  const badPerm = httpError(400, 'Bad Request', 'someOtherReason')
  const failPacked = makeBodyFactory()
  const failDrive = makeFakeDrive({ permissionError: badPerm })
  const failPacks = [{ realType: 'TC', part: 1 }]
  const failResult = await runDriveSync({
    drive: failDrive.drive, packs: failPacks, prevPacks: [], makeBody: failPacked.factory,
    log: silentLog(), delay: noDelay,
  })
  assert.equal(failResult.failed.length, 1)
  assert.equal(failPacks[0].gdriveFileId, undefined, '权限失败不写入链接')

  const okPerm = httpError(400, 'The permission already exists for the file.', 'alreadyExists')
  const okPacked = makeBodyFactory()
  const okDrive = makeFakeDrive({ permissionError: okPerm })
  const okPacks = [{ realType: 'TC', part: 1 }]
  const okResult = await runDriveSync({
    drive: okDrive.drive, packs: okPacks, prevPacks: [], makeBody: okPacked.factory,
    log: silentLog(), delay: noDelay,
  })
  assert.deepEqual(okResult.failed, [])
  assert.equal(okPacks[0].gdriveFileId, 'created-1')
})

test('R09 保留集合同时识别 gdriveFileId 字段与两种 Drive 链接写法', () => {
  const ids = collectReferencedFileIds([
    { gdriveFileId: 'a' },
    { links: { googleDrive: 'https://drive.google.com/uc?id=b&export=download' } },
    { links: { googleDrive: 'https://drive.google.com/file/d/c/view' } },
    { links: { r2: 'https://example.invalid/x.osz' } },
  ])
  assert.deepEqual([...ids].sort(), ['a', 'b', 'c'])
})

test('R09 isAlreadySharedError 只接受 alreadyExists 类 400', () => {
  assert.equal(isAlreadySharedError(httpError(400, 'x', 'alreadyExists')), true)
  assert.equal(isAlreadySharedError(httpError(400, 'The permission already exists for the file.')), true)
  assert.equal(isAlreadySharedError(httpError(400, 'Bad Request', 'invalidSharingRequest')), false)
  assert.equal(isAlreadySharedError(httpError(500, 'backend error')), false)
})

// 复审补充:R09 只防住了"某个包上传失败",没防"本版一个包都没有"。
// 空 manifest 时 failed 为空 → computeOrphans 会把上一版全部 fileId 判成孤儿并删光。
test('R09 复审:空 manifest 直接拒绝执行,绝不进入孤儿清理', () => {
  assert.throws(() => assertNonEmptyPacks([]), /没有任何包/)
  assert.throws(() => assertNonEmptyPacks(undefined), /没有任何包/)
  assert.throws(() => assertNonEmptyPacks(null), /没有任何包/)
  assert.doesNotThrow(() => assertNonEmptyPacks([{ realType: 'SS', part: 1 }]))

  // 证明"空本版"确实会把上一版全部判成孤儿(这就是必须先拒绝的原因)。
  const prev = [{ gdriveFileId: 'a' }, { gdriveFileId: 'b' }]
  assert.deepEqual(computeOrphans(prev, new Set()).map((o) => o.id).sort(), ['a', 'b'])
})

function silentLog() {
  return { log: () => {}, error: () => {}, warn: () => {} }
}

// ---------- 版本化上传（A 方案）----------
// 对象键是内容寻址的，Drive 用同一个名字 → "同名即同内容"：已存在就跳过上传（重跑省整轮流量），
// 内容变了就新建（旧文件原地不动，只会进孤儿报告）。这样两个镜像不会半新半旧。

test('版本化：清单里已记着同一内容键 → 跳过上传，但仍确保可读', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive()
  const packs = [{ realType: 'SS', part: 1, objectKey: 'SS_1.aaaa1111.osz', gdriveFileId: 'f-1', gdriveObjectKey: 'SS_1.aaaa1111.osz' }]

  const result = await runDriveSync({ drive, packs, prevPacks: [], makeBody: packed.factory, log: silentLog(), delay: noDelay })

  assert.deepEqual(calls.create, [], '同内容不该重新上传')
  assert.deepEqual(calls.update, [], '版本化路径不该走 update')
  assert.deepEqual(calls.permissions, ['f-1'], '复用也要确保 anyone-reader')
  assert.equal(result.skipped, 1)
  assert.ok(result.succeeded.includes('SS_1.osz'), 'pendingMirrors 用的是不带哈希的稳定键')
  assert.match(packs[0].links.googleDrive, /f-1/)
})

test('版本化：Drive 上已有同名文件 → 复用（上次跑到一半也能接上）', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive({ existingNames: { 'SS_1.bbbb2222.osz': 'f-2' } })
  const packs = [{ realType: 'SS', part: 1, objectKey: 'SS_1.bbbb2222.osz' }]

  const result = await runDriveSync({ drive, packs, prevPacks: [], makeBody: packed.factory, log: silentLog(), delay: noDelay })

  assert.deepEqual(calls.create, [])
  assert.equal(packs[0].gdriveFileId, 'f-2')
  assert.equal(packs[0].gdriveObjectKey, 'SS_1.bbbb2222.osz')
  assert.equal(result.skipped, 1)
})

test('版本化：内容变了 → 新建文件（名字 = 对象键），绝不覆盖旧文件', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive()
  const packs = [{ realType: 'SS', part: 1, objectKey: 'SS_1.cccc3333.osz', gdriveFileId: 'old-ss1', gdriveObjectKey: 'SS_1.old00000.osz' }]

  const result = await runDriveSync({ drive, packs, prevPacks: [], makeBody: packed.factory, log: silentLog(), delay: noDelay })

  assert.deepEqual(calls.create, ['SS_1.cccc3333.osz'], '新内容要新文件，不是覆盖')
  assert.deepEqual(calls.update, [], '不该碰旧文件')
  assert.deepEqual(calls.permissions, ['created-1'])
  assert.equal(result.skipped, 0)
  assert.equal(packs[0].gdriveObjectKey, 'SS_1.cccc3333.osz')
})

test('版本化：旧文件不再被引用 → 进孤儿报告，但本次不删', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive()
  const packs = [{ realType: 'SS', part: 1, objectKey: 'SS_1.new00000.osz', gdriveObjectKey: 'SS_1.old00000.osz', gdriveFileId: 'drive-old' }]
  const prevPacks = [{ realType: 'SS', part: 1, gdriveFileId: 'drive-old', links: { googleDrive: 'https://drive.google.com/uc?id=drive-old' } }]

  const result = await runDriveSync({ drive, packs, prevPacks, makeBody: packed.factory, log: silentLog(), delay: noDelay })

  assert.equal(result.orphans.length, 1, '旧版本文件应进孤儿报告')
  assert.equal(result.orphans[0].id, 'drive-old')
  assert.deepEqual(calls.delete, [], '报告不等于删除')
})

test('历史条目（没有 objectKey）仍按名字覆盖，不产生同名副本', async () => {
  const packed = makeBodyFactory()
  const { drive, calls } = makeFakeDrive()
  const packs = [{ realType: 'TB', part: 2, gdriveFileId: 'f-tb' }]

  await runDriveSync({ drive, packs, prevPacks: [], makeBody: packed.factory, log: silentLog(), delay: noDelay })

  assert.deepEqual(calls.create, [], '老条目新建会产生同名副本，而旧链接还指着老 id')
  assert.deepEqual(calls.update, ['f-tb'])
  assert.equal(packs[0].gdriveObjectKey, null)
})
