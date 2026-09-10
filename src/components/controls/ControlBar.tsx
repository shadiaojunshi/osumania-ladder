'use client'

import { useViewStore } from '@/stores/viewStore'
import type { SortMode } from '@/stores/viewStore'
import { usePrefsStore } from '@/stores/prefsStore'
import { tournaments } from '@/generated/tournaments'
import { useT } from '@/lib/i18n'

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
    roundBorderAlways, setRoundBorderAlways,
  } = useViewStore()
  const theme = usePrefsStore((s) => s.theme)
  const toggleTheme = usePrefsStore((s) => s.toggleTheme)
  const lang = usePrefsStore((s) => s.lang)
  const setLang = usePrefsStore((s) => s.setLang)
  const t = useT()

  const cycleSortMode = () => {
    const modes: SortMode[] = ['default', 'difficulty-desc', 'difficulty-asc']
    const idx = modes.indexOf(sortMode)
    setSortMode(modes[(idx + 1) % modes.length])
  }

  const sortLabel = sortMode === 'default' ? t('control.sort.default')
    : sortMode === 'difficulty-desc' ? t('control.sort.diffDesc')
    : t('control.sort.diffAsc')

  // 只列出实际存在的年份和轮次缩写,避免下拉里出现死项
  const availableYears = [...new Set(tournaments.map((t) => t.year).filter((y): y is number => !!y))].sort((a, b) => b - a)
  const presentRoundAbbrs = new Set(tournaments.flatMap((t) => t.rounds.map((r) => r.abbreviation)))
  const availableRounds = COMMON_ROUNDS.filter((r) => presentRoundAbbrs.has(r))

  return (
    <footer className="border-t border-gray-200 dark:border-neutral-800 flex items-center px-2 sm:px-4 gap-2 sm:gap-4 shrink-0 bg-gray-50 dark:bg-neutral-900 flex-wrap xl:flex-nowrap min-h-14 py-1 xl:py-0 xl:h-14">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-neutral-400">{t('control.zoom')}</span>
        <button
          onClick={() => setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(1)))}
          className="w-6 h-6 rounded bg-gray-200 dark:bg-neutral-700 dark:text-neutral-100 text-sm flex items-center justify-center hover:bg-gray-300 dark:hover:bg-neutral-600"
        >
          -
        </button>
        <span className="text-xs w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(Math.min(3, +(zoom + 0.1).toFixed(1)))}
          className="w-6 h-6 rounded bg-gray-200 dark:bg-neutral-700 dark:text-neutral-100 text-sm flex items-center justify-center hover:bg-gray-300 dark:hover:bg-neutral-600"
        >
          +
        </button>
      </div>

      <div className="w-px h-6 bg-gray-300 dark:bg-neutral-700 hidden md:block" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-neutral-400">{t('control.columnWidth')}</span>
        <input
          type="range"
          min={80}
          max={280}
          value={columnWidth}
          onChange={(e) => setColumnWidth(Number(e.target.value))}
          className="w-20 h-1 accent-purple-600"
        />
        <span className="text-xs font-mono text-gray-600 dark:text-neutral-300 w-8">{columnWidth}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-neutral-400">{t('control.rowHeight')}</span>
        <input
          type="range"
          min={20}
          max={200}
          value={rowHeight}
          onChange={(e) => setRowHeight(Number(e.target.value))}
          className="w-20 h-1 accent-purple-600"
        />
        <span className="text-xs font-mono text-gray-600 dark:text-neutral-300 w-6">{rowHeight}</span>
      </div>

      <div className="w-px h-6 bg-gray-300 dark:bg-neutral-700 hidden md:block" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-neutral-400">{t('control.rfLnAlign')}</span>
        <input
          type="range"
          min={-3}
          max={3}
          step={0.5}
          value={rfLnOffset}
          onChange={(e) => setRfLnOffset(Number(e.target.value))}
          className="w-16 h-1 accent-indigo-500"
        />
        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-300">
          rf10=ln{10 + rfLnOffset}
        </span>
      </div>

      <div className="w-px h-6 bg-gray-300 dark:bg-neutral-700 hidden md:block" />

      <button
        onClick={cycleSortMode}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          sortMode !== 'default'
            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600'
        }`}
      >
        {sortLabel}
      </button>

      <button
        onClick={() => setHideQualifiers(!hideQualifiers)}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          hideQualifiers
            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200'
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600'
        }`}
      >
        {hideQualifiers ? t('control.qual.hide') : t('control.qual.show')}
      </button>

      {/* 白边默认开启且作用于三种视图,开关全视图可见。 */}
      <button
        onClick={() => setRoundBorderAlways(!roundBorderAlways)}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          roundBorderAlways
            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600'
        }`}
        title={t('control.borderAlways.title')}
      >
        {roundBorderAlways ? t('control.borderAlways.on') : t('control.borderAlways.off')}
      </button>

      <div className="w-px h-6 bg-gray-300 dark:bg-neutral-700 hidden md:block" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-neutral-400">{t('control.year')}</span>
        <select
          value={yearFilter ?? ''}
          onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : null)}
          className={`px-2 py-1 text-xs rounded border ${
            yearFilter !== null
              ? 'bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-200'
              : 'bg-white border-gray-300 text-gray-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300'
          }`}
        >
          <option value="">{t('control.year.all')}</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-neutral-400">{t('control.round')}</span>
        <select
          value={roundFilter ?? ''}
          onChange={(e) => setRoundFilter(e.target.value || null)}
          className={`px-2 py-1 text-xs rounded border ${
            roundFilter
              ? 'bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-200'
              : 'bg-white border-gray-300 text-gray-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300'
          }`}
        >
          <option value="">{t('control.year.all')}</option>
          {availableRounds.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="xl:ml-auto flex items-center gap-2">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600 transition-colors"
          title={lang === 'zh' ? t('control.lang.toEn') : t('control.lang.toZh')}
          aria-label={t('control.lang.aria')}
        >
          {lang === 'zh' ? t('control.lang.en') : t('control.lang.zh')}
        </button>
        <button
          onClick={toggleTheme}
          className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600 transition-colors"
          title={theme === 'dark' ? t('control.theme.toLight') : t('control.theme.toDark')}
          aria-label={t('control.theme.aria')}
        >
          {theme === 'dark' ? t('control.theme.dark') : t('control.theme.light')}
        </button>
        <span className="text-xs text-gray-400 dark:text-neutral-500 hidden md:block">
          {t('control.version')}
        </span>
      </div>
    </footer>
  )
}
