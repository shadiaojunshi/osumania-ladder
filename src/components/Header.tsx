'use client'

import { useViewStore } from '@/stores/viewStore'

const VIEW_MODES = [
  { key: 'tournament' as const, label: '整场比赛', num: '0' },
  { key: 'round' as const, label: '每轮图池', num: '1' },
  { key: 'type' as const, label: '每轮键型', num: '2' },
]

const TYPE_FILTERS = ['全部', 'RC', 'HB', 'LN', 'SV', 'TB']

export function Header() {
  const { mode, setMode, activeFilter, setActiveFilter, searchQuery, setSearchQuery } = useViewStore()

  return (
    <header className="h-14 border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
      <h1 className="text-lg font-bold whitespace-nowrap">
        <span className="text-purple-700">osu!mania</span> 难度天梯榜
      </h1>

      <div className="flex items-center gap-1 ml-4">
        {VIEW_MODES.map((vm) => (
          <button
            key={vm.key}
            onClick={() => setMode(vm.key)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              mode === vm.key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {vm.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 ml-4">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f === '全部' ? null : f)}
            className={`px-2.5 py-1 rounded text-sm transition-colors ${
              (f === '全部' && !activeFilter) || activeFilter === f
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索比赛或轮次..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-48 focus:outline-none focus:border-purple-400"
        />
        <a
          href="/admin"
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-purple-600 border border-gray-200 rounded hover:border-purple-300"
        >
          录入数据
        </a>
      </div>
    </header>
  )
}
