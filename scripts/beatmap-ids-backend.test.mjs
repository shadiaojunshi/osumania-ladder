import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test from 'node:test'

// R33 复查（2026-09-18）：占位 ID 的防护只做在了**前端**，后端与几处前端写路径漏了。
//
// 最要命的一条：`/api/maps/meta`（上传页「一键补全」的数据源）读 R2 里那些 `.osz`
// 的 `[Metadata]`，用的是 `functions/api/_lib/osuArchive.ts` 的解析 —— 那里还是
// `> 0` 的老口径。于是补全会把 `BeatmapSetID:1` 当有效 setId 回给前端，前端再
// **写回比赛 JSON** —— 清理脚本刚删掉的占位值又被补上。这就是"脏数据会复发"。
//
// 另一个必须挡的原因是：MKTC 那 36 张的 `.osz` 就躺在 R2 里（它们的 `[Metadata]`
// 里写死了 `1`）。只要补全跑一次，脏数据就回来了。
//
// 这个文件把整条链锁住：后端解析 / meta 接口 / 前后端两份常量一致 / 几处前端写路径。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const require = createRequire(import.meta.url)

const frontend = await import('../src/lib/beatmapIds.ts')
const backend = await import('../functions/api/_lib/beatmapIds.ts')
const { parseOsuMetadata } = await import('../functions/api/_lib/osuArchive.ts')

// ---------- 前后端两份实现必须一致 ----------
// 仓库里 `functions/` 与 `src/` 是两条独立构建，跨边界 import 没有先例
// （已有 `MAX_TOURNAMENT_ID_LENGTH` vs `LIMITS.maxIdLength` 也是两份、靠测试锁一致）。
// 这里照同样的办法锁住，免得两边口径漂移。

test('R33 前后端两份判读口径一致（阈值与判定结果逐项对齐）', () => {
  assert.equal(backend.PLACEHOLDER_ID_MAX, frontend.PLACEHOLDER_ID_MAX, '阈值必须一起改')
  const samples = [0, 1, 2, -1, -2387506, 1.5, NaN, Infinity, '2387506', null, undefined, {}, 5165500, 2387506]
  for (const value of samples) {
    assert.equal(
      backend.isUsableBeatmapId(value),
      frontend.isUsableBeatmapId(value),
      `${String(value)} 两边判定必须一致`,
    )
  }
  assert.equal(backend.usableBeatmapId(1), frontend.usableBeatmapId(1))
  assert.equal(backend.usableBeatmapsetId(1), frontend.usableBeatmapsetId(1))
  assert.equal(backend.usableBeatmapId(5165500), 5165500)
})

// ---------- 后端 .osu 解析：占位 ID 一律当没有 ----------

const osu = (lines) => ['osu file format v14', '', '[Metadata]', ...lines, '', '[HitObjects]', '64,192,1000,1,0,0:0:0:0:'].join('\n')

test('R33 后端解析：BeatmapSetID:1 / BeatmapID:0 一律当没有 ID（补全不会把占位值写回去）', () => {
  // 这正是 MKTC 那批 .osz 的形状：转换器写了 BeatmapSetID:1，BeatmapID 是 0/空。
  const mkct = parseOsuMetadata(osu(['Title:Curiosity', 'BeatmapID:0', 'BeatmapSetID:1']))
  assert.equal(mkct.beatmapsetId, undefined, '占位 setId 不能被解析出来 —— 否则补全会把它写回 JSON')
  assert.equal(mkct.beatmapId, undefined)
  assert.equal(mkct.title, 'Curiosity', '其它字段不受影响')

  const empty = parseOsuMetadata(osu(['Title:X', 'BeatmapID:', 'BeatmapSetID:']))
  assert.equal(empty.beatmapId, undefined)
  assert.equal(empty.beatmapsetId, undefined)

  const negative = parseOsuMetadata(osu(['Title:X', 'BeatmapID:-1', 'BeatmapSetID:-1']))
  assert.equal(negative.beatmapId, undefined, 'osu! 用 -1 表示未提交')
  assert.equal(negative.beatmapsetId, undefined)
})

