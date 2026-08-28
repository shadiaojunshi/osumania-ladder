'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Tournament, Round } from '@/lib/types'
import { RoundEditor, type RoundWithMeta } from './RoundEditor'
import type { MapCategory, ExtendedMap } from './MapSlotEditor'
import { BulkImporter } from './BulkImporter'
import { useT, type MessageKey } from '@/lib/i18n'
import { useMapHistory } from '@/hooks/useMapHistory'
import { tournaments as allKnownTournaments } from '@/generated/tournaments'
import { normalizeRealType } from '@/lib/realType'

interface Props {
  onUpdate: (tournament: Tournament | null) => void
  initialData?: Tournament | null
  saveSignal?: number
  // 向上冒泡"有未保存修改",供 admin 页在切换其他栏时拦截提示
  onDirtyChange?: (dirty: boolean) => void
}

const EMPTY_TOURNAMENT: Tournament = {
  id: '',
  name: '',
  abbreviation: '',
  keyCount: 4,
  year: new Date().getFullYear(),
  tags: [],
  rounds: [],
  customTypes: [],
}

const TOURNAMENT_DRAFT_VERSION = 1
type TournamentDraft = {
  version: number
  mode: 'create' | 'edit'
  tournamentId: string
  savedAt: number
  tournament: Tournament
  rounds: RoundWithMeta[]
  step: number
}

