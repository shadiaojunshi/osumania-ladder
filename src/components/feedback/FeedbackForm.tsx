'use client'

import { useEffect, useMemo, useState } from 'react'
import { tournaments } from '@/generated/tournaments'
import { feedbackDatasetVersion } from '@/generated/feedbackDataset'
import ladder from '@data/ref-ladder.json'
import { REAL_TYPES, realTypeMatchesCategory, difficultyFieldsFor } from '@/lib/realTypeCatalog'
import { computeRoundRefValues, ROUND_REF_FIELDS } from '@/lib/roundReference'
import { planSuggestChange } from '@/lib/suggestions/patch'
import { stableJson, targetFingerprint } from '@/lib/suggestions/fingerprint'
import { validateSubmission, stripToken, SUGGEST_LIMITS } from '@/lib/suggestions/validation'
import { submitSuggestion, SubmissionError } from '@/lib/suggestions/client'
import type { SuggestKind, SuggestProposal, SuggestStoredSubmission } from '@/lib/suggestions/types'
import { browserRowTarget, type MapBrowserRow } from '@/lib/mapBrowserRows'
import { usePrefsStore } from '@/stores/prefsStore'
import { TurnstileChallenge } from './TurnstileChallenge'

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900'
const endpoint = process.env.NEXT_PUBLIC_FEEDBACK_ENDPOINT ?? ''
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
const draftPrefix = 'ladder:feedback-draft:v2:'

