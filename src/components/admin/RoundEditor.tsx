'use client'

import { useState } from 'react'
import type { Round, BeatmapMeta } from '@/lib/types'
import { MapSlotEditor, type ExtendedMap, type MapCategory, REAL_TYPES } from './MapSlotEditor'

const ROUND_PRESETS = [
  { name: 'Qualifiers', abbreviation: 'Qual', isQualifier: true },
  { name: 'Round of 32', abbreviation: 'RO32' },
  { name: 'Round of 16', abbreviation: 'RO16' },
  { name: 'Quarterfinals', abbreviation: 'QF' },
  { name: 'Semifinals', abbreviation: 'SF' },
  { name: 'Finals', abbreviation: 'F' },
  { name: 'Grand Finals', abbreviation: 'GF' },
]

const STANDARD_TYPES = ['RC', 'HB', 'LN', 'SV', 'TB'] as const

interface RoundWithMeta extends Round {
  _maps: ExtendedMap[]
  _typeDiffs: { rc: number; hb: number; ln: number; sv: number }
}

interface Props {
  round: RoundWithMeta
  index: number
  onChange: (round: RoundWithMeta) => void
  onRemove: () => void
}

export function RoundEditor({ round, index, onChange, onRemove }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [customSlotName, setCustomSlotName] = useState('')

  const updateField = <K extends keyof RoundWithMeta>(key: K, value: RoundWithMeta[K]) => {
    onChange({ ...round, [key]: value })
  }

  const addMap = (category: MapCategory, slotPrefix?: string) => {
    const prefix = slotPrefix || category
    const existingCount = round._maps.filter((m) => m.slot.startsWith(prefix)).length
    const slotNum = existingCount + 1
    const slot = `${prefix}${slotNum}`
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
    onChange({ ...round, _maps: maps, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  const addCustomMap = () => {
    if (!customSlotName.trim()) return
    addMap('SPECIAL' as MapCategory, customSlotName.trim().toUpperCase())
    setCustomSlotName('')
  }

  const updateMap = (mapIndex: number, map: ExtendedMap) => {
    const maps = [...round._maps]
    maps[mapIndex] = map
    onChange({ ...round, _maps: maps, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  const removeMap = (mapIndex: number) => {
    const maps = round._maps.filter((_, i) => i !== mapIndex)
    onChange({ ...round, _maps: maps, maps: mapsToOutput(maps), difficulty: recalcDifficulty(maps) })
  }

  const updateTypeDiff = (key: keyof RoundWithMeta['_typeDiffs'], value: number) => {
    onChange({ ...round, _typeDiffs: { ...round._typeDiffs, [key]: value } })
  }

  const applyPreset = (preset: typeof ROUND_PRESETS[number]) => {
    onChange({
      ...round,
      name: preset.name,
      abbreviation: preset.abbreviation,
      isQualifier: preset.isQualifier || undefined,
    })
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
          <span className="text-sm font-medium">
            {round.name || round.abbreviation || '未命名轮次'}
          </span>
          {round._maps.length > 0 && (
            <span className="text-xs text-gray-400">
              ({round._maps.length} 张谱面)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="text-xs text-red-500 hover:text-red-700"
          >
            删除
          </button>
          <span className="text-gray-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">快速填充:</span>
            {ROUND_PRESETS.map((p) => (
              <button
                key={p.abbreviation}
                onClick={() => applyPreset(p)}
                className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                {p.abbreviation}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">轮次名称</label>
              <input
                type="text"
                value={round.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Quarterfinals"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">缩写</label>
              <input
                type="text"
                value={round.abbreviation}
                onChange={(e) => updateField('abbreviation', e.target.value)}
                placeholder="QF"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">BO (Best Of)</label>
              <input
                type="number"
                value={round.bestOf || ''}
                onChange={(e) => updateField('bestOf', Number(e.target.value) || undefined)}
                placeholder="9"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <label className="block text-xs font-medium text-gray-700 mb-2">各键型平均难度</label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-blue-600 mb-0.5">RC (rf)</label>
                <input
                  type="number"
                  step="0.5"
                  value={round._typeDiffs.rc || ''}
                  onChange={(e) => updateTypeDiff('rc', Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-purple-600 mb-0.5">HB (rf)</label>
                <input
                  type="number"
                  step="0.5"
                  value={round._typeDiffs.hb || ''}
                  onChange={(e) => updateTypeDiff('hb', Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-xs text-indigo-600 mb-0.5">LN (ln)</label>
                <input
                  type="number"
                  step="0.5"
                  value={round._typeDiffs.ln || ''}
                  onChange={(e) => updateTypeDiff('ln', Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs text-amber-600 mb-0.5">SV (rf)</label>
                <input
                  type="number"
                  step="0.5"
                  value={round._typeDiffs.sv || ''}
                  onChange={(e) => updateTypeDiff('sv', Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">谱面列表</label>
              <div className="flex gap-1 flex-wrap">
                {STANDARD_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => addMap(type as MapCategory)}
                    className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100"
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
                placeholder="自定义键型名 (如 EX, DF)"
                className="px-2 py-1 border border-gray-200 rounded text-xs w-36 focus:outline-none focus:border-green-400"
              />
              <button
                onClick={addCustomMap}
                disabled={!customSlotName.trim()}
                className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-40"
              >
                +添加
              </button>
            </div>

            {round._maps.length === 0 && (
              <div className="text-center py-4 text-gray-400 text-xs border border-dashed border-gray-200 rounded">
                点击上方按钮添加谱面槽位
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
            <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">
              难度范围: {round.difficulty.min.toFixed(1)} ~ {round.difficulty.max.toFixed(1)} (平均 {round.difficulty.average.toFixed(1)})
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

export type { RoundWithMeta }
