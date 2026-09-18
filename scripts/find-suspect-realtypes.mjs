#!/usr/bin/env node
/**
 * 找出"可能被误标成大类第一个真实键型(SS / HB1 / RE / SV1)"的谱面。
 *
 * 背景(2026-09-15 站长):早前后台新建谱面 / 改大类时的默认 realType 是该大类的第一个
 * 真实键型,于是"忘了改下拉"的图就静静躺在 SS/HB1/RE 里,和真正的那一型混在一起。
 * 默认键型现已改成 Pending(PD*),但历史数据里的那批还得找出来。
 *
 * 思路:**拿数据自己当参照物** —— 标错的只占少数,所以"多数派/常态"是可用的先验。
 * 不是训练模型,而是几个可解释的信号互相印证,打分排序后交给人复核:
 *
 *   S7 整组键型同质化且罕见(主信号,结构性)
 *      同一轮同一大类里,所有图的键型都相同 —— 全库里这种"整组一个键型"的轮次极少
 *      (例:HB 组 3 张全是 HB1 的只占同规模轮次的 2%)。命中时,组内"还是大类第一个键型"
 *      的那几张就是最典型的"忘了改下拉"。
 *   S1 同一 BID 在别处被标成别的键型 → 跨比赛共识(严格多数才采信,平票不算)
 *   S2 同一 beatmapset、同一大类内部不一致 → 同一套图内共识
 *   S4 谱面名/难度名里出现别的子类型关键词(弱信号,只做提示)
 *   S5 HB 图 ln 难度明显高于 rf,却标成 HB1(速度/通用型,非 LN 主导)
 *   S3/S6 同轮同大类里键型重复 / 只剩它还是默认值(弱指纹)
 *
 * 只读:不写任何比赛 JSON。输出 reports/realtype-suspects.md(人看)+ --json(机器看)。
 *
 * 用法:
 *   node scripts/find-suspect-realtypes.mjs              # 出报告
 *   node scripts/find-suspect-realtypes.mjs --json       # 打到 stdout
 *   node scripts/find-suspect-realtypes.mjs --min-score 3
 */

import fs from 'node:fs'
import path from 'node:path'

// 占位 ID 判读（显式 .ts：本脚本会被 node 直接跑，省略扩展名会 ERR_MODULE_NOT_FOUND）。
// S1「同一 BID 跨比赛共识」与 S2「同一 beatmapset 共识」都按这两个 id 建索引 ——
// 占位 ID（0/1/负数，见 lib/beatmapIds.ts）混进来会把无关谱面粘成一组，
// 于是"共识"变成假信号（MKTC 2025 那 36 张的 `BeatmapSetID:1` 就是）。
import { isUsableBeatmapId } from '../src/lib/beatmapIds.ts'

// 各大类里"排在第一"的真实键型 —— 也就是以前那个会被当成默认值的键型。
const FIRST_REAL_TYPE = { RC: 'SS', HB: 'HB1', LN: 'RE', SV: 'SV1' }
// TB 只有一种键型,谈不上"选错";SPECIAL 的 type 是 HB&SV 这种跨大类名,不走这套。
const KNOWN_CATEGORIES = new Set(Object.keys(FIRST_REAL_TYPE))

