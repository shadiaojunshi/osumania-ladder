'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Tournament, Round } from '@/lib/types'
import { RoundEditor, type RoundWithMeta } from './RoundEditor'
import type { MapCategory, ExtendedMap } from './MapSlotEditor'
import { BulkImporter } from './BulkImporter'

interface Props {
  onUpdate: (tournament: Tournament | null) => void
  initialData?: Tournament | null
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

export function TournamentForm({ onUpdate, initialData }: Props) {
  const [step, setStep] = useState(0)
  const [tournament, setTournament] = useState<Tournament>(EMPTY_TOURNAMENT)
  const [rounds, setRounds] = useState<RoundWithMeta[]>([])

  useEffect(() => {
    if (initialData) {
      setTournament(initialData)
      setRounds(initialData.rounds.map(roundToMeta))
      setStep(1)
    } else {
      setTournament(EMPTY_TOURNAMENT)
      setRounds([])
      setStep(0)
    }
  }, [initialData])

  useEffect(() => {
    const outputRounds = rounds.map(roundWithMetaToOutput)
    const t = { ...tournament, rounds: outputRounds }
    if (t.id && outputRounds.length > 0) {
      onUpdate(t)
    } else {
      onUpdate(null)
    }
  }, [tournament, rounds, onUpdate])

  const updateField = useCallback(<K extends keyof Tournament>(key: K, value: Tournament[K]) => {
    setTournament((prev) => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col max-h-[calc(100vh-180px)]">
      <div className="border-b border-gray-200 px-4 py-3 shrink-0">
        <StepIndicator current={step} />
      </div>

      <div className="p-4 overflow-y-auto flex-1">
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
            onUpdate={setRounds}
            onBack={() => setStep(0)}
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
      ;(m as Record<F, number>)[field] = +(min + (max - min) * (i / (eligible.length - 1))).toFixed(1)
    })
  } else if (avg > 0) {
    eligible.forEach((m) => { (m as Record<F, number>)[field] = avg })
  } else if (min > 0 && max > 0) {
    const mid = +((min + max) / 2).toFixed(1)
    eligible.forEach((m) => { (m as Record<F, number>)[field] = mid })
  }
}

function roundWithMetaToOutput(r: RoundWithMeta): Round {
  const { _maps, _typeDiffs, _typeDiffsLocked, _diffMode, ...rest } = r

  const maps = _maps.map((m) => {
    const { category, ...mapRest } = m
    return { ...mapRest }
  })

  distributeDiffsForType(maps.filter((m) => m.type === 'RC'), _typeDiffs.rcMin, _typeDiffs.rcMax, _typeDiffs.rc, 'difficulty')
  distributeDiffsForType(maps.filter((m) => m.type === 'LN'), _typeDiffs.lnMin, _typeDiffs.lnMax, _typeDiffs.ln, 'difficulty')
  distributeDiffsForType(maps.filter((m) => m.type === 'HB'), _typeDiffs.hbMin, _typeDiffs.hbMax, _typeDiffs.hbLn, 'difficultyLn')
  distributeDiffsForType(maps.filter((m) => m.type === 'HB'), 0, 0, _typeDiffs.hbRf, 'difficulty')
  distributeDiffsForType(maps.filter((m) => m.type === 'SV'), _typeDiffs.svMin, _typeDiffs.svMax, _typeDiffs.sv, 'difficulty')

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
    average = userAvgs.length > 0 ? +(userAvgs.reduce((s, v) => s + v, 0) / userAvgs.length).toFixed(1) : 0
  } else {
    min = nonTbDiffs.length > 0 ? Math.min(...nonTbDiffs) : 0
    max = nonTbDiffs.length > 0 ? Math.max(...nonTbDiffs) : 0
    average = nonTbDiffs.length > 0 ? +(nonTbDiffs.reduce((s, d) => s + d, 0) / nonTbDiffs.length).toFixed(1) : 0
  }

  return {
    ...rest,
    difficulty: { min, max, average },
    maps,
    typeDifficulties: {
      RC: { rf: _typeDiffs.rc || undefined },
      HB: { rf: _typeDiffs.hbRf || undefined, ln: _typeDiffs.hbLn || undefined },
      LN: { ln: _typeDiffs.ln || undefined },
      SV: { rf: _typeDiffs.sv || undefined },
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
      hbRf: td.HB?.rf || 0, hbLn: td.HB?.ln || 0, hbMin: 0, hbMax: 0,
      ln: td.LN?.ln || 0, lnMin: 0, lnMax: 0,
      sv: td.SV?.rf || 0, svMin: 0, svMax: 0,
    },
    _typeDiffsLocked: {
      rc: !!(td.RC?.rf),
      hbRf: !!(td.HB?.rf),
      hbLn: !!(td.HB?.ln),
      ln: !!(td.LN?.ln),
      sv: !!(td.SV?.rf),
    },
    _diffMode: 'perMap' as const,
  }
}

