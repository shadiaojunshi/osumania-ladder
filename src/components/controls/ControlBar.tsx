'use client'

import { useViewStore } from '@/stores/viewStore'
import type { SortMode } from '@/stores/viewStore'
import { tournaments } from '@/generated/tournaments'

const COMMON_ROUNDS = ['Qual', 'RO32', 'RO16', 'QF', 'SF', 'F', 'GF']

export function ControlBar() {
  const {
    zoom, setZoom,
    columnWidth, setColumnWidth,
    rowHeight, setRowHeight,
    rfLnOffset, setRfLnOffset,
    sortMode, setSortMode,
    hideQualifiers, setHideQualifiers,
    yearFilter, setYearFilter,
    roundFilter, setRoundFilter,
  } = useViewStore()

  const cycleSortMode = () => {
    const modes: SortMode[] = ['default', 'difficulty-desc', 'difficulty-asc']
    const idx = modes.indexOf(sortMode)
    setSortMode(modes[(idx + 1) % modes.length])
  }

  const sortLabel = sortMode === 'default' ? '默认排序'
    : sortMode === 'difficulty-desc' ? '难度↓'
    : '难度↑'

  // 只列出实际存在的年份和轮次缩写,避免下拉里出现死项
  const availableYears = [...new Set(tournaments.map((t) => t.year).filter((y): y is number => !!y))].sort((a, b) => b - a)
  const presentRoundAbbrs = new Set(tournaments.flatMap((t) => t.rounds.map((r) => r.abbreviation)))
  const availableRounds = COMMON_ROUNDS.filter((r) => presentRoundAbbrs.has(r))

  return (
    <footer className="h-14 border-t border-gray-200 flex items-center px-4 gap-4 shrink-0 bg-gray-50">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">缩放</span>
        <button
          onClick={() => setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(1)))}
          className="w-6 h-6 rounded bg-gray-200 text-sm flex items-center justify-center hover:bg-gray-300"
        >
          -
        </button>
        <span className="text-xs w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(Math.min(3, +(zoom + 0.1).toFixed(1)))}
          className="w-6 h-6 rounded bg-gray-200 text-sm flex items-center justify-center hover:bg-gray-300"
        >
          +
        </button>
      </div>

      <div className="w-px h-6 bg-gray-300" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">列宽</span>
        <input
          type="range"
          min={80}
          max={280}
          value={columnWidth}
          onChange={(e) => setColumnWidth(Number(e.target.value))}
          className="w-20 h-1 accent-purple-600"
        />
        <span className="text-xs font-mono text-gray-600 w-8">{columnWidth}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">行高</span>
        <input
          type="range"
          min={20}
          max={200}
          value={rowHeight}
          onChange={(e) => setRowHeight(Number(e.target.value))}
          className="w-20 h-1 accent-purple-600"
        />
        <span className="text-xs font-mono text-gray-600 w-6">{rowHeight}</span>
      </div>

      <div className="w-px h-6 bg-gray-300" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">RF/LN 对齐</span>
        <input
          type="range"
          min={-3}
          max={3}
          step={0.5}
          value={rfLnOffset}
          onChange={(e) => setRfLnOffset(Number(e.target.value))}
          className="w-16 h-1 accent-indigo-500"
        />
        <span className="text-xs font-mono text-indigo-600">
          rf10=ln{10 + rfLnOffset}
        </span>
      </div>

      <div className="w-px h-6 bg-gray-300" />

      <button
        onClick={cycleSortMode}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          sortMode !== 'default'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
        }`}
      >
        {sortLabel}
      </button>

      <button
        onClick={() => setHideQualifiers(!hideQualifiers)}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          hideQualifiers
            ? 'bg-orange-100 text-orange-700'
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
        }`}
      >
        {hideQualifiers ? '资格赛: 隐藏' : '资格赛: 显示'}
      </button>

      <div className="w-px h-6 bg-gray-300" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">年份</span>
        <select
          value={yearFilter ?? ''}
          onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : null)}
          className={`px-2 py-1 text-xs rounded border ${
            yearFilter !== null ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-300 text-gray-600'
          }`}
        >
          <option value="">全部</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">轮次</span>
        <select
          value={roundFilter ?? ''}
          onChange={(e) => setRoundFilter(e.target.value || null)}
          className={`px-2 py-1 text-xs rounded border ${
            roundFilter ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-300 text-gray-600'
          }`}
        >
          <option value="">全部</option>
          {availableRounds.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="ml-auto text-xs text-gray-400">
        osu!mania Ladder v0.1
      </div>
    </footer>
  )
}
