import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
// 默认 redact 就是 redactSecrets,而它从「模块加载时」的 env 取凭据值。
// 想在测试里验证"不传 redact 也会打码",必须在 require 脚本之前放一个假凭据,
// 否则默认 secrets 是 undefined,打码退化成恒等函数,测试会假通过。
process.env.R2_SECRET_KEY = 'REDACT-TEST-SECRET-9f8e7d'
const { ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } =
  require('@aws-sdk/client-s3')
const {
  listAll,
  copyHeaders,
  backupPrefix,
  shouldSkipCleanup,
  cleanupTrash,
  resolveExitCode,
  runBackupJob,
  redactSecrets,
} = require('./backup-r2.js')

// R08:备份部分失败必须非零退出并跳过清理;列举失败不得被当成空 bucket。
// 全部用内存 fake client,不需要线上凭据。
const silentLog = { log: () => {}, warn: () => {}, error: () => {} }
const DAY = 24 * 60 * 60 * 1000

// pages: { '<bucket>|<prefix>': [ [objectsPerPage...] ] } —— 每页一个对象数组,
// 除最后一页外都带 NextContinuationToken。
function makeFakeClient({ pages = {}, getResults = {}, getResultsByBucket = {}, failGet = new Set(), failPut = new Set(), failDelete = new Set() } = {}) {
  const calls = { list: [], get: [], put: [], del: [] }
  const client = {
    async send(cmd) {
      if (cmd instanceof ListObjectsV2Command) {
        calls.list.push(cmd.input)
        const key = `${cmd.input.Bucket}|${cmd.input.Prefix}`
        const pageList = pages[key] || [[]]
        const token = cmd.input.ContinuationToken
        const index = token ? Number(token) : 0
        const contents = pageList[index] || []
        const isLast = index >= pageList.length - 1
        return {
          Contents: contents,
          IsTruncated: !isLast,
          NextContinuationToken: isLast ? undefined : String(index + 1),
        }
      }
      if (cmd instanceof GetObjectCommand) {
        calls.get.push(cmd.input)
        if (failGet.has(cmd.input.Key)) throw new Error(`get denied for ${cmd.input.Key}`)
        // 按 bucket 区分：变更前存档要读**备份桶**里那份旧内容，键与源对象完全相同。
        const byBucket = getResultsByBucket[`${cmd.input.Bucket}|${cmd.input.Key}`]
        if (byBucket) return byBucket
        return getResults[cmd.input.Key] || { ContentType: 'text/plain', Body: [Buffer.from('x')] }
      }
      if (cmd instanceof PutObjectCommand) {
        calls.put.push(cmd.input)
        if (failPut.has(cmd.input.Key)) throw new Error(`put failed for ${cmd.input.Key}`)
        return {}
      }
      if (cmd instanceof DeleteObjectCommand) {
        calls.del.push(cmd.input)
        if (failDelete.has(cmd.input.Key)) throw new Error(`delete failed for ${cmd.input.Key}`)
        return {}
      }
      throw new Error('unexpected command')
    },
  }
  return { client, calls }
}

const obj = (Key, Size, ETag, LastModified) => ({ Key, Size, ETag, LastModified })

test('R08 复制失败时作业非零退出且不执行任何清理', async () => {
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 1, 'e1')]],
      'backup|maps/': [[]],
      'src|trash/': [[obj('trash/old.osz', 1, 'e0', new Date(0))]],
    },
    failGet: new Set(['maps/a.osz']),
  })

  const job = await runBackupJob(client, {
    sourceBucket: 'src', backupBucket: 'backup', now: Date.now(), log: silentLog,
  })

  assert.equal(job.backupResults[0].status, 'failed')
  assert.equal(job.backupResults[0].failed, 1)
  assert.equal(job.cleanup, null, '备份不完整时不应执行清理')
  assert.deepEqual(calls.del, [])
  assert.equal(job.exitCode, 1)
})

test('R08 全部成功才清理:超期对象删除、未超期对象保留', async () => {
  const now = Date.now()
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 1, 'e1')]],
      'backup|maps/': [[obj('maps/a.osz', 1, 'e1')]], // size+etag 一致 → 跳过
      'src|trash/': [[
        obj('trash/expired.osz', 1, 'e0', new Date(now - 40 * DAY)),
        obj('trash/fresh.osz', 1, 'e0', new Date(now - 2 * DAY)),
      ]],
    },
  })

  const job = await runBackupJob(client, {
    sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog,
  })

  assert.deepEqual(job.backupResults.map((r) => r.status), ['ok'], '只镜像 maps/ —— versions/ 与 trash/ 都不镜像')
  assert.equal(job.backupResults[0].skipped, 1)
  assert.deepEqual(job.cleanup, {
    prefix: 'trash/', listed: true, deleted: 1, kept: 1, failed: 0, failures: [],
  })
  assert.deepEqual(calls.del.map((c) => c.Key), ['trash/expired.osz'])
  assert.equal(job.exitCode, 0)
})