test('R33 后端解析：真实 ID 照常读出来', () => {
  const real = parseOsuMetadata(osu(['Title:X', 'BeatmapID:5193095', 'BeatmapSetID:2387506']))
  assert.equal(real.beatmapId, 5193095)
  assert.equal(real.beatmapsetId, 2387506)
  // 边界：2 已经算真实 ID（阈值是 <= 1 不可用）
  assert.equal(parseOsuMetadata(osu(['Title:X', 'BeatmapID:2'])).beatmapId, 2)
})

// ---------- meta 接口：不会把占位值回给前端 ----------

function makeR2(entries) {
  const files = new Map(entries)
  return {
    async list() {
      return { objects: [...files.keys()].map((key) => ({ key, size: files.get(key).length })), truncated: false }
    },
    async get(key, options = {}) {
      const bytes = files.get(key)
      if (!bytes) return null
      const offset = options.range?.offset ?? 0
      const length = options.range?.length ?? bytes.length - offset
      const slice = bytes.slice(offset, offset + length)
      return {
        body: 'BODY',
        etag: 'e',
        arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      }
    },
  }
}

test('R33 meta 接口：占位 setId 的 .osz 回的是「没有 ID」而不是 1（补全写不回去）', async () => {
  const { onRequestGet: mapsMeta } = await import('../functions/api/maps/meta.ts')
  const JSZip = require('jszip')
  const bytes = new Uint8Array(
    await new JSZip()
      .file('song.osu', osu(['Title:Toromaru - Curiosity', 'BeatmapID:0', 'BeatmapSetID:1']))
      .generateAsync({ type: 'uint8array' }),
  )
  const res = await mapsMeta({
    request: new Request('https://ladder.test/api/maps/meta?tournamentId=mktc&rounds=qual%3AHB1'),
    env: { R2_BUCKET: makeR2([['maps/mktc/qual/HB1.osz', bytes]]) },
    data: { user: { uid: '1', username: 'tester', role: 'contributor' } },
  })
  assert.equal(res.status, 200)
  const { results } = await res.json()
  const slot = results['qual:HB1']
  assert.equal(slot.status, 'ok')
  assert.equal(slot.beatmapsetId, undefined, '绝不能回 1 —— 前端补全就是拿这个字段写 JSON 的')
  assert.equal(slot.beatmapId, undefined)
  assert.equal(slot.unsubmitted, true, '没有可用 BID → 按未提交处理（前端据此显示"仅标题"）')
  assert.equal(slot.title, 'Toromaru - Curiosity', '名字照常回填')
})

test('R33 meta 接口：真实 ID 照常回（别把正常功能一起关掉）', async () => {
  const { onRequestGet: mapsMeta } = await import('../functions/api/maps/meta.ts')
  const JSZip = require('jszip')
  const bytes = new Uint8Array(
    await new JSZip()
      .file('song.osu', osu(['Title:T', 'BeatmapID:5193095', 'BeatmapSetID:2387506']))
      .generateAsync({ type: 'uint8array' }),
  )
  const res = await mapsMeta({
    request: new Request('https://ladder.test/api/maps/meta?tournamentId=t&rounds=r1%3ARC1'),
    env: { R2_BUCKET: makeR2([['maps/t/r1/RC1.osz', bytes]]) },
    data: { user: { uid: '1', username: 'tester', role: 'contributor' } },
  })
  const { results } = await res.json()
  assert.equal(results['r1:RC1'].beatmapId, 5193095)
  assert.equal(results['r1:RC1'].beatmapsetId, 2387506)
  assert.equal(results['r1:RC1'].unsubmitted, false)
})

// ---------- 上传时的 BID 比对：不能因为占位值放行 ----------

