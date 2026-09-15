'use client'

import { useState } from 'react'
import type { Round, BeatmapMeta } from '@/lib/types'
import { MapSlotEditor, needsDualDifficulty, type ExtendedMap, type MapCategory, REAL_TYPES } from './MapSlotEditor'
import { countableMaps } from '@/lib/difficultyCount'
import { getTemplatesByBestOf, type PoolTemplate } from '@/lib/poolTemplates'
import { useT } from '@/lib/i18n'
import { DifficultyRefPicker } from './DifficultyRefPicker'
import { RoundRefPicker, type RoundRefValues } from './RoundRefPicker'
import {
  DIFFICULTY_MAX,
  DIFFICULTY_WARN_ABOVE,
  classifyDifficulty,
  collectOutOfRange,
  formatDifficulty,
  formatOutOfRange,
} from '@/lib/difficultyLimits'
import type { MapHistorySummary } from '@/hooks/useMapHistory'

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
    hbRf: number; hbLn: number; hbMin: number; hbMax: number; hbLnMin: number; hbLnMax: number
    ln: number; lnMin: number; lnMax: number
    sv: number; svMin: number; svMax: number
    tbRf: number; tbLn: number; tbMin: number; tbMax: number; tbLnMin: number; tbLnMax: number
  }
  _typeDiffsLocked: { rc: boolean; hbRf: boolean; hbLn: boolean; ln: boolean; sv: boolean; tbRf: boolean; tbLn: boolean }
  _diffMode: 'perMap' | 'summary'
  // Explicitly cleared map fields must not be repopulated from summary values
  // when TournamentForm serializes the editor state.
  _mapDifficultiesCleared?: boolean
}

interface Props {
  round: RoundWithMeta
  index: number
  onChange: (round: RoundWithMeta) => void
  onRemove: () => void
  getMapHistory?: (beatmapId: number | undefined, beatmapsetId: number | undefined) => MapHistorySummary | null
  // 本比赛所有轮缩写(易→难),供整轮参考按非标准轮邻居反推档位
  siblingAbbrs?: string[]
  enableEstimation?: boolean
  tournamentId?: string
}

