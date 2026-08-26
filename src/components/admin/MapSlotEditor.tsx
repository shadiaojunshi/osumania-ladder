'use client'

import { useState } from 'react'
import type { BeatmapMeta } from '@/lib/types'
import { useT, type MessageKey } from '@/lib/i18n'
import { DifficultyRefPicker } from './DifficultyRefPicker'
import type { RefType } from '@/lib/referenceData'
import type { MapHistorySummary } from '@/hooks/useMapHistory'
import { classifySetConflict } from '@/lib/mapConflictDetection'

export type MapCategory = 'RC' | 'LN' | 'HB' | 'SV' | 'TB' | 'SPECIAL'

export const REAL_TYPES: Record<string, { id: string; name: string }[]> = {
  RC: [
    { id: 'SS', name: 'Stream (SS)' },
    { id: 'JS', name: 'Jumpstream (JS)' },
    { id: 'SA', name: 'Stamina (SA)' },
    { id: 'CJ', name: 'Chordjack (CJ)' },
    { id: 'SJ', name: 'Jackspeed (SJ)' },
    { id: 'MX', name: 'Rcmix (MX)' },
    { id: 'DP', name: 'Dump (DP)' },
    { id: 'ADP', name: 'Accurate dump (ADP)' },
    { id: 'STC', name: 'Streamtech (STC)' },
    { id: 'MTC', name: 'Minijacktech (MTC)' },
    { id: 'SATC', name: 'Stamina tech (SATC)' },
    { id: 'JTC', name: 'Jackmained tech (JTC)' },
    { id: 'WTC', name: 'Wild tech (WTC)' },
    { id: 'TC', name: 'Tech (TC)' },
    { id: 'ORC', name: 'Otherrice (ORC)' },
    { id: 'PDRC', name: 'Pending RC (PDRC)' },
  ],
  HB: [
    { id: 'HB1', name: 'Speed/Generic (HB1)' },
    { id: 'HB2', name: 'Mid-tempo/Jack/Shield (HB2)' },
    { id: 'HB3', name: 'Technical (HB3)' },
    { id: 'HB4', name: 'Wildcard (HB4)' },
    { id: 'HB5', name: 'Old-school (HB5)' },
    { id: 'RCmainHB', name: 'RC-main Hybrid (RCmainHB)' },
    { id: 'LNmainHB', name: 'LN-main Hybrid (LNmainHB)' },
    { id: 'MXHB', name: 'Mixed HB (MXHB)' },
    { id: 'MNTB', name: 'Mini Tiebreaker (MNTB)' },
    { id: 'OHB', name: 'OtherHybrid (OHB)' },
    { id: 'PDHB', name: 'Pending HB (PDHB)' },
  ],
  LN: [
    { id: 'RE', name: 'Release (RE)' },
    { id: 'CO', name: 'Coordination (CO)' },
    { id: 'TE', name: 'Timinghell (TE)' },
    { id: 'DE', name: 'Density (DE)' },
    { id: 'JW', name: 'Jacky Wildcard LN (JW)' },
    { id: 'SW', name: 'Speedy Wildcard LN (SW)' },
    { id: 'LNMX', name: 'LN Mixed (LNMX)' },
    { id: 'LNWC', name: 'LN Wildcard (LNWC)' },
    { id: 'LNTC', name: 'Technical LN (LNTC)' },
    { id: 'IN', name: 'Inverse (IN)' },
    { id: 'LNWL', name: 'LNwall (LNWL)' },
    { id: 'OLN', name: 'Other LN (OLN)' },
    { id: 'PDLN', name: 'Pending LN (PDLN)' },
  ],
  SV: [
    { id: 'SV1', name: 'Pattern (SV1)' },
    { id: 'SV2', name: 'Rhythm (SV2)' },
    { id: 'SI', name: 'Sightread (SI)' },
    { id: 'ME', name: 'Memorization (ME)' },
    { id: 'SVMX', name: 'SVMix (SVMX)' },
    { id: 'GM', name: 'Gimmick (GM)' },
    { id: 'PDSV', name: 'Pending SV (PDSV)' },
  ],
  TB: [
    { id: 'TB', name: 'Tiebreaker' },
  ],
  SPECIAL: [],
}

export const PENDING_REAL_TYPE_BY_CATEGORY: Partial<Record<MapCategory, string>> = {
  RC: 'PDRC',
  LN: 'PDLN',
  HB: 'PDHB',
  SV: 'PDSV',
}

const CATEGORY_COLORS: Record<string, string> = {
  RC: '#3b82f6',
  HB: '#8b5cf6',
  LN: '#6366f1',
  SV: '#f59e0b',
  TB: '#ef4444',
  SPECIAL: '#10b981',
}

const CATEGORIES: { id: MapCategory; label: string; labelKey?: MessageKey }[] = [
  { id: 'RC', label: 'RC' },
  { id: 'LN', label: 'LN' },
  { id: 'HB', label: 'HB' },
  { id: 'SV', label: 'SV' },
  { id: 'TB', label: 'TB' },
  { id: 'SPECIAL', label: '特殊', labelKey: 'mapSlot.cat.special' },
]

