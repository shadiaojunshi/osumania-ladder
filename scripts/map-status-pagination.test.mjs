import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

// R13：上传状态接口原来只调一次 R2 list（单页上限 1000），超过 1000 张的比赛会
// 静默漏掉后面的对象 —— 前端于是把"已上传"的槽位显示成未上传。
// 现在按 cursor 循环；中途任何一页失败必须返回错误，不能给出"看起来完整"的部分清单。
//
// status.ts 里的相对 import 省略了扩展名，所以必须先 register loader 再动态 import。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestGet: getStatus } = await import('../functions/api/maps/status.ts')

/**
 * 假 R2：按 prefix 命中，pages 决定每次 list 返回多少对象 / 是否报错。
 * 真实 R2 的 list 返回 { objects, truncated, cursor }。
 */
function makeBucket(objects, { pageSize = 1000, failOnCall = null } = {}) {
  let call = 0
  return {
    calls: [],
    async list({ prefix, cursor, limit }) {
      call++
      const index = call
      this.calls.push({ prefix, cursor, limit, call: index })
      if (failOnCall !== null && index === failOnCall) {
        throw new Error('R2 unavailable')
      }
      const matched = objects.filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const size = Math.min(pageSize, limit ?? 1000)
      const slice = matched.slice(start, start + size)
      const next = start + slice.length
      const truncated = next < matched.length
      return {
        objects: slice.map((key) => ({ key, size: 1024 })),
        truncated,
        cursor: truncated ? String(next) : undefined,
      }
    },
  }
}

