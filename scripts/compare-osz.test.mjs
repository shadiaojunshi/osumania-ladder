// compare-osz.mjs 的回归测试。
//
// 这个工具存在的理由：身份报告只说"内容不同"，不说**差在哪**；而"差在哪"决定该怎么办
// （倍速版 = 正常；只有难度设置不同 = 假不同；被 cut = 数据/文件有问题）。
// 所以这里的用例全部围绕"判定能不能区分这些情形"，另加一条走真实 zip 的 CLI 端到端。

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  KNOWN_RATES,
  chartStats,
  columnHistogram,
  compareOsuTexts,
  compareSection,
  difficultySettings,
  nearestRate,
  pickEntry,
  prefixRelation,
  readMapFile,
  sectionLines,
} from './compare-osz.mjs'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const { canonicalContent } = require('./mapIdentity.js')

// ---------------------------------------------------------------------------
// 夹具：一份最小的 4K 谱，按参数生成变体
// ---------------------------------------------------------------------------
function makeOsu({
  artist = 'Primary',
  title = 'Inai Sekai',
  creator = 'someone',
  version = 'Departure',
  od = 8,
  ar = 9,
  rate = 1,
  dropTail = 0,
  noteCount = 8,
  /** 只挪 [TimingPoints]，音符时间不动 —— 用来隔离"只有时间轴不同"这一种 */
  timingOnlyOffset = 0,
  mode = 3,
} = {}) {
  const objects = []
  for (let i = 0; i < noteCount; i++) {
    const t = Math.round((1000 + i * 250) * rate)
    const x = [64, 192, 320, 448][i % 4]
    // 每 4 个一个长音
    if (i % 4 === 3) objects.push(`${x},192,${t},128,0,${t + 200}:0:0:0:0:`)
    else objects.push(`${x},192,${t},1,0,0:0:0:0:`)
  }
  const kept = dropTail > 0 ? objects.slice(0, objects.length - dropTail) : objects
  return [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    `Mode: ${mode}`,
    'PreviewTime: 1000',
    '',
    '[Metadata]',
    `Title:${title}`,
    `Artist:${artist}`,
    `Creator:${creator}`,
    `Version:${version}`,
    'BeatmapID:4747791',
    'BeatmapSetID:2235054',
    '',
    '[Difficulty]',
    'HPDrainRate:7',
    `CircleSize:4`,
    `OverallDifficulty:${od}`,
    `ApproachRate:${ar}`,
    'SliderMultiplier:1.4',
    'SliderTickRate:1',
    '',
    '[Events]',
    '//Background and Video events',
    '0,0,"bg.jpg",0,0',
    '',
    '[TimingPoints]',
    `${Math.round(500 * rate) + timingOnlyOffset},500,4,1,0,100,1,0`,
    '',
    '[HitObjects]',
    ...kept,
    '',
  ].join('\n')
}

const base = makeOsu()

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------
test('canonical 切段：只认那四段（Metadata / Events 不进身份）', () => {
  const sections = sectionLines(canonicalContent(base))
  assert.equal(sections.HitObjects.length, 8)
  assert.equal(sections.TimingPoints.length, 1)
  assert.equal(sections.Difficulty.length, 6)
  assert.deepEqual(sections.General, ['Mode:3'], '只有 Mode 进 General')
  assert.ok(!canonicalContent(base).includes('Inai Sekai'), 'Metadata 不进身份')
  assert.ok(!canonicalContent(base).includes('bg.jpg'), 'Events 不进身份')
})

test('chartStats：音符 / 长音 / 时间轴 / 列分布 / 难度设置', () => {
  const s = chartStats(sectionLines(canonicalContent(base)))
  assert.equal(s.noteCount, 8)
  assert.equal(s.lnCount, 2)
  assert.equal(s.firstTime, 1000)
  assert.equal(s.lastTime, 1000 + 7 * 250)
  assert.equal(s.durationMs, 7 * 250)
  assert.equal(s.timingCount, 1)
  assert.deepEqual(s.columns, [2, 2, 2, 2])
  assert.equal(s.difficulty.OverallDifficulty, '8')
  assert.equal(s.difficulty.ApproachRate, '9')
})

