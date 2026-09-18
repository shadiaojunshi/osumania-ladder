'use client'

import { useState, useEffect } from 'react'
import { difficultyToY, getDifficultyColor } from '@/lib/difficulty'
import { useT } from '@/lib/i18n'

interface RefPoint {
  label: string
  difficulty: number
  type?: 'rice' | 'ln' | 'both'
}

interface ReferencesData {
  points: RefPoint[]
}

const DIFFICULTY_RANGE = { min: 0.5, max: 16.5 }
const PREVIEW_HEIGHT = 500

export function ReferencesEditor() {
  const t = useT()
  const [points, setPoints] = useState<RefPoint[]>([])
  const [sha, setSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newDiff, setNewDiff] = useState('')
  const [newType, setNewType] = useState<'rice' | 'ln'>('rice')

  const fetchRefs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/references')
      if (!res.ok) throw new Error('load failed')
      const { references, sha: s } = await res.json()
      setPoints(references.points || [])
      setSha(s)
    } catch {
      setStatus({ type: 'error', message: t('refs.loadFailed') })
    } finally {
      setLoading(false)
    }
  }

  // 取数函数必须先声明、再在 effect 里引用（否则命中 react-hooks/immutability
  // 的 "Cannot access variable before it is declared"）。行为不变。
  useEffect(() => {
    fetchRefs()
  }, [])

  const addPoint = () => {
    const diff = parseFloat(newDiff)
    if (!newLabel.trim() || isNaN(diff)) return
    const point: RefPoint = { label: newLabel.trim(), difficulty: diff }
    if (newType === 'ln') point.type = 'ln'
    const updated = [...points, point].sort((a, b) => b.difficulty - a.difficulty)
    setPoints(updated)
    setNewLabel('')
    setNewDiff('')
    setNewType('rice')
  }

  const removePoint = (index: number) => {
    setPoints(points.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!sha) return
    setSubmitting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/references', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: { points }, sha }),
      })
      if (!res.ok) throw new Error('save failed')
      setStatus({ type: 'success', message: t('refs.saveSuccess') })
      fetchRefs()
    } catch {
      setStatus({ type: 'error', message: t('refs.saveFailed') })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('refs.loading')}</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('refs.title')}</h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500">{t('refs.hint')}</p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('refs.placeholder.label')}
            className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
          />
          <input
            type="number"
            step="any"
            value={newDiff}
            onChange={(e) => setNewDiff(e.target.value)}
            placeholder={t('refs.placeholder.diff')}
            className="w-20 px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as 'rice' | 'ln')}
            className="px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
          >
            <option value="rice">RF</option>
            <option value="ln">LN</option>
          </select>
          <button
            onClick={addPoint}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            {t('refs.add')}
          </button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-[400px] overflow-y-auto">
          {points.map((point, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <div
                  className="difficulty-swatch w-3 h-3 rounded-full"
                  style={{ background: getDifficultyColor(point.difficulty) }}
                />
                <span className="text-sm text-gray-700 dark:text-neutral-200">{point.label}</span>
                <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">{point.difficulty}</span>
                {point.type === 'ln' && (
                  <span className="text-xs bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 px-1.5 py-0.5 rounded">LN</span>
                )}
              </div>
              <button
                onClick={() => removePoint(i)}
                className="text-xs text-red-400 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200 px-2 py-0.5"
              >
                {t('refs.remove')}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? t('refs.saving') : t('refs.save')}
        </button>

        {status && (
          <div className={`p-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}>
            {status.message}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100 mb-3">{t('refs.preview.title')}</h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mb-2">{t('refs.preview.hint')}</p>
        <div className="relative border border-gray-100 dark:border-neutral-800 rounded overflow-hidden" style={{ height: PREVIEW_HEIGHT }}>
          {points.map((point, i) => {
            const y = difficultyToY(point.difficulty, PREVIEW_HEIGHT, DIFFICULTY_RANGE)
            const isLn = point.type === 'ln'
            return (
              <div
                key={i}
                className="absolute left-0 right-0 flex items-center px-2"
                style={{ top: y - 8 }}
              >
                <div className={`w-4 h-px mr-2 ${isLn ? 'bg-indigo-400' : 'bg-purple-400'}`} />
                <span className={`text-xs ${isLn ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-600 dark:text-neutral-300'}`}>{point.label}</span>
                <span className="text-xs text-gray-300 dark:text-neutral-600 ml-auto font-mono">{point.difficulty}</span>
              </div>
            )
          })}
          <div className="absolute inset-y-0 left-0 w-px bg-gray-200 dark:bg-neutral-700" style={{ marginLeft: '4px' }} />
        </div>
      </div>
    </div>
  )
}
