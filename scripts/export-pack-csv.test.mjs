import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { csvCell, makeCsv, parseChart, planCollections, exportCollections, parseTypeArgs, describeError, withRetry,
  resolveReadConcurrency, DEFAULT_READ_CONCURRENCY, MAX_READ_CONCURRENCY, COLUMNS } from './export-pack-csv.mjs'
import { extractOsuFromOsz } from '../functions/api/_lib/osuArchive.ts'
import { currentPackCsv } from '../src/lib/packCsv.ts'

const require = createRequire(import.meta.url)
const { contentSignature } = require('./mapIdentity.js')
const chart = (time = 2000) => `osu file format v14
[General]
AudioFilename: song.mp3
Mode: 3
PreviewTime: -1
[Metadata]
Title:Song, "你好"
TitleUnicode:歌
Artist:Artist
ArtistUnicode:艺术家
Creator:Mapper
Version:4K Hard
BeatmapID:123456
BeatmapSetID:98765
Source:Some: source
Tags:a b
[Difficulty]
CircleSize:4
HPDrainRate:6.5
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4
[TimingPoints]
0,500,4,1,0,100,1,0
1000,-50,4,1,0,100,0,0
4000,250,4,1,0,100,1,0
[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,${time},128,0,5000:0:0:0:0:
`
const entry = (text, ...paths) => ({ contentKey: contentSignature(text), paths })
const pack = (type, part, entries) => ({ realType: type, part, objectKey: `${type}_${part}.hash.osz`, contentEntries: entries })

test('CSV preserves original IDs and metadata, counts holds, derives duration and dominant BPM', () => {
  const result = parseChart(chart(), 'song.osu')
  assert.equal(result.beatmap_id, 123456)
  assert.equal(result.beatmapset_id, 98765)
  assert.equal(result.title, 'Song, "你好"')
  assert.equal(result.source, 'Some: source')
  assert.equal(result.mode, 'mania')
  assert.equal(result.hp, 6.5)
  assert.equal(result.od, 8)
  assert.equal(result.cs, 4)
  assert.equal(result.total_time, 5000)
  assert.equal(result.preview_time, -1)
  assert.equal(result.hitcircles, 1)
  assert.equal(result.sliders, 1)
  assert.equal(result.bpm, 120)
  assert.equal(result.bpm_max, 240)
  assert.equal(result.bpm_min, 120)
  assert.equal(result.ranked_status, undefined)
  assert.equal(result.md5, undefined)
  assert.equal(result.stars, undefined)
})

test('CSV handles commas, double quotes, line breaks, Unicode, formulas and numeric negatives', () => {
  assert.equal(csvCell('你好, "曲名"\n下一行'), '"你好, ""曲名""\n下一行"')
  for (const value of ['=1+1', '+SUM(A1)', '@command', '-command', '\t=1+1']) assert.ok(csvCell(value).startsWith("'"))
  assert.equal(csvCell(-1), '-1')
  assert.equal(csvCell(undefined), '')
  assert.ok(makeCsv([{ title: '你好, "歌"' }]).startsWith('\uFEFF' + COLUMNS.join(',') + '\r\n'))
  assert.ok(makeCsv([{ title: '你好, "歌"' }]).includes('"你好, ""歌"""'))
})

test('invalid and placeholder IDs remain empty; local chart rows are retained', () => {
  const result = parseChart(chart().replace('BeatmapID:123456', 'BeatmapID:0').replace('BeatmapSetID:98765', 'BeatmapSetID:1'), 'unsubmitted.osu')
  assert.equal(result.beatmap_id, '')
  assert.equal(result.beatmapset_id, '')
})

