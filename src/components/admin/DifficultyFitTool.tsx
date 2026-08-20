'use client'

import { useEffect, useMemo, useState } from 'react'
import ladderData from '@data/ref-ladder.json'
import { tournaments } from '@/generated/tournaments'
import { useT, type MessageKey } from '@/lib/i18n'
import type { Tournament } from '@/lib/types'
import type { LadderEntry } from '@/lib/referenceData'
import {
  DIFFICULTY_DIMENSIONS,
  applyDifficultyGapCalibration,
  buildLadderPositionMap,
  findNearestKnownRounds,
  getRoundDifficulty,
  isValidGapCalibration,
  linearRegression,
  linearRegressionWithSlope,
  removeDifficultyGapCalibration,
  roundKey,
  type DifficultyGapCalibration,
  type DifficultyDimensionId,
  type FitPoint,
} from '@/lib/difficultyFit'

type TargetMode = 'lowest' | 'highest' | 'absolute'

interface SelectedSample {
  key: string
  tournament: Tournament
  round: Tournament['rounds'][number]
  position: number | null
  isOnLadder: boolean
}

interface GapSetting {
  enabled: boolean
  lower: string
  upper: string
  multiplier: string
}

const DEFAULT_GAP_SETTINGS: Record<DifficultyDimensionId, GapSetting> = {
  'rc-rf': { enabled: true, lower: '14', upper: '15', multiplier: '1.5' },
  'ln-ln': { enabled: false, lower: '14', upper: '15', multiplier: '1' },
  'hb-rf': { enabled: true, lower: '14', upper: '15', multiplier: '1.5' },
  'hb-ln': { enabled: false, lower: '14', upper: '15', multiplier: '1' },
  'tb-rf': { enabled: true, lower: '14', upper: '15', multiplier: '1.5' },
  'tb-ln': { enabled: false, lower: '14', upper: '15', multiplier: '1' },
}

const DIMENSION_LABEL_KEYS: Record<DifficultyDimensionId, MessageKey> = {
  'rc-rf': 'difficultyFit.dimension.rc',
  'ln-ln': 'difficultyFit.dimension.ln',
  'hb-rf': 'difficultyFit.dimension.hbRf',
  'hb-ln': 'difficultyFit.dimension.hbLn',
  'tb-rf': 'difficultyFit.dimension.tbRf',
  'tb-ln': 'difficultyFit.dimension.tbLn',
}

function getRoundLabel(tournament: Tournament, round: Tournament['rounds'][number]): string {
  return `${tournament.abbreviation} ${tournament.year} · ${round.abbreviation || round.name}`
}

