'use client'

import { useMemo, useState } from 'react'
import { tournaments as allTournaments } from '@/generated/tournaments'
import { useT } from '@/lib/i18n'
import { REAL_TYPES } from './MapSlotEditor'

const CATEGORY_ORDER = ['RC', 'LN', 'HB', 'SV', 'TB'] as const

interface MapRow {
  key: string
  tournamentId: string
  tournamentName: string
  tournamentAbbr: string
  roundName: string
  roundAbbr: string
  roundOrder: number
  slot: string
  type: string
  realType: string
  name: string
  difficulty: number
  difficultyLn?: number
  beatmapId?: number
}

export function RealTypeMapBrowser() {
  const t = useT()
  const [selectedRealType, setSelectedRealType] = useState(REAL_TYPES.RC[0].id)
  const [selectedTournamentId, setSelectedTournamentId] = useState('all')

  const allRows = useMemo<MapRow[]>(() => allTournaments.flatMap((tournament) =>
    (tournament.rounds || []).flatMap((round) =>
      (round.maps || []).map((map, index) => ({
        key: `${tournament.id}:${round.id}:${map.slot}:${map.beatmapId || index}`,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        roundName: round.name,
        roundAbbr: round.abbreviation || round.name,
        roundOrder: round.order,
        slot: map.slot,
        type: map.type,
        realType: map.realType,
        name: map.name,
        difficulty: map.difficulty,
        difficultyLn: map.difficultyLn,
        beatmapId: map.beatmapId,
      })),
    ),
  ), [])

  const optionGroups = useMemo(() => {
    const known = new Set(CATEGORY_ORDER.flatMap((category) => REAL_TYPES[category].map((item) => item.id)))
    const custom = Array.from(new Set(allRows.map((row) => row.realType).filter((id) => id && !known.has(id))))
      .sort((a, b) => a.localeCompare(b))
    return [
      ...CATEGORY_ORDER.map((category) => ({ category, options: REAL_TYPES[category] })),
      ...(custom.length > 0 ? [{ category: t('realTypeMaps.customGroup'), options: custom.map((id) => ({ id, name: id })) }] : []),
    ]
  }, [allRows, t])

  const matchingTournaments = useMemo(() => allTournaments.filter((tournament) =>
    tournament.rounds?.some((round) => round.maps?.some((map) => map.realType === selectedRealType)),
  ), [selectedRealType])

  const visibleRows = useMemo(() => allRows
    .filter((row) => row.realType === selectedRealType)
    .filter((row) => selectedTournamentId === 'all' || row.tournamentId === selectedTournamentId)
    .sort((a, b) => a.tournamentName.localeCompare(b.tournamentName)
      || a.roundOrder - b.roundOrder
      || a.slot.localeCompare(b.slot, undefined, { numeric: true })),
  [allRows, selectedRealType, selectedTournamentId])

  const handleRealTypeChange = (realType: string) => {
    setSelectedRealType(realType)
    setSelectedTournamentId('all')
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('realTypeMaps.title')}</h3>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-neutral-500">{t('realTypeMaps.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
        <label className="min-w-52 text-xs text-gray-500 dark:text-neutral-400">
          <span className="mb-1 block">{t('realTypeMaps.realType')}</span>
          <select
            value={selectedRealType}
            onChange={(event) => handleRealTypeChange(event.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {optionGroups.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="min-w-64 text-xs text-gray-500 dark:text-neutral-400">
          <span className="mb-1 block">{t('realTypeMaps.tournament')}</span>
          <select
            value={selectedTournamentId}
            onChange={(event) => setSelectedTournamentId(event.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="all">{t('realTypeMaps.allTournaments')}</option>
            {matchingTournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.abbreviation || tournament.name} ({tournament.year})
              </option>
            ))}
          </select>
        </label>

        <div className="pb-2 text-xs tabular-nums text-gray-500 dark:text-neutral-400">
          {t('realTypeMaps.count', { n: String(visibleRows.length) })}
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-neutral-500">
          {t('realTypeMaps.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 dark:bg-neutral-900/50 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t('realTypeMaps.col.tournament')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.round')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.slot')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.map')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.difficulty')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('realTypeMaps.col.link')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {visibleRows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-2.5 text-gray-700 dark:text-neutral-200" title={row.tournamentName}>
                    {row.tournamentAbbr}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400" title={row.roundName}>{row.roundAbbr}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-600 dark:text-neutral-300">{row.slot}</td>
                  <td className="max-w-xl px-3 py-2.5 text-gray-700 dark:text-neutral-200">
                    <span className="line-clamp-2" title={row.name}>{row.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-500 dark:text-neutral-400">
                    {row.difficultyLn
                      ? `RF ${row.difficulty} / LN ${row.difficultyLn}`
                      : row.difficulty}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.beatmapId ? (
                      <a
                        href={`https://osu.ppy.sh/b/${row.beatmapId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="whitespace-nowrap font-mono text-purple-600 hover:underline dark:text-purple-300"
                      >
                        BID {row.beatmapId}
                      </a>
                    ) : (
                      <span className="text-gray-300 dark:text-neutral-600">{t('realTypeMaps.noBid')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
