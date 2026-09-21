'use client'

import { useEffect, useState } from 'react'
import { feedbackDatasetVersion } from '@/generated/feedbackDataset'
import { usePrefsStore } from '@/stores/prefsStore'
import { validateSubmission, stripToken, SUGGEST_LIMITS } from '@/lib/suggestions/validation'
import { stableJson } from '@/lib/suggestions/fingerprint'
import { submitSuggestion, SubmissionError } from '@/lib/suggestions/client'
import type { SuggestStoredSubmission, SuggestTarget } from '@/lib/suggestions/types'
import { TurnstileChallenge } from './TurnstileChallenge'

const endpoint = process.env.NEXT_PUBLIC_FEEDBACK_ENDPOINT ?? ''
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
const input = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export function TextFeedbackForm({ target, heading }: { target?: SuggestTarget; heading?: string }) {
  const en = usePrefsStore(s => s.lang) === 'en'
  const tr = (zh: string, english: string) => en ? english : zh
  const key = 'ladder:feedback-text:v1:' + stableJson(target ?? {})
  const [message, setMessage] = useState('')
  const [alias, setAlias] = useState('')
  const [links, setLinks] = useState('')
  const [pending, setPending] = useState<SuggestStoredSubmission | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [error, setError] = useState('')
  const [challenge, setChallenge] = useState(0)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState({ content: '', token: '' })
  const [retryAt, setRetryAt] = useState(0)
  const [clock, setClock] = useState(0)
  const content = JSON.stringify({ message, alias, links, target })
  const token = verified.content === content ? verified.token : ''
  const snapshot = { message, alias, links, pending }
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (saved && ['message', 'alias', 'links'].every(k => typeof saved[k] === 'string')) {
          setMessage(saved.message); setAlias(saved.alias); setLinks(saved.links)
          const p = saved.pending && validateSubmission({ ...saved.pending, turnstileToken: 'restore' })
          if (p?.ok && p.value.proposal.kind === 'text') setPending(stripToken(p.value))
        }
      } catch { /* retain unreadable storage */ }
      setReady(true)
    })
    return () => { active = false }
  }, [key])
  useEffect(() => {
    if (ready && !receipt) try { localStorage.setItem(key, JSON.stringify({ message, alias, links, pending })) } catch { /* network submission still requires durable save */ }
  }, [ready, receipt, key, message, alias, links, pending])
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
    const validated = validateSubmission({ schemaVersion: 1, clientRequestId: crypto.randomUUID(), datasetVersion: feedbackDatasetVersion, baseFingerprint: 'text-feedback', proposal: { kind: 'text', message, ...(target ? { target } : {}) }, alias: alias.trim(), evidenceUrls: links.split('\n').map(s => s.trim()).filter(Boolean), turnstileToken: token })
    if (!validated.ok) {
      setError(tr('内容有误，请修改后再提交：', 'Please fix these before submitting: ') + validated.errors.map(e => e.message).join('；'))
      setBusy(false)
      return
    }
    try {
      const stored = stripToken(validated.value)
      if (pending && stableJson({ ...pending, clientRequestId: undefined }) === stableJson({ ...stored, clientRequestId: undefined })) stored.clientRequestId = pending.clientRequestId
      setPending(stored)
      // 落盘只为"响应丢失后能用同一个 clientRequestId 重试"。存不下（隐私模式/配额满）
      // 也**必须继续提交**：这里一抛就会被下面的 catch 说成"提交未确认"，而请求根本没发出去
      // —— 玩家看到"内容已保留"会一直重试，却永远提交不了。
      try { localStorage.setItem(key, JSON.stringify({ ...snapshot, pending: stored })) } catch { /* 内存里仍有 pending，本次会话内重试依旧幂等 */ }
      const result = await submitSuggestion(endpoint, stored, token)
      setReceipt(result.id)
      try { localStorage.removeItem(key) } catch { /* receipt already confirmed */ }
    } catch (e) {
      setError(tr('提交未确认，内容已保留：', 'Submission not confirmed; your text is retained: ') + (e as Error).message)
      if (e instanceof SubmissionError && e.retryAfter) { const now = Date.now(); setClock(now); setRetryAt(now + e.retryAfter * 1000) }
    } finally { setBusy(false); setVerified({ content: '', token: '' }); setChallenge(n => n + 1) }
  }
  return <section aria-label={tr('文字反馈', 'Written feedback')} className="space-y-4 rounded-xl border border-purple-200 bg-white p-5 dark:border-purple-900 dark:bg-neutral-950">
    <div><h2 className="font-semibold">{tr('直接写下你的反馈', 'Write your feedback')}</h2><p className="mt-1 text-sm text-gray-500">{heading || tr('不用先选谱。问题、建议或需要修改的地方，都可以写在这里。', 'No map selection required. Describe a problem, suggestion, or correction here.')}</p></div>
    {receipt ? <p role="status" className="break-all text-emerald-700 dark:text-emerald-300">{tr('已收到，等待审核。收据编号：', 'Received for review. Receipt: ')}{receipt}</p> : <fieldset disabled={busy || !ready} className="space-y-4">
      <label className="block text-sm">{tr('反馈内容', 'Your feedback')}<textarea className={input} rows={5} maxLength={SUGGEST_LIMITS.maxMessageLength} value={message} onChange={e => setMessage(e.target.value)} placeholder={tr('例如：某场比赛的 LN2 比相邻谱面难很多，建议上调……', 'For example: LN2 in this tournament feels harder than nearby maps…')} /><span className="text-xs text-gray-500">{message.length} / {SUGGEST_LIMITS.maxMessageLength}</span></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">{tr('昵称（可选）', 'Alias (optional)')}<input className={input} maxLength={60} value={alias} onChange={e => setAlias(e.target.value)} /></label><label className="text-sm">{tr('相关链接（最多两个 HTTPS 链接，每行一个）', 'Links (up to two HTTPS URLs, one per line)')}<textarea className={input} rows={2} maxLength={1002} value={links} onChange={e => setLinks(e.target.value)} /></label></div>
      {!endpoint || !siteKey ? <p className="text-sm text-amber-700 dark:text-amber-300">{tr('反馈提交暂未开放，你可以先填写并保留草稿。', 'Submission is not open yet. Your draft is saved locally.')}</p> : verifying ? <TurnstileChallenge key={`${content}:${challenge}`} siteKey={siteKey} onToken={value => setVerified({ content, token: value })} errorText={tr('验证加载失败，请重试。', 'Verification unavailable. Please retry.')} retryText={tr('重新验证', 'Retry verification')} /> : <button className="rounded border px-3 py-2 text-sm" disabled={!message.trim()} onClick={() => setVerifying(true)}>{tr('填写完成，开始验证', 'Ready — verify to submit')}</button>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="rounded-lg bg-purple-600 px-5 py-2 text-white disabled:opacity-40" disabled={!token || !message.trim() || !endpoint || !siteKey || remaining > 0} onClick={submit}>{busy ? tr('提交中…', 'Submitting…') : remaining ? `${remaining}s` : tr('提交反馈', 'Send feedback')}</button>
      <p className="text-xs text-gray-500">{tr('无需登录。两种反馈合计每个 IP 每天最多 10 条，北京时间早上 8 点重置；重复重试不占新名额。共享网络也共享额度。', 'No login required. Both feedback types share 10 submissions per IP per UTC day. Retries do not use another slot; shared networks share the allowance.')}</p>
    </fieldset>}
  </section>
}
