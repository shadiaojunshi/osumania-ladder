import packsManifest from '@data/packs-manifest.json'

interface Pack {
  realType: string
  name: string
  mapCount: number
  totalMaps: number
  lastUpdated: string
  links: Record<string, string>
  sizeMB: number
}

const CATEGORIES: { label: string; types: string[] }[] = [
  { label: 'Rice 类', types: ['SS', 'JS', 'SA', 'CJ', 'SJ', 'MX', 'DP', 'STC', 'MTC', 'JTC', 'WTC', 'TC', 'ORC'] },
  { label: 'LN 类', types: ['RE', 'CO', 'TE', 'DE', 'SW', 'JW', 'IN', 'OLN'] },
  { label: 'Hybrid 类', types: ['HB1', 'HB2', 'HB3', 'HB4', 'HB5', 'OHB'] },
  { label: 'SV 类', types: ['SV1', 'SV2', 'SI', 'ME'] },
  { label: '其他', types: ['TB'] },
]

const LINK_LABELS: Record<string, string> = {
  drive123: '123网盘',
  googleDrive: 'Google Drive',
  baiduPan: '百度网盘',
  quark: '夸克网盘',
}

export default function DownloadPage() {
  const packs = (packsManifest.packs || []) as Pack[]
  const packMap = new Map(packs.map(p => [p.realType, p]))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">osu!mania 4K 比赛合包下载</h1>
            <p className="text-sm text-gray-500 mt-0.5">按真实键型分类，包含所有已收录比赛的对应谱面</p>
          </div>
          <a href="/" className="text-sm text-purple-600 hover:text-purple-800">← 返回天梯榜</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {CATEGORIES.map(category => {
          const categoryPacks = category.types
            .map(type => packMap.get(type))
            .filter((p): p is Pack => !!p && p.mapCount > 0)

          if (categoryPacks.length === 0 && !category.types.some(t => packMap.has(t))) return null

          return (
            <section key={category.label}>
              <h2 className="text-sm font-medium text-gray-500 mb-3 border-b border-gray-200 pb-2">
                {category.label}
              </h2>
              <div className="grid gap-3">
                {category.types.map(type => {
                  const pack = packMap.get(type)
                  if (!pack) return null
                  return <PackCard key={type} pack={pack} />
                })}
              </div>
            </section>
          )
        })}

        {packs.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">暂无合包</p>
            <p className="text-sm">合包生成后会在这里显示下载链接</p>
          </div>
        )}
      </main>
    </div>
  )
}

function PackCard({ pack }: { pack: Pack }) {
  const hasLinks = Object.keys(pack.links).length > 0
  const progress = pack.totalMaps > 0 ? Math.round((pack.mapCount / pack.totalMaps) * 100) : 0

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{pack.name}</span>
          <span className="text-xs font-mono text-gray-400">({pack.realType})</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{pack.mapCount}/{pack.totalMaps} 张谱面</span>
          {pack.sizeMB > 0 && <span>{pack.sizeMB}MB</span>}
          {pack.lastUpdated && <span>更新于 {pack.lastUpdated}</span>}
        </div>
        {progress < 100 && (
          <div className="mt-2 w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
              className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100"
            >
              {LINK_LABELS[key] || key}
            </a>
          ))
        ) : (
          <span className="text-xs text-gray-400 px-3 py-1.5">暂无下载</span>
        )}
      </div>
    </div>
  )
}