// S4:谱面名里的子类型关键词 → 它暗示的真实键型集合。只在"当前键型不在集合里"时算信号。
const SUBTYPE_KEYWORDS = [
  { label: 'Chord', types: ['CJ'] },
  { label: 'Jack', types: ['CJ', 'SJ', 'FCJ', 'JTC'] },
  { label: 'Stream', types: ['SS', 'STC'] },
  { label: 'Dump', types: ['DP', 'ADP'] },
  { label: 'Tech', types: ['STC', 'MTC', 'SATC', 'JTC', 'WTC', 'TC'] },
  { label: 'Stamina', types: ['SA', 'SATC'] },
  { label: 'LN / Release', types: ['RE', 'CO', 'TE', 'DE', 'JW', 'SW', 'LNMX', 'LNWC', 'LNTC', 'IN', 'LNWL', 'OLN'] },
  { label: 'SV / Gimmick', types: ['SV1', 'SV2', 'SI', 'ME', 'SVMX', 'GM'] },
  { label: 'Hybrid', types: ['HB1', 'HB2', 'HB3', 'HB4', 'HB5', 'RCmainHB', 'LNmainHB', 'MXHB', 'MNTB', 'OHB'] },
].map((entry) => ({ ...entry, pattern: new RegExp({
  Chord: 'chord', Jack: 'jack', Stream: 'stream', Dump: 'dump', Tech: 'tech', Stamina: 'stamina',
  'LN / Release': '(^|[^A-Za-z])LN([^A-Za-z]|$)|release',
  'SV / Gimmick': '(^|[^A-Za-z])SV[0-9]?([^A-Za-z]|$)|gimmick|sightread',
  Hybrid: 'hybrid',
}[entry.label], 'i') }))

function parseArgs(argv) {
  // 默认只报"中"(>=3)及以上 —— 只有单个弱指纹的那 500 多张基本就是"默认池"本身,
  // 列出来反而淹没有效信息。要看全量就传 --min-score 1。
  const options = { dir: 'data/tournaments', json: false, out: 'reports/realtype-suspects.md', minScore: 3 }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') options.json = true
    else if (arg === '--dir') options.dir = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--min-score') options.minScore = Number(argv[++i])
  }
  return options
}

function loadMaps(dir) {
  const maps = []
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue
    const tournament = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const round of tournament.rounds || []) {
      for (const map of round.maps || []) {
        maps.push({
          file,
          tournamentId: tournament.id,
          tournamentAbbr: tournament.abbreviation || tournament.id,
          roundId: round.id,
          roundAbbr: round.abbreviation || round.name || round.id,
          slot: map.slot,
          type: String(map.type || ''),
          realType: String(map.realType || ''),
          name: map.name || '',
          beatmapId: map.beatmapId,
          beatmapsetId: map.beatmapsetId,
          difficulty: map.difficulty,
          difficultyLn: map.difficultyLn,
        })
      }
    }
  }
  return maps
}

/** Pending(PD*)只是"还没分类",既不是证据也不是共识目标 —— 一律忽略。 */
function isPending(realType) {
  return /^PD[A-Z]*$/.test(realType)
}

function majority(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  const ranked = [...counts].sort((a, b) => b[1] - a[1])
  return { type: ranked[0][0], count: ranked[0][1], total: values.length, ranked }
}

/** 严格多数:票数 ≥2 且多于第二名(平票时"多数派"只是数组顺序的产物,不算)。 */
function strictMajority(values) {
  const stat = majority(values)
  if (stat.total < 2) return null
  const top = stat.ranked[0][1]
  const second = stat.ranked[1] ? stat.ranked[1][1] : 0
  if (top < 2 || top <= second) return null
  return stat
}

/** 按 (type, 组规模) 统计"不同键型个数"的分布 —— S7 的基线来自数据本身。
 *  Pending(PD*)不算一种"分类结果",既不计入不同键型个数,也不进基线。 */
function buildGroupBaseline(rounds) {
  const baseline = new Map()
  for (const round of rounds) {
    for (const [type, group] of groupByType(round)) {
      if (!KNOWN_CATEGORIES.has(type)) continue
      const classified = group.filter((map) => !isPending(map.realType))
      if (classified.length < 2) continue
      const distinct = new Set(classified.map((map) => map.realType)).size
      const key = `${type}#${classified.length}`
      if (!baseline.has(key)) baseline.set(key, { total: 0, dist: new Map() })
      const entry = baseline.get(key)
      entry.total++
      entry.dist.set(distinct, (entry.dist.get(distinct) || 0) + 1)
    }
  }
  return baseline
}

