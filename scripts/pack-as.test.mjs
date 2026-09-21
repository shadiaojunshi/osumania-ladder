import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import test from 'node:test'

// 「临时归类到别的键型包」（`map.packAs`）的两份实现锁。
//
// 站长 2026-09-21 的要求：冷门键型张数太少，各自成包没人下载，于是**暂时**把那些谱面
// 塞进大包凑数，但**不改真实键型**。字段落在比赛 JSON 的 `map.packAs`，只在合包时生效。
//
// 为什么这个测试必须存在：判读逻辑有两份实现，跨不了边界 ——
//   `src/lib/packAs.ts`（TS，界面/行生成用）  ↔  `scripts/pack-as.js`（CJS，合包脚本用）
// 合包脚本是 Node 直跑、不经过 Next 打包，import 不了 TS。仓库既有先例（`pack-mirrors.test.mjs`
// 锁镜像键、`admin-data-quality.test.mjs` 锁 `formatSources`）都是这个套路：**拿两份实现
// 对同一批输入逐项比对**。漂开的后果是界面说"归到 SS 包了"、实际合包却按 realType 走。
//
// 另一条同样重要的锁：`NON_PACK_REAL_TYPES`（这里）必须与 `generate-pack.js` 的
// `PACK_EXCLUDED_REAL_TYPES` 一致。判的是同一件事（哪些键型不产出下载包），
// 但一个在 TS、一个在 CJS —— 不一致就会出现"下拉里能选、选了却哪个包都不进"的静默黑洞。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))
const require = createRequire(import.meta.url)

const cjs = require('./pack-as.js')
const ts = await import('../src/lib/packAs.ts')
const { REAL_TYPES } = await import('../src/lib/realTypeCatalog.ts')

const generatePackSrc = readFileSync(new URL('./generate-pack.js', import.meta.url), 'utf-8')

/** 目录里全部键型 id（跨大类去重）。 */
function catalogIds() {
  const ids = []
  for (const list of Object.values(REAL_TYPES)) {
    for (const option of list) ids.push(option.id)
  }
  return ids
}

test('镜像锁：两份实现逐函数同结果（空值 / 空白 / 别名 / 正常值）', () => {
  const cases = [
    {},
    { realType: 'SS' },
    { realType: 'SS', packAs: '' },
    { realType: 'SS', packAs: '   ' },
    { realType: 'SS', packAs: 'CJ' },
    { realType: 'SS', packAs: 'SS' },
    { realType: 'WC', packAs: 'SS' },
    { realType: 'SS', packAs: null },
    { realType: 'SS', packAs: 0 },
    { realType: undefined, packAs: undefined },
  ]
  for (const map of cases) {
    const label = JSON.stringify(map)
    assert.equal(cjs.isValidPackAs(map.packAs), ts.isValidPackAs(map.packAs), `isValidPackAs ${label}`)
    assert.equal(cjs.packRealTypeFor(map), ts.packRealTypeFor(map), `packRealTypeFor ${label}`)
    assert.equal(cjs.isPackAsOverridden(map), ts.isPackAsOverridden(map), `isPackAsOverridden ${label}`)
  }
  // 分组也要一致：CJS 侧没有镜像函数（合包是按 targetType 过滤的，不需要分组），
  // 所以这里只钉住 TS 侧的分组语义 —— 键是 packAs 优先，且顺序按输入顺序。
  const list = [{ realType: 'SS', packAs: 'CJ' }, { realType: 'SS' }, { realType: 'CJ', packAs: 'CJ' }]
  const grouped = ts.groupByPackRealType(list)
  assert.deepEqual([...grouped.keys()], ['CJ', 'SS'])
  assert.equal(grouped.get('CJ').length, 2)
})

test('镜像锁：50 个键型的展示名逐字一致（前缀 `[Inverse]` 用的就是它）', () => {
  const ids = catalogIds()
  assert.equal(ids.length, 50, '目录里的键型数变了 —— 展示名表要跟着加/删')
  for (const id of ids) {
    assert.equal(
      cjs.realTypeDisplayName(id), ts.realTypeDisplayName(id),
      `${id} 的两份展示名不一致（改了 realTypeCatalog 的 name 就要同步 scripts/pack-as.js）`,
    )
  }
  // 目录里没有的（自定义 customTypes，如 HB&SV）原样返回 id —— 有名字总比空着强
  assert.equal(ts.realTypeDisplayName('HB&SV'), 'HB&SV')
  assert.equal(cjs.realTypeDisplayName('HB&SV'), 'HB&SV')
  // 去掉了末尾的 ` (id)`：站长要的格式是 `[Inverse]`，不是 `[Inverse (IN)]`
  assert.equal(ts.realTypeDisplayName('IN'), 'Inverse')
  assert.equal(ts.realTypeDisplayName('SS'), 'Stream')
})

