// R20：backfill-bid 的判读与"只增不改"约束。
//
// 这个脚本会写 data/tournaments/*.json，测试只覆盖纯函数（decideFill /
// parseOszMetadata）—— 不碰 R2、不碰真实数据。
//
// 重点一：占位 ID 的口径必须和 `src/lib/beatmapIds.ts` 一致。旧版到处写 `> 0`，
//   于是 `BeatmapSetID:1` 被当真 setId 写回去（MKTC 那 36 张），而占位
//   `BeatmapID:1` 又被当成"已有 BID"，导致这些图永远修不了。
// 重点二：**两份输入的键名不同** —— 比赛 JSON 里是小写 s 的 `beatmapsetId`，
//   而从 .osu 解析出来的 meta 是 `beatmapSetId`（大写 S，跟 .osu 的字段名一致）。
//   `decideFill(map, meta)` 就是按这个约定各取一边，下面有测试把约定钉死。
import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'

import { decideFill, parseOszMetadata } from './backfill-bid.mjs'

// meta = 从 .osu 解析出来的形状（beatmapSetId，大写 S）。
const metaOf = (over = {}) => ({
  beatmapId: 1234567,
  beatmapSetId: 7654321,
  artist: 'A',
  title: 'T',
  version: 'V',
  ...over,
})

// 2026-09-20 行为变更：以前"有可用 BID"就整条跳过，name 分支永远够不到。
// 现在两条判断互相独立 —— BID 绝不改写，但 name 是占位时仍要补。
test('decideFill：BID 可用**且 name 是真名** → 一律不动（只增不改）', () => {
  assert.equal(decideFill({ slot: 'RC1', beatmapId: 999, name: 'Real Song [Insane]' }, metaOf()), null)
})

test('decideFill：BID 可用但 name 是占位 → 只补 name，绝不碰 ID', () => {
  // 真实案例：ASC 2025 有 80/88 张是这样（BID 正确、name 被填成槽位记号），
  // 4DM2023 是 98/98，全库共 214 张。旧实现永远修不了这批。
  const fill = decideFill({ slot: 'RC1', beatmapId: 999 }, metaOf())
  assert.equal(fill.beatmapId, undefined, 'BID 本来就没问题 —— 不该写回去')
  assert.equal(fill.beatmapsetId, undefined, '连带也不该动 setId')
  assert.equal(fill.replacedPlaceholder, false, '这不是"覆盖占位 ID"')
  assert.equal(fill.name, 'A - T [V]')

  // name === slot 的形态（ASC 2025 的 ST1 等）。
  assert.equal(decideFill({ slot: 'ST1', beatmapId: 5363572, name: 'ST1' }, metaOf()).name, 'A - T [V]')
  // 空 / 纯空白同样算占位。
  assert.equal(decideFill({ slot: 'RC1', beatmapId: 999, name: '' }, metaOf()).name, 'A - T [V]')
  assert.equal(decideFill({ slot: 'RC1', beatmapId: 999, name: '   ' }, metaOf()).name, 'A - T [V]')
})

test('decideFill：meta 里的 beatmapId 不可用（占位/缺失/非整数）→ 不回填', () => {
  for (const bad of [undefined, 0, 1, -1, 1.5, NaN, '123']) {
    assert.equal(decideFill({ slot: 'RC1', name: 'X' }, metaOf({ beatmapId: bad })), null, `不该回填: ${String(bad)}`)
  }
})

test('decideFill：缺 beatmapId → 回填，且标记为"新填"而非"覆盖占位"', () => {
  const fill = decideFill({ slot: 'RC1', name: 'X' }, metaOf())
  assert.equal(fill.beatmapId, 1234567)
  assert.equal(fill.beatmapsetId, 7654321)
  assert.equal(fill.replacedPlaceholder, false)
})

test('decideFill：占位 beatmapId=1 会被真实 BID 覆盖（旧版永远修不了这批）', () => {
  const fill = decideFill({ slot: 'RC1', beatmapId: 1, name: 'X' }, metaOf())
  assert.equal(fill.beatmapId, 1234567)
  assert.equal(fill.replacedPlaceholder, true)
})

test('decideFill：占位 beatmapSetId 不写回', () => {
  for (const bad of [undefined, 0, 1, -1, 2.5]) {
    const fill = decideFill({ slot: 'RC1', name: 'X' }, metaOf({ beatmapSetId: bad }))
    assert.equal(fill.beatmapsetId, undefined, `不该写 setId: ${String(bad)}`)
  }
  assert.equal(decideFill({ slot: 'RC1', name: 'X' }, metaOf()).beatmapsetId, 7654321)
})

test('decideFill：meta 用成 JSON 的键名（beatmapsetId）时不会误写 setId', () => {
  // 这是刻意的"窄接口"：meta 必须是 .osu 的形状。写错键名只会少写 setId，
  // 不会拿别的字段顶上 —— 有测定的约定好过静默猜。
  const fill = decideFill({ slot: 'RC1', name: 'X' }, { beatmapId: 42, beatmapsetId: 7777 })
  assert.equal(fill.beatmapId, 42)
  assert.equal(fill.beatmapsetId, undefined)
})