function groupByType(maps) {
  const byType = new Map()
  for (const map of maps) {
    if (!byType.has(map.type)) byType.set(map.type, [])
    byType.get(map.type).push(map)
  }
  return byType
}

function groupRounds(maps) {
  const rounds = new Map()
  for (const map of maps) {
    const key = `${map.tournamentId}//${map.roundId}`
    if (!rounds.has(key)) rounds.set(key, [])
    rounds.get(key).push(map)
  }
  return [...rounds.values()]
}

function findCandidates(maps) {
  const candidates = maps.map((map) => ({ map, score: 0, evidence: [], suggest: null, kind: null }))
  const indexByBid = new Map()
  const indexBySet = new Map()
  maps.forEach((map, i) => {
    // 占位 ID（0/1/负数）不是身份：拿它建索引会让 36 张无关谱面互相成为"共识"
    // （S1 同 BID / S2 同 set 都会被污染，见 lib/beatmapIds.ts）。
    if (isUsableBeatmapId(map.beatmapId)) {
      if (!indexByBid.has(map.beatmapId)) indexByBid.set(map.beatmapId, [])
      indexByBid.get(map.beatmapId).push(i)
    }
    if (isUsableBeatmapId(map.beatmapsetId)) {
      if (!indexBySet.has(map.beatmapsetId)) indexBySet.set(map.beatmapsetId, [])
      indexBySet.get(map.beatmapsetId).push(i)
    }
  })
  const add = (index, points, text, suggest, kind) => {
    const entry = candidates[index]
    entry.score += points
    entry.evidence.push(text)
    if (suggest && !entry.suggest) entry.suggest = suggest
    if (kind && (entry.kind === null || points > (entry.kindPoints || 0))) {
      entry.kind = kind
      entry.kindPoints = points
    }
  }

  const rounds = groupRounds(maps)
  const baseline = buildGroupBaseline(rounds)

  // ---- S7 整组键型同质化且罕见(主信号)----
  for (const round of rounds) {
    const label = `${round[0].tournamentAbbr} ${round[0].roundAbbr}`
    for (const [type, group] of groupByType(round)) {
      if (!KNOWN_CATEGORIES.has(type)) continue
      // 只看"已分类"的图:整组还是 PD* 说明本来就没填,不需要提醒。
      const classified = group.filter((map) => !isPending(map.realType))
      if (classified.length < 2) continue
      const distinct = new Set(classified.map((map) => map.realType)).size
      const stats = baseline.get(`${type}#${classified.length}`)
      if (!stats || stats.total < 10) continue // 样本太少的规模不做判断
      const rarity = (stats.dist.get(distinct) || 0) / stats.total
      if (rarity > 0.05) continue
      const onlyType = [...new Set(classified.map((map) => map.realType))].join(' / ')
      for (const map of classified) {
        const isDefault = map.realType === FIRST_REAL_TYPE[type]
        const points = isDefault ? 4 : 2
        add(
          maps.indexOf(map),
          points,
          `${label} 的 ${type} 组 ${classified.length} 张只用 ${distinct} 种键型(${onlyType})；全库 ${stats.total} 个同规模 ${type} 组里这样只占 ${(rarity * 100).toFixed(0)}%` +
            (isDefault ? `,而它正是"${type} 的第一个键型" ${map.realType}` : ''),
          null,
          'group-rarity',
        )
      }
    }
  }

  // ---- S1 跨比赛同一 BID 共识 ----
  for (const [bid, list] of indexByBid) {
    if (list.length < 2) continue
    const strict = strictMajority(list.map((i) => maps[i].realType).filter((realType) => !isPending(realType)))
    for (const i of list) {
      const current = maps[i].realType
      if (isPending(current)) continue
      const isDefault = current === FIRST_REAL_TYPE[maps[i].type]
      if (strict && current !== strict.type) {
        add(
          i,
          isDefault ? 5 : 4,
          `同一 beatmapId ${bid} 在别处被标为 ${strict.ranked.map(([t, n]) => `${t}×${n}`).join(' / ')},当前 ${current} 是少数派`,
          strict.type,
          'bid-consensus',
        )
        continue
      }
      // 平票(最常见):只有当"当前用的是大类第一个键型"时才算一条弱证据。
      if (!isDefault) continue
      const others = list
        .filter((other) => other !== i)
        .map((other) => maps[other].realType)
        .filter((realType) => !isPending(realType) && realType !== current)
      if (others.length === 0) continue
      add(
        i,
        3,
        `同一 beatmapId ${bid} 在别处被标为 ${others.join(' / ')}(各一次,平票),而这里是默认值 ${current}`,
        others.length === 1 ? others[0] : null,
        'bid-consensus',
      )
    }
  }

  // ---- S2 同一 beatmapset、同一大类内不一致 ----
  for (const [setId, list] of indexBySet) {
    if (list.length < 2) continue
    for (const [, group] of groupByType(list.map((i) => maps[i]))) {
      if (group.length < 2) continue
      const strict = strictMajority(group.map((map) => map.realType).filter((realType) => !isPending(realType)))
      if (!strict) continue
      for (const map of group) {
        if (isPending(map.realType) || map.realType === strict.type) continue
        add(maps.indexOf(map), 2, `同一 beatmapset ${setId} 的同类图多数标为 ${strict.type}`, strict.type, 'set-consensus')
      }
    }
  }

  // ---- S4 谱面名里的子类型关键词(弱信号)----
  for (const [i, map] of maps.entries()) {
    if (!KNOWN_CATEGORIES.has(map.type) || !map.name) continue
    const diffName = (map.name.match(/\[([^\]]*)\]\s*$/) || [null, map.name])[1].replace(/\bno\s+(LN|SV)\b/gi, '')
    for (const { label, types, pattern } of SUBTYPE_KEYWORDS) {
      if (!pattern.test(diffName)) continue
      if (types.includes(map.realType)) break
      const isDefault = map.realType === FIRST_REAL_TYPE[map.type]
      add(
        i,
        isDefault ? 3 : 2,
        `难度名里出现「${label}」一路的词(\`${diffName}\`),当前标的是 ${map.realType}${isDefault ? '(大类第一个键型)' : ''}`,
        types.length === 1 ? types[0] : null,
        'name-keyword',
      )
      break
    }
  }

  // ---- S5 HB 图 ln 明显高于 rf 却标 HB1 ----
  for (const [i, map] of maps.entries()) {
    if (map.type !== 'HB' || map.realType !== 'HB1') continue
    const rf = Number(map.difficulty || 0)
    const ln = Number(map.difficultyLn || 0)
    if (!(ln > 0 && rf > 0) || ln - rf < 1.5) continue
    add(i, 2, `HB 图 ln ${ln} 比 rf ${rf} 高 ${(ln - rf).toFixed(2)},更像 LN 主导的 HB`, 'LNmainHB', 'hb-ln-gap')
  }

  // ---- S3 / S6 弱指纹 ----
  for (const round of rounds) {
    const label = `${round[0].tournamentAbbr} ${round[0].roundAbbr}`
    for (const [type, group] of groupByType(round)) {
      const fallback = FIRST_REAL_TYPE[type]
      if (!fallback) continue
      // 同上:只看已分类的图,否则"其它几张都是 PD*"会被误读成"都不像它"。
      const classified = group.filter((map) => !isPending(map.realType))
      if (classified.length >= 2) {
        const stat = majority(classified.map((map) => map.realType))
        const duplicate = stat.ranked.find(([realType, n]) => realType === fallback && n > 1)
        if (duplicate) {
          for (const map of classified) {
            if (map.realType !== fallback) continue
            add(maps.indexOf(map), 1, `${label} 的 ${type} 组里 ${fallback} 出现 ${duplicate[1]} 次(同组键型重复)`, null, 'duplicate-default')
          }
        }
      }
      if (classified.length >= 3) {
        const others = classified.filter((map) => map.realType !== fallback)
        if (others.length === classified.length - 1) {
          for (const map of classified) {
            if (map.realType !== fallback) continue
            add(maps.indexOf(map), 1, `${label} 的 ${type} 组里其它 ${others.length} 张都不是 ${fallback},只有它还是默认值`, null, 'lone-default')
          }
        }
      }
    }
  }

  return candidates
}

