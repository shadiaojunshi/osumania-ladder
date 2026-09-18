'use client'

import { useState, useEffect } from 'react'
import { useT, type MessageKey } from '@/lib/i18n'

interface Pack {
  realType: string
  name: string
  part?: number
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

const LINK_KEYS: { id: string; labelKey: MessageKey }[] = [
  { id: 'drive123', labelKey: 'download.link.drive123' },
  { id: 'googleDrive', labelKey: 'download.link.googleDrive' },
  { id: 'baiduPan', labelKey: 'download.link.baiduPan' },
  { id: 'quark', labelKey: 'download.link.quark' },
]

export function PackLinksEditor() {
  const t = useT()
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [sha, setSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchManifest = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/packs-manifest')
      if (!res.ok) throw new Error()
      const { manifest: m, sha: s } = await res.json()
      setManifest(m)
      setSha(s)
    } catch {
      setStatus({ type: 'error', message: t('packs.loadFailed') })
    } finally {
      setLoading(false)
    }
  }

  // 取数函数必须先声明、再在 effect 里引用（否则命中 react-hooks/immutability
  // 的 "Cannot access variable before it is declared"）。行为不变。
  useEffect(() => { fetchManifest() }, [])

  const updateLink = (realType: string, part: number | undefined, linkKey: string, url: string) => {
    if (!manifest) return
    const updated = { ...manifest, packs: manifest.packs.map(p => {
      if (p.realType !== realType || (p.part || undefined) !== part) return p
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
      setStatus({ type: 'success', message: t('packs.saved') })
      fetchManifest()
    } catch {
      setStatus({ type: 'error', message: t('packs.saveFailed') })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admin.loading')}</div>

  if (!manifest || manifest.packs.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-8 text-center">
        <p className="text-gray-500 dark:text-neutral-400 text-sm">{t('packs.empty')}</p>
        <p className="text-gray-400 dark:text-neutral-500 text-xs mt-1">{t('packs.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100 mb-1">{t('packs.title')}</h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mb-4">{t('packs.subtitle')}</p>

        <div className="space-y-4">
          {manifest.packs.map(pack => (
            <div key={`${pack.realType}_${pack.part || 0}`} className="border border-gray-100 dark:border-neutral-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">{pack.name}</span>
                <span className="text-xs text-gray-400 dark:text-neutral-500">{t('packs.maps', { n: pack.mapCount })} · {t('packs.size', { n: pack.sizeMB })}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {LINK_KEYS.map(lk => (
                  <div key={lk.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-neutral-400 w-20 shrink-0">{t(lk.labelKey)}</span>
                    <input
                      type="url"
                      value={pack.links[lk.id] || ''}
                      onChange={e => updateLink(pack.realType, pack.part, lk.id, e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-2 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
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
          {submitting ? t('packs.saving') : t('packs.save')}
        </button>

        {status && (
          <div className={`mt-3 p-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200'}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}