test('columnHistogram：列分布不同 = 布局不同', () => {
  assert.deepEqual(columnHistogram(['64,192,0,1,0,0:0:0:0:', '448,192,0,1,0,0:0:0:0:']), [1, 0, 0, 1])
  assert.deepEqual(columnHistogram([]), [0, 0, 0, 0])
})

test('difficultySettings：只取白名单里的键，浮点原样保留', () => {
  const d = difficultySettings(['OverallDifficulty:8', 'ApproachRate:9.5', 'Foo:1'])
  assert.deepEqual(d, { OverallDifficulty: '8', ApproachRate: '9.5' })
})

test('compareSection：相同 / 不同，并给出首个差异行', () => {
  assert.equal(compareSection('x', ['a', 'b'], ['a', 'b']).same, true)
  const d = compareSection('x', ['a', 'b'], ['a', 'c'])
  assert.equal(d.same, false)
  assert.equal(d.firstDiffIndex, 1)
  assert.equal(d.firstDiffA, 'b')
  assert.equal(d.firstDiffB, 'c')
  // 长度不同也算不同，且能指出缺行
  const short = compareSection('x', ['a'], ['a', 'b'])
  assert.equal(short.same, false)
  assert.equal(short.firstDiffA, '(没有这一行)')
})

test('prefixRelation：短的是长的完整前缀 → 判为截断（cut）', () => {
  const r = prefixRelation(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])
  assert.equal(r.truncation, true)
  assert.equal(r.commonPrefix, 3)
  const mid = prefixRelation(['a', 'z', 'c'], ['a', 'b', 'c', 'd'])
  assert.equal(mid.truncation, false, '中间就不同 → 不是截断')
  assert.equal(mid.commonPrefix, 1)
})

test('nearestRate：只认已知倍速档位，差一点就不认', () => {
  assert.ok(KNOWN_RATES.includes(1.05))
  assert.equal(nearestRate(1.05), 1.05)
  assert.equal(nearestRate(1.1), 1.1)
  assert.equal(nearestRate(1.5), 1.5)
  assert.equal(nearestRate(1.03), null)
  assert.equal(nearestRate(1), null, '1.0 不是倍速')
  assert.equal(nearestRate(NaN), null)
})

// ---------------------------------------------------------------------------
// 判定：能不能把几种情形分开（这是这个工具的全部价值）
// ---------------------------------------------------------------------------
test('判定：只有 Metadata 不同 → identical（证明元数据不参与身份）', () => {
  const r = compareOsuTexts(base, makeOsu({ artist: '别的歌手', title: '另一首歌', version: 'Alpha', creator: 'x' }))
  assert.equal(r.verdict, 'identical')
  assert.ok(r.notes.some((n) => n.includes('玩法内容逐段一致')))
})

test('判定：只有难度设置不同 → difficulty-only（假不同）', () => {
  const r = compareOsuTexts(base, makeOsu({ od: 9.5, ar: 9.8 }))
  assert.equal(r.verdict, 'difficulty-only')
  assert.equal(r.stats.a.noteCount, r.stats.b.noteCount)
})

test('判定：音符一样、只有时间轴不同 → timing-only', () => {
  const r = compareOsuTexts(base, makeOsu({ timingOnlyOffset: 37 }))
  assert.equal(r.verdict, 'timing-only')
})

test('判定：音符数相同 + 时间轴成 1.05 比例 → rate-variant（真不同但设计内）', () => {
  const r = compareOsuTexts(base, makeOsu({ rate: 1.05 }))
  assert.equal(r.verdict, 'rate-variant')
  assert.equal(r.rate, 1.05)
  // 倍速版连 TimingPoints 一起改 —— 所以这条分支**不能**要求时间轴相同
  assert.equal(r.sections.find((s) => s.section === 'TimingPoints').same, false)
  assert.ok(r.notes.some((n) => n.includes('设计内')))
})

test('判定：短的只是被砍掉尾巴 → notes-differ + 明确指出像 cut', () => {
  const r = compareOsuTexts(base, makeOsu({ dropTail: 3 }))
  assert.equal(r.verdict, 'notes-differ')
  assert.ok(r.notes.some((n) => n.includes('8 vs 5')))
  assert.ok(r.notes.some((n) => n.includes('前缀') && n.includes('cut')), '要说出"像是从尾部 cut 掉了"')
})

