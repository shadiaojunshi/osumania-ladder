'use client'

import { useState, useEffect } from 'react'
import { difficultyToY, getDifficultyColor } from '@/lib/difficulty'

interface RefPoint {
  label: string
  difficulty: number
}

interface ReferencesData {
  points: RefPoint[]
}

const DIFFICULTY_RANGE = { min: 0.5, max: 17.5 }
const PREVIEW_HEIGHT = 500

export function ReferencesEditor() {
  const [points, setPoints] = useState<RefPoint[]>([])
  const [sha, setSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newDiff, setNewDiff] = useState('')

  useEffect(() => {
    fetchRefs()
  }, [])

  const fetchRefs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/references')
      if (!res.ok) throw new Error('加载失败')
      const { references, sha: s } = await res.json()
      setPoints(references.points || [])
      setSha(s)
    } catch {
      setStatus({ type: 'error', message: '加载参考点数据失败' })
    } finally {
      setLoading(false)
    }
  }

  const addPoint = () => {
    const diff = parseFloat(newDiff)
    if (!newLabel.trim() || isNaN(diff)) return
    const updated = [...points, { label: newLabel.trim(), difficulty: diff }]
      .sort((a, b) => b.difficulty - a.difficulty)
    setPoints(updated)
    setNewLabel('')
    setNewDiff('')
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
      if (!res.ok) throw new Error('保存失败')
      setStatus({ type: 'success', message: '参考点已更新，网站将在几分钟内重建' })
      fetchRefs()
    } catch {
      setStatus({ type: 'error', message: '保存失败' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400 text-sm">加载中...</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-900">参考点列表</h3>
        <p className="text-xs text-gray-400">这些参考点会显示在天梯榜右侧边栏，帮助用户定位难度</p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="名称 (如 MWC 2025 GF)"
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
          />
          <input
            type="number"
            step="0.5"
            value={newDiff}
            onChange={(e) => setNewDiff(e.target.value)}
            placeholder="难度"
            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
          />
          <button
            onClick={addPoint}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            添加
          </button>
        </div>

        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
          {points.map((point, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: getDifficultyColor(point.difficulty) }}
                />
                <span className="text-sm text-gray-700">{point.label}</span>
                <span className="text-xs text-gray-400 font-mono">{point.difficulty}</span>
              </div>
              <button
                onClick={() => removePoint(i)}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5"
              >
                删除
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? '保存中...' : '保存参考点'}
        </button>

        {status && (
          <div className={`p-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {status.message}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">预览</h3>
        <div className="relative border border-gray-100 rounded overflow-hidden" style={{ height: PREVIEW_HEIGHT }}>
          {points.map((point, i) => {
            const y = difficultyToY(point.difficulty, PREVIEW_HEIGHT, DIFFICULTY_RANGE)
            return (
              <div
                key={i}
                className="absolute left-0 right-0 flex items-center px-2"
                style={{ top: y - 8 }}
              >
                <div className="w-4 h-px bg-purple-400 mr-2" />
                <span className="text-xs text-gray-600">{point.label}</span>
                <span className="text-xs text-gray-300 ml-auto font-mono">{point.difficulty}</span>
              </div>
            )
          })}
          <div className="absolute inset-y-0 left-0 w-px bg-gray-200" style={{ marginLeft: '4px' }} />
        </div>
      </div>
    </div>
  )
}