test('R08 清理阶段删除失败也计入非零退出', async () => {
  const now = Date.now()
  const { client } = makeFakeClient({
    pages: {
      'src|maps/': [[]],
      'backup|maps/': [[]],
      'src|trash/': [[obj('trash/expired.osz', 1, 'e0', new Date(now - 40 * DAY))]],
    },
    failDelete: new Set(['trash/expired.osz']),
  })

  const job = await runBackupJob(client, {
    sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog,
  })

  assert.equal(job.cleanup.failed, 1)
  assert.equal(job.exitCode, 1)
})

test('R08 列举失败不得被当成空 bucket', async () => {
  const client = {
    async send(cmd) {
      if (cmd instanceof ListObjectsV2Command) throw new Error('AccessDenied: no such permission')
      throw new Error('unexpected')
    },
  }

  const result = await backupPrefix(client, {
    sourceBucket: 'src', backupBucket: 'backup', prefix: 'maps/', log: silentLog,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.listed, false, '列举失败必须与"列表为空"区分')
  assert.equal(result.sourceCount, 0)
  assert.match(result.error, /AccessDenied/)
  assert.equal(shouldSkipCleanup([result]), true)
  assert.equal(resolveExitCode({ backupResults: [result], cleanup: null }), 1)
})

test('R08 分页:listAll 覆盖所有页,截断缺 token 时报错', async () => {
  const { client } = makeFakeClient({
    pages: {
      'src|maps/': [
        [obj('maps/p1.osz', 1, 'e1')],
        [obj('maps/p2.osz', 1, 'e2')],
      ],
    },
  })
  const all = await listAll(client, 'src', 'maps/')
  assert.deepEqual(all.map((o) => o.Key), ['maps/p1.osz', 'maps/p2.osz'])

  const broken = {
    async send(cmd) {
      if (cmd instanceof ListObjectsV2Command) return { Contents: [obj('maps/x.osz', 1, 'e')], IsTruncated: true }
      throw new Error('unexpected')
    },
  }
  await assert.rejects(() => listAll(broken, 'src', 'maps/'), /continuation token/)
})

test('R08 复制保留 ContentType 与 Metadata', async () => {
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 5, 'e1')]],
      'backup|maps/': [[]],
    },
    getResults: {
      'maps/a.osz': {
        ContentType: 'application/zip',
        Metadata: { bid: '123' },
        CacheControl: 'max-age=60',
        Body: [Buffer.from('abc')],
      },
    },
  })

  const result = await backupPrefix(client, {
    sourceBucket: 'src', backupBucket: 'backup', prefix: 'maps/', log: silentLog,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.copied, 1)
  assert.equal(calls.put.length, 1)
  assert.equal(calls.put[0].ContentType, 'application/zip')
  assert.deepEqual(calls.put[0].Metadata, { bid: '123' })
  assert.equal(calls.put[0].CacheControl, 'max-age=60')
  assert.equal(copyHeaders({ ContentType: '' }).ContentType, 'application/octet-stream')
})

test('R08 清理只在保留期之外删除,且列举失败不算成功', async () => {
  const now = Date.now()
  const { client } = makeFakeClient({
    pages: {
      'src|trash/': [[
        obj('trash/fresh.osz', 1, 'e0', new Date(now - 1 * DAY)),
        obj('trash/no-date.osz', 1, 'e0', undefined),
      ]],
    },
  })
  const result = await cleanupTrash(client, { bucket: 'src', now, log: silentLog })
  assert.deepEqual(result, { prefix: 'trash/', listed: true, deleted: 0, kept: 2, failed: 0, failures: [] })

  const broken = {
    async send(cmd) {
      if (cmd instanceof ListObjectsV2Command) throw new Error('NetworkError')
      throw new Error('unexpected')
    },
  }
  const bad = await cleanupTrash(broken, { bucket: 'src', now, log: silentLog })
  assert.equal(bad.listed, false)
  assert.equal(resolveExitCode({ backupResults: [{ status: 'ok' }], cleanup: bad }), 1)
})

test('R08 失败日志里的凭据会被打码', () => {
  const msg = 'auth failed for accessKeyId=ACCESSKEY123 secret=SECRETKEY456'
  const safe = redactSecrets(msg, ['ACCESSKEY123', 'SECRETKEY456'])
  assert.equal(safe, 'auth failed for accessKeyId=[redacted] secret=[redacted]')
  assert.doesNotMatch(safe, /ACCESSKEY123|SECRETKEY456/)
})

