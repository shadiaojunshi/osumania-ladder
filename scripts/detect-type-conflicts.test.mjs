// R20：键型冲突检查脚本的安全约束。
//
// 这个脚本会写 data/tournaments/*.json，所以测试的重点全在"不该写的时候不写、
// 该拒绝的时候拒绝"：
//   1. 分类规则与后台面板同源（同 set 不同 BID 不误报成必修冲突）；
//   2. 默认（不带 --apply）不写任何文件；
//   3. 定位必须唯一：轮次 id 重复 / slot 重复 / 无可用 BID 时拒绝，绝不串改；
//   4. 文件里的值已被改成别的 → 拒绝 apply（不做部分写入）；
//   5. 写回保留 CRLF 且只改该改的那几行。
//
// 临时目录：测试全部在 %TEMP% 下自建 data 目录（通过 TOURNAMENTS_DIR 覆盖），
// 不碰真实比赛数据。临时目录不删除（本环境的批量删除守卫会拦，且 %TEMP% 是系统托管区）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DIR = mkdtempSync(path.join(tmpdir(), 'mania-conflicts-'))
process.env.TOURNAMENTS_DIR = DIR
const {
  buildPlan,
  changedLineCount,
  collectConflicts,
  main,
  serializePreservingEol,
} = await import('./detect-type-conflicts.mjs')

// ---------- 造数据的小工具 ----------

function map(slot, realType, extra = {}) {
  return { slot, type: extra.type || 'RC', realType, name: extra.name, difficulty: 0, ...extra }
}

function doc({ id, rounds }) {
  return { id, name: id, abbreviation: id, year: 2026, keyCount: 4, tags: [], rounds }
}

function round(id, maps, extra = {}) {
  return { id, name: id, abbreviation: id, order: 1, maps, difficulty: { min: 0, max: 0, average: 0 }, ...extra }
}

// 同一个 setId 下三首歌（≥3 → setId 视为不可靠），用来验证占位/粘滞保护。
const stickySongs = (setId) => [
  { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('S1', 'JS', { beatmapId: 101, beatmapsetId: setId, name: 'Song A [x]' })])] }) },
  { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('S1', 'CJ', { beatmapId: 102, beatmapsetId: setId, name: 'Song B [x]' })])] }) },
  { file: 'c.json', data: doc({ id: 'c', rounds: [round('r1', [map('S1', 'JS', { beatmapId: 103, beatmapsetId: setId, name: 'Song C [x]' })])] }) },
]

// ---------- 1. 分类 ----------

test('同一 beatmapId 被标了不同 realType → kind=bid（可统一）', () => {
  const conflicts = collectConflicts([
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 500, name: 'X [A]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'CJ', { beatmapId: 500, name: 'X [A]' })])] }) },
  ])
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].kind, 'bid')
  assert.equal(conflicts[0].key, 'b:500')
  assert.deepEqual(conflicts[0].realTypes.sort(), ['CJ', 'JS'])
})

test('同 set 不同 BID、倍速相同 → setReview（只供人工核对，不可自动改）', () => {
  const conflicts = collectConflicts([
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'TC', { beatmapId: 700, beatmapsetId: 900, name: 'X [A]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'DP', { beatmapId: 701, beatmapsetId: 900, name: 'X [B]' })])] }) },
  ])
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].kind, 'setReview', '同 set 不同难度本来就可以不同键型，不能报成必修冲突')
})

test('同 set 不同 BID、倍速不同 → rateSet（可统一）', () => {
  const conflicts = collectConflicts([
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'TC', { beatmapId: 710, beatmapsetId: 910, name: 'X [Insane 1.10x]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'DP', { beatmapId: 711, beatmapsetId: 910, name: 'X [Insane 1.05x]' })])] }) },
  ])
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].kind, 'rateSet')
})

test('同一个 setId 下 ≥3 首不同的歌 → 整个 setId 不可靠，不报冲突', () => {
  assert.deepEqual(collectConflicts(stickySongs(1)), [], '占位 setId=1 不能把无关谱面粘成一组')
  assert.deepEqual(collectConflicts(stickySongs(999999)), [], '真实 setId 但三首不同歌 → setId 判定为不可靠')
})