export function FeedbackForm({ row, onClose }: { row: MapBrowserRow; onClose: () => void }) {
  const draftKey = draftPrefix + row.key
  const english = usePrefsStore(s => s.lang) === 'en'
  const tr = (zh: string, en: string) => english ? en : zh
  const [kind, setKind] = useState<SuggestKind>('slot.realType')
  const [realType, setRealType] = useState(row.realType)
  const [difficulty, setDifficulty] = useState(String(row.difficulty || ''))
  const [difficultyLn, setDifficultyLn] = useState(String(row.difficultyLn || ''))
  const [offset, setOffset] = useState(0)
  const [reason, setReason] = useState('')
  const [alias, setAlias] = useState('')
  const [links, setLinks] = useState('')
  const [challengeResult, setChallengeResult] = useState({ key: '', token: '' })
  const [challenge, setChallenge] = useState(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [clock, setClock] = useState(0)
  const [pending, setPending] = useState<SuggestStoredSubmission | null>(null)
  const [verifying, setVerifying] = useState(false)
  const tournament = tournaments.find(t => t.id === row.tournamentId)!
  // 目标用**唯一实现** `browserRowTarget`（占位 BID 会被丢掉，见 beatmapIds.ts），
  // 不在这里再抄一遍 `> 1` 的判据 —— 抄出来的副本正是上次 0/1 占位事故的来源。
  const target = useMemo(() => browserRowTarget(row), [row])
  const values = useMemo(() => computeRoundRefValues({ tournaments, entries: ladder.entries, basePos: 0, offset, exclude: target }), [offset, target])
  const proposal: SuggestProposal = kind === 'slot.realType' ? { kind, target, value: realType }
    : kind === 'slot.difficulty' ? { kind, target, value: { ...(difficulty.trim() ? { difficulty: Number(difficulty) } : {}), ...(difficultyFieldsFor(row.category).includes('difficultyLn') && difficultyLn.trim() ? { difficultyLn: Number(difficultyLn) } : {}) } }
    : { kind, target: { tournamentId: row.tournamentId, roundId: row.roundId }, reference: { tournamentId: row.tournamentId, roundId: row.roundId, offset }, value: values }
  const plan = planSuggestChange({ rounds: tournament.rounds, proposal })
  const contentKey = JSON.stringify({ proposal, reason, alias, links })
  const token = challengeResult.key === contentKey ? challengeResult.token : ''

  // Restore only this target's draft; the retry UUID/body survive refresh without token.
  useEffect(() => {
    queueMicrotask(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null')
      if (saved?.rowKey === row.key && ['slot.realType','slot.difficulty','round.reference'].includes(saved.kind) && ['realType','difficulty','difficultyLn','reason','alias','links'].every(k => typeof saved[k] === 'string') && Number.isInteger(saved.offset) && saved.offset >= 0 && saved.offset <= 12) {
        setKind(saved.kind); setRealType(saved.realType); setDifficulty(saved.difficulty); setDifficultyLn(saved.difficultyLn)
        setOffset(saved.offset); setReason(saved.reason); setAlias(saved.alias); setLinks(saved.links); setPending(saved.pending ?? null)
      }
    } catch { /* leave unreadable data for manual recovery */ }
    setReady(true)
    })
  }, [row.key, draftKey])
  useEffect(() => {
    if (!ready || receipt) return
    try { localStorage.setItem(draftKey, JSON.stringify({ rowKey: row.key, kind, realType, difficulty, difficultyLn, offset, reason, alias, links, pending })) } catch { /* current form still retained in memory */ }
  }, [draftKey, ready, receipt, row.key, kind, realType, difficulty, difficultyLn, offset, reason, alias, links, pending])
  useEffect(() => {
    if (!retryAt) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [retryAt])
  const remaining = Math.max(0, Math.ceil((retryAt - clock) / 1000))

  async function submit() {
    setBusy(true); setError('')
    // 校验放在 try **外面**：本地校验失败时请求根本没发出去，所以
    //   ① 不能报成"提交未确认"（玩家会以为内容已经到过服务器）；
    //   ② 不能作废这次验证 —— try 的 finally 会清 token 并换新挑战，
    //      而服务端压根没见过这个 token，白白多花一次验证。
    // 内容没改就再点一次时，token 仍然对得上（token 是按 contentKey 绑定的）。
    const business = { schemaVersion: 1, datasetVersion: feedbackDatasetVersion, baseFingerprint: await targetFingerprint(tournament, proposal.target), proposal, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(alias.trim() ? { alias: alias.trim() } : {}), evidenceUrls: links.split('\n').map(s => s.trim()).filter(Boolean) }
    const validated = validateSubmission({ ...business, clientRequestId: crypto.randomUUID(), turnstileToken: token })
    if (!validated.ok) {
      setError(tr('内容有误，请修改后再提交：', 'Please fix these before submitting: ') + validated.errors.map(e => e.message).join('；'))
      setBusy(false)
      return
    }
    try {
      const stored = stripToken(validated.value)
      if (pending && stableJson({ ...pending, clientRequestId: undefined }) === stableJson({ ...stored, clientRequestId: undefined })) stored.clientRequestId = pending.clientRequestId
      setPending(stored)
      // Persist before the network request, including the original UUID — so that a
      // lost response can be retried with the same clientRequestId.
      // 存不下（隐私模式/配额满）也**必须继续提交**：这里一抛就会被下面的 catch 说成
      // "提交未确认"，而那次请求根本没发出去 —— 玩家会以为重试就行，实际永远提交不了。
      try { localStorage.setItem(draftKey, JSON.stringify({ rowKey: row.key, kind, realType, difficulty, difficultyLn, offset, reason, alias, links, pending: stored })) } catch { /* 内存里仍有 pending，本次会话内重试依旧幂等 */ }
      const result = await submitSuggestion(endpoint, stored, token)
      setReceipt(result.id)
      try { localStorage.removeItem(draftKey) } catch { /* receipt already confirmed */ }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'NETWORK'
      setError(tr('提交未确认，输入已保留。请重新完成验证后重试：', 'Submission not confirmed. Your inputs are retained. Complete a new challenge and retry: ') + message)
      if (e instanceof SubmissionError && e.retryAfter) { const now = new Date().getTime(); setClock(now); setRetryAt(now + e.retryAfter * 1000) }
    } finally { setBusy(false); setChallengeResult({ key: '', token: '' }); setChallenge(c => c + 1) }
  }
  return <section className="rounded-xl border border-purple-200 bg-white p-5 shadow-sm dark:border-purple-900 dark:bg-neutral-950" aria-label={tr('提交建议', 'Submit suggestion')}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{row.tournamentName}</h2><p className="text-sm text-gray-500">{row.roundName} · {row.slot} · {row.name}</p></div><button disabled={busy} onClick={onClose} className="rounded border px-3 py-1">{tr('关闭', 'Close')}</button></div>
    {receipt ? <p className="mt-5 break-all text-emerald-700 dark:text-emerald-300" role="status">{tr('已收到，等待审核。收据编号：', 'Received, awaiting review. Receipt: ')}{receipt}</p> : <fieldset disabled={busy} className="mt-4 space-y-4">
      <label className="block text-sm">{tr('建议内容', 'Suggestion type')}<select className={inputClass} value={kind} onChange={e => setKind(e.target.value as SuggestKind)}><option value="slot.realType">{tr('槽位键型', 'Map pattern')}</option><option value="slot.difficulty">{tr('槽位难度', 'Map difficulty')}</option><option value="round.reference">{tr('整轮参考难度', 'Round reference difficulty')}</option></select></label>
      {kind === 'slot.realType' && <label className="block text-sm">{tr('建议键型', 'Proposed pattern')}<select className={inputClass} value={realType} onChange={e => setRealType(e.target.value)}>{Object.entries(REAL_TYPES).map(([category, options]) => <optgroup key={category} label={category}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>)}</select></label>}
      {kind === 'slot.difficulty' && <div className="grid grid-cols-2 gap-3"><label className="text-sm">{row.category === 'LN' ? 'LN' : 'RF'}<input className={inputClass} type="number" min="0.01" max={SUGGEST_LIMITS.maxDifficulty} step="any" value={difficulty} onChange={e => setDifficulty(e.target.value)} /></label>{difficultyFieldsFor(row.category).includes('difficultyLn') && <label className="text-sm">LN<input className={inputClass} type="number" min="0.01" max={SUGGEST_LIMITS.maxDifficulty} step="any" value={difficultyLn} onChange={e => setDifficultyLn(e.target.value)} /></label>}</div>}
      {kind === 'round.reference' && <div className="space-y-2"><label className="block text-sm">{tr('统一标尺位置（0 为起点，每格一轮）', 'Global reference position (one round per step)')}<input className={inputClass} type="range" min="0" max="12" step="1" value={offset} onChange={e => setOffset(Number(e.target.value))} />{offset}</label><div className="grid grid-cols-3 gap-2">{ROUND_REF_FIELDS.map(f => <span key={f.key} className="rounded bg-purple-50 p-2 text-xs dark:bg-purple-950">{f.label} {values[f.key] ? values[f.key].toFixed(2) : '—'}</span>)}</div><p className="text-xs text-amber-700 dark:text-amber-300">{tr('整轮参考会统一同类槽位的难度，覆盖逐图差异；SV 与特殊槽位不变。', 'This sets the same difficulty for maps of each category, replacing individual differences. SV and special categories are unchanged.')}</p></div>}
      <div className="max-h-44 overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-neutral-900">{plan.ok ? (plan.slot ? plan.changes.map(c => ({ ...c, slot: plan.slot, category: plan.category })) : plan.roundChanges).map((c, i) => <p key={i}>{c.slot} · {c.field === 'realType' ? tr('键型', 'Pattern') : c.field === 'difficultyLn' || c.category === 'LN' ? 'LN' : 'RF'}: {c.before || '—'} → {c.after}{c.field === 'realType' && c.category && !realTypeMatchesCategory(c.category, String(c.after)) && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">{tr('（跨类别：这张谱会归入另一个键型的包）', '(cross-category: this map joins another pattern\'s pack)')}</span>}</p>) : plan.detail}</div>
      <label className="block text-sm">{tr('理由（可选）', 'Reason (optional)')}<textarea className={inputClass} maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">{tr('昵称（可选）', 'Alias (optional)')}<input className={inputClass} maxLength={60} value={alias} onChange={e => setAlias(e.target.value)} /></label><label className="text-sm">{tr('证据链接（最多两个 HTTPS 链接，每行一个）', 'Evidence (up to two HTTPS links, one per line)')}<textarea className={inputClass} rows={2} value={links} maxLength={1002} onChange={e => setLinks(e.target.value)} /></label></div>
      {!endpoint || !siteKey ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{tr('反馈提交暂未开放，你可以先浏览与填写建议。', 'Submission is not open yet. You can browse and prepare a suggestion.')}</p> : verifying ? <TurnstileChallenge key={`${contentKey}:${challenge}`} siteKey={siteKey} onToken={value => setChallengeResult({ key: contentKey, token: value })} errorText={tr('验证加载失败，请稍后重试。', 'Challenge unavailable. Please retry later.')} retryText={tr('重新验证', 'Retry verification')} /> : <button className="rounded border px-3 py-2 text-sm" onClick={() => setVerifying(true)}>{tr('填写完成，开始验证', 'Ready — verify to submit')}</button>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button className="rounded-lg bg-purple-600 px-5 py-2 text-white disabled:opacity-40" disabled={!ready || !endpoint || !siteKey || !token || !plan.ok || plan.noop || remaining > 0} onClick={submit}>{busy ? tr('提交中…', 'Submitting…') : remaining ? `${remaining}s` : tr('提交建议', 'Submit suggestion')}</button>
      <p className="text-xs text-gray-500">{tr('无需登录。两种反馈共用每 IP 每天 10 条额度（北京时间早上 8 点重置）。建议审核后才会修改数据。', 'No login required. Both feedback types share 10 submissions per IP per UTC day. Changes require review.')}</p>
    </fieldset>}
  </section>
}
