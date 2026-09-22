import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { csvCell, makeCsv, parseChart, planCollections, exportCollections, COLUMNS } from './export-pack-csv.mjs'
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
    targetType: 'TB', publicUrl: 'https://packs.example/', exportedAt: '2026-09-22T00:00:00Z',
    readChart: async key => {
      requests.push(key)
      if (key === paths[0]) throw new Error('missing primary copy')
      return { content: key.endsWith('.nsv.osz') ? b : a, osuName: 'song.osu' }
    }, upload: async data => uploads.push(data),
  })
  assert.deepEqual(requests, paths)
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
  assert.throws(() => planCollections(manifest, 'TYPO'), /No published packs/)
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