// 复审补充:上面那条只测了纯函数。真正要保证的是「不传 redact 时默认也打码」——
// 之前默认值是恒等函数,main 又没传,等于验收条件完全没落地。
test('R08 复审:不传 redact 时默认打码(凭据不会进失败信息)', async () => {
  const secret = process.env.R2_SECRET_KEY
  assert.ok(typeof secret === 'string' && secret.length >= 6, '测试前置:假凭据应在 require 前设好')

  const client = {
    async send(cmd) {
      if (cmd instanceof ListObjectsV2Command) {
        return cmd.input.Bucket === 'src'
          ? { Contents: [{ Key: 'maps/a.osz', Size: 2, ETag: 'e1' }], IsTruncated: false }
          : { Contents: [], IsTruncated: false }
      }
      if (cmd instanceof GetObjectCommand) throw new Error(`AccessDenied for secret=${secret}`)
      throw new Error('unexpected')
    },
  }

  const result = await backupPrefix(client, {
    sourceBucket: 'src',
    backupBucket: 'bak',
    prefix: 'maps/',
    log: silentLog,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.failed, 1)
  const dumped = JSON.stringify(result)
  assert.ok(!dumped.includes(secret), '失败信息里不应出现凭据原文')
  assert.ok(dumped.includes('[redacted]'), '默认应打码成 [redacted]')
})


// ---------- 变更前存档（2026-09-18）：备份在覆盖镜像之前先留住旧内容 ----------
//
// 攻击路径：上传页对同一槽位连改两次（versions/ 每槽位只留一版，第 2 次就覆盖掉）
// + 等一晚这个备份跑过 → 原图在所有地方都没有好副本了。有存档之后，攻击者改内容的那一晚，
// 备份反而把"被改之前的那一份"存了下来。

const dateKey = (now) => new Date(now).toISOString().slice(0, 10)

test('变更前存档：覆盖镜像之前，先把备份桶里的旧内容写进当天快照', async () => {
  const now = Date.now()
  const today = dateKey(now)
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 99, 'new-etag')]],
      'backup|maps/': [[obj('maps/a.osz', 10, 'old-etag')]],
      'src|trash/': [[]],
      [`backup|snapshots/${today}/`]: [[]],
      'backup|snapshots/': [[]],
    },
    getResultsByBucket: {
      // 备份桶里那份是"被篡改前"的好内容
      'backup|maps/a.osz': { ContentType: 'application/zip', Body: [Buffer.from('GOOD-OLD')] },
      // 主桶里那份已经是新（可疑）内容
      'src|maps/a.osz': { ContentType: 'application/zip', Body: [Buffer.from('TAMPERED')] },
    },
  })

  const job = await runBackupJob(client, { sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog })

  const puts = calls.put.map((c) => `${c.Bucket}|${c.Key}`)
  assert.deepEqual(
    puts,
    [`backup|snapshots/${today}/maps/a.osz`, 'backup|maps/a.osz'],
    '顺序必须是"先存档、后覆盖镜像"',
  )
  const bodyOf = (b) => (Buffer.isBuffer(b) ? b.toString() : Buffer.concat(b).toString())
  assert.equal(bodyOf(calls.put[0].Body), 'GOOD-OLD', '存档的必须是旧内容，不是新内容')
  assert.equal(bodyOf(calls.put[1].Body), 'TAMPERED', '镜像随后被更新为新内容')
  assert.equal(job.backupResults[0].archived, 1)
  assert.equal(job.backupResults[0].copied, 1)
  assert.equal(job.exitCode, 0)
})

test('变更前存档失败 → 该对象不覆盖镜像（宁可落后，也不换掉唯一的好副本）', async () => {
  const now = Date.now()
  const today = dateKey(now)
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 99, 'new-etag')]],
      'backup|maps/': [[obj('maps/a.osz', 10, 'old-etag')]],
      'src|trash/': [[]],
      [`backup|snapshots/${today}/`]: [[]],
    },
    getResultsByBucket: {
      'backup|maps/a.osz': { ContentType: 'application/zip', Body: [Buffer.from('GOOD-OLD')] },
      'src|maps/a.osz': { ContentType: 'application/zip', Body: [Buffer.from('TAMPERED')] },
    },
    failPut: new Set([`snapshots/${today}/maps/a.osz`]),
  })

  const job = await runBackupJob(client, { sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog })

  assert.deepEqual(
    calls.put.map((c) => c.Key).filter((k) => k === 'maps/a.osz'),
    [],
    '存档失败时不得写镜像（存档本身的那次 PUT 会被 fake 记录，这里只看镜像 key）',
  )
  assert.equal(job.backupResults[0].failed, 1)
  assert.equal(job.backupResults[0].status, 'failed')
  assert.equal(job.cleanup, null, '不完整就不做任何删除')
  assert.equal(job.snapshotPrune, null)
  assert.equal(job.exitCode, 1)
})

