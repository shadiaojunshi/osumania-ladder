'use client'

import { useState } from 'react'
import type { Round, BeatmapMeta } from '@/lib/types'
import { MapSlotEditor, type ExtendedMap, type MapCategory, REAL_TYPES } from './MapSlotEditor'
import { getTemplatesByBestOf, type PoolTemplate } from '@/lib/poolTemplates'
import { useT } from '@/lib/i18n'
import { DifficultyRefPicker } from './DifficultyRefPicker'

const ROUND_PRESETS: {
  name: string
  abbreviation: string
  isQualifier?: boolean
  defaultBo?: number
}[] = [
  { name: 'Qualifiers', abbreviation: 'Qual', isQualifier: true },
  { name: 'Round of 32', abbreviation: 'RO32', defaultBo: 9 },
  { name: 'Round of 16', abbreviation: 'RO16', defaultBo: 9 },
  { name: 'Quarterfinals', abbreviation: 'QF', defaultBo: 11 },
  { name: 'Semifinals', abbreviation: 'SF', defaultBo: 11 },
  { name: 'Finals', abbreviation: 'F', defaultBo: 13 },
  { name: 'Grand Finals', abbreviation: 'GF', defaultBo: 13 },
]

const STANDARD_TYPES = ['RC', 'HB', 'LN', 'SV', 'TB'] as const

interface RoundWithMeta extends Round {
  _maps: ExtendedMap[]
  _typeDiffs: {
    rc: number; rcMin: number; rcMax: number
    hbRf: number; hbLn: number; hbMin: number; hbMax: number
    ln: number; lnMin: number; lnMax: number
    sv: number; svMin: number; svMax: number
    tbRf: number; tbLn: number; tbMin: number; tbMax: number; tbLnMin: number; tbLnMax: number
  }
  _typeDiffsLocked: { rc: boolean; hbRf: boolean; hbLn: boolean; ln: boolean; sv: boolean; tbRf: boolean; tbLn: boolean }
  _diffMode: 'perMap' | 'summary'
}

interface Props {
  round: RoundWithMeta
  index: number
  onChange: (round: RoundWithMeta) => void
  onRemove: () => void
}

