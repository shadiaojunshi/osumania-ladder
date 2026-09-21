import assert from 'node:assert/strict'
import fs, { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { planPackRun, assertSinglePublishSafe, assertPublishedContent } = require('./pack-plan')
const { normalizeRealType, REAL_TYPE_NAMES, PACK_EXCLUDED_REAL_TYPES } = require('./generate-pack')
const options = { normalize: normalizeRealType, knownTypes: Object.keys(REAL_TYPE_NAMES), excludedTypes: [...PACK_EXCLUDED_REAL_TYPES] }
const tournament = (maps) => ({ id: 'cup', rounds: [{ id: 'final', maps }] })
const content = (key) => ({ contentKey: key, paths: [`maps/${key}.osz`] })

test('run planning includes an empty destination and retains the source for retirement', () => {
  const plan = planPackRun([tournament([{ slot: 'LN1', realType: 'IN', packAs: 'ORC' }])], options)
  assert.deepEqual(plan.types, ['IN', 'ORC'])
  assert.deepEqual(plan.routing['maps/cup/final/LN1.osz'], { from: 'IN', to: 'ORC' })
})

test('aliases do not force a migration; invalid or excluded destinations stop the run', () => {
  assert.deepEqual(planPackRun([tournament([{ realType: 'WC', packAs: 'LNWC' }])], options).routing, {})
  for (const packAs of ['TYPO', 'PDRC']) {
    assert.throws(() => planPackRun([tournament([{ realType: 'IN', packAs }])], options), /无效/)
  }
})

test('single publish refuses active migrations and cancelling the last migration', () => {
  const routing = { a: { from: 'IN', to: 'SS' } }
  assert.throws(() => assertSinglePublishSafe(routing, {}), /全量发布/)
  assert.throws(() => assertSinglePublishSafe({}, routing), /全量发布/)
  assert.doesNotThrow(() => assertSinglePublishSafe({}, {}))
})

test('new maps cannot mask lost content, including NSV; explicit removal can be allowed', () => {
  const old = [{ contentEntries: [content('main'), content('nsv')] }]
  const next = [{ contentEntries: [content('main'), content('borrowed1'), content('borrowed2')] }]
  assert.throws(() => assertPublishedContent(old, next), /nsv/)
  assert.equal(assertPublishedContent(old, next, true).lost.length, 1)
})

test('moving and splitting maps preserves content; legacy coverage is reported honestly', () => {
  const old = [{ contentEntries: [content('a'), content('b')] }, { realType: 'legacy' }]
  const result = assertPublishedContent(old, [{ contentEntries: [content('b')] }, { contentEntries: [content('a')] }])
  assert.deepEqual(result.lost, [])
  assert.equal(result.legacyPacks, 1)
})

// Exercise the real CLI main, replacing only IO and pack generation. No R2,
// output directory, or real manifest is accessed by this harness.
async function runMain({ maps, argv = [], previous = { packs: [] }, generate }) {
  const calls = [], writes = [], logs = []
  const fakeFs = {
    existsSync: () => true,
    readdirSync: () => ['cup.json'],
    readFileSync: (file) => JSON.stringify(String(file).includes('packs-manifest') ? previous : tournament(maps)),
    writeFileSync: (file, data) => writes.push({ file: String(file), data: JSON.parse(data) }),
  }
  const context = {
    require: (name) => name === 'fs' ? fakeFs : require(name),
    module: { exports: {} },
    __dirname: new URL('.', import.meta.url).pathname,
    process: { argv: ['node', 'generate-pack.js', ...argv], env: { R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY: 'test', R2_SECRET_KEY: 'test', R2_PACKS_PUBLIC_URL: 'https://example.test' }, exit: (code) => { throw new Error(`exit ${code}`) } },
    console: { log: (...v) => logs.push(v.join(' ')), warn: (...v) => logs.push(v.join(' ')), error: (...v) => logs.push(v.join(' ')) },
    generate: async (type) => {
      calls.push(type)
      return generate ? generate(type) : { realType: type, status: 'ok', plannedSlots: 1, packs: [{ realType: type, part: 1, status: 'ok', mapCount: 1, contentEntries: [content(type)] }] }
    },
  }
  const source = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  vm.runInNewContext(source + '\ngeneratePack = generate; writeIdentityReport = () => {}; listPackBucketObjects = async () => []; module.exports.runMain = main;', context)
  let error
  try { await context.module.exports.runMain() } catch (err) { error = err }
  return { calls, writes, logs, error }
}

test('CLI full run actually generates a destination without native maps', async () => {
  const result = await runMain({ maps: [{ realType: 'IN', packAs: 'ORC', slot: 'LN1' }] })
  assert.equal(result.error, undefined)
  assert.deepEqual(result.calls, ['IN', 'ORC'])
  assert.equal(result.writes.find((w) => w.file.endsWith('packs-manifest.json')).data.packRouting['maps/cup/final/LN1.osz'].to, 'ORC')
})

test('CLI single migration publish stops before generation or writing', async () => {
  const result = await runMain({ maps: [{ realType: 'IN', packAs: 'SS', slot: 'LN1' }], argv: ['--type=IN', '--publish'] })
  assert.match(result.error?.message || '', /全量发布/)
  assert.deepEqual(result.calls, [])
  assert.deepEqual(result.writes, [])
})

test('CLI full retirement removes old source and publishes destination together', async () => {
  const previous = { packs: [{ realType: 'IN', part: 1, contentEntries: [content('song')] }] }
  const result = await runMain({ maps: [{ realType: 'IN', packAs: 'SS', slot: 'LN1' }], previous,
    generate: (type) => ({ realType: type, status: 'ok', reason: type === 'IN' ? 'moved-out' : 'ok', plannedSlots: type === 'IN' ? 0 : 1,
      packs: type === 'IN' ? [] : [{ realType: type, part: 1, status: 'ok', mapCount: 1, contentEntries: [content('song')] }] }),
  })
  assert.equal(result.error, undefined)
  const manifest = result.writes.find((w) => w.file.endsWith('packs-manifest.json')).data
  assert.deepEqual(manifest.packs.map((p) => p.realType), ['SS'])
})

test('CLI refuses masked content loss before writing either manifest', async () => {
  const result = await runMain({ maps: [{ realType: 'SS', slot: 'RC1' }], previous: { packs: [{ realType: 'SS', part: 1, contentEntries: [content('lost')] }] } })
  assert.match(result.error?.message || '', /未收录/)
  assert.deepEqual(result.writes, [])
})

test('CLI preview remains available during a migration and never claims retirement', async () => {
  const result = await runMain({ maps: [{ realType: 'IN', packAs: 'SS', slot: 'LN1' }], argv: ['--type=IN'],
    generate: () => ({ realType: 'IN', status: 'ok', reason: 'moved-out', plannedSlots: 0, packs: [] }),
  })
  assert.equal(result.error, undefined)
  assert.deepEqual(result.writes, [])
  assert.ok(!result.logs.some((s) => s.includes('已下线')))
})

test('real ZIP generation moves main + NSV, borrows resources, records content, and blocks masked loss', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ladder-pack-review-'))
  const JSZip = require('jszip')
  const { contentSignature } = require('./mapIdentity')
  const sdk = require('@aws-sdk/client-s3')
  const objects = new Map(), uploads = new Map()
  const chart = (end) => `osu file format v14\n[General]\nAudioFilename: song.mp3\nMode: 3\n[Metadata]\nTitle:Song\nArtist:Artist\nCreator:Mapper\nVersion:Normal\n[Difficulty]\nCircleSize:4\n[Events]\n0,0,"bg.jpg",0,0\n[TimingPoints]\n0,500,4,1,0,100,1,0\n[HitObjects]\n64,192,100,128,0,${end}:0:0:0:0:\n`
  const makeOsz = async (text, resources) => {
    const zip = new JSZip().file('map.osu', text)
    if (resources) zip.file('song.mp3', Buffer.from('audio')).file('bg.jpg', Buffer.from('background'))
    return zip.generateAsync({ type: 'nodebuffer' })
  }
  objects.set('maps/cup/final/LN1.osz', await makeOsz(chart(500), true))
  objects.set('maps/cup/final/LN1.nsv.osz', await makeOsz(chart(600), false))
  const source = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf8')
  const run = async () => {
    const context = {
      require: (name) => name !== '@aws-sdk/client-s3' ? require(name) : { ...sdk, S3Client: class {
        async send(command) {
          const { Key, Prefix, Body } = command.input
          if (command instanceof sdk.ListObjectsV2Command) return { Contents: [...(Prefix ? objects : uploads)].map(([Key, buf]) => ({ Key, Size: buf.length })) }
          if (command instanceof sdk.GetObjectCommand) {
            assert.ok(objects.has(Key), `Unexpected download ${Key}`)
            return { Body: [objects.get(Key)] }
          }
          if (command instanceof sdk.PutObjectCommand) { uploads.set(Key, Body); return {} }
          assert.fail('Unexpected storage operation')
        }
      } },
      module: { exports: {} }, __dirname: path.join(root, 'scripts'), Buffer,
      process: { argv: ['node', 'generate-pack.js'], env: { R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY: 'test', R2_SECRET_KEY: 'test', R2_PACKS_PUBLIC_URL: 'https://example.test' }, exit: (code) => { throw new Error(`exit ${code}`) } },
      console: { log() {}, warn() {}, error() {} },
    }
    vm.runInNewContext(source + '\nmodule.exports.runMain = main;', context)
    await context.module.exports.runMain()
  }
  try {
    fs.mkdirSync(path.join(root, 'data', 'tournaments'), { recursive: true })
    const dataPath = path.join(root, 'data', 'tournaments', 'cup.json')
    const manifestPath = path.join(root, 'data', 'packs-manifest.json')
    fs.writeFileSync(dataPath, JSON.stringify(tournament([{ realType: 'IN', packAs: 'ORC', slot: 'LN1' }])))
    await run()
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.deepEqual(manifest.packs.map((p) => p.realType), ['ORC'])
    assert.equal(manifest.packs[0].mapCount, 1)
    assert.equal(manifest.packs[0].contentEntries.length, 2)
    assert.ok(manifest.packs[0].contentEntries.some((e) => e.contentKey === contentSignature(chart(600))))
    const pack = await JSZip.loadAsync(uploads.get(manifest.packs[0].objectKey))
    const maps = Object.values(pack.files).filter((f) => f.name.endsWith('.osu') && f.name !== 'delete this.osu')
    assert.equal(maps.length, 2)
    for (const map of maps) {
      const text = await map.async('string')
      assert.match(text, /Version:\[Inverse\]/)
      assert.ok(pack.file(/AudioFilename:\s*(.+)/.exec(text)[1]))
      assert.ok(pack.file(/0,0,"([^"]+)"/.exec(text)[1]))
    }
    const before = fs.readFileSync(manifestPath, 'utf8')
    // Lose the NSV but add a new native chart: count is up, yet old content vanished.
    objects.delete('maps/cup/final/LN1.nsv.osz')
    objects.set('maps/cup/final/RC1.osz', await makeOsz(chart(700), true))
    fs.writeFileSync(dataPath, JSON.stringify(tournament([
      { realType: 'IN', packAs: 'ORC', slot: 'LN1' }, { realType: 'ORC', slot: 'RC1' },
    ])))
    await assert.rejects(run(), /未收录/)
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), before)
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('ladder-pack-review-'))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