function parseFinite(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function DifficultyFitTool() {
  const t = useT()
  const [dimensionId, setDimensionId] = useState<DifficultyDimensionId>('rc-rf')
  const [entries, setEntries] = useState<LadderEntry[]>(
    (ladderData.entries as LadderEntry[]) || [],
  )
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(
      (ladderData.entries as LadderEntry[]).map((entry) =>
        roundKey(entry.tournamentId, entry.roundId)
      ),
    ),
  )
  const [positionOverrides, setPositionOverrides] = useState<Record<string, string>>({})
  const [addTournamentId, setAddTournamentId] = useState('')
  const [addRoundId, setAddRoundId] = useState('')
  const [addPosition, setAddPosition] = useState('')
  const [targetMode, setTargetMode] = useState<TargetMode>('lowest')
  const [targetOffset, setTargetOffset] = useState('-1')
  const [absoluteTarget, setAbsoluteTarget] = useState('0')
  const [gapSettings, setGapSettings] = useState<Record<DifficultyDimensionId, GapSetting>>(
    DEFAULT_GAP_SETTINGS,
  )
  const [manualSlopeDimensions, setManualSlopeDimensions] = useState<Set<DifficultyDimensionId>>(
    () => new Set(),
  )
  const [manualSlopes, setManualSlopes] = useState<Partial<Record<DifficultyDimensionId, string>>>({})

  useEffect(() => {
    let active = true
    fetch('/api/ref-ladder')
      .then(async (response) => {
        if (!response.ok) throw new Error('request failed')
        return response.json() as Promise<{ data?: { entries?: LadderEntry[] } }>
      })
      .then((payload) => {
        if (active && payload.data?.entries) {
          setEntries(payload.data.entries)
          setSelectedKeys(new Set(
            payload.data.entries.map((entry) => roundKey(entry.tournamentId, entry.roundId)),
          ))
        }
      })
      .catch(() => {
        // Static JSON keeps the tool usable in `next dev`, where Pages Functions are absent.
      })
    return () => {
      active = false
    }
  }, [])

  const positionMap = useMemo(
    () => buildLadderPositionMap(tournaments, entries),
    [entries],
  )

  const tournamentById = useMemo(
    () => new Map(tournaments.map((tournament) => [tournament.id, tournament])),
    [],
  )

  const ladderSamples = useMemo<SelectedSample[]>(() => entries.flatMap((entry) => {
    const tournament = tournamentById.get(entry.tournamentId)
    const round = tournament?.rounds.find((item) => item.id === entry.roundId)
    if (!tournament || !round) return []
    const key = roundKey(tournament.id, round.id)
    return [{
      key,
      tournament,
      round,
      position: positionMap.get(key) ?? null,
      isOnLadder: true,
    }]
  }), [entries, positionMap, tournamentById])

  const extraSamples = useMemo<SelectedSample[]>(() => {
    const ladderKeys = new Set(ladderSamples.map((sample) => sample.key))
    const samples: SelectedSample[] = []
    for (const key of selectedKeys) {
      if (ladderKeys.has(key)) continue
      const [tournamentId, roundId] = key.split('::')
      const tournament = tournamentById.get(tournamentId)
      const round = tournament?.rounds.find((item) => item.id === roundId)
      if (!tournament || !round) continue
      samples.push({
        key,
        tournament,
        round,
        position: parseFinite(positionOverrides[key] ?? ''),
        isOnLadder: false,
      })
    }
    return samples
  }, [ladderSamples, positionOverrides, selectedKeys, tournamentById])

  const chosenSamples = useMemo(
    () => [...ladderSamples, ...extraSamples].filter((sample) => selectedKeys.has(sample.key)),
    [extraSamples, ladderSamples, selectedKeys],
  )

  const plottedSamples = useMemo(() => chosenSamples.flatMap((sample) => {
    const reading = getRoundDifficulty(sample.round, dimensionId)
    const position = sample.isOnLadder
      ? sample.position
      : parseFinite(positionOverrides[sample.key] ?? '')
    if (!reading || position === null) return []
    return [{ ...sample, position, reading }]
  }), [chosenSamples, dimensionId, positionOverrides])

  const gapSetting = gapSettings[dimensionId]
  const requestedCalibration = useMemo<DifficultyGapCalibration | null>(() => {
    if (!gapSetting.enabled) return null
    const lower = parseFinite(gapSetting.lower)
    const upper = parseFinite(gapSetting.upper)
    const multiplier = parseFinite(gapSetting.multiplier)
    if (lower === null || upper === null || multiplier === null) return null
    return { lower, upper, multiplier }
  }, [gapSetting])
  const calibration = isValidGapCalibration(requestedCalibration) ? requestedCalibration : null
  const calibrationInvalid = gapSetting.enabled && !calibration

  const fitPoints = useMemo(
    () => plottedSamples.map((sample) => ({
      x: sample.position,
      y: applyDifficultyGapCalibration(sample.reading.value, calibration),
    })),
    [calibration, plottedSamples],
  )
  const automaticFit = useMemo(() => linearRegression(fitPoints), [fitPoints])
  const manualSlopeEnabled = manualSlopeDimensions.has(dimensionId)
  const manualSlope = parseFinite(manualSlopes[dimensionId] ?? '')
  const fit = useMemo(
    () => manualSlopeEnabled && manualSlope !== null
      ? linearRegressionWithSlope(fitPoints, manualSlope)
      : automaticFit,
    [automaticFit, fitPoints, manualSlope, manualSlopeEnabled],
  )

  const xExtent = useMemo(() => {
    if (plottedSamples.length === 0) return null
    const positions = plottedSamples.map((sample) => sample.position)
    return { min: Math.min(...positions), max: Math.max(...positions) }
  }, [plottedSamples])

  const targetPosition = useMemo(() => {
    if (!xExtent) return null
    if (targetMode === 'absolute') return parseFinite(absoluteTarget)
    const offset = parseFinite(targetOffset)
    if (offset === null) return null
    return (targetMode === 'lowest' ? xExtent.min : xExtent.max) + offset
  }, [absoluteTarget, targetMode, targetOffset, xExtent])

  const calibratedPrediction = fit && targetPosition !== null ? fit.predict(targetPosition) : null
  const prediction = calibratedPrediction === null
    ? null
    : removeDifficultyGapCalibration(calibratedPrediction, calibration)
  const nearestRounds = useMemo(
    () => prediction === null
      ? []
      : findNearestKnownRounds(tournaments, dimensionId, prediction, selectedKeys, 5),
    [dimensionId, prediction, selectedKeys],
  )

  const sortedTournaments = useMemo(
    () => [...tournaments].sort((a, b) =>
      b.year - a.year || a.abbreviation.localeCompare(b.abbreviation)
    ),
    [],
  )
  const addTournament = tournamentById.get(addTournamentId)
  const addRounds = addTournament
    ? [...addTournament.rounds].sort((a, b) => a.order - b.order)
    : []
  const addRound = addRounds.find((round) => round.id === addRoundId)
  const addKey = addTournament && addRound ? roundKey(addTournament.id, addRound.id) : ''
  const addKnownPosition = addKey ? positionMap.get(addKey) : undefined
  const addReading = addRound ? getRoundDifficulty(addRound, dimensionId) : null

  useEffect(() => {
    if (addKnownPosition !== undefined) setAddPosition(String(addKnownPosition))
    else setAddPosition('')
  }, [addKnownPosition, addRoundId])

  const toggleSample = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addSample = () => {
    if (!addTournament || !addRound || !addKey || !addReading) return
    const position = parseFinite(addPosition)
    if (position === null) return
    setSelectedKeys((current) => new Set(current).add(addKey))
    if (addKnownPosition === undefined) {
      setPositionOverrides((current) => ({ ...current, [addKey]: addPosition }))
    }
    setAddRoundId('')
    setAddPosition('')
  }

  const removeExtra = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
    setPositionOverrides((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const updateGapSetting = (patch: Partial<GapSetting>) => {
    setGapSettings((current) => ({
      ...current,
      [dimensionId]: { ...current[dimensionId], ...patch },
    }))
  }

  const toggleManualSlope = () => {
    setManualSlopeDimensions((current) => {
      const next = new Set(current)
      if (next.has(dimensionId)) next.delete(dimensionId)
      else next.add(dimensionId)
      return next
    })
    if (!manualSlopeEnabled && automaticFit) {
      setManualSlopes((current) => ({
        ...current,
        [dimensionId]: automaticFit.slope.toFixed(3),
      }))
    }
  }

  const unknownChosen = chosenSamples.length - plottedSamples.length
  const extrapolating = targetPosition !== null && xExtent
    ? targetPosition < xExtent.min || targetPosition > xExtent.max
    : false
  const manualSlopeValue = manualSlope ?? automaticFit?.slope ?? 0
  const manualSlopeMax = Math.max(Math.abs(automaticFit?.slope ?? 0) * 2.5, 0.25)

  return (
    <div className="space-y-5">
      <section className="border-b border-gray-200 dark:border-neutral-800 pb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          {t('difficultyFit.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          {t('difficultyFit.subtitle')}
        </p>
      </section>

      <section>
        <div className="text-xs font-medium text-gray-500 dark:text-neutral-400 mb-2">
          {t('difficultyFit.dimension')}
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-md bg-gray-100 dark:bg-neutral-800 p-1">
          {DIFFICULTY_DIMENSIONS.map((dimension) => (
            <button
              key={dimension.id}
              type="button"
              onClick={() => setDimensionId(dimension.id)}
              className={`min-h-9 px-3 rounded text-xs font-medium transition-colors ${
                dimensionId === dimension.id
                  ? 'bg-white dark:bg-neutral-700 text-purple-700 dark:text-purple-200 shadow-sm'
                  : 'text-gray-600 dark:text-neutral-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t(DIMENSION_LABEL_KEYS[dimension.id])}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-gray-200 dark:border-neutral-800 rounded-md p-3">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-gray-800 dark:text-neutral-200">
                {t('difficultyFit.gap.title')}
              </span>
              <span className="block mt-0.5 text-[11px] text-gray-500 dark:text-neutral-400">
                {t('difficultyFit.gap.summary')}
              </span>
            </span>
            <input
              type="checkbox"
              checked={gapSetting.enabled}
              onChange={(event) => updateGapSetting({ enabled: event.target.checked })}
              className="h-4 w-4 accent-purple-600"
            />
          </label>
          {gapSetting.enabled && (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_minmax(90px,1.2fr)] gap-2 items-end">
              <label className="min-w-0">
                <span className="block text-[10px] text-gray-400 dark:text-neutral-500 mb-1">
                  {t('difficultyFit.gap.lower')}
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={gapSetting.lower}
                  onChange={(event) => updateGapSetting({ lower: event.target.value })}
                  className="w-full px-2 py-1.5 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                />
              </label>
              <span className="pb-1.5 text-center text-gray-400">→</span>
              <label className="min-w-0">
                <span className="block text-[10px] text-gray-400 dark:text-neutral-500 mb-1">
                  {t('difficultyFit.gap.upper')}
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={gapSetting.upper}
                  onChange={(event) => updateGapSetting({ upper: event.target.value })}
                  className="w-full px-2 py-1.5 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                />
              </label>
              <label className="min-w-0">
                <span className="block text-[10px] text-gray-400 dark:text-neutral-500 mb-1">
                  {t('difficultyFit.gap.multiplier')}
                </span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={gapSetting.multiplier}
                  onChange={(event) => updateGapSetting({ multiplier: event.target.value })}
                  className="w-full px-2 py-1.5 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                />
              </label>
            </div>
          )}
          {calibrationInvalid && (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
              {t('difficultyFit.gap.invalid')}
            </p>
          )}
        </div>

        <div className="border border-gray-200 dark:border-neutral-800 rounded-md p-3">
          <label className={`flex items-center justify-between gap-3 ${automaticFit ? 'cursor-pointer' : 'opacity-50'}`}>
            <span>
              <span className="block text-sm font-medium text-gray-800 dark:text-neutral-200">
                {t('difficultyFit.manualSlope.title')}
              </span>
              <span className="block mt-0.5 text-[11px] text-gray-500 dark:text-neutral-400">
                {t('difficultyFit.manualSlope.summary')}
              </span>
            </span>
            <input
              type="checkbox"
              checked={manualSlopeEnabled}
              disabled={!automaticFit}
              onChange={toggleManualSlope}
              className="h-4 w-4 accent-purple-600"
            />
          </label>
          {manualSlopeEnabled && automaticFit && (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_90px] gap-3 items-center">
              <input
                type="range"
                min="0"
                max={manualSlopeMax}
                step={manualSlopeMax / 200}
                value={Math.min(Math.max(manualSlopeValue, 0), manualSlopeMax)}
                onChange={(event) => setManualSlopes((current) => ({
                  ...current,
                  [dimensionId]: event.target.value,
                }))}
                aria-label={t('difficultyFit.manualSlope.value')}
                className="w-full accent-purple-600"
              />
              <input
                type="number"
                step="0.001"
                value={manualSlopes[dimensionId] ?? ''}
                onChange={(event) => setManualSlopes((current) => ({
                  ...current,
                  [dimensionId]: event.target.value,
                }))}
                aria-label={t('difficultyFit.manualSlope.value')}
                className="w-full px-2 py-1.5 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
              />
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-6">
        <div className="space-y-5">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-200">
                {t('difficultyFit.ladderSamples')}
              </h3>
              <span className="text-xs tabular-nums text-gray-400 dark:text-neutral-500">
                {t('difficultyFit.usedCount', { n: plottedSamples.length })}
              </span>
            </div>
            <div className="max-h-[360px] overflow-y-auto border border-gray-200 dark:border-neutral-800 rounded-md divide-y divide-gray-100 dark:divide-neutral-800">
              {ladderSamples.map((sample) => {
                const reading = getRoundDifficulty(sample.round, dimensionId)
                const selected = selectedKeys.has(sample.key)
                return (
                  <label
                    key={sample.key}
                    className={`grid grid-cols-[20px_minmax(0,1fr)_auto] gap-2 items-center px-3 py-2 ${
                      reading ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800/50' : 'opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected && !!reading}
                      disabled={!reading}
                      onChange={() => toggleSample(sample.key)}
                      className="accent-purple-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-gray-800 dark:text-neutral-200">
                        {getRoundLabel(sample.tournament, sample.round)}
                      </span>
                      <span className="block text-[10px] text-gray-400 dark:text-neutral-500">
                        {t('difficultyFit.positionValue', { value: sample.position?.toFixed(1) ?? '?' })}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-gray-600 dark:text-neutral-300">
                      {reading ? reading.value.toFixed(2) : t('difficultyFit.unknown')}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          {extraSamples.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-200 mb-2">
                {t('difficultyFit.extraSamples')}
              </h3>
              <div className="border border-gray-200 dark:border-neutral-800 rounded-md divide-y divide-gray-100 dark:divide-neutral-800">
                {extraSamples.map((sample) => {
                  const reading = getRoundDifficulty(sample.round, dimensionId)
                  return (
                    <div key={sample.key} className="grid grid-cols-[minmax(0,1fr)_82px_28px] gap-2 items-center px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-gray-800 dark:text-neutral-200">
                          {getRoundLabel(sample.tournament, sample.round)}
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-neutral-500">
                          {reading ? reading.value.toFixed(2) : t('difficultyFit.unknown')}
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        value={positionOverrides[sample.key] ?? ''}
                        onChange={(event) => setPositionOverrides((current) => ({
                          ...current,
                          [sample.key]: event.target.value,
                        }))}
                        aria-label={t('difficultyFit.position')}
                        className="w-full px-2 py-1.5 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => removeExtra(sample.key)}
                        title={t('difficultyFit.remove')}
                        aria-label={t('difficultyFit.remove')}
                        className="w-7 h-7 text-gray-400 hover:text-red-600 dark:hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-200 mb-2">
              {t('difficultyFit.addSample')}
            </h3>
            <div className="space-y-2">
              <select
                value={addTournamentId}
                onChange={(event) => {
                  setAddTournamentId(event.target.value)
                  setAddRoundId('')
                }}
                className="w-full px-2 py-2 text-xs border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
              >
                <option value="">{t('difficultyFit.pickTournament')}</option>
                {sortedTournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.abbreviation} ({tournament.year})
                  </option>
                ))}
              </select>
              <select
                value={addRoundId}
                disabled={!addTournament}
                onChange={(event) => setAddRoundId(event.target.value)}
                className="w-full px-2 py-2 text-xs border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 disabled:opacity-50"
              >
                <option value="">{t('difficultyFit.pickRound')}</option>
                {addRounds.map((round) => {
                  const reading = getRoundDifficulty(round, dimensionId)
                  return (
                    <option key={round.id} value={round.id}>
                      {round.abbreviation || round.name} · {reading ? reading.value.toFixed(2) : t('difficultyFit.unknown')}
                    </option>
                  )
                })}
              </select>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <label className="min-w-0">
                  <span className="sr-only">{t('difficultyFit.position')}</span>
                  <input
                    type="number"
                    step="0.1"
                    value={addPosition}
                    disabled={!addRound || addKnownPosition !== undefined}
                    onChange={(event) => setAddPosition(event.target.value)}
                    placeholder={t('difficultyFit.positionPlaceholder')}
                    className="w-full px-2 py-2 text-xs border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 disabled:bg-gray-50 dark:disabled:bg-neutral-800 disabled:text-gray-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={addSample}
                  disabled={!addReading || parseFinite(addPosition) === null || selectedKeys.has(addKey)}
                  className="px-4 py-2 text-xs font-medium rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('difficultyFit.add')}
                </button>
              </div>
              {addRound && !addReading && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('difficultyFit.noDifficulty')}
                </p>
              )}
              {addRound && addReading && addKnownPosition === undefined && (
                <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                  {t('difficultyFit.manualPositionHint')}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          <FitChart
            points={plottedSamples.map((sample) => ({
              x: sample.position,
              y: applyDifficultyGapCalibration(sample.reading.value, calibration),
              rawY: sample.reading.value,
              label: getRoundLabel(sample.tournament, sample.round),
            }))}
            fit={fit}
            targetPosition={targetPosition}
            prediction={calibratedPrediction}
            displayPrediction={prediction}
            calibrated={!!calibration}
          />

          <section className="border-t border-gray-200 dark:border-neutral-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-200 mb-3">
              {t('difficultyFit.predictTitle')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)_110px] gap-2">
              <select
                value={targetMode}
                onChange={(event) => setTargetMode(event.target.value as TargetMode)}
                className="px-2 py-2 text-xs border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
              >
                <option value="lowest">{t('difficultyFit.target.lowest')}</option>
                <option value="highest">{t('difficultyFit.target.highest')}</option>
                <option value="absolute">{t('difficultyFit.target.absolute')}</option>
              </select>
              {targetMode === 'absolute' ? (
                <input
                  type="number"
                  step="0.1"
                  value={absoluteTarget}
                  onChange={(event) => setAbsoluteTarget(event.target.value)}
                  aria-label={t('difficultyFit.targetPosition')}
                  className="px-2 py-2 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                />
              ) : (
                <input
                  type="number"
                  step="0.1"
                  value={targetOffset}
                  onChange={(event) => setTargetOffset(event.target.value)}
                  aria-label={t('difficultyFit.offset')}
                  className="px-2 py-2 text-xs tabular-nums border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                />
              )}
              <div className="flex items-center justify-end px-2 text-xs tabular-nums text-gray-500 dark:text-neutral-400">
                {t('difficultyFit.targetPositionShort', { value: targetPosition?.toFixed(2) ?? '?' })}
              </div>
            </div>

            {fit && prediction !== null ? (
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3 border-y border-gray-100 dark:border-neutral-800 py-4">
                <Metric label={t('difficultyFit.prediction')} value={prediction.toFixed(2)} primary />
                <Metric
                  label={t(calibration ? 'difficultyFit.slopeCalibrated' : 'difficultyFit.slope')}
                  value={fit.slope.toFixed(3)}
                />
                <Metric label="R²" value={fit.rSquared.toFixed(3)} />
                <Metric
                  label={t(calibration ? 'difficultyFit.rmseCalibrated' : 'difficultyFit.rmse')}
                  value={`±${fit.rmse.toFixed(2)}`}
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">
                {t('difficultyFit.needSamples')}
              </p>
            )}

            <div className="mt-3 space-y-1 text-xs">
              {unknownChosen > 0 && (
                <p className="text-amber-700 dark:text-amber-300">
                  {t('difficultyFit.unknownExcluded', { n: unknownChosen })}
                </p>
              )}
              {fit && fit.sampleCount < 3 && (
                <p className="text-amber-700 dark:text-amber-300">{t('difficultyFit.twoPointWarning')}</p>
              )}
              {extrapolating && (
                <p className="text-amber-700 dark:text-amber-300">{t('difficultyFit.extrapolationWarning')}</p>
              )}
              {fit && (
                <p className="text-gray-500 dark:text-neutral-400">
                  {t(calibration ? 'difficultyFit.formulaCalibrated' : 'difficultyFit.formula', {
                    slope: fit.slope.toFixed(3),
                    intercept: fit.intercept.toFixed(3),
                  })}
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-200 mb-2">
              {t('difficultyFit.nearestTitle')}
            </h3>
            {nearestRounds.length > 0 ? (
              <div className="border border-gray-200 dark:border-neutral-800 rounded-md divide-y divide-gray-100 dark:divide-neutral-800">
                {nearestRounds.map((item) => (
                  <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-800 dark:text-neutral-200">
                        {getRoundLabel(item.tournament, item.round)}
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-neutral-500">
                        {item.reading.source === 'typeDifficulty'
                          ? t('difficultyFit.source.explicit')
                          : t('difficultyFit.source.maps', { n: item.reading.sampleCount })}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-sm font-medium text-gray-800 dark:text-neutral-200">
                        {item.reading.value.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-neutral-500">
                        {t('difficultyFit.difference', { value: item.difference.toFixed(2) })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {t('difficultyFit.nearestEmpty')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 dark:text-neutral-500">{label}</div>
      <div className={`mt-0.5 tabular-nums ${
        primary
          ? 'text-xl font-semibold text-purple-700 dark:text-purple-200'
          : 'text-sm font-medium text-gray-800 dark:text-neutral-200'
      }`}>
        {value}
      </div>
    </div>
  )
}

function FitChart({
  points,
  fit,
  targetPosition,
  prediction,
  displayPrediction,
  calibrated,
}: {
  points: Array<FitPoint & { label: string; rawY: number }>
  fit: ReturnType<typeof linearRegression>
  targetPosition: number | null
  prediction: number | null
  displayPrediction: number | null
  calibrated: boolean
}) {
  const t = useT()
  const width = 760
  const height = 390
  const margin = { top: 24, right: 24, bottom: 48, left: 58 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom

  if (points.length === 0) {
    return (
      <div className="aspect-[760/390] min-h-[260px] flex items-center justify-center border border-dashed border-gray-300 dark:border-neutral-700 rounded-md text-sm text-gray-400 dark:text-neutral-500">
        {t('difficultyFit.chartEmpty')}
      </div>
    )
  }

  const allX = [...points.map((point) => point.x)]
  if (targetPosition !== null) allX.push(targetPosition)
  let minX = Math.min(...allX)
  let maxX = Math.max(...allX)
  if (minX === maxX) {
    minX -= 1
    maxX += 1
  }
  const xPad = Math.max((maxX - minX) * 0.08, 0.25)
  minX -= xPad
  maxX += xPad

  const lineStart = fit?.predict(minX)
  const lineEnd = fit?.predict(maxX)
  const allY = [
    ...points.map((point) => point.y),
    ...(prediction === null ? [] : [prediction]),
    ...(lineStart === undefined || lineEnd === undefined ? [] : [lineStart, lineEnd]),
  ]
  let minY = Math.min(...allY)
  let maxY = Math.max(...allY)
  if (minY === maxY) {
    minY -= 0.5
    maxY += 0.5
  }
  const yPad = Math.max((maxY - minY) * 0.12, 0.25)
  minY = Math.max(0, minY - yPad)
  maxY += yPad

  const sx = (value: number) => margin.left + ((value - minX) / (maxX - minX)) * plotWidth
  const sy = (value: number) => margin.top + (1 - (value - minY) / (maxY - minY)) * plotHeight
  const ticks = Array.from({ length: 6 }, (_, index) => index / 5)

  return (
    <div className="overflow-hidden border border-gray-200 dark:border-neutral-800 rounded-md bg-white dark:bg-neutral-950">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t('difficultyFit.chartAria')}
        className="block w-full aspect-[760/390] min-h-[260px]"
      >
        <rect width={width} height={height} className="fill-white dark:fill-neutral-950" />
        {ticks.map((ratio) => {
          const xValue = minX + (maxX - minX) * ratio
          const yValue = minY + (maxY - minY) * ratio
          return (
            <g key={ratio}>
              <line x1={sx(xValue)} y1={margin.top} x2={sx(xValue)} y2={height - margin.bottom} className="stroke-gray-100 dark:stroke-neutral-800" />
              <line x1={margin.left} y1={sy(yValue)} x2={width - margin.right} y2={sy(yValue)} className="stroke-gray-100 dark:stroke-neutral-800" />
              <text x={sx(xValue)} y={height - margin.bottom + 20} textAnchor="middle" className="fill-gray-400 dark:fill-neutral-500 text-[11px]">
                {xValue.toFixed(1)}
              </text>
              <text x={margin.left - 10} y={sy(yValue) + 4} textAnchor="end" className="fill-gray-400 dark:fill-neutral-500 text-[11px]">
                {yValue.toFixed(1)}
              </text>
            </g>
          )
        })}
        <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="stroke-gray-300 dark:stroke-neutral-600" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} className="stroke-gray-300 dark:stroke-neutral-600" />

        {fit && lineStart !== undefined && lineEnd !== undefined && (
          <line
            x1={sx(minX)}
            y1={sy(lineStart)}
            x2={sx(maxX)}
            y2={sy(lineEnd)}
            className="stroke-purple-600 dark:stroke-purple-300"
            strokeWidth="2.5"
          />
        )}

        {points.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={sx(point.x)} cy={sy(point.y)} r="5" className="fill-teal-600 dark:fill-teal-300 stroke-white dark:stroke-neutral-950" strokeWidth="2" />
            <title>{calibrated
              ? `${point.label}: (${point.x.toFixed(2)}, ${point.rawY.toFixed(2)} → ${point.y.toFixed(2)})`
              : `${point.label}: (${point.x.toFixed(2)}, ${point.rawY.toFixed(2)})`}
            </title>
          </g>
        ))}

        {targetPosition !== null && prediction !== null && (
          <g>
            <line x1={sx(targetPosition)} y1={margin.top} x2={sx(targetPosition)} y2={height - margin.bottom} className="stroke-rose-400" strokeDasharray="5 5" />
            <circle cx={sx(targetPosition)} cy={sy(prediction)} r="7" className="fill-rose-500 stroke-white dark:stroke-neutral-950" strokeWidth="2" />
            <text x={sx(targetPosition)} y={Math.max(margin.top + 12, sy(prediction) - 12)} textAnchor="middle" className="fill-rose-600 dark:fill-rose-300 text-[12px] font-semibold">
              {(displayPrediction ?? prediction).toFixed(2)}
            </text>
          </g>
        )}

        <text x={margin.left + plotWidth / 2} y={height - 10} textAnchor="middle" className="fill-gray-500 dark:fill-neutral-400 text-[12px]">
          {t('difficultyFit.axisPosition')}
        </text>
        <text transform={`translate(16 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-gray-500 dark:fill-neutral-400 text-[12px]">
          {t(calibrated ? 'difficultyFit.axisCalibratedDifficulty' : 'difficultyFit.axisDifficulty')}
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-2 border-t border-gray-100 dark:border-neutral-800 text-[11px] text-gray-500 dark:text-neutral-400">
        <span><span className="inline-block w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-300 mr-1" />{t('difficultyFit.legendSample')}</span>
        <span><span className="inline-block w-4 h-0.5 bg-purple-600 dark:bg-purple-300 align-middle mr-1" />{t('difficultyFit.legendFit')}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1" />{t('difficultyFit.legendPrediction')}</span>
      </div>
    </div>
  )
}