test('镜像锁：展示名与 generate-pack 的 REAL_TYPE_NAMES 是**两份不同的表**（不能混用）', () => {
  // 这是实测踩过的坑：把包显示名（含 `Hybrid`/`SV` 后缀、`Single/Minijack Stream/Consistency`）
  // 当前缀用会得到 `[Stream SV]` 这种界面里根本看不到的名字。前缀取**界面目录名**。
  const block = generatePackSrc.slice(
    generatePackSrc.indexOf('const REAL_TYPE_NAMES'),
    generatePackSrc.indexOf('const PACK_EXCLUDED_REAL_TYPES'),
  )
  const differ = ['SS', 'WTC', 'SV1', 'HB1', 'MNTB'].filter((id) => {
    const m = block.match(new RegExp(`\\b${id}:\\s*'([^']+)'`))
    return m && m[1] !== cjs.realTypeDisplayName(id)
  })
  assert.ok(differ.length >= 3, `两份表应该有明显差异，实际只差 ${differ.length} 处：${differ.join(', ')}`)
})

test('退出名单锁：NON_PACK_REAL_TYPES 必须与 generate-pack 的 PACK_EXCLUDED_REAL_TYPES 一致', () => {
  const m = generatePackSrc.match(/const PACK_EXCLUDED_REAL_TYPES = new Set\(\[([^\]]*)\]\)/)
  assert.ok(m, '没找到 PACK_EXCLUDED_REAL_TYPES —— generate-pack.js 的写法变了，这个锁要跟着改')
  const fromScript = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort()
  const fromTs = [...ts.NON_PACK_REAL_TYPES].sort()
  assert.deepEqual(fromTs, fromScript, '两边判的必须是同一件事，否则下拉里能选、选了哪个包都不进')
  // PDSV 是刻意的例外：未分类的 SV 图仍要有可用的兜底包，所以它是目标而不是被排除的
  assert.ok(!fromTs.includes('PDSV'), 'PDSV 不能被排除 —— 未分类 SV 图需要兜底包')
})

test('下拉目标 = 目录里所有会产出下载包的键型（排除 Pending 分类队列）', () => {
  const ids = catalogIds()
  const excluded = new Set(ts.NON_PACK_REAL_TYPES)
  const groups = ts.packAsTargetGroups()
  const flat = groups.flatMap((g) => g.options.map((o) => o.id))
  assert.equal(flat.length, ids.filter((id) => !excluded.has(id)).length)
  for (const id of excluded) assert.ok(!flat.includes(id), `${id} 不该出现在可归类的目标里`)
  assert.ok(flat.includes('PDSV'))
  assert.ok(flat.includes('TB'))
  // 分组里的每个 option 都带名字（下拉要显示它）
  for (const g of groups) for (const o of g.options) assert.ok(o.name && o.name.length > 0, `${o.id} 没有名字`)
})

test('`[真实键型]` 前缀的落点：方括号在来源圆括号**外面、紧贴**（站长给的格式）', () => {
  // 站长原文：`[inverse](PFC S3 .......)......` —— 括号外面，中间没有空格。
  // 这条曾经写错过：前缀一度被塞进 formatSources 的输出里，得到 `([Inverse] PFC S3 ST4)`，
  // 与要求的位置不符。前缀现在由 `packAsPrefixFor` 拼在 Version 模板的圆括号**之前**。
  const { packAsPrefixFor } = require('./generate-pack.js')
  const { formatSources } = require('./source-label.js')
  const sources = [{ tournamentAbbr: 'PFC', roundAbbr: 'S3', slot: 'ST4' }]

  // `formatSources` 只管括号里的内容，本身不认识前缀（老调用方行为一个字不变）
  assert.equal(formatSources(sources, false), 'PFC S3 ST4')
  // 端到端的 Version 串，逐字复刻站长的例子
  const version = `${packAsPrefixFor(true, 'IN')}(${formatSources(sources, false)}) Milk - A [Mapper] (Insane)`
  assert.equal(version, '[Inverse](PFC S3 ST4) Milk - A [Mapper] (Insane)')
  // 没被临时归类 → 一个字符都不多
  assert.equal(packAsPrefixFor(false, 'IN'), '')
  assert.equal(`${packAsPrefixFor(false, 'IN')}(${formatSources(sources, false)})`, '(PFC S3 ST4)')
  // 取界面目录名（`Speed/Generic`），不是 REAL_TYPE_NAMES 的 `Speed/Generic Hybrid`
  assert.equal(packAsPrefixFor(true, 'HB1'), '[Speed/Generic]')
  assert.equal(packAsPrefixFor(true, 'SS'), '[Stream]')
  // 名字取不到 → 宁可不加，也不要把 `[]` 发布出去（文件名内容寻址，改名会断成绩）
  assert.equal(packAsPrefixFor(true, ''), '')
  assert.equal(packAsPrefixFor(true, undefined), '')
})

