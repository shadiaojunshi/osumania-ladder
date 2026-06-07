'use client'

import { useViewStore } from '@/stores/viewStore'
import { tournaments } from '@/generated/tournaments'

const VIEW_MODES = [
  { key: 'tournament' as const, label: '整场比赛', num: '0' },
  { key: 'round' as const, label: '每轮图池', num: '1' },
  { key: 'type' as const, label: '每轮键型', num: '2' },
]

const STANDARD_TYPES = ['RC', 'HB', 'LN', 'SV', 'TB']

function getAllTypes(): string[] {
  const seen = new Set<string>()
  for (const t of tournaments) {
    for (const r of t.rounds) {
      for (const m of r.maps) {
        seen.add(m.type)
      }
    }
  }
  const standard = STANDARD_TYPES.filter((t) => seen.has(t))
  const custom = [...seen].filter((t) => !STANDARD_TYPES.includes(t)).sort()
  return [...standard, ...custom]
}

export function Header() {
  const { mode, setMode, activeFilter, setActiveFilter, searchQuery, setSearchQuery } = useViewStore()
  const allTypes = getAllTypes()

  return (
    <header className="border-b border-gray-200 flex items-center px-2 sm:px-4 gap-2 sm:gap-4 shrink-0 flex-wrap md:flex-nowrap min-h-14 py-1 md:py-0 md:h-14">
      <h1 className="text-base sm:text-lg font-bold whitespace-nowrap">
        <span className="text-purple-700">osu!mania</span> <span className="hidden sm:inline">比赛谱面</span>天梯榜
      </h1>

      <div className="flex items-center gap-1 sm:ml-4 flex-wrap">
        {VIEW_MODES.map((vm) => (
          <button
            key={vm.key}
            onClick={() => setMode(vm.key)}
            className={`px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
              mode === vm.key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {vm.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 sm:ml-4 flex-wrap">
        <button
          onClick={() => setActiveFilter(null)}
          className={`px-2 sm:px-2.5 py-1 rounded text-xs sm:text-sm transition-colors ${
            !activeFilter
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          全部
        </button>
        {allTypes.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-2 sm:px-2.5 py-1 rounded text-xs sm:text-sm transition-colors ${
              activeFilter === f
                ? 'bg-orange-500 text-white'
                : STANDARD_TYPES.includes(f)
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="md:ml-auto flex items-center gap-1 sm:gap-2 flex-wrap">
        <input
          type="text"
          placeholder="搜索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded text-xs sm:text-sm w-28 sm:w-48 focus:outline-none focus:border-purple-400"
        />
        <a
          href="/download"
          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-500 hover:text-purple-600 border border-gray-200 rounded hover:border-purple-300 whitespace-nowrap"
        >
          下载合包
        </a>
        <a
          href="/admin"
          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-500 hover:text-purple-600 border border-gray-200 rounded hover:border-purple-300 whitespace-nowrap"
        >
          录入数据
        </a>
      </div>
    </header>
  )
}
