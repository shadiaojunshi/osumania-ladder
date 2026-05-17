'use client'

import { useState, useEffect } from 'react'

interface Pack {
  realType: string
  name: string
  mapCount: number
  totalMaps: number
  lastUpdated: string
  links: Record<string, string>
  sizeMB: number
}

interface Manifest {
  packs: Pack[]
  lastGenerated: string
}

const LINK_KEYS = [
  { id: 'drive123', label: '123网盘' },
  { id: 'googleDrive', label: 'Google Drive' },
  { id: 'baiduPan', label: '百度网盘' },
  { id: 'quark', label: '夸克网盘' },
]

export function PackLinksEditor() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [sha, setSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => { fetchManifest() }, [])

  const fetchManifest = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/packs-manifest')
      if (!res.ok) throw new Error()
      const { manifest: m, sha: s } = await res.json()
      setManifest(m)
      setSha(s)
    } catch {
      setStatus({ type: 'error', message: '加载合包清单失败' })
    } finally {
      setLoading(false)
    }
  }

  const updateLink = (realType: string, linkKey: string, url: string) => {
    if (!manifest) return
    const updated = { ...manifest, packs: manifest.packs.map(p => {
      if (p.realType !== realType) return p
      const links = { ...p.links }
      if (url.trim()) links[linkKey] = url.trim()
      else delete links[linkKey]
      return { ...p, links }
    })}
    setManifest(updated)
  }

  const handleSave = async () => {
    if (!manifest || !sha) return
    setSubmitting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/packs-manifest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, sha }),
      })
      if (!res.ok) throw new Error()
      setStatus({ type: 'success', message: '下载链接已更新' })
      fetchManifest()
    } catch {
      setStatus({ type: 'error', message: '保存失败' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">加载中...</div>

  if (!manifest || manifest.packs.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-gray-500 text-sm">暂无合包数据</p>
        <p className="text-gray-400 text-xs mt-1">请先通过 GitHub Actions 生成合包</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-1">合包下载链接管理</h3>
        <p className="text-xs text-gray-400 mb-4">生成合包后，在这里填写网盘下载链接</p>

        <div className="space-y-4">
          {manifest.packs.map(pack => (
            <div key={pack.realType} className="border border-gray-100 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{pack.name}</span>
                <span className="text-xs text-gray-400">{pack.mapCount} 张 · {pack.sizeMB}MB</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {LINK_KEYS.map(lk => (
                  <div key={lk.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">{lk.label}</span>
                    <input
                      type="url"
                      value={pack.links[lk.id] || ''}
                      onChange={e => updateLink(pack.realType, lk.id, e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-purple-400"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={submitting}
          className="mt-4 w-full px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? '保存中...' : '保存链接'}
        </button>

        {status && (
          <div className={`mt-3 p-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}
