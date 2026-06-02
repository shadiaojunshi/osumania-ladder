'use client'

import { useState, useEffect, useCallback } from 'react'

interface TrashItem {
  id: string
  kind: 'tournament' | 'map'
  label: string
  deletedAt: number
  deletedByName: string
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export function TrashManager() {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trash')
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setStatus({ type: 'error', message: '加载回收站失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrash()
  }, [fetchTrash])

  const restore = async (item: TrashItem) => {
    if (!confirm(`恢复 ${item.label}？`)) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '恢复失败')
      setStatus({ type: 'success', message: `已恢复 ${item.label}` })
      fetchTrash()
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">回收站</h3>
          <p className="text-xs text-gray-400 mt-0.5">删除的比赛和谱面会在此保留 30 天，到期自动清除。可在保留期内恢复。</p>
        </div>
        <button
          onClick={fetchTrash}
          disabled={loading}
          className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          刷新
        </button>
      </div>

      {status && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {status.message}
        </div>
      )}

      {loading && <div className="p-8 text-center text-gray-400 text-sm">加载中...</div>}

      {!loading && items.length === 0 && (
        <div className="p-8 text-center text-gray-400 text-sm">回收站是空的</div>
      )}

      {!loading && items.length > 0 && (
        <div className="divide-y divide-gray-100">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.kind === 'tournament' ? 'bg-orange-50 text-orange-700' : 'bg-cyan-50 text-cyan-700'}`}>
                    {item.kind === 'tournament' ? '比赛' : '谱面'}
                  </span>
                  <span className="text-sm text-gray-800 font-mono truncate">{item.label}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {item.deletedByName} 删除于 {formatTime(item.deletedAt)}
                </div>
              </div>
              <button
                onClick={() => restore(item)}
                disabled={busy}
                className="px-3 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50 shrink-0"
              >
                恢复
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
