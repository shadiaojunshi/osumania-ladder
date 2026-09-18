'use client'

import { useState, useEffect, useCallback } from 'react'
import { useT, type MessageKey } from '@/lib/i18n'
import { usePrefsStore } from '@/stores/prefsStore'

interface AuditEntry {
  ts: number
  actorUid: string
  actorName: string
  action: string
  target: string
  detail?: string
  ip?: string
  // R16：list 里的 target/detail 可能被 KV metadata 字节上限收缩过；true 时可按 key 取全文。
  truncated?: boolean
  key?: string
}

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  'tournament.create': 'audit.action.tournament.create',
  'tournament.update': 'audit.action.tournament.update',
  'tournament.delete': 'audit.action.tournament.delete',
  'tournament.restore': 'audit.action.tournament.restore',
  'map.delete': 'audit.action.map.delete',
  'map.restore': 'audit.action.map.restore',
  'admin.setRole': 'audit.action.admin.setRole',
  'admin.remove': 'audit.action.admin.remove',
  'references.update': 'audit.action.references.update',
  'packs.update': 'audit.action.packs.update',
}

const ACTION_COLOR: Record<string, string> = {
  'tournament.create': 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  'tournament.update': 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  'tournament.delete': 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  'tournament.restore': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  'map.delete': 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  'map.restore': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  'admin.setRole': 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
  'admin.remove': 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200',
  'references.update': 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300',
  'packs.update': 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300',
}

function formatTime(ts: number, lang: 'zh' | 'en'): string {
  return new Date(ts).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })
}

export function AuditLog() {
  const t = useT()
  const lang = usePrefsStore((s) => s.lang)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // R16：被收缩过的条目 → 按 key 取回完整正文，展示在行下方。
  const [expanded, setExpanded] = useState<Record<string, AuditEntry | 'loading' | 'error'>>({})

  const toggleFull = useCallback(async (entry: AuditEntry) => {
    if (!entry.key) return
    const k = entry.key
    if (expanded[k] && expanded[k] !== 'error') {
      setExpanded((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
      return
    }
    setExpanded((prev) => ({ ...prev, [k]: 'loading' }))
    try {
      const res = await fetch(`/api/audit?key=${encodeURIComponent(k)}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      if (!data?.entry) throw new Error('empty')
      setExpanded((prev) => ({ ...prev, [k]: data.entry as AuditEntry }))
    } catch {
      setExpanded((prev) => ({ ...prev, [k]: 'error' }))
    }
  }, [expanded])

  const fetchAudit = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/audit?limit=100')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch {
      setError(t('audit.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchAudit()
  }, [fetchAudit])

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('audit.title')}</h3>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{t('audit.subtitle')}</p>
        </div>
        <button
          onClick={fetchAudit}
          disabled={loading}
          className="px-3 py-1 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          {t('audit.refresh')}
        </button>
      </div>

      {error && <div className="mx-4 mt-3 px-3 py-2 rounded text-xs bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-200">{error}</div>}

      {loading && <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admin.loading')}</div>}

      {!loading && entries.length === 0 && !error && (
        <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('audit.empty')}</div>
      )}

      {!loading && entries.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-[calc(100vh-260px)] overflow-y-auto">
          {entries.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
              <div className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${ACTION_COLOR[e.action] || 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                  {ACTION_LABEL_KEYS[e.action] ? t(ACTION_LABEL_KEYS[e.action]) : e.action}
                </span>
                <span className="text-gray-700 dark:text-neutral-200 font-mono truncate flex-1">{e.target}</span>
                {e.detail && <span className="text-gray-400 dark:text-neutral-500 text-xs truncate max-w-[160px]">{e.detail}</span>}
                {e.truncated && e.key && (
                  <button
                    onClick={() => toggleFull(e)}
                    className="text-xs text-blue-600 dark:text-blue-300 underline shrink-0"
                  >
                    {t('audit.viewFull')}
                  </button>
                )}
                <span className="text-gray-500 dark:text-neutral-400 text-xs shrink-0">{e.actorName}</span>
                <span className="text-gray-400 dark:text-neutral-500 text-xs shrink-0 w-36 text-right">{formatTime(e.ts, lang)}</span>
              </div>
              {e.key && expanded[e.key] && (
                <div className="px-4 pb-3 text-xs text-gray-600 dark:text-neutral-300">
                  {expanded[e.key] === 'loading' && <span className="text-gray-400 dark:text-neutral-500">{t('admin.loading')}</span>}
                  {expanded[e.key] === 'error' && <span className="text-red-500 dark:text-red-300">{t('audit.loadFailed')}</span>}
                  {expanded[e.key] !== 'loading' && expanded[e.key] !== 'error' && (
                    <div className="rounded border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 p-2 space-y-1">
                      <div className="font-mono break-all whitespace-pre-wrap">
                        {(expanded[e.key] as AuditEntry).target}
                      </div>
                      {(expanded[e.key] as AuditEntry).detail && (
                        <div className="text-gray-500 dark:text-neutral-400 break-all whitespace-pre-wrap">
                          {(expanded[e.key] as AuditEntry).detail}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