test('变更前存档：当天快照已有同内容时不重复写（同一天重复触发是幂等的）', async () => {
  const now = Date.now()
  const today = dateKey(now)
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 99, 'new-etag')]],
      'backup|maps/': [[obj('maps/a.osz', 10, 'old-etag')]],
      'src|trash/': [[]],
      [`backup|snapshots/${today}/`]: [[obj(`snapshots/${today}/maps/a.osz`, 10, 'old-etag')]],
    },
  })

  const job = await runBackupJob(client, { sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog })

  assert.equal(job.backupResults[0].archiveSkipped, 1)
  assert.equal(job.backupResults[0].archived, 0)
  assert.deepEqual(calls.put.map((c) => c.Key), ['maps/a.osz'], '只更新镜像，不重复写快照')
})

test('首次备份没有旧内容可存档：镜像里没有该对象时不产生快照写入', async () => {
  const now = Date.now()
  const today = dateKey(now)
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/new.osz', 5, 'e1')]],
      'backup|maps/': [[]],
      'src|trash/': [[]],
      [`backup|snapshots/${today}/`]: [[]],
    },
  })

  const job = await runBackupJob(client, { sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog })

  assert.deepEqual(calls.put.map((c) => c.Key), ['maps/new.osz'])
  assert.equal(job.backupResults[0].archived, 0)
  assert.equal(job.exitCode, 0)
})

test('快照轮转：超期快照删除、当天的保留、非日期键不动', async () => {
  const now = Date.now()
  const today = dateKey(now)
  const oldDate = dateKey(now - 8 * DAY)
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[]],
      'backup|maps/': [[]],
      'src|trash/': [[]],
      [`backup|snapshots/${today}/`]: [[]],
      'backup|snapshots/': [[
        obj(`snapshots/${oldDate}/maps/a.osz`, 1, 'e-old'),
        obj(`snapshots/${today}/maps/a.osz`, 1, 'e-new'),
        obj('snapshots/README.txt', 1, 'e-note'),
      ]],
    },
  })

  const job = await runBackupJob(client, { sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog })

  assert.deepEqual(calls.del.map((c) => `${c.Bucket}|${c.Key}`), [`backup|snapshots/${oldDate}/maps/a.osz`])
  assert.equal(job.snapshotPrune.deleted, 1)
  assert.equal(job.snapshotPrune.kept, 1)
  assert.equal(job.snapshotPrune.ignored, 1, '非 snapshots/<日期>/ 形状的键不删')
  assert.equal(job.exitCode, 0)
})

test('快照轮转：保留天数设成 0 → 关闭存档与轮转（退回纯镜像）', async () => {
  const now = Date.now()
  const oldDate = dateKey(now - 30 * DAY)
  const { client, calls } = makeFakeClient({
    pages: {
      'src|maps/': [[obj('maps/a.osz', 99, 'new')]],
      'backup|maps/': [[obj('maps/a.osz', 10, 'old')]],
      'src|trash/': [[]],
      'backup|snapshots/': [[obj(`snapshots/${oldDate}/maps/a.osz`, 1, 'e')]],
    },
    getResultsByBucket: {
      'backup|maps/a.osz': { ContentType: 'application/zip', Body: [Buffer.from('OLD')] },
      'src|maps/a.osz': { ContentType: 'application/zip', Body: [Buffer.from('NEW')] },
    },
  })

  const job = await runBackupJob(client, {
    sourceBucket: 'src', backupBucket: 'backup', now, snapshotRetentionDays: 0, log: silentLog,
  })

  assert.deepEqual(calls.put.map((c) => c.Key), ['maps/a.osz'], '关闭时不写快照')
  assert.equal(job.snapshotPrune, null, '关闭时不做轮转')
  assert.deepEqual(calls.del, [])
  assert.equal(job.exitCode, 0)
})

test('快照轮转：删除失败计入非零退出', async () => {
  const now = Date.now()
  const oldDate = dateKey(now - 9 * DAY)
  const { client } = makeFakeClient({
    pages: {
      'src|maps/': [[]],
      'backup|maps/': [[]],
      'src|trash/': [[]],
      'backup|snapshots/': [[obj(`snapshots/${oldDate}/maps/a.osz`, 1, 'e')]],
    },
    failDelete: new Set([`snapshots/${oldDate}/maps/a.osz`]),
  })

  const job = await runBackupJob(client, { sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog })

  assert.equal(job.snapshotPrune.failed, 1)
  assert.equal(job.exitCode, 1)
})