test('R33 上传校验：.osu 里是占位 BID 时不参与"就是这张图"的判定', async () => {
  const { extractOsuFromOsz } = await import('../functions/api/_lib/osuArchive.ts')
  const JSZip = require('jszip')
  // 两个难度，一个真 BID、一个占位 0：按 BID=5193095 应能唯一命中真那张，
  // 占位那张不该"因为 uploadedId 是 0 而被当成匹配"。
  const zip = new JSZip()
  zip.file('a.osu', osu(['Version:A', 'BeatmapID:5193095']))
  zip.file('b.osu', osu(['Version:B', 'BeatmapID:0']))
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
  const getRange = async (start, end) => bytes.slice(start, end)
  const hit = await extractOsuFromOsz(bytes.length, getRange, 5193095)
  assert.equal(hit.osuName, 'a.osu')

  // 选一个不存在的 BID → 必须报"无法唯一识别"，不能因为场上有占位值就乱返回。
  await assert.rejects(() => extractOsuFromOsz(bytes.length, getRange, 999999), /cannot uniquely identify/)
})

test('R33 上传校验：单难度里 BID 是占位值时不报"BID 不一致"（占位=没有，无处可比）', async () => {
  const { extractOsuFromOsz } = await import('../functions/api/_lib/osuArchive.ts')
  const JSZip = require('jszip')
  const bytes = new Uint8Array(
    await new JSZip()
      .file('song.osu', osu(['Version:V', 'BeatmapID:0', 'BeatmapSetID:1']))
      .generateAsync({ type: 'uint8array' }),
  )
  const getRange = async (start, end) => bytes.slice(start, end)
  // 用户贴了 BID 5193095 想传这张，但文件里是占位 0：按"没有 ID"处理 → 放行
  //（不是"BID 不一致"）。这正是 MKTC 那批的处境：文件里根本没有真 ID。
  const ok = await extractOsuFromOsz(bytes.length, getRange, 5193095)
  assert.equal(ok.osuName, 'song.osu')
  // 而文件里是**真** BID 且与请求不符时，仍然要拦住。
  const other = new Uint8Array(
    await new JSZip().file('song.osu', osu(['Version:V', 'BeatmapID:777'])).generateAsync({ type: 'uint8array' }),
  )
  await assert.rejects(() => extractOsuFromOsz(other.length, async (s, e) => other.slice(s, e), 5193095), /differs/)
})

// ---------- 前端写路径（漏网的几处） ----------

test('R33 前端：占位 ID 不当身份 —— 36 张无关谱面不会被判成"同一张图被复用"', async () => {
  const { mapIdentityKey, findDuplicateRoundMaps } = await import('../src/lib/tournamentDiagnostics.ts')
  // 有名字时用名字当身份（名字里带 type/难度，不含 BID）。
  assert.equal(mapIdentityKey({ beatmapId: 1, name: 'Toromaru - Curiosity [S7]' }), 'meta:|toromaru - curiosity [s7]||')
  // 没名字时才退化到 BID；占位 BID 不是身份 → null（过去会返回 "bid:1"，
  // 于是 36 张无名谱面互相判成"同一张图"）。
  assert.equal(mapIdentityKey({ beatmapId: 1 }), null)
  assert.equal(mapIdentityKey({ beatmapId: 0 }), null)
  assert.equal(mapIdentityKey({ beatmapId: -1 }), null)
  assert.equal(mapIdentityKey({ beatmapId: 5193095 }), 'bid:5193095')

  // 端到端：两轮里各有一张"只有占位 BID、没名字"的谱面 → 不该报重复使用。
  const dupRound = (id) => ({ id, abbreviation: id, maps: [{ slot: 'RC1', type: 'RC', realType: 'RC', difficulty: 0, beatmapId: 1 }] })
  const bogus = findDuplicateRoundMaps([{ id: 'mktc', abbreviation: 'MKTC', rounds: [dupRound('qual'), dupRound('gf')] }])
  assert.deepEqual(bogus, [], '占位 BID 不能把两轮的谱面粘成"同一张"')
})