test('判定：音符数相同但内容不同、时长也对不上 → 报成"真的不同谱面"', () => {
  // 同一个时间轴上换掉音符内容（不缩放），音符数一致、比例≈1
  const other = makeOsu().replace('64,192,1000,1,0,0:0:0:0:', '448,192,1000,1,0,0:0:0:0:')
  const r = compareOsuTexts(base, other)
  assert.equal(r.verdict, 'notes-differ')
  assert.ok(r.notes.some((n) => n.includes('被编辑过')))
})

test('判定：Mode 不同直接判不同谱面', () => {
  const r = compareOsuTexts(base, makeOsu({ mode: 0 }))
  assert.equal(r.verdict, 'notes-differ')
  assert.ok(r.notes.some((n) => n.includes('Mode 不同')))
})

test('判定：有一份没有可比内容 → no-content（不是"相同"）', () => {
  const empty = 'osu file format v14\n\n[Metadata]\nTitle:x\n'
  const r = compareOsuTexts(base, empty)
  assert.equal(r.verdict, 'no-content')
  assert.equal(r.canonicalB, '', 'canonicalContent 为空')
})

// ---------------------------------------------------------------------------
// IO + CLI
// ---------------------------------------------------------------------------
test('pickEntry：多个难度时按提示取，取不到就取第一个', () => {
  const entries = [{ name: 'a.osu' }, { name: 'b.osu' }]
  assert.equal(pickEntry(entries, 'b').name, 'b.osu')
  assert.equal(pickEntry(entries, 'nope').name, 'a.osu')
  assert.equal(pickEntry(entries).name, 'a.osu')
  assert.equal(pickEntry([]), null)
})

test('readMapFile：纯 .osu 文本与非 zip 都能读（不依赖 PK 头）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-osz-'))
  try {
    const p = path.join(dir, 'plain.osu')
    fs.writeFileSync(p, base)
    const r = await readMapFile(p)
    assert.equal(r.entries.length, 1)
    assert.equal(r.entries[0].text, base)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI 端到端：真 zip 进、结论出（含 --json 与退出码）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-osz-cli-'))
  try {
    // 两个真 .osz：同一张谱的 A 与 1.05x 版（倍速版的典型形态）
    for (const [file, text] of [['a.osz', base], ['b.osz', makeOsu({ rate: 1.05 })]]) {
      const zip = new JSZip()
      zip.file('audio.mp3', Buffer.from([0, 1, 2, 3]))
      zip.file('song.osu', text)
      fs.writeFileSync(path.join(dir, file), await zip.generateAsync({ type: 'nodebuffer' }))
    }
    // 路径里带空格：pathname 会给出 %20，必须用 fileURLToPath
    const cli = fileURLToPath(new URL('./compare-osz.mjs', import.meta.url))
    const out = execFileSync(process.execPath, [cli, path.join(dir, 'a.osz'), path.join(dir, 'b.osz'), '--json'], {
      encoding: 'utf-8',
    })
    const parsed = JSON.parse(out)
    assert.equal(parsed.verdict, 'rate-variant')
    assert.equal(parsed.rate, 1.05)
    assert.equal(parsed.a.entry, 'song.osu', '要挑出包里的 .osu，忽略音频')

    // 人类可读模式：结论那一行必须在
    const text = execFileSync(process.execPath, [cli, path.join(dir, 'a.osz'), path.join(dir, 'b.osz')], { encoding: 'utf-8' })
    assert.match(text, /结论：rate-variant/)
    assert.match(text, /逐段比对/)
    assert.match(text, /\[HitObjects\] 不同/)

    // 单文件模式
    const one = execFileSync(process.execPath, [cli, path.join(dir, 'a.osz')], { encoding: 'utf-8' })
    assert.match(one, /音符 8/)

    // 参数错 → 退出码 2；--help → 0
    let code = 0
    try {
      execFileSync(process.execPath, [cli, 'a', 'b', 'c'], { encoding: 'utf-8', stdio: 'pipe' })
    } catch (err) {
      code = err.status
    }
    assert.equal(code, 2, '参数错要 exit 2')
    const help = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf-8' })
    assert.match(help, /canonicalContent/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