export function RoundEditor({ round, index, onChange, onRemove, getMapHistory, siblingAbbrs, enableEstimation, tournamentId }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(true)
  const [customSlotName, setCustomSlotName] = useState('')
  const [estimateSignal, setEstimateSignal] = useState(0)
  // 被拒绝的难度输入(超过上限)。存值而不是布尔:提示里要显示"你输入了多少"。
  const [rejectedDifficulty, setRejectedDifficulty] = useState<number | null>(null)

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

  const clearAllMapDifficulties = () => {
    const maps = round._maps.map((map) => ({
      ...map,
      difficulty: 0,
      // Clear both fields even if legacy data attached difficultyLn to a
      // category that is not currently marked as dual-valued.
      difficultyLn: undefined,
    }))
    // Keep round-level difficulty and type averages intact while the map pool is edited.
    onChange({ ...round, _maps: maps, maps: mapsToOutput(maps), _mapDifficultiesCleared: true })
  }

  const hasMapDifficulties = round._maps.some(
    (map) => map.difficulty > 0 || (needsDualDifficulty(map.category) && (map.difficultyLn || 0) > 0)
  )

  // 难度越界汇总(>18 警告、>25 报错)。阈值见 src/lib/difficultyLimits.ts。
  const outOfRange = collectOutOfRange(round._typeDiffs)
  const overMax = outOfRange.filter((item) => item.level === 'over')
  const overWarn = outOfRange.filter((item) => item.level === 'warn')

  const updateTypeDiff = (key: keyof RoundWithMeta['_typeDiffs'], value: number) => {
    // 手填难度最容易多按一个 0(19 → 190)。超上限直接拒绝这次输入,而不是截断成上限 ——
    // 截断会把一个明显的笔误变成"看起来合理"的错数据。
    if (classifyDifficulty(value) === 'over') {
      setRejectedDifficulty(value)
      return
    }
    setRejectedDifficulty(null)
    const locked = { ...round._typeDiffsLocked, [key]: value > 0 }
    onChange({
      ...round,
      _typeDiffs: { ...round._typeDiffs, [key]: value },
      _typeDiffsLocked: locked,
      // Editing a summary is an explicit request to use summary values again.
      _mapDifficultiesCleared: false,
    })
  }

  // TB(rf)/TB(ln) 与唯一 TB 谱面的 difficulty/difficultyLn 完全联动:
  // 编辑 summary 里的 tbRf/tbLn 时写穿回那张 TB 谱面,且保持 unlocked ——
  // 这样 autoCalc(图→summary) 反向也会让 summary 跟着谱面,两侧永远相等。
  // 仅当本轮恰好一张 TB 时启用直连(多 TB 保持"平均"语义,走普通 lock 路径)。
  const updateTbLinked = (field: 'rf' | 'ln', value: number) => {
    // 这个入口会直连写穿到那张唯一 TB 谱面的 difficulty/difficultyLn,同样要过阈值。
    if (classifyDifficulty(value) === 'over') {
      setRejectedDifficulty(value)
      return
    }
    setRejectedDifficulty(null)
    const tbIdxs = round._maps.map((m, i) => (m.type === 'TB' ? i : -1)).filter((i) => i >= 0)
    if (tbIdxs.length !== 1) {
      updateTypeDiff(field === 'rf' ? 'tbRf' : 'tbLn', value)
      return
    }
    const maps = [...round._maps]
    const idx = tbIdxs[0]
    maps[idx] = field === 'rf'
      ? { ...maps[idx], difficulty: value }
      : { ...maps[idx], difficultyLn: value || undefined }
    // 强制解锁被编辑侧,让 autoCalc 从谱面回填(值相等,幂等),保证 summary=谱面。
    const locked = { ...round._typeDiffsLocked, [field === 'rf' ? 'tbRf' : 'tbLn']: false }
    const typeDiffs = autoCalcTypeDiffs(maps, round._typeDiffs, locked)
    onChange({ ...round, _maps: maps, _typeDiffs: typeDiffs, _typeDiffsLocked: locked, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  // 整轮「参考」:把 6 个非 SV 平均值一次写回并 lock。SV / min/max 不动。
  const applyRoundRef = (v: RoundRefValues) => {
    // Keep the visible per-map editor and the summary editor in sync. The
    // exported round is derived from both, so updating only _typeDiffs made a
    // reference appear to do nothing while the editor was in per-map mode.
    const maps = round._maps.map((map) => {
      switch (map.category) {
        case 'RC':
          return v.rc > 0 ? { ...map, difficulty: v.rc } : map
        case 'HB':
          return {
            ...map,
            ...(v.hbRf > 0 ? { difficulty: v.hbRf } : {}),
            ...(v.hbLn > 0 ? { difficultyLn: v.hbLn } : {}),
          }
        case 'LN':
          return v.ln > 0 ? { ...map, difficulty: v.ln } : map
        case 'TB':
          return {
            ...map,
            ...(v.tbRf > 0 ? { difficulty: v.tbRf } : {}),
            ...(v.tbLn > 0 ? { difficultyLn: v.tbLn } : {}),
          }
        default:
          // SV and custom SPECIAL pools are intentionally not touched.
          return map
      }
    })
    const nextDiffs = { ...round._typeDiffs }
    const nextLocked = { ...round._typeDiffsLocked }
    const set = (key: keyof RoundWithMeta['_typeDiffs'], lockKey: keyof RoundWithMeta['_typeDiffsLocked'], val: number) => {
      if (val > 0) { nextDiffs[key] = val; nextLocked[lockKey] = true }
    }
    set('rc', 'rc', v.rc)
    set('hbRf', 'hbRf', v.hbRf)
    set('hbLn', 'hbLn', v.hbLn)
    set('ln', 'ln', v.ln)
    set('tbRf', 'tbRf', v.tbRf)
    set('tbLn', 'tbLn', v.tbLn)
    onChange({
      ...round,
      _maps: maps,
      maps: mapsToOutput(maps),
      difficulty: recalcDifficulty(maps),
      _typeDiffs: nextDiffs,
      _typeDiffsLocked: nextLocked,
      _mapDifficultiesCleared: false,
    })
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
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-700 dark:text-neutral-200">{t('round.diff.input')}</label>
                <RoundRefPicker
                  roundAbbr={round.abbreviation}
                  siblingAbbrs={siblingAbbrs}
                  roundIndex={index}
                  onApply={applyRoundRef}
                />
              </div>
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

            {rejectedDifficulty !== null && (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {t('diff.limit.rejected', { max: DIFFICULTY_MAX, value: formatDifficulty(rejectedDifficulty) })}
              </p>
            )}
            {overMax.length > 0 && (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {t('diff.limit.overFields', { max: DIFFICULTY_MAX, fields: formatOutOfRange(overMax) })}
              </p>
            )}
            {overMax.length === 0 && overWarn.length > 0 && (
              <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                {t('diff.limit.warnFields', { warn: DIFFICULTY_WARN_ABOVE, fields: formatOutOfRange(overWarn) })}
              </p>
            )}

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
                  <input type="number" step="any" value={round._typeDiffs.rcMin || ''} onChange={(e) => updateTypeDiff('rcMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                  <input type="number" step="any" value={round._typeDiffs.rcMax || ''} onChange={(e) => updateTypeDiff('rcMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.rc || ''} onChange={(e) => updateTypeDiff('rc', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                    <DifficultyRefPicker value={round._typeDiffs.rc || 0} onChange={(n) => updateTypeDiff('rc', n)} type="RC" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-purple-600 dark:text-purple-300 font-medium">HB (rf)</span>
                  <input type="number" step="any" value={round._typeDiffs.hbMin || ''} onChange={(e) => updateTypeDiff('hbMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  <input type="number" step="any" value={round._typeDiffs.hbMax || ''} onChange={(e) => updateTypeDiff('hbMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.hbRf || ''} onChange={(e) => updateTypeDiff('hbRf', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                    <DifficultyRefPicker value={round._typeDiffs.hbRf || 0} onChange={(n) => updateTypeDiff('hbRf', n)} type="HB" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-purple-600 dark:text-purple-300 font-medium">HB (ln)</span>
                  <input type="number" step="any" value={round._typeDiffs.hbLnMin || ''} onChange={(e) => updateTypeDiff('hbLnMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  <input type="number" step="any" value={round._typeDiffs.hbLnMax || ''} onChange={(e) => updateTypeDiff('hbLnMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.hbLn || ''} onChange={(e) => updateTypeDiff('hbLn', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                    <DifficultyRefPicker value={round._typeDiffs.hbLn || 0} onChange={(n) => updateTypeDiff('hbLn', n)} type="HB" field="ln" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-indigo-600 dark:text-indigo-300 font-medium">LN (ln)</span>
                  <input type="number" step="any" value={round._typeDiffs.lnMin || ''} onChange={(e) => updateTypeDiff('lnMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                  <input type="number" step="any" value={round._typeDiffs.lnMax || ''} onChange={(e) => updateTypeDiff('lnMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.ln || ''} onChange={(e) => updateTypeDiff('ln', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                    <DifficultyRefPicker value={round._typeDiffs.ln || 0} onChange={(n) => updateTypeDiff('ln', n)} type="LN" field="ln" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-amber-600 dark:text-amber-300 font-medium">SV (rf)</span>
                  <input type="number" step="any" value={round._typeDiffs.svMin || ''} onChange={(e) => updateTypeDiff('svMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                  <input type="number" step="any" value={round._typeDiffs.svMax || ''} onChange={(e) => updateTypeDiff('svMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.sv || ''} onChange={(e) => updateTypeDiff('sv', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                    <DifficultyRefPicker value={round._typeDiffs.sv || 0} onChange={(n) => updateTypeDiff('sv', n)} type="SV" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-rose-600 dark:text-rose-300 font-medium">TB (rf)</span>
                  <input type="number" step="any" value={round._typeDiffs.tbMin || ''} onChange={(e) => updateTypeDiff('tbMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <input type="number" step="any" value={round._typeDiffs.tbMax || ''} onChange={(e) => updateTypeDiff('tbMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.tbRf || ''} onChange={(e) => updateTbLinked('rf', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                    <DifficultyRefPicker value={round._typeDiffs.tbRf || 0} onChange={(n) => updateTbLinked('rf', n)} type="TB" field="rf" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <span className="text-xs text-rose-600 dark:text-rose-300 font-medium">TB (ln)</span>
                  <input type="number" step="any" value={round._typeDiffs.tbLnMin || ''} onChange={(e) => updateTypeDiff('tbLnMin', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <input type="number" step="any" value={round._typeDiffs.tbLnMax || ''} onChange={(e) => updateTypeDiff('tbLnMax', Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" value={round._typeDiffs.tbLn || ''} onChange={(e) => updateTbLinked('ln', Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-rose-400" />
                    <DifficultyRefPicker value={round._typeDiffs.tbLn || 0} onChange={(n) => updateTbLinked('ln', n)} type="TB" field="ln" />
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
                    <input type="number" step="any" value={round._typeDiffs.rc || ''} onChange={(e) => updateTypeDiff('rc', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-purple-600 dark:text-purple-300 mb-0.5">HB (rf)</label>
                    <input type="number" step="any" value={round._typeDiffs.hbRf || ''} onChange={(e) => updateTypeDiff('hbRf', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-purple-600 dark:text-purple-300 mb-0.5">HB (ln)</label>
                    <input type="number" step="any" value={round._typeDiffs.hbLn || ''} onChange={(e) => updateTypeDiff('hbLn', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-indigo-600 dark:text-indigo-300 mb-0.5">LN (ln)</label>
                    <input type="number" step="any" value={round._typeDiffs.ln || ''} onChange={(e) => updateTypeDiff('ln', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-amber-600 dark:text-amber-300 mb-0.5">SV (rf)</label>
                    <input type="number" step="any" value={round._typeDiffs.sv || ''} onChange={(e) => updateTypeDiff('sv', Number(e.target.value))} className="w-full px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-neutral-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-neutral-200">{t('round.maps.title')}</label>
              <div className="flex gap-1 flex-wrap">
                {enableEstimation && round._maps.some((map) => map.category !== 'SV' && (!!map.beatmapId || !!tournamentId)) && (
                  <button
                    type="button"
                    onClick={() => setEstimateSignal((value) => value + 1)}
                    title={t('round.maps.estimate.title')}
                    className="px-2 py-0.5 text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                  >
                    {t('round.maps.estimate')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAllMapDifficulties}
                  disabled={!hasMapDifficulties}
                  title={t('round.maps.clearDifficulties')}
                  className="px-2 py-0.5 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('round.maps.clearDifficulties')}
                </button>
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
                  getMapHistory={getMapHistory}
                  enableEstimation={enableEstimation}
                  tournamentId={tournamentId}
                  roundId={round.id}
                  estimateSignal={estimateSignal}
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

// round.difficulty 的收数规则:
//   TB (含 slot='TB1', type 都是 'TB'):不参与本轮统计
//   HB:同一张图有 rf/ln 两个刻度,两侧都填就取平均 (rf+ln)/2 作为一个数据点,
//        单侧有就用那侧,两侧都是 0 就跳过。rf/ln 尺度不严格对应,但作
//        round-level 的 fallback 数字足够。
//   其它 (RC/LN/SV/SPECIAL):存储字段 difficulty > 0 就收 difficulty。
function recalcDifficulty(maps: ExtendedMap[]): Round['difficulty'] {
  if (maps.length === 0) return { min: 0, max: 0, average: 0 }
  const points: number[] = []
  // 勾了"不参与难度统计"的图不进本轮 min/max/average(与前端取数同一口径)。
  for (const m of countableMaps(maps)) {
    if (m.type === 'TB') continue
    if (m.type === 'HB') {
      const rf = m.difficulty > 0 ? m.difficulty : 0
      const ln = (m.difficultyLn ?? 0) > 0 ? m.difficultyLn! : 0
      // 双值偏 ln 2/3;单侧就用那侧;都空跳过。
      if (rf > 0 && ln > 0) points.push(rf + (ln - rf) * (2 / 3))
      else if (rf > 0) points.push(rf)
      else if (ln > 0) points.push(ln)
      else continue
    } else {
      if (m.difficulty > 0) points.push(m.difficulty)
    }
  }
  if (points.length === 0) return { min: 0, max: 0, average: 0 }
  const min = +Math.min(...points).toFixed(2)
  const max = +Math.max(...points).toFixed(2)
  const average = +(points.reduce((s, d) => s + d, 0) / points.length).toFixed(2)
  return { min, max, average }
}

function autoCalcTypeDiffs(
  maps: ExtendedMap[],
  current: RoundWithMeta['_typeDiffs'],
  locked: RoundWithMeta['_typeDiffsLocked']
): RoundWithMeta['_typeDiffs'] {
  const result = { ...current }
  const avg = (type: string, field: 'difficulty' | 'difficultyLn' = 'difficulty') => {
    const diffs = countableMaps(maps).filter((m) => m.type === type).map((m) => m[field] || 0).filter((d) => d > 0)
    return diffs.length > 0 ? +(diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(2) : 0
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
