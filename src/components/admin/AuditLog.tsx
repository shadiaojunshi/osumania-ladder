'use client'

import { useState, useEffect, useCallback } from 'react'

interface AuditEntry {
  ts: number
  actorUid: string
  actorName: string
  action: string
  target: string
  detail?: string
  ip?: string
}

const ACTION_LABELS: Record<string, string> = {
  'tournament.create': '创建比赛',
  'tournament.update': '编辑比赛',
  'tournament.delete': '删除比赛',
  'tournament.restore': '恢复比赛',
  'map.delete': '删除谱面',
  'map.restore': '恢复谱面',
  'admin.setRole': '设置角色',
  'admin.remove': '移除管理员',
  'references.update': '更新参考点',
  'packs.update': '更新合包链接',
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAudit = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/audit?limit=100')
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch {
      setError('加载审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAudit()
  }, [fetchAudit])

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">操作日志</h3>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">记录所有写操作（谁、何时、做了什么）。保留 180 天。</p>
        </div>
        <button
          onClick={fetchAudit}
          disabled={loading}
          className="px-3 py-1 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          刷新
        </button>
      </div>

      {error && <div className="mx-4 mt-3 px-3 py-2 rounded text-xs bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-200">{error}</div>}

      {loading && <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">加载中...</div>}

      {!loading && entries.length === 0 && !error && (
        <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">暂无日志</div>
      )}

      {!loading && entries.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-[calc(100vh-260px)] overflow-y-auto">
          {entries.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-neutral-800/50 text-sm">
              <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${ACTION_COLOR[e.action] || 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                {ACTION_LABELS[e.action] || e.action}
              </span>
              <span className="text-gray-700 dark:text-neutral-200 font-mono truncate flex-1">{e.target}</span>
              {e.detail && <span className="text-gray-400 dark:text-neutral-500 text-xs truncate max-w-[160px]">{e.detail}</span>}
              <span className="text-gray-500 dark:text-neutral-400 text-xs shrink-0">{e.actorName}</span>
              <span className="text-gray-400 dark:text-neutral-500 text-xs shrink-0 w-36 text-right">{formatTime(e.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
