'use client'

import { useMemo, useState } from 'react'
import { tournaments as allTournaments } from '@/generated/tournaments'
import { useT } from '@/lib/i18n'
import { REAL_TYPES } from '@/lib/realTypeCatalog'
import { normalizeRealType } from '@/lib/realType'
import {
  browserOptionGroups,
  buildMapBrowserRows,
  conversionGroupsFor,
  duplicateGroupsOf,
  duplicateRoundIndexOf,
  matchingTournamentsFor,
  visibleBrowserRows,
  type BrowserOverrideMap,
  type MapBrowserRow,
} from '@/lib/mapBrowserRows'
import { ManiaChartButton } from '@/components/chart/ManiaChartButton'

// 行形状与判定逻辑都在 src/lib/mapBrowserRows.ts（公开反馈页复用同一份），
// 这里只做"取全库数据 → 喂给纯函数 → 渲染表格"的适配。
interface Props {
  canStage?: boolean
  stagedCount?: number
  onStageMapChange?: (change: { tournamentId: string; roundId: string; roundIndex: number; slot: string; beatmapId?: number; realType: string }) => void
}

export function RealTypeMapBrowser({ canStage = false, stagedCount = 0, onStageMapChange }: Props) {
  const t = useT()
  const [selectedRealType, setSelectedRealType] = useState(REAL_TYPES.RC[0].id)
  const [selectedTournamentId, setSelectedTournamentId] = useState('all')
  const [overrides, setOverrides] = useState<BrowserOverrideMap>({})

  // 行生成 / 筛选 / 排序 / 下拉项全部走 src/lib/mapBrowserRows.ts 的纯函数
  // （公开反馈页用的是同一份，因此这些规则只有一处实现）。
  const duplicateMapIndex = useMemo(() => duplicateRoundIndexOf(allTournaments), [])
  const allRows = useMemo(() => buildMapBrowserRows(allTournaments, duplicateMapIndex), [duplicateMapIndex])
  const optionGroups = useMemo(() => browserOptionGroups(allRows, t('realTypeMaps.customGroup')), [allRows, t])

  const matchingTournaments = useMemo(
    () => matchingTournamentsFor(allTournaments, allRows, selectedRealType),
    [allRows, selectedRealType],
  )

  const visibleRows = useMemo(
    () => visibleBrowserRows(allRows, {
      realType: selectedRealType,
      tournamentId: selectedTournamentId,
      overrides,
    }),
    [allRows, overrides, selectedRealType, selectedTournamentId],
  )

  // 「这一行的身份在别处被复用了」的汇总（判据与去重规则见 mapBrowserRows.duplicateGroupsOf）。
  const duplicateGroups = useMemo(() => duplicateGroupsOf(visibleRows), [visibleRows])

  const handleRealTypeChange = (realType: string) => {
    setSelectedRealType(realType)
    setSelectedTournamentId('all')
  }

  const getConversionGroups = (row: MapBrowserRow) => conversionGroupsFor(row.category, row.realType)

  const handleConversion = (row: MapBrowserRow, realType: string) => {
    const canonical = normalizeRealType(realType)
    setOverrides((current) => ({ ...current, [row.key]: canonical }))
    onStageMapChange?.({
      tournamentId: row.tournamentId,
      roundId: row.roundId,
      roundIndex: row.roundIndex,
      slot: row.slot,
      beatmapId: row.beatmapId,
      realType: canonical,
    })
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
        {canStage && stagedCount > 0 && (
          <div className="pb-2 text-xs text-blue-700 dark:text-blue-300">
            {t('realTypeMaps.staged', { n: String(stagedCount) })}
          </div>
        )}
      </div>

      {duplicateGroups.length > 0 && (
        <div className="mx-4 mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <div>{t('realTypeMaps.duplicateWarning')}</div>
          <ul className="mt-1 list-inside list-disc">
            {duplicateGroups.slice(0, 6).map((group) => (
              <li key={`${group.abbr}:${group.rounds.join('&')}`}>
                {group.abbr} — {group.rounds.join(' & ')}
              </li>
            ))}
          </ul>
          {duplicateGroups.length > 6 && (
            <div className="mt-1">+{duplicateGroups.length - 6}</div>
          )}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-neutral-500">
          {t('realTypeMaps.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 dark:bg-neutral-900/50 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t('realTypeMaps.col.tournament')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.round')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.slot')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.map')}</th>
                <th className="px-3 py-2 font-medium">{t('realTypeMaps.col.difficulty')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('realTypeMaps.col.link')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('realTypeMaps.col.chart')}</th>
                {canStage && <th className="px-4 py-2 font-medium">{t('realTypeMaps.col.convert')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {visibleRows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-2.5 text-gray-700 dark:text-neutral-200" title={row.tournamentName}>
                    {row.tournamentAbbr}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400" title={row.roundName}>
                    {row.roundAbbr}
                    {row.duplicateRounds && (
                      <span className="ml-1 text-amber-600 dark:text-amber-300" title={t('realTypeMaps.duplicateRowHint', { rounds: row.duplicateRounds.join(' & ') })}>!</span>
                    )}
                  </td>
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
                  <td className="px-4 py-2.5 text-right">
                    <ManiaChartButton
                      target={{
                        beatmapId: row.beatmapId,
                        tournamentId: row.tournamentId,
                        roundId: row.roundId,
                        slot: row.slot,
                      }}
                      heading={`${row.tournamentAbbr} ${row.roundAbbr} ${row.slot}`}
                      className="whitespace-nowrap text-purple-600 dark:text-purple-300 hover:underline"
                    />
                  </td>
                  {canStage && (
                    <td className="px-4 py-2.5">
                      <select
                        value={row.realType}
                        onChange={(event) => handleConversion(row, event.target.value)}
                        className="max-w-48 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                        title={t('realTypeMaps.convertTitle')}
                      >
                        {getConversionGroups(row).map((group) => (
                          <optgroup key={group.category} label={group.category}>
                            {group.options.map((option) => (
                              <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
