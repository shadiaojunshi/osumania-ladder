'use client'

import { useEffect, useMemo, useState } from 'react'
import { tournaments } from '@/generated/tournaments'
import { useT } from '@/lib/i18n'
import { invalidateRefLadder } from './DifficultyRefPicker'
import type { LadderEntry } from '@/lib/referenceData'

interface Data {
  entries: LadderEntry[]
}

// 把 (tournamentId, roundId) 解析成展示标签 "ABBR (year) · ROUND"
function labelOf(entry: LadderEntry): string {
  const tn = tournaments.find((t) => t.id === entry.tournamentId)
  if (!tn) return `${entry.tournamentId} · ${entry.roundId}`
  const round = tn.rounds.find((r) => r.id === entry.roundId)
  const tnAbbr = tn.abbreviation || tn.id
  const yr = tn.year ? ` (${tn.year})` : ''
  const rAbbr = round?.abbreviation || round?.name || entry.roundId
  return `${tnAbbr}${yr} · ${rAbbr}`
}

export function RefLadderEditor() {
  const t = useT()
  const [entries, setEntries] = useState<LadderEntry[]>([])
  const [sha, setSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [original, setOriginal] = useState<string>('[]')
  // 添加区:先选比赛再选轮
  const [addTn, setAddTn] = useState<string>('')
  const [addRound, setAddRound] = useState<string>('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ref-ladder')
      if (!res.ok) throw new Error()
      const { data, sha: s } = (await res.json()) as { data: Data; sha: string | null }
      setEntries(data.entries || [])
      setOriginal(JSON.stringify(data.entries || []))
      setSha(s)
    } catch {
      setStatus({ type: 'error', message: t('refLadder.loadFailed') })
    } finally {
      setLoading(false)
    }
  }

  // 取数函数必须先声明、再在 effect 里引用（否则命中 react-hooks/immutability
  // 的 "Cannot access variable before it is declared"）。行为不变。
  useEffect(() => {
    fetchData()
  }, [])
  const sortedTournaments = useMemo(
    () =>
      [...tournaments].sort((a, b) => {
        const yd = (b.year || 0) - (a.year || 0)
        if (yd !== 0) return yd
        return (a.abbreviation || a.id).localeCompare(b.abbreviation || b.id)
      }),
    []
  )

  const addTnRounds = useMemo(() => {
    const tn = tournaments.find((t) => t.id === addTn)
    if (!tn) return []
    return [...tn.rounds].sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [addTn])

  const dirty = useMemo(() => JSON.stringify(entries) !== original, [entries, original])

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= entries.length) return
    const next = [...entries]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setEntries(next)
  }

  const remove = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx))
  }

  const add = () => {
    if (!addTn || !addRound) return
    if (entries.some((e) => e.tournamentId === addTn && e.roundId === addRound)) return
    setEntries([...entries, { tournamentId: addTn, roundId: addRound }])
    setAddRound('')
  }

  // 改某项步长(比上一轮难几个"标准轮")。空 → 删除 step(视作默认 1)。
  const updateStep = (idx: number, raw: string) => {
    const next = [...entries]
    const e = { ...next[idx] }
    if (raw.trim() === '') {
      delete e.step
    } else {
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      e.step = n
    }
    next[idx] = e
    setEntries(next)
  }

  // 累计轮位坐标(第一项=0,后续累加 step;非法/≤0 视作 1)。仅用于显示。
  const positions = useMemo(() => {
    const out: number[] = []
    let pos = 0
    entries.forEach((e, i) => {
      if (i > 0) {
        const s = typeof e.step === 'number' && Number.isFinite(e.step) && e.step > 0 ? e.step : 1
        pos += s
      }
      out.push(pos)
    })
    return out
  }, [entries])

  const handleSave = async () => {
    setSubmitting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/ref-ladder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, sha }),
      })
      if (!res.ok) throw new Error()
      setStatus({ type: 'success', message: t('refLadder.saved') })
      invalidateRefLadder()
      fetchData()
    } catch {
      setStatus({ type: 'error', message: t('refLadder.saveFailed') })
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
          {t('refLadder.title')}
        </h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
          {t('refLadder.subtitle')}
        </p>
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <select
          value={addTn}
          onChange={(e) => {
            setAddTn(e.target.value)
            setAddRound('')
          }}
          className="px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
        >
          <option value="">{t('refLadder.pickTournament')}</option>
          {sortedTournaments.map((tn) => (
            <option key={tn.id} value={tn.id}>
              {tn.abbreviation || tn.id}
              {tn.year ? ` (${tn.year})` : ''}
            </option>
          ))}
        </select>
        <select
          value={addRound}
          onChange={(e) => setAddRound(e.target.value)}
          disabled={!addTn}
          className="px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 disabled:opacity-50"
        >
          <option value="">{t('refLadder.pickRound')}</option>
          {addTnRounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.abbreviation || r.name || r.id}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={!addTn || !addRound}
          className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('refLadder.add')}
        </button>
      </div>
      {/* PLACEHOLDER_LIST */}
      <p className="text-[11px] text-gray-400 dark:text-neutral-500 mb-2">
        {t('refLadder.orderHint')}
      </p>
      <div className="border border-gray-100 dark:border-neutral-800 rounded max-h-[480px] overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800">
        {entries.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-400 dark:text-neutral-500">
            {t('refLadder.empty')}
          </div>
        )}
        {entries.map((e, idx) => (
          <div
            key={`${e.tournamentId}::${e.roundId}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800/40"
          >
            <span className="text-xs text-gray-400 dark:text-neutral-500 w-6 tabular-nums">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0 text-sm text-gray-700 dark:text-neutral-200 truncate">
              {labelOf(e)}
            </div>
            {idx === 0 ? (
              <span className="text-[10px] text-gray-400 dark:text-neutral-500 shrink-0 w-24 text-center">
                {t('refLadder.baseline')}
              </span>
            ) : (
              <div className="flex items-center gap-0.5 shrink-0" title={t('refLadder.stepHint')}>
                <span className="text-[10px] text-gray-400 dark:text-neutral-500">+</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={e.step === undefined ? '' : String(e.step)}
                  placeholder="1"
                  onChange={(ev) => updateStep(idx, ev.target.value)}
                  className="w-12 px-1 py-0.5 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                />
              </div>
            )}
            <span className="text-[10px] text-gray-400 dark:text-neutral-500 shrink-0 w-14 text-right tabular-nums">
              {t('refLadder.pos')} {positions[idx].toFixed(1)}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                title={t('refLadder.moveUp')}
                className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↑
              </button>
              <button
                onClick={() => move(idx, 1)}
                disabled={idx === entries.length - 1}
                title={t('refLadder.moveDown')}
                className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↓
              </button>
              <button
                onClick={() => remove(idx)}
                title={t('refLadder.remove')}
                className="px-1.5 py-0.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-400 dark:text-neutral-500">{t('refLadder.note')}</p>
        <button
          onClick={handleSave}
          disabled={submitting || !dirty}
          className="px-4 py-2 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? t('packs.saving') : t('refLadder.save')}
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