test('export covers all parts and NSV, uses fallback copies, respects published routing and never reads unrelated types', async () => {
  const a = chart(), b = chart(3000)
  const paths = ['maps/cup/r/a.osz', 'maps/cup/r/a-copy.osz', 'maps/cup/r/a.nsv.osz']
  const manifest = { packs: [pack('TB', 2, [entry(b, paths[2])]), pack('CJ', 1, [entry(a, 'maps/cup/r/other.osz')]), pack('TB', 1, [entry(a, ...paths.slice(0, 2))])] }
  const requests = [], uploads = []
  const collections = await exportCollections(manifest, {
    targetTypes: ['TB'], publicUrl: 'https://packs.example/', exportedAt: '2026-09-22T00:00:00Z',
    readChart: async key => {
      requests.push(key)
      if (key === paths[0]) throw new Error('missing primary copy')
      return { content: key.endsWith('.nsv.osz') ? b : a, osuName: 'song.osu' }
    }, upload: async data => uploads.push(data),
  })
  // 读是并发的，完成顺序不保证 —— 只断言"读了哪些"，不锁"按什么顺序读"。
  // 这条测试真正要守的是下一行：别的键型的对象一个都不许碰。
  assert.deepEqual([...requests].sort(), [...paths].sort())
  assert.equal(uploads.length, 1)
  assert.equal(collections[0].mapCount, 2)
  assert.equal(collections[0].nsvCount, 1)
  assert.equal(collections[0].missingIdCount, 0)
  assert.deepEqual(collections[0].sourceObjectKeys, ['TB_1.hash.osz', 'TB_2.hash.osz'])
  assert.match(collections[0].url, /^https:\/\/packs.example\/csv\/TB\.[a-f0-9]{16}\.csv$/)
  const csv = uploads[0].body.toString('utf8')
  assert.equal(csv.trim().split('\r\n').length, 3)
  assert.ok(csv.includes(',main,'))
  assert.ok(csv.includes(',NSV,'))
  assert.ok(csv.includes(',98765,123456,'))
})

test('changed/missing R2 originals and failed uploads abort export instead of silently omitting charts', async () => {
  const manifest = { packs: [pack('TB', 1, [entry(chart(), 'maps/cup/r/a.osz')])] }
  let uploaded = false
  const options = { publicUrl: 'https://packs.example', exportedAt: 'today', readChart: async () => ({ content: chart(3500), osuName: 'map.osu' }), upload: async () => { uploaded = true } }
  await assert.rejects(exportCollections(manifest, options), /与已发布合集不一致/)
  assert.equal(uploaded, false)
  await assert.rejects(exportCollections(manifest, { ...options, readChart: async () => { throw new Error('missing') } }), /missing/)
  await assert.rejects(exportCollections(manifest, { ...options, readChart: async () => ({ content: chart(), osuName: 'a.osu' }), upload: async () => { throw new Error('upload failed') } }), /upload failed/)
  assert.throws(() => planCollections({ packs: [{ realType: 'TB' }] }), /缺少/)
  assert.throws(() => planCollections(manifest, ['TYPO']), /No published packs/)
})

test('published CSV is hidden when parts change, and remains usable after mirror-only changes', () => {
  const parts = [{ realType: 'TB', objectKey: 'TB_1.a.osz' }, { realType: 'TB', objectKey: 'TB_2.b.osz' }]
  const csv = { realType: 'TB', url: 'https://packs.example/csv/tb.csv', sourceObjectKeys: ['TB_2.b.osz', 'TB_1.a.osz'], mapCount: 99, exportedAt: 'today' }
  assert.equal(currentPackCsv(parts, [csv]), csv)
  assert.equal(currentPackCsv(parts.slice(0, 1), [csv]), undefined)
  assert.equal(currentPackCsv([...parts, { realType: 'TB', objectKey: 'new.osz' }], [csv]), undefined)
  assert.equal(currentPackCsv([{ realType: 'TB' }], [csv]), undefined)
})

test('range extraction reads chart text without downloading the audio asset', async () => {
  const JSZip = require('jszip')
  const zip = new JSZip()
  zip.file('song.osu', chart())
  zip.file('song.mp3', Buffer.alloc(512 * 1024, 123))
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
  let readBytes = 0
  const result = await extractOsuFromOsz(bytes.length, async (start, end) => { readBytes += end - start; return bytes.subarray(start, end) })
  assert.equal(result.content, chart())
  assert.equal(result.osuName, 'song.osu')
  assert.ok(readBytes < bytes.length / 2)
  const deflated = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const compressedResult = await extractOsuFromOsz(deflated.length, async (start, end) => deflated.subarray(start, end))
  assert.equal(compressedResult.content, chart())
})