test('占位 ID（beatmapId/setId ≤ 1）不参与分组', () => {
  const conflicts = collectConflicts([
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('S1', 'JS', { beatmapId: 1, beatmapsetId: 1, name: 'X [A]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('S1', 'CJ', { beatmapId: 1, beatmapsetId: 1, name: 'Y [B]' })])] }) },
  ])
  assert.deepEqual(conflicts, [])
})

test('realType 一致时不产生任何组', () => {
  const conflicts = collectConflicts([
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 800, beatmapsetId: 801, name: 'X [A]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'JS', { beatmapId: 802, beatmapsetId: 801, name: 'X [B]' })])] }) },
  ])
  assert.deepEqual(conflicts, [])
})

// ---------- 2. buildPlan 的安全拒绝 ----------

const bidConflict = () => collectConflicts([
  { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 500, name: 'X [A]' })])] }) },
  { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'CJ', { beatmapId: 500, name: 'X [A]' })])] }) },
])[0]

test('buildPlan：setReview 一律拒绝（不自动改）', () => {
  const conflict = collectConflicts([
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'TC', { beatmapId: 700, beatmapsetId: 900, name: 'X [A]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'DP', { beatmapId: 701, beatmapsetId: 900, name: 'X [B]' })])] }) },
  ])[0]
  const plan = buildPlan(conflict, 'TC', new Map())
  assert.deepEqual(plan.edits, [])
  assert.ok(plan.problems.length > 0)
})

test('buildPlan：--to 不在该组取值里 → 拒绝', () => {
  const plan = buildPlan(bidConflict(), 'SS', new Map())
  assert.deepEqual(plan.edits, [])
  assert.match(plan.problems.join(), /不在这组的取值里/)
})

test('buildPlan：文件里的值已被改成别的 → 拒绝（不做部分写入）', () => {
  const conflict = bidConflict()
  const docs = new Map([
    ['a.json', doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 500, name: 'X [A]' })])] })],
    // b.json 里已经是 MX，与报告记的 CJ 不一致
    ['b.json', doc({ id: 'b', rounds: [round('r1', [map('RC2', 'MX', { beatmapId: 500, name: 'X [A]' })])] })],
  ])
  const plan = buildPlan(conflict, 'JS', docs)
  assert.ok(plan.problems.some((p) => /不一致/.test(p)), plan.problems.join())
})

test('buildPlan：组里某条没有可用 beatmapId 且同轮 slot 重复 → 拒绝自动修', () => {
  // 这组只能靠 setId 成组（rateSet），其中 c.json 那条没有 beatmapId，
  // 且它的轮里还有一张同 slot 的图 —— 按 slot 猜就会改错。
  const docsArr = [
    { file: 'a.json', data: doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 630, beatmapsetId: 950, name: 'X [Insane 1.10x]' })])] }) },
    { file: 'b.json', data: doc({ id: 'b', rounds: [round('r1', [map('RC2', 'CJ', { beatmapId: 631, beatmapsetId: 950, name: 'X [Insane 1.05x]' })])] }) },
    {
      file: 'c.json',
      data: doc({
        id: 'c',
        rounds: [
          round('r1', [
            map('RC1', 'DP', { beatmapsetId: 950, name: 'X [Insane 1.05x]' }),
            map('RC1', 'MX', { beatmapsetId: 950, name: 'X [Insane 1.05x]' }),
          ]),
        ],
      }),
    },
  ]
  const conflict = collectConflicts(docsArr).find((c) => c.kind === 'rateSet')
  assert.ok(conflict, '这组应该是 rateSet（可统一的那种）')
  const plan = buildPlan(conflict, 'JS', new Map(docsArr.map((d) => [d.file, d.data])))
  assert.ok(plan.problems.some((p) => /身份不可靠/.test(p)), plan.problems.join())
})

test('buildPlan：报告之后轮次 id 重复且下标对不上 → 拒绝定位（不串改）', () => {
  const conflict = bidConflict()
  const docs = new Map([
    ['a.json', doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 500, name: 'X [A]' })])] })],
    [
      'b.json',
      doc({
        id: 'b',
        rounds: [
          round('other', []),
          round('r1', [map('RC2', 'CJ', { beatmapId: 500, name: 'X [A]' })]),
          round('r1', [map('RC3', 'CJ', { beatmapId: 501, name: 'Y [B]' })]),
        ],
      }),
    ],
  ])
  const plan = buildPlan(conflict, 'JS', docs)
  assert.deepEqual(plan.edits, [])
  assert.ok(plan.problems.some((p) => /定位不到轮次/.test(p)), plan.problems.join())
})