async function callStatus(query, { bucket }) {
  const request = new Request(`https://x/api/maps/status?${query}`)
  const res = await getStatus({ request, env: { R2_BUCKET: bucket } })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

const TID = 'demo-cup'

test('R13 单页内：主图与 NSV 分开归类（键解析用共享实现）', async () => {
  const bucket = makeBucket([
    `maps/${TID}/r1/RC1.osz`,
    `maps/${TID}/r1/RC1.nsv.osz`,
    `maps/${TID}/r1/FS/TB.osz`,
  ])
  const { status, body } = await callStatus(`tournamentId=${TID}`, { bucket })
  assert.equal(status, 200)
  assert.deepEqual(body.uploaded.sort(), ['r1/FS/TB', 'r1/RC1'])
  assert.deepEqual(body.uploadedNsv, ['r1/RC1'])
})

test('R13 超过一页时累计所有页，不静默漏掉后面的对象', async () => {
  const objects = []
  for (let i = 1; i <= 25; i++) objects.push(`maps/${TID}/r1/RC${i}.osz`)
  // 每页只给 10 个 → 需要 3 页
  const bucket = makeBucket(objects, { pageSize: 10 })
  const { status, body } = await callStatus(`tournamentId=${TID}`, { bucket })

  assert.equal(status, 200)
  assert.equal(body.uploaded.length, 25, '25 张必须一张不少')
  assert.equal(bucket.calls.length, 3, '应该翻 3 页')
  assert.equal(bucket.calls[0].cursor, undefined, '第一页不带 cursor')
  assert.equal(bucket.calls[1].cursor, '10', '第二页带上游返回的 cursor')
})

test('R13 分页中途失败 → 返回错误，绝不返回"部分清单"', async () => {
  const objects = []
  for (let i = 1; i <= 25; i++) objects.push(`maps/${TID}/r1/RC${i}.osz`)
  const bucket = makeBucket(objects, { pageSize: 10, failOnCall: 2 })
  const { status, body } = await callStatus(`tournamentId=${TID}`, { bucket })

  assert.equal(status, 502)
  assert.equal(body.code, 'R2_LIST_FAILED')
  assert.equal(body.uploaded, undefined, '不能给出部分清单（前端会误当成权威状态并清掉勾选）')
  assert.equal(body.uploadedNsv, undefined)
})

test('R13 只有一页且未截断时只调一次 list', async () => {
  const bucket = makeBucket([`maps/${TID}/r1/RC1.osz`], { pageSize: 1000 })
  const { status } = await callStatus(`tournamentId=${TID}`, { bucket })
  assert.equal(status, 200)
  assert.equal(bucket.calls.length, 1, '没有下一页就不该多翻一次')
})

test('R13 不匹配前缀 / 非法对象名的键被跳过（不会算成已上传）', async () => {
  const bucket = makeBucket([
    `maps/${TID}/r1/RC1.osz`,
    `maps/${TID}/r1/.osz`,        // 空槽位段 → 解析失败
    `maps/${TID}/r1/../x.osz`,    // 坏键段（.. 会让 R2 键有歧义）
    `maps/${TID}/r1/.nsv.osz`,    // 空槽位段（NSV 侧）
    `maps/other-cup/r1/RC1.osz`,  // 别的比赛（prefix 已隔离，双重保险）
  ])
  const { status, body } = await callStatus(`tournamentId=${TID}`, { bucket })
  assert.equal(status, 200)
  assert.deepEqual(body.uploaded, ['r1/RC1'])
  assert.deepEqual(body.uploadedNsv, [])
})

test('R13 参数校验仍走 R04 的共享规则（含长度上限）', async () => {
  const bucket = makeBucket([])
  assert.equal((await callStatus('', { bucket })).status, 400)
  assert.equal((await callStatus('tournamentId=../evil', { bucket })).status, 400)
  assert.equal((await callStatus('tournamentId=-leading', { bucket })).status, 400)
  // 比写路径(validation.ts 的 LIMITS.maxIdLength)还长的 id 不该放行去查 R2。
  assert.equal((await callStatus(`tournamentId=${'x'.repeat(200)}`, { bucket })).status, 400)
  // 边界：正好在长度上限上仍然合法。
  assert.equal((await callStatus(`tournamentId=${'x'.repeat(128)}`, { bucket })).status, 200)
})

test('R13 id 长度上限与写路径的 LIMITS.maxIdLength 保持一致', async () => {
  const { MAX_TOURNAMENT_ID_LENGTH } = await import('../functions/api/_lib/tournamentId.ts')
  const { LIMITS } = await import('../functions/api/_lib/validation.ts')
  assert.equal(MAX_TOURNAMENT_ID_LENGTH, LIMITS.maxIdLength, '两份常量必须一起改')
})

test('R13 联表校验：合法槽位含 / 与 & () 。parseMapObjectKey + splitMapRelative 不误伤', async () => {
  const { splitMapRelative } = await import('../functions/api/_lib/mapKeys.ts')
  assert.deepEqual(splitMapRelative('r1/FS/TB'), { roundId: 'r1', slot: 'FS/TB' })
  assert.deepEqual(splitMapRelative('r1/GM(HR/SD)'), { roundId: 'r1', slot: 'GM(HR/SD)' })
  assert.deepEqual(splitMapRelative('r1/RC1'), { roundId: 'r1', slot: 'RC1' })
  assert.equal(splitMapRelative('r1'), null, '没有槽位段')
  assert.equal(splitMapRelative('/RC1'), null, '没有轮次段')
  assert.equal(splitMapRelative('r1/'), null, '空槽位')
  assert.equal(splitMapRelative('r1/..'), null)
  assert.equal(splitMapRelative('r1/a\\b'), null)
})

test('R13 全库真实对象的键都能通过拆解校验（收紧不误伤现有数据）', async () => {
  const { splitMapRelative, mapObjectKey } = await import('../functions/api/_lib/mapKeys.ts')
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.join(process.cwd(), 'data', 'tournaments')
  let keys = 0
  for (const file of fs.readdirSync(dir)) {
    const tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        for (const nsv of [false, true]) {
          const key = mapObjectKey(tournament.id, String(round.id), String(map.slot), nsv)
          const relative = key.slice(`maps/${tournament.id}/`.length, key.length - (nsv ? '.nsv.osz'.length : '.osz'.length))
          assert.ok(splitMapRelative(relative), `${key} 不该被拆解校验拒绝`)
          keys++
        }
      }
    }
  }
  assert.ok(keys > 8000, `应扫到全部槽位（实际 ${keys}）`)
})
