'use client'

import type { BeatmapMeta } from '@/lib/types'

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
    { id: 'STC', name: 'Streamtech (STC)' },
    { id: 'MTC', name: 'Minijacktech (MTC)' },
    { id: 'JTC', name: 'Jackmained tech (JTC)' },
    { id: 'WTC', name: 'Wild tech (WTC)' },
    { id: 'TC', name: 'Tech (TC)' },
    { id: 'ORC', name: 'Otherrice (ORC)' },
  ],
  HB: [
    { id: 'HB1', name: 'Speed/Generic (HB1)' },
    { id: 'HB2', name: 'Mid-tempo/Jack/Shield (HB2)' },
    { id: 'HB3', name: 'Technical (HB3)' },
    { id: 'HB4', name: 'Wildcard (HB4)' },
    { id: 'HB5', name: 'Old-school (HB5)' },
    { id: 'OHB', name: 'OtherHybrid (OHB)' },
  ],
  LN: [
    { id: 'RE', name: 'Release (RE)' },
    { id: 'CO', name: 'Coordination (CO)' },
    { id: 'TE', name: 'Timinghell (TE)' },
    { id: 'DE', name: 'Density (DE)' },
    { id: 'SW', name: 'Speedy Wildcard LN (SW)' },
    { id: 'JW', name: 'Jacky Wildcard LN (JW)' },
    { id: 'IN', name: 'Inverse (IN)' },
    { id: 'OLN', name: 'OtherLongnote (OLN)' },
  ],
  SV: [
    { id: 'SV1', name: 'Pattern (SV1)' },
    { id: 'SV2', name: 'Rhythm (SV2)' },
    { id: 'SI', name: 'Sightread (SI)' },
    { id: 'ME', name: 'Memorization (ME)' },
  ],
  TB: [
    { id: 'TB', name: 'Tiebreaker' },
  ],
  SPECIAL: [],
}

const CATEGORY_COLORS: Record<string, string> = {
  RC: '#3b82f6',
  HB: '#8b5cf6',
  LN: '#6366f1',
  SV: '#f59e0b',
  TB: '#ef4444',
  SPECIAL: '#10b981',
}

const CATEGORIES: { id: MapCategory; label: string }[] = [
  { id: 'RC', label: 'RC' },
  { id: 'LN', label: 'LN' },
  { id: 'HB', label: 'HB' },
  { id: 'SV', label: 'SV' },
  { id: 'TB', label: 'TB' },
  { id: 'SPECIAL', label: '特殊' },
]

export interface ExtendedMap extends BeatmapMeta {
  category: MapCategory
}

interface Props {
  map: ExtendedMap
  onChange: (map: ExtendedMap) => void
  onRemove: () => void
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

export function MapSlotEditor({ map, onChange, onRemove }: Props) {
  const dual = needsDualDifficulty(map.category)
  const realTypeOptions = REAL_TYPES[map.category] || []

  const updateField = <K extends keyof ExtendedMap>(key: K, value: ExtendedMap[K]) => {
    onChange({ ...map, [key]: value })
  }

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
    <div className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-100">
      <div
        className="w-1.5 self-stretch rounded-full shrink-0"
        style={{ background: CATEGORY_COLORS[map.category] || '#9ca3af' }}
      />

      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={map.slot}
            onChange={(e) => updateField('slot', e.target.value)}
            className="w-14 px-1.5 py-1 border border-gray-200 rounded text-xs font-mono text-center focus:outline-none focus:border-purple-400"
            title="槽位名称 (如 RC1, EX1)"
          />

          <select
            value={map.category}
            onChange={(e) => handleCategoryChange(e.target.value as MapCategory)}
            className="px-1.5 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-purple-400"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>

          {map.category === 'SPECIAL' && (
            <input
              type="text"
              value={map.type}
              onChange={(e) => updateField('type', e.target.value.toUpperCase())}
              placeholder="类型名 (如 EX)"
              className="w-16 px-1.5 py-1 border border-gray-200 rounded text-xs font-mono text-center focus:outline-none focus:border-purple-400"
              title="在天梯榜中显示的类型名"
            />
          )}

          {realTypeOptions.length > 0 && (
            <select
              value={map.realType}
              onChange={(e) => updateField('realType', e.target.value)}
              className="px-1.5 py-1 border border-gray-200 rounded text-xs flex-1 min-w-0 focus:outline-none focus:border-purple-400"
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
              placeholder="自定义类型"
              className="px-1.5 py-1 border border-gray-200 rounded text-xs flex-1 min-w-0 focus:outline-none focus:border-purple-400"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              max="20"
              value={map.difficulty || ''}
              onChange={(e) => updateField('difficulty', Number(e.target.value))}
              placeholder={getDiffLabel(map.category)}
              className="w-16 px-1.5 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:border-purple-400"
            />
            <span className="text-xs text-gray-400">{getDiffLabel(map.category)}</span>
          </div>

          {dual && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                min="0"
                max="20"
                value={map.difficultyLn || ''}
                onChange={(e) => updateField('difficultyLn', Number(e.target.value) || undefined)}
                placeholder="ln"
                className="w-16 px-1.5 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:border-purple-400"
              />
              <span className="text-xs text-gray-400">ln</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onRemove}
        className="text-gray-300 hover:text-red-500 shrink-0 mt-1"
        title="删除"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
