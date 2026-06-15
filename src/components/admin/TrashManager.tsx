'use client'

import { useState, useEffect, useCallback } from 'react'
import { useT } from '@/lib/i18n'
import { usePrefsStore } from '@/stores/prefsStore'

interface TrashItem {
  id: string
  kind: 'tournament' | 'map'
  label: string
  deletedAt: number
  deletedByName: string
}

function formatTime(ts: number, lang: 'zh' | 'en'): string {
  const d = new Date(ts)
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })
}

export function TrashManager() {
  const t = useT()
  const lang = usePrefsStore((s) => s.lang)
  if (typeof window !== 'undefined') console.count('[TrashManager render]')
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trash')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setStatus({ type: 'error', message: t('trash.loadFailed') })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchTrash()
  }, [fetchTrash])

  const restore = async (item: TrashItem) => {
    if (!confirm(t('trash.restoreConfirm', { label: item.label }))) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('trash.restoreFailed'))
      setStatus({ type: 'success', message: t('trash.restored', { label: item.label }) })
      fetchTrash()
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('trash.title')}</h3>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{t('trash.subtitle')}</p>
        </div>
        <button
          onClick={fetchTrash}
          disabled={loading}
          className="px-3 py-1 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          {t('trash.refresh')}
        </button>
      </div>

      {status && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-200'}`}>
          {status.message}
        </div>
      )}

      {loading && <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admin.loading')}</div>}

      {!loading && items.length === 0 && (
        <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('trash.empty')}</div>
      )}

      {!loading && items.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.kind === 'tournament' ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200' : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200'}`}>
                    {item.kind === 'tournament' ? t('trash.kind.tournament') : t('trash.kind.map')}
                  </span>
                  <span className="text-sm text-gray-800 dark:text-neutral-200 font-mono truncate">{item.label}</span>
                </div>
                <div className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                  {t('trash.deletedBy', { name: item.deletedByName, time: formatTime(item.deletedAt, lang) })}
                </div>
              </div>
              <button
                onClick={() => restore(item)}
                disabled={busy}
                className="px-3 py-1 text-xs bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-200 rounded hover:bg-green-100 dark:hover:bg-green-900/60 disabled:opacity-50 shrink-0"
              >
                {t('trash.restore')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