test('合包筛选：进哪个包看 packAs 优先，realType 仍原样带进打包项', () => {
  // 直接测判读链，而不是读源码 —— generatePack 需要 R2 凭据跑不起来。
  const map = { realType: 'IN', packAs: 'SS' }
  assert.equal(cjs.packRealTypeFor(map), 'SS')
  assert.equal(cjs.isPackAsOverridden(map), true)
  // 别名在 packAs 里也认（`WC` 不是真实类型，不过一遍 normalizeRealType 哪个包都进不去）
  const legacy = { realType: 'SS', packAs: 'WC' }
  assert.equal(cjs.isPackAsOverridden(legacy), true)
  // 哨兵：语法上必须过 normalizeRealType —— 这条靠源码锁，因为函数是文件内私有的
  assert.ok(
    /normalizeRealType\(packRealTypeFor\(map\)\)/.test(generatePackSrc),
    '合包筛选必须对 packAs 也过一遍 normalizeRealType（历史别名 WC→LNWC）',
  )
})

test('`[真实键型]` 前缀的判据是"任一来源被临时归类"，取簇代表值的 realType', () => {
  // 簇里只要有一处承认借来，就该告诉玩家 —— 不会因为另一处恰好是本键型就变回去。
  // 这条读源码锁：generate-pack 的 prefetchOne 需要 R2 才能跑。
  assert.ok(
    /const borrowed = map\.sources\.some\(\(s\) => s && s\.packAsOverridden\)/.test(generatePackSrc),
    '前缀判据必须是"任一来源"（some），不是全部',
  )
  assert.ok(
    /\$\{packAsPrefixFor\(borrowed, map\.realType\)\}\(\$\{sourcesLabel\}\)/.test(generatePackSrc),
    '前缀必须拼在来源圆括号**外面**（`[Inverse](PFC S3 ST4)`，不是 `([Inverse] PFC S3 ST4)`）',
  )
  // packAsOverridden 必须一路从 mapsToProcess 带到 sources 上 —— 断了前缀就永远不加
  assert.ok(
    /packAsOverridden: m\.packAsOverridden === true/.test(generatePackSrc),
    'sources 上必须带上 packAsOverridden，否则包内标签永远不加前缀',
  )
  assert.ok(
    /packAsOverridden: isPackAsOverridden\(map\)/.test(generatePackSrc),
    'mapsToProcess 里必须算 packAsOverridden',
  )
})

test('真实数据：填了的 packAs 一律是**有效的合包目标**（写错就等于把图丢进黑洞）', () => {
  // ⚠️ 这条**刻意不断言"现在没人填"**。这个字段就是给站长用的，断言"空"会在第一次
  // 正常使用后变红 —— 那是随数据演进的快照值，拦不住任何 bug。
  // 真正的不变量是：填了的值必须能真的进包。写成 `PDRC`（Pending 队列）或拼错
  // （`packAs: "SS "`、`packAs: "PFC"`）会让这张图**哪个包都不进**，而且没有任何报错 ——
  // 数据里看不出来、界面上也不显眼，只有这张图悄悄消失。
  const path = require('node:path')
  const { readdirSync } = require('node:fs')
  const { fileURLToPath } = require('node:url')
  const root = fileURLToPath(new URL('../data/tournaments/', import.meta.url))
  const valid = new Set(ts.packAsTargetGroups().flatMap((g) => g.options.map((o) => o.id)))
  let total = 0
  const filled = []
  const bad = []
  for (const file of readdirSync(root).filter((f) => f.endsWith('.json'))) {
    const tournament = JSON.parse(readFileSync(path.join(root, file), 'utf-8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        total++
        if (!ts.isValidPackAs(map.packAs)) continue
        filled.push(`${tournament.id}/${round.id}/${map.slot}=${map.packAs}`)
        if (!valid.has(map.packAs)) bad.push(`${tournament.id}/${round.id}/${map.slot}=${map.packAs}`)
      }
    }
  }
  assert.ok(total > 1000, `只读到 ${total} 张谱面 —— 数据路径不对`)
  assert.deepEqual(bad, [], `这些 packAs 不是可归类的目标（会哪个包都不进）：${bad.join(', ')}`)
})