test('R33 前端：占位 ID 不进"这个 BID 在别处出现过"的比较集（重复比赛警告不被带偏）', async () => {
  const { analyzeImportedMapIds } = await import('../src/lib/tournamentDiagnostics.ts')
  // 已有比赛里那张图只有占位 BID=1；导入的行里也有一行 BID 抄成了 1。
  // 过去两边都会产生 '1' → overlap 1/2 = 0.5 → 误报"这场已经存在了"。
  const existing = [{
    id: 'mktc', name: 'MKTC', abbreviation: 'MKTC',
    rounds: [{ id: 'qual', abbreviation: 'QUAL', maps: [{ slot: 'HB1', type: 'HB', realType: 'HB2', difficulty: 0, beatmapId: 1 }] }],
  }]
  const diagnostics = analyzeImportedMapIds([{ groupIndex: 0, mapIds: ['1', '5000001'] }], existing)
  assert.deepEqual(diagnostics.duplicateTournaments, [], '占位 BID 不该造成"这场已经存在了"的误报')
})

// 下面两条是**逻辑复刻**（React 组件 / hook 没法在 node:test 里直接跑），
// 只保证"判读函数用对了"这件事有据可查；真正的行为仍需浏览器实机验收。

test('R33 前端：BulkImporter 的 ID 判读（含手抄的占位值与 osu 返回的占位值）', () => {
  // 逻辑与 BulkImporter.doImport 一致：osu 的 meta 与手抄的 mapId 都要过判读。
  const resolveIds = (m, mapId) => {
    const fallbackBid = !m ? frontend.usableBeatmapId(/^\d+$/.test(mapId) ? Number(mapId) : undefined) : null
    const importedBid = m ? frontend.usableBeatmapId(Number(m.beatmapId)) : null
    const importedSetId = m ? frontend.usableBeatmapsetId(Number(m.beatmapsetId)) : null
    return {
      ...(importedBid ? { beatmapId: importedBid } : fallbackBid ? { beatmapId: fallbackBid } : {}),
      ...(importedSetId ? { beatmapsetId: importedSetId } : {}),
    }
  }
  // osu 返回占位值 → 两个字段都不写
  assert.deepEqual(resolveIds({ beatmapId: '0', beatmapsetId: '1' }, ''), {})
  // osu 返回真值 → 都写
  assert.deepEqual(resolveIds({ beatmapId: '5193095', beatmapsetId: '2387506' }, ''), {
    beatmapId: 5193095,
    beatmapsetId: 2387506,
  })
  // 识别失败但手抄了 BID：保留 BID，不写 setId
  assert.deepEqual(resolveIds(null, '5193095'), { beatmapId: 5193095 })
  // 手抄了个占位值 1 → 什么都不写（过去会写成 beatmapId: 1）
  assert.deepEqual(resolveIds(null, '1'), {})
  assert.deepEqual(resolveIds(null, '0'), {})
})

test('R33 前端：useMapHistory 不按占位 ID 建索引（同 set 共识/相关版本不被污染）', () => {
  const { isUsableBeatmapId } = frontend
  // 与 useMapHistory 的索引条件一致
  const indexable = (map) => ({
    bid: isUsableBeatmapId(map.beatmapId),
    set: isUsableBeatmapId(map.beatmapsetId),
  })
  assert.deepEqual(indexable({ beatmapId: 5193095, beatmapsetId: 1 }), { bid: true, set: false }, '占位 setId 不进 set 索引')
  assert.deepEqual(indexable({ beatmapId: 0, beatmapsetId: 2387506 }), { bid: false, set: true })
  assert.deepEqual(indexable({ beatmapId: undefined, beatmapsetId: undefined }), { bid: false, set: false })
})