test('decideFill：name 只在空 / 等于 slot / 纯空白时补', () => {
  assert.equal(decideFill({ slot: 'RC1' }, metaOf()).name, 'A - T [V]')
  assert.equal(decideFill({ slot: 'RC1', name: '' }, metaOf()).name, 'A - T [V]')
  assert.equal(decideFill({ slot: 'RC1', name: '   ' }, metaOf()).name, 'A - T [V]')
  assert.equal(decideFill({ slot: 'RC1', name: 'RC1' }, metaOf()).name, 'A - T [V]')
  assert.equal(
    decideFill({ slot: 'RC1', name: '已有真名 [Insane]' }, metaOf()).name,
    undefined,
    '已有真实曲名不能覆盖',
  )
})

test('decideFill：meta 缺 artist/title 时用 Unknown 兜底，不产出空名字', () => {
  const fill = decideFill({ slot: 'RC1' }, { beatmapId: 42 })
  assert.equal(fill.name, 'Unknown - Unknown [Normal]')
})

test('parseOszMetadata：解析 [Metadata] 段（且只认这一段）', async () => {
  const zip = new JSZip()
  zip.file(
    'song.osu',
    [
      'osu file format v14',
      '',
      '[Metadata]',
      'Title:Some Title',
      'Artist:Some Artist',
      'Version:Insane',
      'BeatmapID:123',
      'BeatmapSetID:456',
      '',
      '[Difficulty]',
      'HPDrainRate:7',
      'BeatmapID:0',
    ].join('\n'),
  )
  const meta = await parseOszMetadata(await zip.generateAsync({ type: 'nodebuffer' }))
  assert.equal(meta.title, 'Some Title')
  assert.equal(meta.artist, 'Some Artist')
  assert.equal(meta.version, 'Insane')
  assert.equal(meta.beatmapId, 123, '[Difficulty] 段里的同名键不该被读到')
  assert.equal(meta.beatmapSetId, 456)
})

test('parseOszMetadata → decideFill 端到端：两个 ID 都写到位（键名约定对齐）', async () => {
  const zip = new JSZip()
  zip.file('song.osu', ['[Metadata]', 'Artist:A', 'Title:T', 'Version:V', 'BeatmapID:123', 'BeatmapSetID:456'].join('\n'))
  const meta = await parseOszMetadata(await zip.generateAsync({ type: 'nodebuffer' }))
  const fill = decideFill({ slot: 'S1', name: 'S1' }, meta)
  assert.equal(fill.beatmapId, 123)
  assert.equal(fill.beatmapsetId, 456, 'id 与 set id 都必须落到位')
  assert.equal(fill.name, 'A - T [V]')
})

test('parseOszMetadata：占位值原样读出来，由调用方按 isUsableBeatmapId 判读', async () => {
  const zip = new JSZip()
  zip.file('song.osu', ['[Metadata]', 'Title:T', 'BeatmapID:1', 'BeatmapSetID:1'].join('\n'))
  const meta = await parseOszMetadata(await zip.generateAsync({ type: 'nodebuffer' }))
  assert.equal(meta.beatmapId, 1)
  assert.equal(meta.beatmapSetId, 1)
  assert.equal(decideFill({ slot: 'S1' }, meta), null, '占位 BID 不该被当成可回填的值')
})

test('parseOszMetadata：zip 里没有 .osu → null', async () => {
  const zip = new JSZip()
  zip.file('readme.txt', 'nothing here')
  assert.equal(await parseOszMetadata(await zip.generateAsync({ type: 'nodebuffer' })), null)
})

// ---------- Action 的守门（2026-09-19）----------
// 这个 workflow 用的是**仓库里的真实 R2 密钥**，而且它**会改比赛数据**。
// 所以"默认只报告"和"只提交 data/tournaments"必须由断言守住，不能只写在注释里。

// 注释里出现 `git add -A` 是**说明**，不是行为 —— 只检查真正的命令行。
const codeOnly = (src) => src.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join('\n')

test('守门：backfill-metadata.yml 默认必须是只报告（只有显式 true 才写数据）', () => {
  const src = readFileSync(new URL('../.github/workflows/backfill-metadata.yml', import.meta.url), 'utf-8')
  assert.match(src, /default:\s*'false'/, '默认值必须是 false（只报告）')
  assert.ok(!/default:\s*'true'/.test(src), '默认值绝不能是 true')
  assert.match(src, /if \[ "\$APPLY" = "true" \]; then args\+=\("--apply"\); fi/, '只有显式 true 才加 --apply')
  // 提交那一步必须同时要求 apply=true
  assert.match(src, /if: success\(\) && github\.event\.inputs\.apply == 'true'/, '提交步骤要被 apply=true 守住')
})

test('守门：backfill-metadata.yml 只能提交 data/tournaments（不许 git add -A / force push）', () => {
  const src = readFileSync(new URL('../.github/workflows/backfill-metadata.yml', import.meta.url), 'utf-8')
  assert.ok(src.includes('git add data/tournaments'), '只加数据目录')
  assert.ok(!/git add -A|git add \.\s/.test(codeOnly(src)), '不能用 git add -A')
  assert.ok(!/--force|push -f/.test(codeOnly(src)), '禁止 force push')
  assert.ok(src.includes("git rebase --abort || true"), 'rebase 冲突要安全中止')
})
