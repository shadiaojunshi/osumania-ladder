'use strict'

/**
 * 把 `sources` 编成包内 `.osu` 的 Version 前缀：`(MWC 4K 2026 QF RC1 & ...) Artist - Title`。
 *
 * ⚠️ 这里**只管括号里的内容**。`[真实键型]`（临时归类，`map.packAs`）加在**括号外面**，
 * 由 `generate-pack.js` 的 `packAsPrefixFor` 拼 —— 因为括号本身是调用方（Version 模板）
 * 加的，前缀要落在它前面：`[Inverse](PFC S3 ST4) Artist - Title`。
 */
function formatSources(sources, isNsv) {
  const nsvSuffix = isNsv ? ' NSV' : ''
  const displaySlot = (slot) => (slot === 'TB1' ? 'TB' : slot)
  const groups = []
  const byTournament = new Map()

  for (const source of sources) {
    const key = source.tournamentAbbr || ''
    let group = byTournament.get(key)
    if (!group) {
      group = { tournamentAbbr: key, sources: [] }
      byTournament.set(key, group)
      groups.push(group)
    }
    group.sources.push(source)
  }

  const labels = groups.flatMap((group) => {
    const rounds = Array.from(new Set(group.sources.map((source) => source.roundAbbr).filter(Boolean)))
    if (rounds.length >= 2) {
      return [`${group.tournamentAbbr} ${rounds.join('&')}${nsvSuffix}`]
    }
    return Array.from(new Set(group.sources.map((source) =>
      `${group.tournamentAbbr} ${source.roundAbbr} ${displaySlot(source.slot)}${nsvSuffix}`,
    )))
  })

  if (labels.length <= 3) return labels.join(' & ')
  return groups.flatMap((group) => {
    const compactAbbr = (group.tournamentAbbr || '').replace(/\s*4K\s*/g, '').replace(/\s+/g, '')
    const rounds = Array.from(new Set(group.sources.map((source) => source.roundAbbr).filter(Boolean)))
    if (rounds.length >= 2) return [`${compactAbbr}${rounds.join('&')}${nsvSuffix}`]
    return Array.from(new Set(group.sources.map((source) =>
      `${compactAbbr}${source.roundAbbr} ${displaySlot(source.slot)}${nsvSuffix}`,
    )))
  }).join('/')
}

module.exports = { formatSources }
