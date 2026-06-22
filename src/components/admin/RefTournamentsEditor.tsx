'use client'

import { useEffect, useMemo, useState } from 'react'
import { tournaments } from '@/generated/tournaments'
import { useT } from '@/lib/i18n'
import { invalidateRefWhitelist } from './DifficultyRefPicker'

interface Data {
  tournamentIds: string[]
}

export function RefTournamentsEditor() {
  const t = useT()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [originalSelected, setOriginalSelected] = useState<Set<string>>(new Set())
  const [sha, setSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ref-tournaments')
      if (!res.ok) throw new Error()
      const { data, sha: s } = (await res.json()) as { data: Data; sha: string | null }
      const ids = new Set(data.tournamentIds)
      setSelected(ids)
      setOriginalSelected(new Set(ids))
      setSha(s)
    } catch {
      setStatus({ type: 'error', message: t('refTn.loadFailed') })
    } finally {
      setLoading(false)
    }
  }

  const sortedTournaments = useMemo(
    () =>
      [...tournaments].sort((a, b) => {
        const yd = (b.year || 0) - (a.year || 0)
        if (yd !== 0) return yd
        return (a.abbreviation || a.id).localeCompare(b.abbreviation || b.id)
      }),
    []
  )

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return sortedTournaments
    return sortedTournaments.filter(
      (tn) =>
        tn.id.toLowerCase().includes(q) ||
        (tn.abbreviation || '').toLowerCase().includes(q) ||
        (tn.name || '').toLowerCase().includes(q)
    )
  }, [filter, sortedTournaments])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const dirty = useMemo(() => {
    if (selected.size !== originalSelected.size) return true
    for (const id of selected) if (!originalSelected.has(id)) return true
    return false
  }, [selected, originalSelected])

  const handleSave = async () => {
    setSubmitting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/ref-tournaments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentIds: [...selected], sha }),
      })
      if (!res.ok) throw new Error()
      setStatus({ type: 'success', message: t('refTn.saved') })
      invalidateRefWhitelist()
      fetchData()
    } catch {
      setStatus({ type: 'error', message: t('refTn.saveFailed') })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">
        {t('admin.loading')}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">
          {t('refTn.title')}
        </h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{t('refTn.subtitle')}</p>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('refTn.filterPlaceholder')}
          className="flex-1 px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
        />
        <span className="text-xs text-gray-400 dark:text-neutral-500">
          {t('refTn.selectedCount', { n: selected.size })}
        </span>
      </div>

      <div className="border border-gray-100 dark:border-neutral-800 rounded max-h-[480px] overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-400 dark:text-neutral-500">
            {t('refTn.noMatch')}
          </div>
        )}
        {filtered.map((tn) => {
          const checked = selected.has(tn.id)
          return (
            <label
              key={tn.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800/40 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(tn.id)}
                className="accent-purple-600"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-700 dark:text-neutral-200 truncate">
                  {tn.abbreviation || tn.id}
                  {tn.year ? (
                    <span className="ml-2 text-xs text-gray-400 dark:text-neutral-500">
                      {tn.year}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-400 dark:text-neutral-500 truncate font-mono">
                  {tn.id}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-400 dark:text-neutral-500">{t('refTn.note')}</p>
        <button
          onClick={handleSave}
          disabled={submitting || !dirty}
          className="px-4 py-2 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? t('packs.saving') : t('refTn.save')}
        </button>
      </div>

      {status && (
        <div
          className={`mt-3 p-2 rounded text-xs ${
            status.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200'
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  )
}
