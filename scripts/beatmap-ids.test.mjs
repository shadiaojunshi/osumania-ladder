import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// R33：占位 beatmapId / beatmapsetId 的判读（2026-09-18 站长反馈）。
//
// MKTC 2025 的 36 张谱面来自 Malody `.mcz` → `.osz` 的转换，转换器写了
// `BeatmapSetID:1`；上传解析当时只滤 `> 0`，于是 **36 首不同的歌共用 setId = 1**：
//   · 键型冲突工具把它们粘成一组「同 set 待核对」，真实冲突被淹掉；
//   · 上传页"下载"按钮按 setId 下载 → 会去下 beatmapset 1（完全无关的图）；
//   · 误标检测的"同 set 共识"被污染。
// 这个文件锁住：口径（0/1/负数不可用）、"同一 setId 挂多首歌就不可靠"的判定、
// 以及"全库当前没有占位 ID"这条数据不变量。

import {
  PLACEHOLDER_ID_MAX,
  SET_ID_UNRELIABLE_SONG_COUNT,
  isUsableBeatmapId,
  songKeyOf,
  usableBeatmapId,
  usableBeatmapsetId,
} from '../src/lib/beatmapIds.ts'
import { classifySetConflict, extractRate } from '../src/lib/mapConflictDetection.ts'

const require = createRequire(import.meta.url)

test('R33 占位阈值：0 / 1 / 负数 / 非整数 / 非数字都不可用', () => {
  assert.equal(PLACEHOLDER_ID_MAX, 1)
  for (const bad of [0, 1, -1, -2387506, 1.5, NaN, Infinity, '2387506', null, undefined, {}]) {
    assert.equal(isUsableBeatmapId(bad), false, `${String(bad)} 不该被当成可用 ID`)
  }
  for (const good of [2, 100, 5165500, 2387506]) {
    assert.equal(isUsableBeatmapId(good), true, `${good} 应是可用 ID`)
  }
  assert.equal(usableBeatmapId(1), null)
  assert.equal(usableBeatmapsetId(1), null)
  assert.equal(usableBeatmapId(5165500), 5165500)
})

test('R33 songKeyOf：从 "Artist - Title [Version]" 取 "artist - title"', () => {
  assert.equal(songKeyOf('Toromaru - Curiosity [Stage 7: Lv.31]'), 'toromaru - curiosity')
  assert.equal(songKeyOf('Various - Song'), 'various - song')
  assert.equal(songKeyOf('  空 白   '), '空 白')
  assert.equal(songKeyOf(' [only version]'), null)
  assert.equal(songKeyOf(''), null)
  assert.equal(songKeyOf(undefined), null)
})

test('R33 同一个 setId 下 ≥3 首不同的歌 → 不再当作"同 set 键型分歧"', () => {
  // MKTC 那组的形状：同一个 setId、36 首不同的歌、不同的 bid、多种 realType。
  const bogus = Array.from({ length: 36 }, (_, i) => ({
    beatmapId: 5000000 + i,
    beatmapsetId: 1,
    realType: ['HB2', 'TC', 'SS', 'JS', 'LNTC'][i % 5],
    name: `Artist ${i} - Song ${i} [RC${i} Lv.3${i % 10}]`,
  }))
  assert.equal(classifySetConflict(bogus), null, '占位 setId 粘出来的组必须被忽略')
})

test('R33 真的是同一首歌的多难度仍然照常判定（不能把正常功能一起关掉）', () => {
  const sameSong = [
    { beatmapId: 1001, beatmapsetId: 2387506, realType: 'RC', name: 'Camellia - Ghost [NM]' },
    { beatmapId: 1002, beatmapsetId: 2387506, realType: 'HB', name: 'Camellia - Ghost [HD]' },
    { beatmapId: 1003, beatmapsetId: 2387506, realType: 'LN', name: 'Camellia - Ghost [MX]' },
  ]
  assert.equal(classifySetConflict(sameSong), 'setReview')

  // 名字写法略有出入（补 (Cut Ver.) / feat.）也只算 2 首 → 仍然报
  const twoWays = [
    { beatmapId: 2001, beatmapsetId: 99, realType: 'RC', name: 'A - B [1]' },
    { beatmapId: 2002, beatmapsetId: 99, realType: 'HB', name: 'A - B (Cut Ver.) [2]' },
    { beatmapId: 2003, beatmapsetId: 99, realType: 'LN', name: 'A - B [3]' },
  ]
  assert.equal(classifySetConflict(twoWays), 'setReview')
})

test('R33 倍速 set 的既有行为不变（rateSet 仍能识别）', () => {
  const rateSet = [
    { beatmapId: 1, beatmapsetId: 555, realType: 'RC', name: 'X - Y [1.1x]' },
    { beatmapId: 2, beatmapsetId: 555, realType: 'HB', name: 'X - Y [1.2x]' },
  ]
  assert.equal(extractRate(rateSet[0].name), 1.1)
  assert.equal(classifySetConflict(rateSet), 'rateSet')
})

test('R33 既有的短路条件不变', () => {
  assert.equal(classifySetConflict([]), null)
  assert.equal(classifySetConflict([{ beatmapId: 1, beatmapsetId: 9, realType: 'RC', name: 'A - B [1]' }]), null)
  // 同一个 realType → 不是冲突
  assert.equal(
    classifySetConflict([
      { beatmapId: 1, beatmapsetId: 9, realType: 'RC', name: 'A - B [1]' },
      { beatmapId: 2, beatmapsetId: 9, realType: 'RC', name: 'A - B [2]' },
    ]),
    null,
  )
  // 同一个 bid（同一个难度被标了两遍）→ 交给同 BID 冲突那条线，不在 set 这条报
  assert.equal(
    classifySetConflict([
      { beatmapId: 1, beatmapsetId: 9, realType: 'RC', name: 'A - B [1]' },
      { beatmapId: 1, beatmapsetId: 9, realType: 'HB', name: 'A - B [1]' },
    ]),
    null,
  )
})

test('R33 数据不变量：data/tournaments 里不该有占位 ID', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = path.join(process.cwd(), 'data', 'tournaments')
  const found = []
  let maps = 0
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        maps++
        for (const field of ['beatmapId', 'beatmapsetId']) {
          const value = map[field]
          if (value === undefined || value === null) continue
          if (!isUsableBeatmapId(value)) {
            found.push(`${file} ${round.id} ${map.slot} ${field}=${value}`)
          }
        }
      }
    }
  }
  assert.ok(maps > 4000, `应扫到全部谱面（实际 ${maps}）`)
  assert.deepEqual(
    found,
    [],
    `发现占位 ID —— 用 "node scripts/find-suspicious-ids.mjs" 出清单再清掉：\n${found.slice(0, 10).join('\n')}`,
  )
  assert.equal(SET_ID_UNRELIABLE_SONG_COUNT, 3)
})