test('buildPlan：正常一组产出精确修改，且按轮次下标落到正确的轮', () => {
  const conflict = bidConflict()
  const docs = new Map([
    ['a.json', doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 500, name: 'X [A]' })])] })],
    ['b.json', doc({ id: 'b', rounds: [round('r1', [map('RC2', 'CJ', { beatmapId: 500, name: 'X [A]' })])] })],
  ])
  const plan = buildPlan(conflict, 'CJ', docs)
  assert.deepEqual(plan.problems, [])
  assert.equal(plan.edits.length, 1, '只有 a.json 需要从 JS 改成 CJ')
  assert.deepEqual(
    { file: plan.edits[0].file, rid: plan.edits[0].rid, slot: plan.edits[0].slot, from: plan.edits[0].from, to: plan.edits[0].to },
    { file: 'a.json', rid: 'r1', slot: 'RC1', from: 'JS', to: 'CJ' },
  )
})

test('buildPlan：轮次 id 重复时按下标收敛（两个 r1 各改自己那一张）', () => {
  const aDoc = doc({ id: 'a', rounds: [round('r1', [map('RC1', 'JS', { beatmapId: 500, name: 'X [A]' })])] })
  const bDoc = doc({
    id: 'b',
    rounds: [
      round('r1', [map('RC1', 'CJ', { beatmapId: 500, name: 'X [A]' })]),
      round('r1', [map('RC9', 'CJ', { beatmapId: 500, name: 'X [A]' })]),
    ],
  })
  const conflict = collectConflicts([
    { file: 'a.json', data: aDoc },
    { file: 'b.json', data: bDoc },
  ])[0]
  const plan = buildPlan(conflict, 'JS', new Map([['a.json', aDoc], ['b.json', bDoc]]))
  assert.deepEqual(plan.problems, [])
  assert.deepEqual(
    plan.edits.filter((e) => e.file === 'b.json').map((e) => `${e.roundIndex}:${e.slot}`).sort(),
    ['0:RC1', '1:RC9'],
    '轮次 id 重复时必须按轮次下标各改自己那一张（不能退回"只按 id 找"而拒绝，也不能只认第一个）',
  )
})

// ---------- 3. 换行保真 ----------

test('serializePreservingEol：CRLF 原文件写回仍是 CRLF，且只动一行', () => {
  const original = '{\r\n  "realType": "JS"\r\n}\r\n'
  const parsed = JSON.parse(original)
  const next = serializePreservingEol({ ...parsed, realType: 'CJ' }, original)
  assert.ok(next.includes('\r\n'), '必须保留 CRLF')
  assert.ok(!/[^\r]\n/.test(next), '不能混进裸 LF')
  assert.equal(changedLineCount(original, next), 1)
})

// ---------- 4. CLI 端到端（临时目录） ----------

function writeTournaments(files) {
  writeFileSync(path.join(DIR, 'keep.txt'), 'sentinel')
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(DIR, name), text, 'utf-8')
}

function snapshot() {
  const out = {}
  for (const f of readdirSync(DIR)) {
    const st = statSync(path.join(DIR, f))
    out[f] = { size: st.size, mtimeMs: st.mtimeMs, content: readFileSync(path.join(DIR, f), 'utf-8') }
  }
  return out
}

function quiet(fn) {
  const log = console.log
  const err = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    return fn()
  } finally {
    console.log = log
    console.error = err
  }
}

const crlfDoc = (id, realType, beatmapId) =>
  JSON.stringify(
    doc({ id, rounds: [round('r1', [map('RC1', realType, { beatmapId, name: 'X [A]' })])] }),
    null,
    2,
  ).replace(/\n/g, '\r\n') + '\r\n'

const FIXTURE = { 'a.json': crlfDoc('a', 'JS', 500), 'b.json': crlfDoc('b', 'CJ', 500) }

test('CLI：默认只读，不写任何文件', () => {
  writeTournaments(FIXTURE)
  const before = snapshot()
  const code = quiet(() => main([]))
  assert.equal(code, 0)
  assert.deepEqual(snapshot(), before, '默认运行不允许写盘')
})

