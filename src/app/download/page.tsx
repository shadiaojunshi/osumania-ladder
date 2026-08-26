'use client'

import { useState } from 'react'
import Link from 'next/link'
import packsManifest from '@data/packs-manifest.json'
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

const CATEGORIES: { labelKey: MessageKey; types: string[] }[] = [
  { labelKey: 'download.cat.rice', types: ['SS', 'JS', 'SA', 'CJ', 'SJ', 'MX', 'DP', 'ADP', 'STC', 'MTC', 'SATC', 'JTC', 'WTC', 'TC', 'ORC'] },
  { labelKey: 'download.cat.ln', types: ['RE', 'CO', 'TE', 'DE', 'JW', 'SW', 'LNMX', 'LNWC', 'LNTC', 'IN', 'LNWL', 'OLN'] },
  { labelKey: 'download.cat.hb', types: ['HB1', 'HB2', 'HB3', 'HB4', 'HB5', 'RCmainHB', 'LNmainHB', 'MXHB', 'MNTB', 'OHB'] },
  { labelKey: 'download.cat.sv', types: ['SV1', 'SV2', 'SI', 'ME', 'SVMX', 'GM', 'PDSV'] },
  { labelKey: 'download.cat.other', types: ['TB'] },
]

const LINK_LABEL_KEYS: Record<string, MessageKey> = {
  r2: 'download.link.r2',
  drive123: 'download.link.drive123',
  googleDrive: 'download.link.googleDrive',
  baiduPan: 'download.link.baiduPan',
  quark: 'download.link.quark',
}

export default function DownloadPage() {
  const t = useT()
  const allPacks = (packsManifest.packs || []) as Pack[]
  // 按 realType 分组,每组按 part 升序排
  const groupsByType = new Map<string, Pack[]>()
  for (const p of allPacks) {
    if (!groupsByType.has(p.realType)) groupsByType.set(p.realType, [])
    groupsByType.get(p.realType)!.push(p)
  }
  for (const list of groupsByType.values()) {
    list.sort((a, b) => (a.part || 0) - (b.part || 0))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-neutral-100">{t('download.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">{t('download.subtitle')}</p>
          </div>
          <Link href="/" className="text-sm text-purple-600 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200">{t('download.back')}</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {CATEGORIES.map(category => {
          const categoryGroups = category.types
            .map(type => ({ type, parts: groupsByType.get(type) }))
            .filter(g => g.parts && g.parts.length > 0)

          if (categoryGroups.length === 0) return null

          return (
            <section key={category.labelKey}>
              <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400 mb-3 border-b border-gray-200 dark:border-neutral-800 pb-2">
                {t(category.labelKey)}
              </h2>
              <div className="grid gap-3">
                {categoryGroups.map(g => (
                  <PackGroup key={g.type} parts={g.parts!} />
                ))}
              </div>
            </section>
          )
        })}

        {allPacks.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-neutral-500">
            <p className="text-lg mb-2">{t('download.empty')}</p>
            <p className="text-sm">{t('download.emptyHint')}</p>
          </div>
        )}
      </main>
    </div>
  )
}

function PackGroup({ parts }: { parts: Pack[] }) {
  const t = useT()
  // 同 realType 的多个 part 共享 mapCount/totalMaps 求和;name 取去掉" Pack N"后缀的根名
  const totalMaps = parts[0].totalMaps
  const totalMapCount = parts.reduce((s, p) => s + p.mapCount, 0)
  const totalSizeMB = parts.reduce((s, p) => s + p.sizeMB, 0)
  const lastUpdated = parts.map(p => p.lastUpdated).sort().slice(-1)[0] || ''
  const baseName = parts[0].name.replace(/ Pack \d+$/, ' Pack')
  const realType = parts[0].realType

  const isMulti = parts.length > 1
  const [expanded, setExpanded] = useState(false)

  // 单包时直接平铺,多包时折叠
  if (!isMulti) {
    return <PackRow pack={parts[0]} hidePartLabel />
  }

  const progress = totalMaps > 0 ? Math.round((totalMapCount / totalMaps) * 100) : 0

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition"
      >
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`text-xs text-gray-400 dark:text-neutral-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">{baseName}</span>
            <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">({realType})</span>
            <span className="text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-200 px-1.5 py-0.5 rounded">{t('download.parts', { n: parts.length })}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 ml-5 text-xs text-gray-500 dark:text-neutral-400">
            <span>{t('download.maps', { cur: totalMapCount, total: totalMaps })}</span>
            {totalSizeMB > 0 && <span>{totalSizeMB}MB</span>}
            {lastUpdated && <span>{t('download.updated', { date: lastUpdated })}</span>}
          </div>
          {progress < 100 && (
            <div className="mt-2 ml-5 w-32 h-1.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800">
          {parts.map(p => <PackRow key={p.part} pack={p} indent />)}
        </div>
      )}
    </div>
  )
}

function PackRow({ pack, indent, hidePartLabel }: { pack: Pack; indent?: boolean; hidePartLabel?: boolean }) {
  const t = useT()
  const hasLinks = Object.keys(pack.links).length > 0
  const progress = pack.totalMaps > 0 ? Math.round((pack.mapCount / pack.totalMaps) * 100) : 0

  return (
    <div className={`flex items-center justify-between p-4 ${indent ? 'pl-9' : 'bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm'}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {hidePartLabel ? (
            <>
              <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">{pack.name}</span>
              <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">({pack.realType})</span>
            </>
          ) : (
            <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">Part {pack.part}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-neutral-400">
          <span>{t('download.mapsSimple', { n: pack.mapCount })}</span>
          {pack.sizeMB > 0 && <span>{pack.sizeMB}MB</span>}
          {hidePartLabel && pack.lastUpdated && <span>{t('download.updated', { date: pack.lastUpdated })}</span>}
        </div>
        {hidePartLabel && progress < 100 && (
          <div className="mt-2 w-32 h-1.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {hasLinks ? (
          Object.entries(pack.links).map(([key, url]) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-200 dark:hover:bg-purple-900/50"
            >
              {LINK_LABEL_KEYS[key] ? t(LINK_LABEL_KEYS[key]) : key}
            </a>
          ))
        ) : (
          <span className="text-xs text-gray-400 dark:text-neutral-500 px-3 py-1.5">{t('download.noLinks')}</span>
        )}
      </div>
    </div>
  )
}