export function RoundEditor({ round, index, onChange, onRemove }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(true)
  const [customSlotName, setCustomSlotName] = useState('')

  const updateField = <K extends keyof RoundWithMeta>(key: K, value: RoundWithMeta[K]) => {
    onChange({ ...round, [key]: value })
  }

  const addMap = (category: MapCategory, slotPrefix?: string) => {
    const prefix = slotPrefix || category
    const existingCount = round._maps.filter((m) => m.slot.startsWith(prefix)).length
    const slotNum = existingCount + 1
    // TB 习惯上单张就叫 TB,只在出现第二张时才编号 TB2/TB3...。
    // 跟 generate-pack.js 的 TB1→TB 显示规则保持一致。
    const slot = prefix === 'TB' && slotNum === 1 ? 'TB' : `${prefix}${slotNum}`
    const realTypes = REAL_TYPES[category] || []
    const firstRealType = realTypes.length > 0 ? realTypes[0].id : ''

    const newMap: ExtendedMap = {
      slot,
      type: category === 'SPECIAL' ? prefix : category,
      realType: firstRealType,
      name: slot,
      difficulty: 0,
      category,
    }
    const maps = [...round._maps, newMap]
    const typeDiffs = autoCalcTypeDiffs(maps, round._typeDiffs, round._typeDiffsLocked)
    onChange({ ...round, _maps: maps, _typeDiffs: typeDiffs, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  const addCustomMap = () => {
    if (!customSlotName.trim()) return
    addMap('SPECIAL' as MapCategory, customSlotName.trim().toUpperCase())
    setCustomSlotName('')
  }

  const updateMap = (mapIndex: number, map: ExtendedMap) => {
    const maps = [...round._maps]
    maps[mapIndex] = map
    const typeDiffs = autoCalcTypeDiffs(maps, round._typeDiffs, round._typeDiffsLocked)
    onChange({ ...round, _maps: maps, _typeDiffs: typeDiffs, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  const removeMap = (mapIndex: number) => {
    const maps = round._maps.filter((_, i) => i !== mapIndex)
    const typeDiffs = autoCalcTypeDiffs(maps, round._typeDiffs, round._typeDiffsLocked)
    onChange({ ...round, _maps: maps, _typeDiffs: typeDiffs, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  const updateTypeDiff = (key: keyof RoundWithMeta['_typeDiffs'], value: number) => {
    const locked = { ...round._typeDiffsLocked, [key]: value > 0 }
    onChange({ ...round, _typeDiffs: { ...round._typeDiffs, [key]: value }, _typeDiffsLocked: locked })
  }

  const applyPreset = (preset: typeof ROUND_PRESETS[number]) => {
    // BO 默认值只在用户没填时补;已填值不动,避免覆盖手改。
    const nextBo =
      !preset.isQualifier && preset.defaultBo && !round.bestOf
        ? preset.defaultBo
        : round.bestOf
    onChange({
      ...round,
      name: preset.name,
      abbreviation: preset.abbreviation,
      isQualifier: preset.isQualifier || undefined,
      bestOf: nextBo,
    })
  }

  const getTemplates = (bo: number, isQualifier: boolean): PoolTemplate[] => {
    return getTemplatesByBestOf(bo, isQualifier)
  }

  const applyPoolTemplate = (tpl: PoolTemplate) => {
    // 先统计每种 type 在模板里出现几次,用来决定 TB 是叫 TB 还是 TB1。
    // 单张 TB → "TB",多张才编号(TB1/TB2...);跟 addMap 的规则对齐。
    const totalPerType: Record<string, number> = {}
    for (const m of tpl.maps) totalPerType[m.type] = (totalPerType[m.type] || 0) + 1
    const slotCounters: Record<string, number> = {}
    const maps: ExtendedMap[] = tpl.maps.map((m) => {
      const count = (slotCounters[m.type] || 0) + 1
      slotCounters[m.type] = count
      const slot = m.type === 'TB' && totalPerType.TB === 1 ? 'TB' : `${m.type}${count}`
      return {
        slot,
        type: m.type,
        realType: m.realType,
        name: slot,
        difficulty: 0,
        category: m.type,
      }
    })
    const typeDiffs = autoCalcTypeDiffs(maps, round._typeDiffs, round._typeDiffsLocked)
    onChange({ ...round, _maps: maps, _typeDiffs: typeDiffs, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  return (
    <div className="border border-gray-200 dark:border-neutral-800 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-neutral-900/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">#{index + 1}</span>
          <span className="text-sm font-medium">
            {round.name || round.abbreviation || t('round.untitled')}
          </span>
          {round._maps.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-neutral-500">
              {t('round.mapsCount', { n: round._maps.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="text-xs text-red-500 hover:text-red-700"
          >
            {t('round.delete')}
          </button>
          <span className="text-gray-400 dark:text-neutral-500">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-neutral-400">{t('round.preset.label')}</span>
            {ROUND_PRESETS.map((p) => (
              <button
                key={p.abbreviation}
                onClick={() => applyPreset(p)}
                className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 rounded hover:bg-gray-200 dark:hover:bg-neutral-700"
              >
                {p.abbreviation}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-0.5">{t('round.label.name')}</label>
              <input
                type="text"
                value={round.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder={t('round.placeholder.name')}
                className="w-full px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-0.5">{t('round.label.abbr')}</label>
              <input
                type="text"
                value={round.abbreviation}
                onChange={(e) => updateField('abbreviation', e.target.value)}
                placeholder={t('round.placeholder.abbr')}
                className="w-full px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-0.5">
                {round.isQualifier ? t('round.label.qualMaps') : t('round.label.bo')}
              </label>
              <input
                type="number"
                value={round.bestOf || ''}
                onChange={(e) => updateField('bestOf', Number(e.target.value) || undefined)}
                placeholder={round.isQualifier ? '9' : '9'}
                className="w-full px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {round.bestOf && getTemplates(round.bestOf, !!round.isQualifier).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-neutral-400">{t('round.template.label')}</span>
              {getTemplates(round.bestOf, !!round.isQualifier).map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => applyPoolTemplate(tpl)}
                  className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-gray-100 dark:border-neutral-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-neutral-200">{t('round.diff.input')}</label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateField('_diffMode', 'perMap')}
                  className={`px-2 py-0.5 text-xs rounded ${round._diffMode === 'perMap' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300'}`}
                >
                  {t('round.diff.perMap')}
                </button>
                <button
                  onClick={() => updateField('_diffMode', 'summary')}
                  className={`px-2 py-0.5 text-xs rounded ${round._diffMode === 'summary' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300'}`}
                >
                  {t('round.diff.summary')}
                </button>
              </div>
            </div>

            {round._diffMode === 'summary' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div className="text-xs text-gray-500 dark:text-neutral-400 font-medium"></div>
                  <div className="text-xs text-gray-400 dark:text-neutral-500 text-center">{t('round.diff.min')}</div>
                  <div className="text-xs text-gray-400 dark:text-neutral-500 text-center">{t('round.diff.max')}</div>
                  <div className="text-xs text-gray-400 dark:text-neutral-500 text-center">{t('round.diff.avg')}</div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-blue-600 dark:text-blue-300 font-medium">RC (rf)</span>
                  <input type="number" step="0.5" value={round._typeDiffs.rcMin || ''} onChange={(e) => updateTypeDiff('rcMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                  <input type="number" step="0.5" value={round._typeDiffs.rcMax || ''} onChange={(e) => updateTypeDiff('rcMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={round._typeDiffs.rc || ''} onChange={(e) => updateTypeDiff('rc', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                    <DifficultyRefPicker value={round._typeDiffs.rc || 0} onChange={(n) => updateTypeDiff('rc', n)} type="RC" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-purple-600 dark:text-purple-300 font-medium">HB (ln)</span>
                  <input type="number" step="0.5" value={round._typeDiffs.hbMin || ''} onChange={(e) => updateTypeDiff('hbMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  <input type="number" step="0.5" value={round._typeDiffs.hbMax || ''} onChange={(e) => updateTypeDiff('hbMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={round._typeDiffs.hbLn || ''} onChange={(e) => updateTypeDiff('hbLn', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                    <DifficultyRefPicker value={round._typeDiffs.hbLn || 0} onChange={(n) => updateTypeDiff('hbLn', n)} type="HB" field="ln" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-indigo-600 dark:text-indigo-300 font-medium">LN (ln)</span>
                  <input type="number" step="0.5" value={round._typeDiffs.lnMin || ''} onChange={(e) => updateTypeDiff('lnMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                  <input type="number" step="0.5" value={round._typeDiffs.lnMax || ''} onChange={(e) => updateTypeDiff('lnMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={round._typeDiffs.ln || ''} onChange={(e) => updateTypeDiff('ln', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                    <DifficultyRefPicker value={round._typeDiffs.ln || 0} onChange={(n) => updateTypeDiff('ln', n)} type="LN" field="ln" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-amber-600 dark:text-amber-300 font-medium">SV (rf)</span>
                  <input type="number" step="0.5" value={round._typeDiffs.svMin || ''} onChange={(e) => updateTypeDiff('svMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                  <input type="number" step="0.5" value={round._typeDiffs.svMax || ''} onChange={(e) => updateTypeDiff('svMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={round._typeDiffs.sv || ''} onChange={(e) => updateTypeDiff('sv', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                    <DifficultyRefPicker value={round._typeDiffs.sv || 0} onChange={(n) => updateTypeDiff('sv', n)} type="SV" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-rose-600 dark:text-rose-300 font-medium">TB (rf)</span>
                  <input type="number" step="0.5" value={round._typeDiffs.tbMin || ''} onChange={(e) => updateTypeDiff('tbMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <input type="number" step="0.5" value={round._typeDiffs.tbMax || ''} onChange={(e) => updateTypeDiff('tbMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={round._typeDiffs.tbRf || ''} onChange={(e) => updateTypeDiff('tbRf', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                    <DifficultyRefPicker value={round._typeDiffs.tbRf || 0} onChange={(n) => updateTypeDiff('tbRf', n)} type="TB" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-rose-600 dark:text-rose-300 font-medium">TB (ln)</span>
                  <input type="number" step="0.5" value={round._typeDiffs.tbLnMin || ''} onChange={(e) => updateTypeDiff('tbLnMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <input type="number" step="0.5" value={round._typeDiffs.tbLnMax || ''} onChange={(e) => updateTypeDiff('tbLnMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={round._typeDiffs.tbLn || ''} onChange={(e) => updateTypeDiff('tbLn', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                    <DifficultyRefPicker value={round._typeDiffs.tbLn || 0} onChange={(n) => updateTypeDiff('tbLn', n)} type="TB" field="ln" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-neutral-500">{t('round.diff.summaryHint')}</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-2">{t('round.diff.avgHint')}</label>
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="block text-xs text-blue-600 dark:text-blue-300 mb-0.5">RC (rf)</label>
                    <input type="number" step="0.5" value={round._typeDiffs.rc || ''} onChange={(e) => updateTypeDiff('rc', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-purple-600 dark:text-purple-300 mb-0.5">HB (rf)</label>
                    <input type="number" step="0.5" value={round._typeDiffs.hbRf || ''} onChange={(e) => updateTypeDiff('hbRf', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-purple-600 dark:text-purple-300 mb-0.5">HB (ln)</label>
                    <input type="number" step="0.5" value={round._typeDiffs.hbLn || ''} onChange={(e) => updateTypeDiff('hbLn', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-indigo-600 dark:text-indigo-300 mb-0.5">LN (ln)</label>
                    <input type="number" step="0.5" value={round._typeDiffs.ln || ''} onChange={(e) => updateTypeDiff('ln', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-amber-600 dark:text-amber-300 mb-0.5">SV (rf)</label>
                    <input type="number" step="0.5" value={round._typeDiffs.sv || ''} onChange={(e) => updateTypeDiff('sv', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-neutral-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-neutral-200">{t('round.maps.title')}</label>
              <div className="flex gap-1 flex-wrap">
                {STANDARD_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => addMap(type as MapCategory)}
                    className="px-2 py-0.5 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50"
                  >
                    +{type}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="text"
                value={customSlotName}
                onChange={(e) => setCustomSlotName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomMap()}
                placeholder={t('round.custom.placeholder')}
                className="px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs w-36 bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-green-400"
              />
              <button
                onClick={addCustomMap}
                disabled={!customSlotName.trim()}
                className="px-2 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40"
              >
                {t('round.custom.add')}
              </button>
            </div>

            {round._maps.length === 0 && (
              <div className="text-center py-4 text-gray-400 dark:text-neutral-500 text-xs border border-dashed border-gray-200 dark:border-neutral-700 rounded">
                {t('round.maps.empty')}
              </div>
            )}

            <div className="space-y-1.5">
              {round._maps.map((map, i) => (
                <MapSlotEditor
                  key={i}
                  map={map}
                  onChange={(m) => updateMap(i, m)}
                  onRemove={() => removeMap(i)}
                />
              ))}
            </div>
          </div>

          {round._maps.length > 0 && (
            <div className="text-xs text-gray-400 dark:text-neutral-500 pt-1 border-t border-gray-100 dark:border-neutral-800">
              {t('round.diff.range', {
                min: round.difficulty.min.toFixed(1),
                max: round.difficulty.max.toFixed(1),
                avg: round.difficulty.average.toFixed(1),
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function mapsToOutput(maps: ExtendedMap[]): BeatmapMeta[] {
  return maps.map(({ category, ...rest }) => rest)
}

function recalcDifficulty(maps: ExtendedMap[]): Round['difficulty'] {
  if (maps.length === 0) return { min: 0, max: 0, average: 0 }
  const diffs = maps.map((m) => m.difficulty).filter((d) => d > 0)
  if (diffs.length === 0) return { min: 0, max: 0, average: 0 }
  const min = Math.min(...diffs)
  const max = Math.max(...diffs)
  const average = +(diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(1)
  return { min, max, average }
}

function autoCalcTypeDiffs(
  maps: ExtendedMap[],
  current: RoundWithMeta['_typeDiffs'],
  locked: RoundWithMeta['_typeDiffsLocked']
): RoundWithMeta['_typeDiffs'] {
  const result = { ...current }
  const avg = (type: string, field: 'difficulty' | 'difficultyLn' = 'difficulty') => {
    const diffs = maps.filter((m) => m.type === type).map((m) => m[field] || 0).filter((d) => d > 0)
    return diffs.length > 0 ? +(diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(1) : 0
  }
  if (!locked.rc) result.rc = avg('RC')
  if (!locked.hbRf) result.hbRf = avg('HB', 'difficulty')
  if (!locked.hbLn) result.hbLn = avg('HB', 'difficultyLn')
  if (!locked.ln) result.ln = avg('LN')
  if (!locked.sv) result.sv = avg('SV')
  if (!locked.tbRf) result.tbRf = avg('TB', 'difficulty')
  if (!locked.tbLn) result.tbLn = avg('TB', 'difficultyLn')
  return result
}

export type { RoundWithMeta }
