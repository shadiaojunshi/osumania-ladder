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
function makeFakeClient({ pages = {}, getResults = {}, failGet = new Set(), failPut = new Set(), failDelete = new Set() } = {}) {
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
      'src|versions/': [[]],
      'backup|versions/': [[]],
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
      'src|versions/': [[]],
      'backup|versions/': [[]],
      'src|trash/': [[
        obj('trash/expired.osz', 1, 'e0', new Date(now - 40 * DAY)),
        obj('trash/fresh.osz', 1, 'e0', new Date(now - 2 * DAY)),
      ]],
    },
  })

  const job = await runBackupJob(client, {
    sourceBucket: 'src', backupBucket: 'backup', now, log: silentLog,
  })

  assert.deepEqual(job.backupResults.map((r) => r.status), ['ok', 'ok'])
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
      'src|versions/': [[]],
      'backup|versions/': [[]],
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
