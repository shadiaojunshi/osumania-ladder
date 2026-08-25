'use strict'

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
