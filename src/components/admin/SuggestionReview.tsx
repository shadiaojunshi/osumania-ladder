'use client'

import { useState } from 'react'
import { usePrefsStore } from '@/stores/prefsStore'
import type { ReviewItem, ReviewPreview, SuggestionRef } from '@/lib/suggestions/review'
import { previewRequest, reviewRequest } from '@/lib/suggestions/adminClient'

export function SuggestionReview({ draftId, onStage, onSave, onClear, count, busy, status, linked, onRelease, pending, onRecover, onSync }: {
  draftId: string; onStage: (preview: ReviewPreview) => Promise<void>; onSave: () => Promise<void>; onClear: () => void
  count: number; busy: boolean; status?: string; linked: SuggestionRef[]; onRelease: (ref: SuggestionRef) => Promise<void>
  pending: boolean; onRecover: () => Promise<void>; onSync: () => Promise<void>
}) {
  const english = usePrefsStore(s => s.lang) === 'en'
  const tr = (zh: string, en: string) => english ? en : zh
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<ReviewItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [preview, setPreview] = useState<ReviewPreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('all')
  const refFor = (item: ReviewItem): SuggestionRef => ({ id: item.id, date: item.receivedAt.slice(0, 10), revision: item.review.revision, draftId })
  async function run(action: () => Promise<void>) {
    setLoading(true); setError('')
    try { await action() } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  async function load(next?: string) {
    const params = new URLSearchParams({ date, ...(next ? { cursor: next } : {}) })
    const res = await fetch(`/api/suggestions?${params}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Load failed')
    setItems(current => next ? [...current, ...data.items] : data.items)
    setCursor(data.cursor); setLoaded(true)
  }
  const button = 'rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-neutral-700'
  const statuses = { pending: tr('待审核', 'Pending'), staged: tr('待保存', 'Staged'), applied: tr('已发布', 'Published'), ignored: tr('已忽略', 'Ignored'), resolved: tr('已处理', 'Resolved') }
  return <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
    <h2 className="text-lg font-semibold">{tr('反馈审核', 'Feedback review')}</h2>
    <p className="text-sm text-gray-500">{tr('采纳只进入本机暂存。多条建议随“保存全部”一次发布。日期按 UTC；筛选只针对已加载的记录。', 'Accepting stages local drafts. Save all publishes the batch together. Dates use UTC; filters apply to loaded records only.')}</p>
    <fieldset disabled={busy || loading} className="flex flex-wrap items-center gap-3">
      <input type="date" aria-label="UTC date" value={date} onChange={e => { setDate(e.target.value); setItems([]); setCursor(null); setLoaded(false); setPreview(null) }} className={button} />
      <button className={button} onClick={() => run(() => load())}>{tr('加载 / 刷新', 'Load / Refresh')}</button>
      <select aria-label={tr('已加载记录状态', 'Loaded status')} value={filter} onChange={e => setFilter(e.target.value)} className={button}><option value="all">{tr('全部状态', 'All statuses')}</option>{Object.entries(statuses).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
      <button className={button} disabled={!count || pending} onClick={onSave}>{tr('保存全部', 'Save all')} ({count})</button>
      <button className={button} disabled={!count || pending} onClick={onClear}>{tr('清空暂存', 'Clear drafts')}</button>
      {pending && <button className={button} onClick={onRecover}>{tr('恢复上次保存结果', 'Recover last save')}</button>}
      <button className={button} onClick={onSync}>{tr('同步已保存的审核状态', 'Sync published reviews')}</button>
    </fieldset>
    {(error || status) && <p role="status" className="whitespace-pre-wrap break-words text-sm text-amber-700 dark:text-amber-300">{error || status}</p>}
    {linked.length > 0 && <details><summary>{tr('本机暂存的建议来源', 'Suggestions in local drafts')} ({linked.length})</summary><p className="text-xs text-gray-500">{tr('取消关联只释放建议，不回滚草稿中的数值；手动修改过的内容会保留。', 'Unlinking releases the suggestion and keeps draft values, including manual edits.')}</p>{linked.map(ref => <div key={ref.id} className="flex flex-wrap gap-2 py-1 text-xs"><span>{ref.date} · {ref.id}</span><button disabled={pending || busy || loading} className="underline" onClick={() => run(() => onRelease(ref))}>{tr('取消关联', 'Unlink')}</button></div>)}</details>}
    {loaded && !items.length && <p>{tr('这一天暂无建议。', 'No suggestions for this date.')}</p>}
    <div className="divide-y divide-gray-200 dark:divide-neutral-700">{items.filter(item => filter === 'all' || item.review.status === filter).map(item => {
      const proposal = item.submission.proposal
      const target = proposal.target
      const closed = ['applied', 'staged', 'resolved', 'ignored'].includes(item.review.status)
      return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 text-sm"><p className="break-words">{target ? `${target.tournamentId} · ${target.roundId} · ${target.slot ?? tr('整轮', 'Whole round')}` : tr('文字反馈（未关联谱面）', 'Written feedback (no map selected)')}</p><p className="text-xs text-gray-500">{statuses[item.review.status]} · {item.receivedAt}</p></div><div className="flex gap-2">{proposal.kind !== 'text' && <button disabled={loading || busy} className={button} onClick={() => run(async () => setPreview(await previewRequest(refFor(item))))}>{tr('查看建议', 'Review')}</button>}<button disabled={loading || busy || closed} className={button} onClick={() => run(async () => { await reviewRequest('ignore', refFor(item)); setPreview(null); await load() })}>{tr('忽略', 'Ignore')}</button></div>
        {proposal.kind === 'text' && <details className="w-full rounded-lg bg-purple-50 p-3 dark:bg-purple-950/30"><summary className="cursor-pointer">{tr('查看文字反馈', 'Read feedback')} · {proposal.message.slice(0, 50)}{proposal.message.length > 50 ? '…' : ''}</summary><p className="mt-3 whitespace-pre-wrap break-words">{proposal.message}</p><p className="mt-2 text-xs text-gray-500">{tr('自填昵称（未验证）：', 'Unverified alias: ')}{item.submission.alias || '—'}</p>{item.submission.evidenceUrls?.map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm underline">{url}</a>)}<p className="my-3 text-xs text-gray-500">{tr('文字反馈需要人工判断。若需修改比赛，请在编辑器暂存并保存；此处“已处理”仅结束审核，不修改比赛。', 'Review this text manually. Stage tournament changes in the editor if needed. Resolving this feedback only closes the review.')}</p><button disabled={busy || loading || closed} className={button} onClick={() => run(async () => { await reviewRequest('resolve', refFor(item)); await load() })}>{tr('标记已处理', 'Mark resolved')}</button></details>}
      </div>
    })}</div>
    {cursor && <button className={button} disabled={loading} onClick={() => run(() => load(cursor))}>{tr('再加载 20 条', 'Load 20 more')}</button>}
    {preview && <div className="space-y-3 rounded-lg bg-purple-50 p-4 dark:bg-purple-950/30"><h3 className="font-medium">{preview.tournament.name} · {preview.plan.roundId}</h3>{preview.changedSinceSubmission && <p className="text-sm text-amber-700 dark:text-amber-300">{tr('提交时的数据已变化。以下显示当前权威值，请重新判断。', 'Data changed since submission. Review the current authoritative values below.')}</p>}<p className="whitespace-pre-wrap break-words text-sm">{preview.item.submission.reason || tr('未填写理由', 'No reason provided')}</p><p className="text-xs">{tr('自填昵称（未验证）：', 'Unverified alias: ')}{preview.item.submission.alias || '—'}</p>{preview.item.submission.evidenceUrls?.map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm underline">{url}</a>)}<div className="max-h-64 overflow-auto text-sm">{(preview.plan.slot ? preview.plan.changes.map(c => ({ ...c, slot: preview.plan.slot })) : preview.plan.roundChanges).map((c, i) => <p key={i}>{c.slot} · {c.field}: {c.before || '—'} → {c.after}</p>)}</div>{preview.plan.noop ? <p>{tr('当前数据已经符合建议，无需重复保存。', 'Already matches the current data; no save is needed.')}</p> : <button disabled={busy || loading || pending || linked.some(r => r.id === preview.item.id) || preview.item.review.status === 'applied'} className={button} onClick={() => run(async () => { await onStage(preview); setPreview(null); await load() })}>{tr('采纳到暂存', 'Accept into drafts')}</button>}</div>}
  </section>
}
