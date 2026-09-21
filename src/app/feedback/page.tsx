'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { tournaments } from '@/generated/tournaments'
import { buildMapBrowserRows, browserOptionGroups, browserRowTarget, type MapBrowserRow } from '@/lib/mapBrowserRows'
import { isUsableBeatmapId } from '@/lib/beatmapIds'
import { usePrefsStore } from '@/stores/prefsStore'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { FeedbackForm } from '@/components/feedback/FeedbackForm'
import { TextFeedbackForm } from '@/components/feedback/TextFeedbackForm'

const allRows = buildMapBrowserRows(tournaments)
const PAGE_SIZE = 40
export default function FeedbackPage() {
  const english = usePrefsStore(s => s.lang) === 'en'
  const tr = (zh: string, en: string) => english ? en : zh
  const [realType, setRealType] = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<MapBrowserRow | null>(null)
  const [mode, setMode] = useState<'text' | 'map'>('text')
  const [contextError, setContextError] = useState(false)
  const groups = browserOptionGroups(allRows, tr('其他', 'Other'))
  const rows = useMemo(() => allRows.filter(row => (!realType || row.realType === realType) && (!tournamentId || row.tournamentId === tournamentId) && (!search || `${row.name} ${row.slot} ${row.roundName} ${row.beatmapId ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [realType, tournamentId, search])
  const available = useMemo(() => new Set(allRows.filter(r => !realType || r.realType === realType).map(r => r.tournamentId)), [realType])
  useEffect(() => {
    // Read URL after hydration: this page remains a static export with no API reads.
    const params = new URLSearchParams(window.location.search)
    if (!params.has('tournamentId')) return
    const matches = allRows.filter(r => r.tournamentId === params.get('tournamentId') && r.roundId === params.get('roundId') && r.slot === params.get('slot') && (!params.get('beatmapId') || String(r.beatmapId) === params.get('beatmapId')))
    queueMicrotask(() => {
      if (matches.length === 1) { setSelected(matches[0]); setTournamentId(matches[0].tournamentId); setMode('map') } else setContextError(true)
    })
  }, [])
  const selectClass = 'min-w-0 rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900'
  return <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-neutral-950 dark:text-neutral-100">
    <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-neutral-800"><Link href="/" className="font-semibold text-purple-700 dark:text-purple-300">osu!mania ladder</Link><div className="flex items-center gap-4"><Link href="/download">{tr('下载', 'Downloads')}</Link><PlayerAvatar /></div></header>
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-300">Community feedback</p><h1 className="mt-2 text-3xl font-bold">{tr('让难度更准确', 'Help refine the ladder')}</h1><p className="mt-3 text-sm text-gray-500 dark:text-neutral-400">{tr('找到谱面，建议键型、槽位难度或整轮参考难度。所有人都可以参与。', 'Find a map and suggest its pattern, difficulty, or a reference difficulty for the whole round. Everyone can contribute.')}</p></div>
      {contextError && <p role="alert">{tr('链接中的目标不存在或不唯一，请从列表重新选择。', 'The linked target is missing or ambiguous. Please select it from the list.')}</p>}
      <div className="flex flex-wrap gap-3"><button className="rounded-lg border px-4 py-2 text-sm aria-pressed:bg-purple-600 aria-pressed:text-white" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>{tr('直接写反馈', 'Write feedback')}</button><button className="rounded-lg border px-4 py-2 text-sm aria-pressed:bg-purple-600 aria-pressed:text-white" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>{tr('选择谱面修改', 'Suggest map changes')}</button>{mode === 'text' && selected && <button className="text-sm underline" onClick={() => setSelected(null)}>{tr('取消关联谱面', 'Remove map context')}</button>}</div>
      {mode === 'text' && <TextFeedbackForm key={selected?.key ?? 'general'} target={selected ? browserRowTarget(selected) : undefined} heading={selected ? `${selected.tournamentName} · ${selected.roundName} · ${selected.slot}` : undefined} />}
      {mode === 'map' && selected && <FeedbackForm key={selected.key} row={selected} onClose={() => setSelected(null)} />}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="grid gap-3 border-b border-gray-200 p-4 sm:grid-cols-3 dark:border-neutral-800">
          <select aria-label={tr('键型', 'Pattern')} className={selectClass} value={realType} onChange={e => { setRealType(e.target.value); setTournamentId(''); setPage(0) }}><option value="">{tr('所有键型', 'All patterns')}</option>{groups.map(g => <optgroup key={g.category} label={g.category}>{g.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>)}</select>
          <select aria-label={tr('比赛', 'Tournament')} className={selectClass} value={tournamentId} onChange={e => { setTournamentId(e.target.value); setPage(0) }}><option value="">{tr('所有比赛', 'All tournaments')}</option>{tournaments.filter(t => available.has(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input aria-label={tr('搜索谱面、轮次或 BID', 'Search map, round or BID')} placeholder={tr('搜索谱面、轮次或 BID', 'Search map, round or BID')} className={selectClass} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">{rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => <div key={row.key} className="flex items-center justify-between gap-3 p-4 hover:bg-purple-50/50 dark:hover:bg-purple-950/20"><div className="min-w-0"><p className="text-xs text-gray-500">{row.tournamentName} · {row.roundName}</p><p className="mt-1 break-words text-sm font-medium"><span className="mr-2 text-purple-600 dark:text-purple-300">{row.slot}</span>{row.name}</p><p className="mt-1 text-xs text-gray-500">{row.realType || '—'} · {row.difficulty || '—'}{row.difficultyLn ? ` / LN ${row.difficultyLn}` : ''}{isUsableBeatmapId(row.beatmapId) ? ` · BID ${row.beatmapId}` : ''}</p></div><button className="shrink-0 rounded-lg border border-purple-200 px-3 py-2 text-sm text-purple-700 dark:border-purple-800 dark:text-purple-300" onClick={() => { setSelected(row); setMode('map'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{tr('建议修改', 'Suggest')}</button></div>)}</div>
        <div className="flex items-center justify-between border-t border-gray-200 p-4 text-sm dark:border-neutral-800"><span>{rows.length} {tr('张谱面', 'maps')} · {page + 1} / {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}</span><div className="flex gap-3"><button disabled={!page} className="disabled:opacity-30" onClick={() => setPage(p => p - 1)}>{tr('上一页', 'Previous')}</button><button disabled={(page + 1) * PAGE_SIZE >= rows.length} className="disabled:opacity-30" onClick={() => setPage(p => p + 1)}>{tr('下一页', 'Next')}</button></div></div>
      </section>
    </main>
  </div>
}