test('CLI：--apply 缺 --bid/--set 或 --to、未知参数 → 参数错误，且不写盘', () => {
  writeTournaments(FIXTURE)
  const before = snapshot()
  assert.equal(quiet(() => main(['--apply'])), 2)
  assert.equal(quiet(() => main(['--apply', '--bid=500'])), 2)
  assert.equal(quiet(() => main(['--bogus'])), 2)
  assert.deepEqual(snapshot(), before)
})

test('CLI：指向不存在的组 → 拒绝，且不写盘', () => {
  writeTournaments(FIXTURE)
  const before = snapshot()
  assert.equal(quiet(() => main(['--apply', '--bid=424242', '--to=JS'])), 1)
  assert.deepEqual(snapshot(), before)
})

test('CLI：--apply 只改目标那一行，保留 CRLF，其它文件不动', () => {
  writeTournaments(FIXTURE)
  const before = snapshot()
  const code = quiet(() => main(['--apply', '--bid=500', '--to=CJ']))
  assert.equal(code, 0)
  const a = readFileSync(path.join(DIR, 'a.json'), 'utf-8')
  assert.ok(a.includes('"realType": "CJ"'), 'a.json 应已统一成 CJ')
  assert.ok(a.includes('\r\n') && !/[^\r]\n/.test(a), 'a.json 仍是 CRLF')
  assert.equal(changedLineCount(before['a.json'].content, a), 1, '只该动一行')
  assert.equal(readFileSync(path.join(DIR, 'b.json'), 'utf-8'), before['b.json'].content, 'b.json 不该被动')
  assert.equal(readFileSync(path.join(DIR, 'keep.txt'), 'utf-8'), 'sentinel', '非 JSON 文件不该被动')
})

test('CLI：setReview 组用 --set 也拒绝写回', () => {
  writeTournaments({
    'a.json': JSON.stringify(
      doc({ id: 'a', rounds: [round('r1', [map('RC1', 'TC', { beatmapId: 700, beatmapsetId: 900, name: 'X [A]' })])] }),
      null,
      2,
    ).replace(/\n/g, '\r\n') + '\r\n',
    'b.json': JSON.stringify(
      doc({ id: 'b', rounds: [round('r1', [map('RC2', 'DP', { beatmapId: 701, beatmapsetId: 900, name: 'X [B]' })])] }),
      null,
      2,
    ).replace(/\n/g, '\r\n') + '\r\n',
  })
  const before = snapshot()
  assert.equal(quiet(() => main(['--apply', '--set=900', '--to=TC'])), 1)
  assert.deepEqual(snapshot(), before)
})

test('CLI：同一 slot 出现在不同轮次时只改目标那一轮（不串改）', () => {
  // a.json:r1 与 b.json:r2 共用 beatmapId 660 → 真正的冲突在 b.json 的 r2；
  // b.json 的 r1 里有一张**同 slot** 的 MX —— 旧版按 slot 跨轮匹配会把它一起改掉。
  const docText = (id, rounds) =>
    JSON.stringify(
      doc({
        id,
        rounds: rounds.map(([rid, slot, realType, beatmapId]) =>
          round(rid, [
            map(slot, realType, {
              name: 'X [A]',
              ...(beatmapId ? { beatmapId } : {}),
            }),
          ]),
        ),
      }),
      null,
      2,
    ).replace(/\n/g, '\r\n') + '\r\n'

  writeTournaments({
    'a.json': docText('a', [['r1', 'RC1', 'JS', 660]]),
    'b.json': docText('b', [
      ['r1', 'RC1', 'MX', null],
      ['r2', 'RC1', 'CJ', 660],
    ]),
  })
  const before = snapshot()
  assert.equal(quiet(() => main(['--apply', '--bid=660', '--to=CJ'])), 0)
  const a = readFileSync(path.join(DIR, 'a.json'), 'utf-8')
  assert.ok(a.includes('"realType": "CJ"'), 'a.json 应该被统一成 CJ')
  assert.equal(changedLineCount(before['a.json'].content, a), 1)
  assert.equal(
    readFileSync(path.join(DIR, 'b.json'), 'utf-8'),
    before['b.json'].content,
    'b.json 的 r1（同 slot、别的轮次）必须原封不动',
  )
})
