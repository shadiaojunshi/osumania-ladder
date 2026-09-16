import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  REAL_TYPES,
  PENDING_REAL_TYPE_BY_CATEGORY,
  defaultRealTypeFor,
  realTypeOptionsFor,
} from '../src/lib/realTypeCatalog.ts'
import { isPendingRealType } from '../src/lib/realType.ts'
import { PENDING_REAL_TYPES, NON_SV_PENDING_REAL_TYPES } from '../src/lib/tournamentDiagnostics.ts'

// 2026-09-15 站长要求(三件事一起):
//   ① 特殊谱面默认键型不再是 SS,新增 PDEX(Pending Special),且**不进合包**;
//   ② 新建谱面 / 改大类 / 批量导入的默认键型一律是 Pending,而不是"列表第一个";
//   ③ 只有手动点蓝色模板按钮才会写入具体键型。
// 这个文件把"默认值必须是 Pending"这条规则锁住 —— 它以前是误标数据(SS/HB1/RE)的源头。

process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_ACCESS_KEY = 'test-key'
process.env.R2_SECRET_KEY = 'test-secret'
const require = createRequire(import.meta.url)

const CATEGORIES = ['RC', 'LN', 'HB', 'SV', 'TB', 'SPECIAL']

test('每个大类都有自己的 Pending 键型,且该键型确实在该大类的列表里', () => {
  for (const category of CATEGORIES) {
    if (category === 'TB') continue // TB 只有一种键型,没有"待分类"
    const pending = PENDING_REAL_TYPE_BY_CATEGORY[category]
    assert.ok(pending, `${category} 缺少 Pending 键型`)
    assert.match(pending, /^PD/, `${category} 的 Pending 键型应以 PD 开头`)
    assert.ok(
      REAL_TYPES[category].some((type) => type.id === pending),
      `${category} 的 Pending 键型 ${pending} 不在 REAL_TYPES.${category} 里`,
    )
  }
  assert.equal(PENDING_REAL_TYPE_BY_CATEGORY.SPECIAL, 'PDEX')
})

test('默认键型 = 该大类的 Pending(而不是列表第一个 SS/HB1/RE/SV1)', () => {
  assert.equal(defaultRealTypeFor('RC'), 'PDRC')
  assert.equal(defaultRealTypeFor('LN'), 'PDLN')
  assert.equal(defaultRealTypeFor('HB'), 'PDHB')
  assert.equal(defaultRealTypeFor('SV'), 'PDSV')
  assert.equal(defaultRealTypeFor('SPECIAL'), 'PDEX')
  // 没有 Pending 的大类退回列表第一个;两边都没有时保留原值(不写空串)。
  assert.equal(defaultRealTypeFor('TB'), 'TB')
  assert.equal(defaultRealTypeFor('RC', 'KEEP'), 'PDRC')
  // 关键回归:默认值绝不能是"列表第一个具体键型"。
  for (const category of ['RC', 'LN', 'HB', 'SV']) {
    assert.notEqual(defaultRealTypeFor(category), REAL_TYPES[category][0].id)
  }
})

test('特殊槽位的下拉含 PDEX,普通大类不含 PDEX', () => {
  const special = realTypeOptionsFor('SPECIAL')
  assert.ok(special.some((type) => type.id === 'PDEX'), '特殊下拉应有 PDEX')
  // 特殊槽位跨大类:仍能选到各具体键型(如 HB1 / SVMX)。
  assert.ok(special.some((type) => type.id === 'HB1'))
  assert.ok(special.some((type) => type.id === 'SVMX'))
  // 每个选项带 group,便于分组显示。
  assert.ok(special.every((type) => typeof type.group === 'string'))

  for (const category of ['RC', 'LN', 'HB', 'SV', 'TB']) {
    const options = realTypeOptionsFor(category)
    assert.ok(options.length > 0)
    assert.equal(options.some((type) => type.id === 'PDEX'), false, `${category} 不应出现 PDEX`)
    assert.ok(options.every((type) => REAL_TYPES[category].some((own) => own.id === type.id)))
  }
})

test('PDEX 被认作 Pending,并且不进合包(PDSV 仍可下载)', () => {
  assert.equal(isPendingRealType('PDEX'), true)
  assert.equal(isPendingRealType('SS'), false)
  assert.ok(PENDING_REAL_TYPES.has('PDEX'))
  assert.ok(NON_SV_PENDING_REAL_TYPES.has('PDEX'))

  const { PACK_EXCLUDED_REAL_TYPES, REAL_TYPE_NAMES } = require('./generate-pack.js')
  assert.ok(PACK_EXCLUDED_REAL_TYPES.has('PDEX'), 'PDEX 不能在合包白名单外被漏掉')
  assert.equal(PACK_EXCLUDED_REAL_TYPES.has('PDSV'), false, 'PDSV 仍要进下载栏')
  assert.equal(typeof REAL_TYPE_NAMES.PDEX, 'string')
})

// 上线时的一次性核对(2026-09-15 执行:扫全库 4625 张图、无一张用 PDEX)已经做完。
// 这里**故意不再断言"没有图用 PDEX"** —— 特殊槽位新建/改大类后的默认值就是 PDEX,
// 站长一用这个功能那条断言就会红,而那是正常用法。留下的是真正该长期守的两条:
// realType 永远是非空字符串(不能悄悄变 undefined),以及 PD* 一律被认作 Pending。
test('全库数据:realType 都是非空字符串,且每个 PD* 都被认作 Pending', () => {
  const dir = path.join(process.cwd(), 'data', 'tournaments')
  const counts = new Map()
  const bad = []
  let total = 0
  for (const file of fs.readdirSync(dir)) {
    const tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        total++
        counts.set(map.realType, (counts.get(map.realType) || 0) + 1)
        if (typeof map.realType !== 'string' || map.realType === '') {
          bad.push(`${file} ${round.id} ${map.slot} = ${JSON.stringify(map.realType)}`)
          continue
        }
        // 数据里一旦出现 PD*(含 PDEX),它必须被识别为 Pending ——
        // 否则"待分类"的图会被当成已分类,合包/统计都会按具体键型处理。
        if (map.realType.startsWith('PD') && !isPendingRealType(map.realType)) {
          bad.push(`${file} ${round.id} ${map.slot} 的 ${map.realType} 没被认作 Pending`)
        }
      }
    }
  }
  assert.ok(total > 4000, `应扫到全部谱面(实际 ${total})`)
  assert.deepEqual(bad, [], 'realType 必须是非空字符串,且 PD* 都要被认作 Pending')
  // 顺带留个底:历史默认键型仍大量存在 —— 这批就是"可能被误标"的候选池,
  // 由 scripts/find-suspect-realtypes.mjs 出报告,不在这里断言具体数量。
  assert.ok(counts.get('SS') > 0)
})