export function TournamentForm({ onUpdate, initialData, saveSignal, onDirtyChange }: Props) {
  const t = useT()
  const [step, setStep] = useState(0)
  const [tournament, setTournament] = useState<Tournament>(EMPTY_TOURNAMENT)
  const [rounds, setRounds] = useState<RoundWithMeta[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const checkedDraftKeys = useRef(new Set<string>())
  const skipDraftCleanupSave = useRef(false)
  const draftKey = `osumania-ladder:tournament-draft:v${TOURNAMENT_DRAFT_VERSION}:${initialData ? `edit:${initialData.id}` : 'create'}`

  // dirty 变化时向上通知(用于跨栏切换拦截)
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  // 构建谱面历史索引：直接用编译期打进 bundle 的全量 tournaments
  // （/api/tournaments 只返回 {id, sha}[] 清单，没有 rounds，不能用来建索引）
  // During a new tournament entry, use the typed ID as the exclusion key too.
  // Otherwise an existing tournament with the same ID can shadow a same-set
  // conflict and prevent the set fallback from running.
  const { getMapHistory } = useMapHistory(allKnownTournaments, initialData?.id || tournament.id || undefined)

  useEffect(() => {
    const baseTournament = initialData || EMPTY_TOURNAMENT
    const baseRounds = initialData ? initialData.rounds.map(roundToMeta) : []
    const baseStep = initialData ? 1 : 0
    setTournament(baseTournament)
    setRounds(baseRounds)
    setStep(baseStep)
    setIsDirty(false)

    // Drafts are deliberately scoped by mode and tournament ID. This keeps a
    // half-finished new tournament from replacing an edit draft (and vice versa).
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      if (checkedDraftKeys.current.has(draftKey)) return
      checkedDraftKeys.current.add(draftKey)
      const draft = JSON.parse(raw) as Partial<TournamentDraft>
      const valid = draft.version === TOURNAMENT_DRAFT_VERSION
        && draft.mode === (initialData ? 'edit' : 'create')
        && Array.isArray(draft.rounds)
        && !!draft.tournament
        && (!initialData || draft.tournamentId === initialData.id)
      if (!valid) return
      const savedAt = Number(draft.savedAt)
      const when = Number.isFinite(savedAt) ? new Date(savedAt).toLocaleString() : ''
      if (!window.confirm(t('form.draft.restore', { time: when }))) {
        window.localStorage.removeItem(draftKey)
        return
      }
      setTournament(draft.tournament as Tournament)
      setRounds(draft.rounds as RoundWithMeta[])
      setStep(Number.isFinite(Number(draft.step)) ? Number(draft.step) : baseStep)
      setIsDirty(true)
    } catch {
      try { window.localStorage.removeItem(draftKey) } catch { /* storage may be disabled */ }
    }
  }, [initialData, draftKey, t])

  // 远端提交或本地暂存成功后清除 dirty 标志。
  useEffect(() => {
    if (saveSignal) {
      skipDraftCleanupSave.current = true
      setIsDirty(false)
      try { window.localStorage.removeItem(draftKey) } catch { /* storage may be disabled */ }
    }
  }, [saveSignal, draftKey])

  // Persist edits locally with a short debounce and a periodic safety write.
  // localStorage survives an Edge crash/restart, unlike React state or sessionStorage.
  useEffect(() => {
    if (!isDirty) {
      skipDraftCleanupSave.current = false
      return
    }
    skipDraftCleanupSave.current = false
    const saveDraft = () => {
      const draft: TournamentDraft = {
        version: TOURNAMENT_DRAFT_VERSION,
        mode: initialData ? 'edit' : 'create',
        tournamentId: tournament.id || initialData?.id || '',
        savedAt: Date.now(),
        tournament,
        rounds,
        step,
      }
      try { window.localStorage.setItem(draftKey, JSON.stringify(draft)) } catch { /* quota/private mode */ }
    }
    const debounce = window.setTimeout(saveDraft, 800)
    const interval = window.setInterval(saveDraft, 60_000)
    return () => {
      if (!skipDraftCleanupSave.current) saveDraft()
      window.clearTimeout(debounce)
      window.clearInterval(interval)
    }
  }, [draftKey, initialData, isDirty, rounds, step, tournament])

  useEffect(() => {
    const outputRounds = rounds.map(roundWithMetaToOutput)
    const t = { ...tournament, rounds: outputRounds }
    if (t.id && outputRounds.length > 0) {
      onUpdate(t)
    } else {
      onUpdate(null)
    }
  }, [tournament, rounds, onUpdate])

  // 关闭/刷新前提示未保存的修改
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = '您做出的改动可能未保存'
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const updateField = useCallback(<K extends keyof Tournament>(key: K, value: Tournament[K]) => {
    setTournament((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }, [])

  const updateRoundsWithDirty = useCallback((newRounds: RoundWithMeta[]) => {
    setRounds(newRounds)
    setIsDirty(true)
  }, [])

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm flex flex-col max-h-[calc(100vh-180px)]">
      <div className="border-b border-gray-200 dark:border-neutral-800 px-4 py-3 shrink-0">
        <StepIndicator current={step} />
      </div>

      <div className="p-4 overflow-y-auto flex-1">
        <details className="mb-4 border border-gray-200 dark:border-neutral-800 rounded-md bg-gray-50/70 dark:bg-neutral-900/60">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200">
            {t('form.typeGuide.title')}
          </summary>
          <div className="border-t border-gray-200 dark:border-neutral-800 px-3 py-3 text-xs leading-5 whitespace-pre-line text-gray-500 dark:text-neutral-400">
            {t('form.typeGuide.placeholder')}
          </div>
        </details>
        {step === 0 && (
          <BasicInfoStep
            tournament={tournament}
            updateField={updateField}
            onNext={() => setStep(1)}
            isEditing={!!initialData}
          />
        )}
        {step === 1 && (
          <RoundsStep
            rounds={rounds}
            onUpdate={updateRoundsWithDirty}
            onBack={() => setStep(0)}
            getMapHistory={getMapHistory}
            editingTournamentId={initialData?.id}
            enableEstimation={!!initialData}
          />
        )}
      </div>
    </div>
  )
}

function distributeDiffsForType<F extends 'difficulty' | 'difficultyLn'>(
  maps: { type: string; difficulty?: number; difficultyLn?: number }[],
  min: number,
  max: number,
  avg: number,
  field: F,
) {
  if (maps.length === 0) return
  const eligible = maps.filter((m) => !m[field] || m[field] === 0)
  if (eligible.length === 0) return
  const allEligible = eligible.length === maps.length

  if (allEligible && eligible.length >= 2 && min > 0 && max > 0) {
    eligible.forEach((m, i) => {
      ;(m as Record<F, number>)[field] = +(min + (max - min) * (i / (eligible.length - 1))).toFixed(2)
    })
  } else if (avg > 0) {
    eligible.forEach((m) => { (m as Record<F, number>)[field] = avg })
  } else if (min > 0 && max > 0) {
    const mid = +((min + max) / 2).toFixed(2)
    eligible.forEach((m) => { (m as Record<F, number>)[field] = mid })
  }
}

function roundWithMetaToOutput(r: RoundWithMeta): Round {
  const { _maps, _typeDiffs, _typeDiffsLocked, _diffMode, _mapDifficultiesCleared, ...rest } = r

  const maps = _maps.map((m) => {
    const { category, ...mapRest } = m
    return { ...mapRest, realType: normalizeRealType(mapRest.realType) }
  })

  if (!_mapDifficultiesCleared) {
    distributeDiffsForType(maps.filter((m) => m.type === 'RC'), _typeDiffs.rcMin, _typeDiffs.rcMax, _typeDiffs.rc, 'difficulty')
    distributeDiffsForType(maps.filter((m) => m.type === 'LN'), _typeDiffs.lnMin, _typeDiffs.lnMax, _typeDiffs.ln, 'difficulty')
    distributeDiffsForType(maps.filter((m) => m.type === 'HB'), _typeDiffs.hbMin, _typeDiffs.hbMax, _typeDiffs.hbLn, 'difficultyLn')
    distributeDiffsForType(maps.filter((m) => m.type === 'HB'), 0, 0, _typeDiffs.hbRf, 'difficulty')
    distributeDiffsForType(maps.filter((m) => m.type === 'SV'), _typeDiffs.svMin, _typeDiffs.svMax, _typeDiffs.sv, 'difficulty')
    // TB 双字段:rf 走 difficulty 用 tbMin/tbMax,ln 走 difficultyLn 用 tbLnMin/tbLnMax。
    // 纯米 TB 不填 ln(=0),纯长 TB 不填 rf(=0),distributeDiffsForType 在 avg/min/max 全 0
    // 时不会动 map 上的字段,自然就让计算路径忽略掉那一面。
    distributeDiffsForType(maps.filter((m) => m.type === 'TB'), _typeDiffs.tbMin, _typeDiffs.tbMax, _typeDiffs.tbRf, 'difficulty')
    distributeDiffsForType(maps.filter((m) => m.type === 'TB'), _typeDiffs.tbLnMin, _typeDiffs.tbLnMax, _typeDiffs.tbLn, 'difficultyLn')
  }

  const nonTbDiffs = maps
    .filter((m) => m.type !== 'TB')
    .flatMap((m) => [m.difficulty, m.difficultyLn].filter((d): d is number => !!d && d > 0))

  let min: number, max: number, average: number

  if (_diffMode === 'summary') {
    const userMins = [_typeDiffs.rcMin, _typeDiffs.hbMin, _typeDiffs.lnMin, _typeDiffs.svMin].filter((v) => v > 0)
    const userMaxes = [_typeDiffs.rcMax, _typeDiffs.hbMax, _typeDiffs.lnMax, _typeDiffs.svMax].filter((v) => v > 0)
    const userAvgs = [_typeDiffs.rc, _typeDiffs.hbLn, _typeDiffs.ln, _typeDiffs.sv].filter((v) => v > 0)
    min = userMins.length > 0 ? Math.min(...userMins) : (nonTbDiffs.length > 0 ? Math.min(...nonTbDiffs) : 0)
    max = userMaxes.length > 0 ? Math.max(...userMaxes) : (nonTbDiffs.length > 0 ? Math.max(...nonTbDiffs) : 0)
    average = userAvgs.length > 0 ? +(userAvgs.reduce((s, v) => s + v, 0) / userAvgs.length).toFixed(2) : 0
  } else {
    min = nonTbDiffs.length > 0 ? Math.min(...nonTbDiffs) : 0
    max = nonTbDiffs.length > 0 ? Math.max(...nonTbDiffs) : 0
    average = nonTbDiffs.length > 0 ? +(nonTbDiffs.reduce((s, d) => s + d, 0) / nonTbDiffs.length).toFixed(2) : 0
  }

  return {
    ...rest,
    // A deliberate round-wide clear is meant to remove map fields while
    // retaining the stored round-level difficulty summary.
    difficulty: _mapDifficultiesCleared ? rest.difficulty : { min, max, average },
    maps,
    typeDifficulties: {
      RC: { rf: _typeDiffs.rc || undefined },
      HB: { rf: _typeDiffs.hbRf || undefined, ln: _typeDiffs.hbLn || undefined },
      LN: { ln: _typeDiffs.ln || undefined },
      SV: { rf: _typeDiffs.sv || undefined },
      TB: { rf: _typeDiffs.tbRf || undefined, ln: _typeDiffs.tbLn || undefined },
    },
  }
}

function roundToMeta(r: Round): RoundWithMeta {
  const STANDARD_CATEGORIES = ['RC', 'LN', 'HB', 'SV', 'TB']
  const maps: ExtendedMap[] = r.maps.map((m) => {
    let category: MapCategory
    if (STANDARD_CATEGORIES.includes(m.type)) {
      category = m.type as MapCategory
    } else {
      category = 'SPECIAL'
    }
    return { ...m, category }
  })
  const td = r.typeDifficulties || {}
  return {
    ...r,
    _maps: maps,
    _typeDiffs: {
      rc: td.RC?.rf || 0, rcMin: 0, rcMax: 0,
      hbRf: td.HB?.rf || 0, hbLn: td.HB?.ln || 0, hbMin: 0, hbMax: 0, hbLnMin: 0, hbLnMax: 0,
      ln: td.LN?.ln || 0, lnMin: 0, lnMax: 0,
      sv: td.SV?.rf || 0, svMin: 0, svMax: 0,
      tbRf: td.TB?.rf || 0, tbLn: td.TB?.ln || 0, tbMin: 0, tbMax: 0, tbLnMin: 0, tbLnMax: 0,
    },
    _typeDiffsLocked: {
      rc: !!(td.RC?.rf),
      hbRf: !!(td.HB?.rf),
      hbLn: !!(td.HB?.ln),
      ln: !!(td.LN?.ln),
      sv: !!(td.SV?.rf),
      tbRf: !!(td.TB?.rf),
      tbLn: !!(td.TB?.ln),
    },
    _diffMode: 'summary' as const,
  }
}

function StepIndicator({ current }: { current: number }) {
  const t = useT()
  const steps: MessageKey[] = ['form.step.basic', 'form.step.rounds']
  return (
    <div className="flex items-center gap-2">
      {steps.map((labelKey, i) => (
        <div key={labelKey} className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= current ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-neutral-700 dark:text-neutral-400'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm ${i <= current ? 'text-gray-900 dark:text-neutral-100' : 'text-gray-400 dark:text-neutral-500'}`}>
            {t(labelKey)}
          </span>
          {i < steps.length - 1 && <div className="w-8 h-px bg-gray-300 dark:bg-neutral-600" />}
        </div>
      ))}
    </div>
  )
}

function BasicInfoStep({
  tournament,
  updateField,
  onNext,
  isEditing,
}: {
  tournament: Tournament
  updateField: <K extends keyof Tournament>(key: K, value: Tournament[K]) => void
  onNext: () => void
  isEditing: boolean
}) {
  const t = useT()
  const canProceed = tournament.name.trim() && tournament.abbreviation.trim()

  const autoId = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.name')}</label>
        <input
          type="text"
          value={tournament.name}
          onChange={(e) => {
            updateField('name', e.target.value)
            if (!tournament.id || tournament.id === autoId(tournament.name)) {
              updateField('id', autoId(e.target.value))
            }
          }}
          placeholder={t('form.placeholder.name')}
          className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.abbr')}</label>
          <input
            type="text"
            value={tournament.abbreviation}
            onChange={(e) => {
              const abbr = e.target.value
              updateField('abbreviation', abbr)
              // 自动设 priority:MWC(非NMWC)→5, MCNC/VNMC/MCLC→3
              if (/\bMWC\b/i.test(abbr) && !/NMWC/i.test(abbr)) {
                if (tournament.priority === undefined || tournament.priority === 0) {
                  updateField('priority', 5)
                }
              } else if (/\b(MCNC|VNMC|MCLC)\b/i.test(abbr)) {
                if (tournament.priority === undefined || tournament.priority === 0) {
                  updateField('priority', 3)
                }
              }
            }}
            placeholder={t('form.placeholder.abbr')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.id')} {isEditing ? t('form.id.editing') : t('form.id.auto')}</label>
          <input
            type="text"
            value={tournament.id}
            onChange={(e) => !isEditing && updateField('id', e.target.value)}
            disabled={isEditing}
            className={`w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-md text-sm bg-gray-50 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 ${isEditing ? 'cursor-not-allowed opacity-60' : ''}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.keyCount')}</label>
          <div className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-md text-sm bg-gray-50 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400">
            {t('form.keyCount.note')}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.year')}</label>
          <input
            type="number"
            value={tournament.year}
            onChange={(e) => updateField('year', Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.priority')}</label>
        <input
          type="number"
          step="0.1"
          min="1"
          max="5"
          value={tournament.priority ?? ''}
          onChange={(e) => {
            const val = e.target.value === '' ? undefined : Number(e.target.value)
            updateField('priority', val)
          }}
          placeholder="1-5 (可选)"
          className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
        />
        <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1.5 leading-relaxed">
          <strong>5</strong>: MWC 系列赛事<br/>
          <strong>4</strong>: 世界热门锦标赛 (THMC4, 4DM, GBC春)<br/>
          <strong>3</strong>: 世界大众赛事 & 国家杯锦标赛 (MCNC, TTI, JHC)<br/>
          <strong>2</strong>: 世界小型 / 国家范围赛事 (CUC, RDC, PFC)<br/>
          <strong>1</strong>: 小型社区比赛 (SYC, WBDC, GFRL)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.forumUrl')}</label>
          <input
            type="url"
            value={tournament.forumUrl || ''}
            onChange={(e) => updateField('forumUrl', e.target.value || undefined)}
            placeholder="https://osu.ppy.sh/..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.wikiUrl')}</label>
          <input
            type="url"
            value={tournament.wikiUrl || ''}
            onChange={(e) => updateField('wikiUrl', e.target.value || undefined)}
            placeholder="https://osu.ppy.sh/wiki/..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.sheetUrl')}</label>
        <input
          type="url"
          value={tournament.sheetUrl || ''}
          onChange={(e) => updateField('sheetUrl', e.target.value || undefined)}
          placeholder="https://docs.google.com/spreadsheets/..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">{t('form.label.tags')}</label>
        <input
          type="text"
          value={(tournament.tags || []).join(', ')}
          onChange={(e) => updateField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder={t('form.placeholder.tags')}
          className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
        />
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('form.next')}
        </button>
      </div>
    </div>
  )
}

function RoundsStep({
  rounds,
  onUpdate,
  onBack,
  getMapHistory,
  editingTournamentId,
  enableEstimation,
}: {
  rounds: RoundWithMeta[]
  onUpdate: (rounds: RoundWithMeta[]) => void
  onBack: () => void
  getMapHistory?: (beatmapId: number | undefined, beatmapsetId: number | undefined) => import('@/hooks/useMapHistory').MapHistorySummary | null
  editingTournamentId?: string
  enableEstimation?: boolean
}) {
  const t = useT()
  const [importerOpen, setImporterOpen] = useState(false)

  const addRound = () => {
    const order = rounds.length + 1
    const newRound: RoundWithMeta = {
      id: `round-${order}`,
      name: '',
      abbreviation: '',
      order,
      difficulty: { min: 0, max: 0, average: 0 },
      maps: [],
      _maps: [],
      _typeDiffs: { rc: 0, rcMin: 0, rcMax: 0, hbRf: 0, hbLn: 0, hbMin: 0, hbMax: 0, hbLnMin: 0, hbLnMax: 0, ln: 0, lnMin: 0, lnMax: 0, sv: 0, svMin: 0, svMax: 0, tbRf: 0, tbLn: 0, tbMin: 0, tbMax: 0, tbLnMin: 0, tbLnMax: 0 },
      _typeDiffsLocked: { rc: false, hbRf: false, hbLn: false, ln: false, sv: false, tbRf: false, tbLn: false },
      _diffMode: 'summary',
    }
    onUpdate([...rounds, newRound])
  }

  const updateRound = (index: number, round: RoundWithMeta) => {
    const updated = [...rounds]
    updated[index] = round
    onUpdate(updated)
  }

  const removeRound = (index: number) => {
    onUpdate(rounds.filter((_, i) => i !== index))
  }

  const handleImport = (newRounds: RoundWithMeta[]) => {
    onUpdate([...rounds, ...newRounds])
    setImporterOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-neutral-200">
          {t('form.rounds.title', { n: rounds.length })}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setImporterOpen(true)}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
          >
            {t('form.import')}
          </button>
          <button
            onClick={addRound}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            {t('form.addRound')}
          </button>
        </div>
      </div>

      {rounds.length === 0 && (
        <div className="text-center py-8 text-gray-400 dark:text-neutral-500 text-sm">
          {t('form.rounds.empty')}
        </div>
      )}

      {rounds.map((round, i) => (
        <RoundEditor
          key={i}
          round={round}
          index={i}
          onChange={(r) => updateRound(i, r)}
          onRemove={() => removeRound(i)}
          getMapHistory={getMapHistory}
          siblingAbbrs={rounds.map((r) => r.abbreviation)}
          enableEstimation={enableEstimation}
        />
      ))}

      <div className="pt-2 flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-200 text-gray-700 dark:bg-neutral-700 dark:text-neutral-200 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-neutral-600"
        >
          {t('form.back')}
        </button>
      </div>

      {importerOpen && (
        <BulkImporter
          onImport={handleImport}
          onClose={() => setImporterOpen(false)}
          existingRoundCount={rounds.length}
          currentTournamentId={editingTournamentId}
        />
      )}
    </div>
  )
}
