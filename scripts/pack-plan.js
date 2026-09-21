'use strict'

const { packRealTypeFor, isValidPackAs } = require('./pack-as')

// Include both ends: a type with all maps moved out must retire its old pack,
// and a destination with no native maps must still get generated.
function planPackRun(tournaments, { normalize, knownTypes, excludedTypes }) {
  const types = new Set()
  const routing = {}
  const known = new Set(knownTypes)
  const excluded = new Set(excludedTypes)
  for (const tournament of tournaments) for (const round of tournament.rounds) for (const map of round.maps) {
    const from = normalize(map.realType)
    const to = normalize(packRealTypeFor(map))
    const key = `maps/${tournament.id}/${round.id}/${map.slot}.osz`
    if (isValidPackAs(map.packAs) && (!known.has(to) || excluded.has(to))) {
      throw new Error(`${key}: 无效的临时归包目标 ${map.packAs}`)
    }
    if (!excluded.has(from)) types.add(from)
    if (!excluded.has(to)) types.add(to)
    if (from !== to) routing[key] = { from, to }
  }
  return { types: [...types], routing }
}

function assertSinglePublishSafe(routing, previousRouting = {}) {
  // Previous routing matters when cancelling the last override. A single pack
  // cannot safely remove the old destination and restore the source together.
  if (Object.keys(routing).length || Object.keys(previousRouting).length) {
    throw new Error('存在临时归包或上一版临时归包记录：请全量发布（不传 --type），来源包和目标包必须一起更新。离线单类型预览仍可用。')
  }
}

// Compare actual gameplay content, across all packs, so moving/splitting a map
// is harmless but adding other maps cannot conceal the loss of an old one.
function comparePublishedContent(previousPacks, nextPacks) {
  const current = new Set(nextPacks.flatMap((p) => (p.contentEntries || []).map((e) => e.contentKey)))
  const lost = new Map()
  for (const p of previousPacks) for (const entry of p.contentEntries || []) {
    if (!current.has(entry.contentKey)) lost.set(entry.contentKey, entry)
  }
  return {
    lost: [...lost.values()],
    legacyPacks: previousPacks.filter((p) => !Array.isArray(p.contentEntries)).length,
  }
}

function assertPublishedContent(previousPacks, nextPacks, allowContentGaps = false) {
  const result = comparePublishedContent(previousPacks, nextPacks)
  if (result.lost.length && !allowContentGaps) {
    throw new Error(`上一版的 ${result.lost.length} 张谱面内容本次未收录（新增或借入不能抵消）：${result.lost.slice(0, 20).flatMap((e) => e.paths).join(', ')}。确认有意移除或替换后才使用 --allow-content-gaps。清单未更新。`)
  }
  return result
}

module.exports = { planPackRun, assertSinglePublishSafe, comparePublishedContent, assertPublishedContent }