// ---------------------------------------------------------------------------
// 批量导出：一次导多个键型，省的就是"每个键型一次 commit = 一次 Pages 构建"
// ---------------------------------------------------------------------------

test('一次导多个键型：只导选中的那些，其余键型的对象一个都不碰', async () => {
  const a = chart(), b = chart(3000)
  const manifest = { packs: [
    pack('TB', 1, [entry(a, 'maps/cup/r/tb.osz')]),
    pack('CJ', 1, [entry(b, 'maps/cup/r/cj.osz')]),
    pack('SS', 1, [entry(a, 'maps/cup/r/ss.osz')]),
  ] }
  const requests = [], uploads = []
  const collections = await exportCollections(manifest, {
    targetTypes: ['CJ', 'TB'], concurrency: 1, publicUrl: 'https://packs.example', exportedAt: 'today',
    readChart: async key => { requests.push(key); return { content: key.includes('cj') ? b : a, osuName: 'song.osu' } },
    upload: async data => uploads.push(data),
  })
  assert.deepEqual(collections.map(c => c.realType), ['CJ', 'TB'], '输出按键型字母序')
  assert.deepEqual(uploads.map(u => u.realType), ['CJ', 'TB'])
  assert.deepEqual(requests, ['maps/cup/r/cj.osz', 'maps/cup/r/tb.osz'], 'SS 没被选中，它的对象不该被读')
  await assert.rejects(
    exportCollections(manifest, { targetTypes: ['NOPE'], readChart: async () => ({ content: a, osuName: 'a.osu' }), upload: async () => {} }),
    /No published packs for NOPE/)
})

test('多键型里有一个查无数据：整趟拒绝，不静默只导剩下的', () => {
  const manifest = { packs: [pack('TB', 1, [entry(chart(), 'maps/cup/r/tb.osz')])] }
  // 'TB,TYPO'（键型名敲错）和 'TB,GM'（GM 的包已下架）是同一种情况，都必须整趟停下。
  // 只导 TB 然后报成功，用户会以为两个键型都刷新了；而索引合并又会把那个键型的旧条目滤掉 ——
  // 一次"看起来成功"的运行，实际结果和用户的理解相反。宁可白跑一趟也不许静默半成功。
  assert.throws(() => planCollections(manifest, ['TB', 'TYPO']), /No published packs for TYPO/, '漏报的那个键型要指名')
  assert.throws(() => planCollections(manifest, ['TYPO', 'NOPE']), /No published packs for TYPO, NOPE/)
})

test('并发读不打乱 CSV 行序：行仍按包与条目原顺序输出', async () => {
  const total = 12
  const entries = Array.from({ length: total }, (_, i) => entry(chart(2000 + i), `maps/cup/r/${i}.osz`))
  const uploads = [], completed = []
  const collections = await exportCollections({ packs: [pack('TB', 1, entries)] }, {
    targetTypes: ['TB'], concurrency: 8, publicUrl: 'https://packs.example', exportedAt: 'today',
    // 故意让先发起的后回来：若行是按"完成顺序"追加的，这条断言会整个翻过来。
    readChart: async key => {
      const i = Number(key.match(/(\d+)\.osz$/)[1])
      await new Promise(resolve => setTimeout(resolve, (total - i) * 2))
      completed.push(i)
      return { content: chart(2000 + i), osuName: `${i}.osu` }
    },
    upload: async data => uploads.push(data),
  })
  // 前提断言：读的完成顺序真的被打乱了。没打乱的话（比如并发数被改成 1，
  // 或上面的延迟被删掉），下面那条就变成恒真的空转断言了。
  assert.notDeepEqual(completed, entries.map((_, i) => i), '读的完成顺序没被打乱，这条测试测不到东西')
  assert.equal(collections[0].mapCount, total)
  const keys = uploads[0].body.toString('utf8').trim().split('\r\n').slice(1).map(line => line.split(',').at(-1))
  assert.deepEqual(keys, entries.map(e => e.contentKey), 'CSV 行序必须与已发布清单里的顺序一致')
})

// ---------------------------------------------------------------------------
// 命令行 / 重试 / 诊断信息 / 并发旋钮
// ---------------------------------------------------------------------------