function StepIndicator({ current }: { current: number }) {
  const steps = ['基本信息', '轮次与谱面']
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= current ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm ${i <= current ? 'text-gray-900' : 'text-gray-400'}`}>
            {label}
          </span>
          {i < steps.length - 1 && <div className="w-8 h-px bg-gray-300" />}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">比赛全称</label>
        <input
          type="text"
          value={tournament.name}
          onChange={(e) => {
            updateField('name', e.target.value)
            if (!tournament.id || tournament.id === autoId(tournament.name)) {
              updateField('id', autoId(e.target.value))
            }
          }}
          placeholder="例: osu!mania World Cup 2025"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">缩写</label>
          <input
            type="text"
            value={tournament.abbreviation}
            onChange={(e) => updateField('abbreviation', e.target.value)}
            placeholder="例: MWC 2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID {isEditing ? '(不可修改)' : '(自动生成)'}</label>
          <input
            type="text"
            value={tournament.id}
            onChange={(e) => !isEditing && updateField('id', e.target.value)}
            disabled={isEditing}
            className={`w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-600 ${isEditing ? 'cursor-not-allowed opacity-60' : ''}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">键数</label>
          <div className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-600">
            4K（暂不支持其他键数）
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">年份</label>
          <input
            type="number"
            value={tournament.year}
            onChange={(e) => updateField('year', Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">论坛链接 (可选)</label>
          <input
            type="url"
            value={tournament.forumUrl || ''}
            onChange={(e) => updateField('forumUrl', e.target.value || undefined)}
            placeholder="https://osu.ppy.sh/..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Wiki 链接 (可选)</label>
          <input
            type="url"
            value={tournament.wikiUrl || ''}
            onChange={(e) => updateField('wikiUrl', e.target.value || undefined)}
            placeholder="https://osu.ppy.sh/wiki/..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">主表格链接 (可选)</label>
        <input
          type="url"
          value={tournament.sheetUrl || ''}
          onChange={(e) => updateField('sheetUrl', e.target.value || undefined)}
          placeholder="https://docs.google.com/spreadsheets/..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">标签 (逗号分隔)</label>
        <input
          type="text"
          value={(tournament.tags || []).join(', ')}
          onChange={(e) => updateField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="例: community, 4k, chinese"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
        />
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一步: 添加轮次 →
        </button>
      </div>
    </div>
  )
}

function RoundsStep({
  rounds,
  onUpdate,
  onBack,
}: {
  rounds: RoundWithMeta[]
  onUpdate: (rounds: RoundWithMeta[]) => void
  onBack: () => void
}) {
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
      _typeDiffs: { rc: 0, rcMin: 0, rcMax: 0, hbRf: 0, hbLn: 0, hbMin: 0, hbMax: 0, ln: 0, lnMin: 0, lnMax: 0, sv: 0, svMin: 0, svMax: 0 },
      _typeDiffsLocked: { rc: false, hbRf: false, hbLn: false, ln: false, sv: false },
      _diffMode: 'perMap',
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

  const handleImport = (round: RoundWithMeta) => {
    onUpdate([...rounds, round])
    setImporterOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          轮次列表 ({rounds.length} 轮)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setImporterOpen(true)}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
          >
            从主表格导入
          </button>
          <button
            onClick={addRound}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            + 添加轮次
          </button>
        </div>
      </div>

      {rounds.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          还没有轮次，点击上方按钮添加
        </div>
      )}

      {rounds.map((round, i) => (
        <RoundEditor
          key={i}
          round={round}
          index={i}
          onChange={(r) => updateRound(i, r)}
          onRemove={() => removeRound(i)}
        />
      ))}

      <div className="pt-2 flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
        >
          ← 上一步
        </button>
      </div>

      {importerOpen && (
        <BulkImporter
          onImport={handleImport}
          onClose={() => setImporterOpen(false)}
          existingRoundCount={rounds.length}
        />
      )}
    </div>
  )
}
