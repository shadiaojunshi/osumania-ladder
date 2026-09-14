import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test from 'node:test'

// R04 尾巴:osu/raw 的键段校验原先自带一份局部规则,把 `/` 也判成非法字符,
// 而现有数据里就有 FS/TB、GM(HR/SD) 这类槽位 → 这些槽位读上传谱面会被 400 拒掉。
// 现在改用 _lib/mapKeys 的共享校验与键构造。这个文件就是那条回归的守门人。
register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const { onRequestGet: rawBeatmap } = await import('../functions/api/osu/raw.ts')

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

const OSZ_BYTES = new Uint8Array(
  await new JSZip()
    .file('song.osu', [
      'osu file format v14',
      '',
      '[General]',
      'Mode: 3',
      '',
      '[Metadata]',
      'Title:Uploaded Version',
      'BeatmapID:777',
      '',
      '[HitObjects]',
      '64,192,1000,1,0,0:0:0:0:',
      '',
    ].join('\n'))
    .generateAsync({ type: 'uint8array' }),
)

// 支持 head 与 range 读(getRange 由 extractOsuFromOsz 驱动)。
function makeR2(entries) {
  const files = new Map(entries)
  return {
    async head(key) {
      const bytes = files.get(key)
      return bytes ? { key, size: bytes.length, etag: 'etag-1', httpEtag: '"etag-1"' } : null
    },
    async get(key, options = {}) {
      const bytes = files.get(key)
      if (!bytes) return null
      const offset = options.range?.offset ?? 0
      const length = options.range?.length ?? bytes.length - offset
      const slice = bytes.slice(offset, offset + length)
      return {
        body: 'BODY',
        etag: 'etag-1',
        arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      }
    },
  }
}

async function callRaw(query, { user = { uid: '1', username: 'tester', role: 'contributor' }, r2 } = {}) {
  const res = await rawBeatmap({
    request: new Request(`https://ladder.test/api/osu/raw?${query}`),
    env: r2 ? { R2_BUCKET: r2 } : {},
    data: { user },
  })
  return { status: res.status, text: await res.text(), source: res.headers.get('X-Beatmap-Source') }
}

const q = (params) => new URLSearchParams(params).toString()

test('R04 含 / 的真实槽位不再被 400 拒掉(以前会)', async () => {
  const slashSlots = ['FS/TB', 'GM(HR/SD)', 'GM(FL&EZ)']
  for (const slot of slashSlots) {
    const query = q({ tournamentId: 't', roundId: 'r1', slot })
    // 没配 R2 → 503 说明校验已经通过(400 才是被键段校验拒掉)
    const noR2 = await callRaw(query)
    assert.equal(noR2.status, 503, `${slot} 应通过键段校验(实际 ${noR2.status})`)

    const withR2 = await callRaw(query, {
      r2: makeR2([[`maps/t/r1/${slot}.osz`, OSZ_BYTES]]),
    })
    assert.equal(withR2.status, 200, `${slot} 应能读到上传版本(实际 ${withR2.status})`)
    assert.equal(withR2.source, 'r2')
    assert.match(withR2.text, /Uploaded Version/)
  }
})

test('R04 raw 仍拒绝真正非法的键段', async () => {
  const bad = ['a/../b', '.', '..', 'a//b', '\\x', 'x'.repeat(41), 'bad\u0000slot']
  for (const slot of bad) {
    const res = await callRaw(q({ tournamentId: 't', roundId: 'r1', slot }))
    assert.equal(res.status, 400, `${JSON.stringify(slot)} 应被拒绝`)
  }
  assert.equal((await callRaw(q({ tournamentId: 't', roundId: '..', slot: 'RC1' }))).status, 400)
  assert.equal((await callRaw(q({ tournamentId: '../escape', roundId: 'r1', slot: 'RC1' }))).status, 400)
  assert.equal((await callRaw(q({ tournamentId: 't', roundId: 'r1', slot: '' }))).status, 400)
})

test('R04 raw 的 NSV 回退与权限仍照旧', async () => {
  const query = q({ tournamentId: 't', roundId: 'r1', slot: 'FS/TB' })
  const nsvOnly = await callRaw(query, { r2: makeR2([[`maps/t/r1/FS/TB.nsv.osz`, OSZ_BYTES]]) })
  assert.equal(nsvOnly.status, 200, '只有 NSV 文件时也要能找到')
  assert.equal(nsvOnly.source, 'r2')

  const anonymous = await callRaw(query, {
    user: null,
    r2: makeR2([[`maps/t/r1/FS/TB.osz`, OSZ_BYTES]]),
  })
  assert.equal(anonymous.status, 403, 'slot 读取仍需 contributor')

  const missing = await callRaw(query, { r2: makeR2([]) })
  assert.equal(missing.status, 404, 'R2 里确实没有该对象时按"没有上传版本"处理')
  assert.match(missing.text, /no uploaded beatmap/)
})