export interface ExtendedMap extends BeatmapMeta {
  category: MapCategory
}

interface Props {
  map: ExtendedMap
  onChange: (map: ExtendedMap) => void
  onRemove: () => void
  getMapHistory?: (beatmapId: number | undefined, beatmapsetId: number | undefined) => MapHistorySummary | null
}

function needsDualDifficulty(category: MapCategory): boolean {
  return category === 'HB' || category === 'TB' || category === 'SPECIAL'
}

function getDiffLabel(category: MapCategory): string {
  switch (category) {
    case 'RC': case 'SV': return 'rf'
    case 'LN': return 'ln'
    case 'HB': case 'TB': case 'SPECIAL': return 'rf'
  }
}

// MapCategory → RefType。picker 只认 RC/HB/LN/SV/TB,SPECIAL 当 RC 处理(常见情况)
function toRefType(category: MapCategory): RefType {
  switch (category) {
    case 'RC': return 'RC'
    case 'HB': return 'HB'
    case 'LN': return 'LN'
    case 'SV': return 'SV'
    case 'TB': return 'TB'
    case 'SPECIAL': return 'RC'
  }
}

export function MapSlotEditor({ map, onChange, onRemove, getMapHistory }: Props) {
  const t = useT()
  const [showHistory, setShowHistory] = useState(false)
  const dual = needsDualDifficulty(map.category)
  const realTypeOptions = map.category === 'SPECIAL'
    ? Object.entries(REAL_TYPES).flatMap(([cat, types]) =>
        cat === 'SPECIAL' ? [] : types.map((t) => ({ ...t, group: cat }))
      )
    : (REAL_TYPES[map.category] || [])

  const history = getMapHistory ? getMapHistory(map.beatmapId, map.beatmapsetId) : null

  // 检测类型冲突:大键型(type)或真实类型(realType)只要和历史不一致就提示。
  // 之前只在大键型不同才弹,导致同为 RC 但 realType 不同(如 Stream vs Jack)不提示。
  const exactHistory = history?.matchKind === 'bid'
  const rateSetConflict = history?.matchKind === 'set'
    && classifySetConflict([
      ...history.usages.map((usage) => ({
        beatmapId: usage.beatmapId || 0,
        beatmapsetId: usage.beatmapsetId,
        realType: usage.realType,
        name: usage.name,
      })),
      {
        beatmapId: map.beatmapId || 0,
        beatmapsetId: map.beatmapsetId,
        realType: map.realType,
        name: map.name,
      },
    ]) === 'rateSet'
  const typeConflict = exactHistory && history &&
    history.totalUses > 0 &&
    map.type !== history.mostCommonType &&
    history.types.has(map.type) === false  // 当前 type 从未被用过
  const realTypeConflict = exactHistory && history &&
    history.totalUses > 0 &&
    !!map.realType &&
    !!history.mostCommonRealType &&
    map.realType !== history.mostCommonRealType &&
    history.realTypes.has(map.realType) === false  // 当前 realType 从未被用过
  const hasTypeConflict = typeConflict || realTypeConflict || rateSetConflict

  const updateField = <K extends keyof ExtendedMap>(key: K, value: ExtendedMap[K]) => {
    onChange({ ...map, [key]: value })
  }

  // 清空本图难度框(HB/TB/SPECIAL 同时清 rf+ln 两框)。清空后该 type 若未 lock
  // 会自动回落到平均难度,方便"直接用平均"。
  const clearDifficulty = () => {
    onChange({ ...map, difficulty: 0, difficultyLn: dual ? undefined : map.difficultyLn })
  }
  const hasDiff = (map.difficulty || 0) > 0 || (dual && (map.difficultyLn || 0) > 0)

  const handleCategoryChange = (category: MapCategory) => {
    const newRealTypes = REAL_TYPES[category] || []
    const firstRealType = newRealTypes.length > 0 ? newRealTypes[0].id : map.realType
    onChange({
      ...map,
      category,
      type: category === 'SPECIAL' ? map.type : category,
      realType: firstRealType,
      difficultyLn: needsDualDifficulty(category) ? (map.difficultyLn || undefined) : undefined,
    })
  }

  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${
      hasTypeConflict
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-700'
        : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-100 dark:border-neutral-800'
    }`}>
      <div
        className="category-swatch w-1.5 self-stretch rounded-full shrink-0"
        style={{ background: CATEGORY_COLORS[map.category] || '#9ca3af' }}
      />

      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {/* 历史提示横幅 */}
        {history && history.totalUses > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                hasTypeConflict
                  ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700'
                  : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
              }`}
              title={t('mapSlot.history.title')}
            >
              {hasTypeConflict ? '⚠️' : '📋'}
              <span>
                {history.matchKind === 'set'
                  ? t('mapSlot.history.relatedSet', { n: history.totalUses })
                  : t('mapSlot.history.used', { n: history.totalUses })}
              </span>
              <span className="text-[10px]">
                ({history.mostCommonType})
              </span>
              <span>{showHistory ? '▼' : '▶'}</span>
            </button>

            {hasTypeConflict && (
              <span className="text-yellow-700 dark:text-yellow-300 text-xs">
                {rateSetConflict
                  ? t('mapSlot.history.rateSetConflict', {
                      current: map.realType,
                      suggested: history.mostCommonRealType,
                    })
                  : typeConflict
                  ? t('mapSlot.history.conflict', {
                      current: map.type,
                      suggested: history.mostCommonType,
                    })
                  : t('mapSlot.history.conflictRealType', {
                      current: map.realType,
                      suggested: history.mostCommonRealType,
                    })}
              </span>
            )}
          </div>
        )}

        {/* 展开的历史记录 */}
        {showHistory && history && (
          <div className="border border-blue-200 dark:border-blue-800 rounded bg-white dark:bg-neutral-900 p-2 text-xs">
            <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">
              {t('mapSlot.history.previous')}:
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {history.usages.slice(0, 10).map((usage, i) => (
                <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-neutral-400">
                  <span className="font-mono text-[10px]">
                    {usage.tournamentAbbr} {usage.roundAbbr}
                  </span>
                  <span className="font-mono text-[10px]">{usage.slot}</span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    usage.type === map.type
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400'
                  }`}>
                    {usage.type} ({usage.realType})
                  </span>
                </div>
              ))}
              {history.usages.length > 10 && (
                <div className="text-gray-400 dark:text-neutral-500 text-[10px] italic">
                  {t('mapSlot.history.more', { n: history.usages.length - 10 })}
                </div>
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-blue-100 dark:border-blue-900">
              <div className="text-gray-500 dark:text-neutral-400 text-[10px]">
                {t('mapSlot.history.summary')}:
                {Array.from(history.types.entries()).map(([type, count]) => (
                  <span key={type} className="ml-2">
                    {type}×{count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={map.slot}
            onChange={(e) => updateField('slot', e.target.value)}
            className="w-14 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs font-mono text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
            title={t('mapSlot.slot.title')}
          />

          <select
            value={map.category}
            onChange={(e) => handleCategoryChange(e.target.value as MapCategory)}
            className="px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.labelKey ? t(c.labelKey) : c.label}</option>
            ))}
          </select>

          {map.category === 'SPECIAL' && (
            <input
              type="text"
              value={map.type}
              onChange={(e) => updateField('type', e.target.value.toUpperCase())}
              placeholder={t('mapSlot.special.placeholder')}
              className="w-16 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs font-mono text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
              title={t('mapSlot.special.title')}
            />
          )}

          {realTypeOptions.length > 0 && (
            <select
              value={map.realType}
              onChange={(e) => updateField('realType', e.target.value)}
              className="px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs flex-1 min-w-0 bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
            >
              {realTypeOptions.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          )}

          {realTypeOptions.length === 0 && (
            <input
              type="text"
              value={map.realType}
              onChange={(e) => updateField('realType', e.target.value)}
              placeholder={t('mapSlot.realType.custom')}
              className="px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs flex-1 min-w-0 bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="any"
              min="0"
              max="20"
              value={map.difficulty || ''}
              onChange={(e) => updateField('difficulty', Number(e.target.value))}
              placeholder={getDiffLabel(map.category)}
              className="w-16 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
            />
            <span className="text-xs text-gray-400 dark:text-neutral-500">{getDiffLabel(map.category)}</span>
            <DifficultyRefPicker
              value={map.difficulty || 0}
              onChange={(n) => updateField('difficulty', n)}
              type={toRefType(map.category)}
              field={map.category === 'LN' ? 'ln' : 'rf'}
            />
          </div>

          {dual && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                min="0"
                max="20"
                value={map.difficultyLn || ''}
                onChange={(e) => updateField('difficultyLn', Number(e.target.value) || undefined)}
                placeholder="ln"
                className="w-16 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
              />
              <span className="text-xs text-gray-400 dark:text-neutral-500">ln</span>
              <DifficultyRefPicker
                value={map.difficultyLn || 0}
                onChange={(n) => updateField('difficultyLn', n || undefined)}
                type={toRefType(map.category)}
                field="ln"
              />
            </div>
          )}

          {hasDiff && (
            <button
              type="button"
              onClick={clearDifficulty}
              title={t('mapSlot.clearDiff')}
              className="px-1.5 py-1 text-[10px] border border-gray-200 dark:border-neutral-700 rounded text-gray-400 dark:text-neutral-500 hover:text-red-500 hover:border-red-300 dark:hover:border-red-800"
            >
              {t('mapSlot.clearDiff.short')}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={onRemove}
        className="text-gray-300 dark:text-neutral-600 hover:text-red-500 shrink-0 mt-1"
        title={t('mapSlot.remove')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