test('命令行：留空=全量，单个、逗号多个、重复去重，写错一律报用法', () => {
  assert.deepEqual(parseTypeArgs([]), [], '留空导出全部')
  assert.deepEqual(parseTypeArgs(['--type=TB']), ['TB'])
  assert.deepEqual(parseTypeArgs(['--type=ADP,CJ,CO']), ['ADP', 'CJ', 'CO'])
  assert.deepEqual(parseTypeArgs(['--type=TB,TB']), ['TB'], '重复的键型去重')
  for (const bad of [['--type='], ['--type=TB,'], ['--type=,TB'], ['--type=A B'], ['--type=tb!'],
    ['--type=A', '--type=B'], ['-t=TB'], ['extra']]) {
    assert.throws(() => parseTypeArgs(bad), /Usage/, `${JSON.stringify(bad)} 应报用法`)
  }
})

test('错误摊平带上 name / code / HTTP 状态，不再只剩 message', () => {
  // 2026-09-22 那次只剩 `aborted`，看不出是 ECONNRESET（偶发）还是对象坏了。
  const reset = Object.assign(new Error('aborted'), { code: 'ECONNRESET', $metadata: { httpStatusCode: 200 } })
  assert.equal(describeError(reset), 'aborted [ECONNRESET] [HTTP 200]')
  assert.equal(describeError(new TypeError('bad shape')), 'bad shape [TypeError]')
  assert.equal(describeError(new Error('plain')), 'plain')
  assert.equal(describeError(undefined), 'unknown error')
})

test('读操作重试：抖动两次后成功；一直失败则用尽次数并抛出最后一个错', async () => {
  const warns = []
  const realWarn = console.warn
  console.warn = message => warns.push(message)
  try {
    let calls = 0
    const value = await withRetry('读 x', async () => { if (++calls < 3) throw new Error('blip'); return 'ok' }, { delayMs: 1 })
    assert.equal(value, 'ok')
    assert.equal(calls, 3, '第三次才成功，说明确实重试了')

    let attempts = 0
    await assert.rejects(
      withRetry('读 y', async () => { attempts++; throw Object.assign(new Error('boom'), { code: 'ECONNRESET' }) }, { delayMs: 1 }),
      error => error.code === 'ECONNRESET' && error.message === 'boom')
    assert.equal(attempts, 3, '重试到上限就停，不无限重试')
  } finally {
    console.warn = realWarn
  }
  // 重试必须留下原因，否则日志里只看到"变慢了"，看不出被重试的是哪种错。
  assert.ok(warns.some(w => w.includes('ECONNRESET')), `重试日志缺错误码：${warns.join(' | ')}`)
})

test('并发旋钮：默认 8、非法值回退、上限 32、下限 1', () => {
  assert.equal(resolveReadConcurrency(undefined), DEFAULT_READ_CONCURRENCY)
  assert.equal(DEFAULT_READ_CONCURRENCY, 8, '默认值改动要同步文档（CSV_READ_CONCURRENCY）')
  // 非法 / 无意义的值一律回退默认，绝不返回 0 或 NaN（那会让任务空转）
  for (const bad of ['', '  ', '0', '-1', 'abc', 'NaN', null]) {
    assert.equal(resolveReadConcurrency(bad), DEFAULT_READ_CONCURRENCY, `${JSON.stringify(bad)} 应回退默认`)
  }
  assert.equal(resolveReadConcurrency('1'), 1)
  assert.equal(resolveReadConcurrency('12'), 12)
  assert.equal(resolveReadConcurrency('12.9'), 12, '小数向下取整')
  assert.equal(resolveReadConcurrency('9999'), MAX_READ_CONCURRENCY, '上限封顶')
})

test('守门：并发数只从旋钮取，脚本里不得写死 mapWithConcurrency 的并发', () => {
  // 写死的并发是"调不动导出速度"的根因，别再散落回去。
  const src = readFileSync(new URL('./export-pack-csv.mjs', import.meta.url), 'utf-8')
  const hardcoded = [...src.matchAll(/mapWithConcurrency\(\s*[A-Za-z_$][\w$]*\s*,\s*(\d+)/g)].map(m => m[1])
  assert.deepEqual(hardcoded, [], `并发数必须走 READ_CONCURRENCY，发现写死：${hardcoded.join(', ')}`)
})