function confidenceOf(score) {
  if (score >= 5) return '高'
  if (score >= 3) return '中'
  return '低'
}

function renderTable(items) {
  const rows = [
    '| 置信 | 分数 | 比赛 | 轮次 | 槽位 | 大类 | 当前键型 | 建议 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const item of items) {
    const map = item.map
    const evidence = item.evidence.join('<br>').replace(/\|/g, '\\|')
    rows.push(`| ${confidenceOf(item.score)} | ${item.score} | ${map.tournamentAbbr} | ${map.roundAbbr} | ${map.slot} | ${map.type} | ${map.realType} | ${item.suggest || '—'} | ${evidence} |`)
  }
  return rows
}

function renderReport(candidates, allMaps, options) {
  const lines = []
  const high = candidates.filter((item) => item.score >= 5)
  const medium = candidates.filter((item) => item.score >= 3 && item.score < 5)
  const low = candidates.filter((item) => item.score > 0 && item.score < 3)
  const byTournament = new Map()
  for (const item of candidates.filter((item) => item.score >= 3)) {
    const key = `${item.map.tournamentAbbr} (${item.map.tournamentId})`
    if (!byTournament.has(key)) byTournament.set(key, [])
    byTournament.get(key).push(item)
  }
  const bySuggestion = new Map()
  for (const item of candidates) {
    if (!item.suggest) continue
    bySuggestion.set(item.suggest, (bySuggestion.get(item.suggest) || 0) + 1)
  }
  const lowByTournament = new Map()
  for (const item of low) lowByTournament.set(item.map.tournamentAbbr, (lowByTournament.get(item.map.tournamentAbbr) || 0) + 1)

  lines.push('# 疑似键型误标候选（自动检测）')
  lines.push('')
  lines.push(`生成时间:${new Date().toISOString()}`)
  lines.push(`扫描:${options.dir} · 谱面 ${allMaps.length} 张`)
  lines.push('')
  lines.push('> **只读报告**,不修改任何比赛数据。候选按证据强度排序,高置信只是"先看这批",不是自动结论 ——')
  lines.push('> 有些分歧纯粹是两个编辑者口径不同(同一张图一个算 HB2、一个算 HB3),需要人来拍板。')
  lines.push('')
  lines.push('## 总览')
  lines.push('')
  lines.push(`- 候选:${candidates.length} 张(高 ${high.length} / 中 ${medium.length} / 低 ${low.length})`)
  lines.push(`- 涉及比赛:${byTournament.size} 个`)
  if (bySuggestion.size > 0) {
    lines.push(`- 能给出去向建议的:${[...bySuggestion].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  }
  lines.push('')
  lines.push('**先看「高置信」**:它们要么"同一张图在别处被标成别的键型且这里是少数派",要么同时命中多个弱指纹。')
  lines.push('「中置信」里最多的那一类来自主信号 S7 —— 整个组的键型同质化到全库罕见(详见信号说明)。')
  lines.push('')

  lines.push('## 高置信')
  lines.push('')
  if (high.length === 0) lines.push('（无）')
  else lines.push(...renderTable(high))
  lines.push('')

  lines.push('## 中置信')
  lines.push('')
  if (medium.length === 0) lines.push('（无）')
  else lines.push(...renderTable(medium))
  lines.push('')

  lines.push('## 低置信（弱指纹,仅供参考）')
  lines.push('')
  if (low.length === 0) {
    lines.push('（默认不列出。弱指纹的意思是:全库还有 900 多张图按"大类第一个键型"躺着,其中绝大多数是对的,')
    lines.push('只有弱指纹并不足以说明标错。要看全量:`node scripts/find-suspect-realtypes.mjs --min-score 1`。）')
  } else {
    lines.push(`共 ${low.length} 张,按比赛聚合:${[...lowByTournament].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
    lines.push('')
    lines.push(...renderTable(low.slice(0, 30)))
    if (low.length > 30) {
      lines.push('')
      lines.push('（只列前 30 条;完整清单:`node scripts/find-suspect-realtypes.mjs --json --min-score 1`。）')
    }
  }
  lines.push('')

  lines.push('## 按比赛分组（高 + 中,便于复核）')
  lines.push('')
  for (const [key, list] of [...byTournament].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${key} — ${list.length} 张`)
    lines.push('')
    for (const item of [...list].sort((a, b) => b.score - a.score)) {
      const map = item.map
      lines.push(`- [${confidenceOf(item.score)}/${item.score}] ${map.roundAbbr} · ${map.slot} · \`${map.realType}\`${item.suggest ? ` → \`${item.suggest}\`` : ''}${map.name ? ` · ${map.name}` : ''}`)
      for (const text of item.evidence) lines.push(`  - ${text}`)
    }
    lines.push('')
  }

  lines.push('## 信号说明（怎么读）')
  lines.push('')
  lines.push('| 信号 | 分值 | 含义 |')
  lines.push('| --- | --- | --- |')
  lines.push('| S7 结构罕见度 | 4(默认值)/2 | 本轮同大类组里键型同质化到罕见:全库同 (大类, 组规模) 的组里,这种"只用了这么少的键型"的占比 ≤5% |')
  lines.push('| S1 跨比赛共识 | 3~5 | 同一个 beatmapId 在别处被标成别的键型。严格多数(≥2 票且多于第二名)算强证据;平票时只有"当前是大类第一个键型"才算 3 分 |')
  lines.push('| S2 同一套图共识 | 2 | 同一 beatmapset 里同类谱面的键型不一致 |')
  lines.push('| S4 难度名关键词 | 2~3 | 难度名里出现别的子类型的关键词(如标了 SS 但名字里有 Jack)。弱信号,常有歌曲名的误报 |')
  lines.push('| S5 HB 的 ln 倒挂 | 2 | HB 图 ln 难度比 rf 高 ≥1.5 却标成 HB1(速度/通用型) |')
  lines.push('| S3/S6 弱指纹 | 1 | 同组键型重复且撞上默认值 / 同组只剩它还是默认值 |')
  lines.push('')
  lines.push('共识类信号只用**严格多数**,平票不算;`PD*` 待分类标记既不作为证据也不作为共识目标。')
  lines.push('S7 的基线是用全库现算的(不是写死的),所以数据变了报告会自动跟着变。')
  lines.push('')
  return lines.join('\n')
}

const options = parseArgs(process.argv.slice(2))
const allMaps = loadMaps(path.resolve(options.dir))
const candidates = findCandidates(allMaps)
  .filter((item) => item.score >= options.minScore)
  .sort((a, b) => b.score - a.score || a.map.tournamentAbbr.localeCompare(b.map.tournamentAbbr) || a.map.slot.localeCompare(b.map.slot))

if (options.json) {
  process.stdout.write(JSON.stringify({ scanned: allMaps.length, candidates }, null, 2) + '\n')
} else {
  const report = renderReport(candidates, allMaps, options)
  const outPath = path.resolve(options.out)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, report, 'utf8')
  const high = candidates.filter((item) => item.score >= 5).length
  const medium = candidates.filter((item) => item.score >= 3 && item.score < 5).length
  console.log(`扫描 ${allMaps.length} 张谱面 → 候选 ${candidates.length} 张(高 ${high} / 中 ${medium} / 低 ${candidates.length - high - medium})`)
  console.log(`报告已写入 ${path.relative(process.cwd(), outPath)}`)
}
