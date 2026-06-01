'use client'

import { useState } from 'react'
import type { RoundWithMeta } from './RoundEditor'
import type { ExtendedMap, MapCategory } from './MapSlotEditor'
import { REAL_TYPES } from './MapSlotEditor'

interface BeatmapApiResponse {
  beatmapId: string
  beatmapsetId: string
  artist: string
  title: string
  version: string
  creator: string
  mode: string
  bpm: number | null
  length: number | null
}

type RowStatus = 'pending' | 'fetching' | 'ok' | 'error'

interface ParsedRow {
  raw: string
  slot: string
  mapId: string
  status: RowStatus
  meta?: BeatmapApiResponse
  error?: string
}

interface Props {
  onImport: (round: RoundWithMeta) => void
  onClose: () => void
  existingRoundCount: number
}

const SLOT_PREFIX_TO_CATEGORY: { prefix: RegExp; category: MapCategory }[] = [
  { prefix: /^TB/i, category: 'TB' },
  { prefix: /^MN/i, category: 'HB' },
  { prefix: /^RC/i, category: 'RC' },
  { prefix: /^LN/i, category: 'LN' },
  { prefix: /^HB/i, category: 'HB' },
  { prefix: /^SV/i, category: 'SV' },
]

function detectCategory(slot: string): MapCategory {
  for (const { prefix, category } of SLOT_PREFIX_TO_CATEGORY) {
    if (prefix.test(slot)) return category
  }
  return 'SPECIAL'
}

function extractMapId(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return trimmed
  const bMatch = trimmed.match(/osu\.ppy\.sh\/b\/(\d+)/i)
  if (bMatch) return bMatch[1]
  const setMatch = trimmed.match(/osu\.ppy\.sh\/beatmapsets\/\d+#\w+\/(\d+)/i)
  if (setMatch) return setMatch[1]
  const lastNumber = trimmed.match(/(\d+)(?!.*\d)/)
  if (lastNumber) return lastNumber[1]
  return null
}

function parseInput(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.map((raw): ParsedRow => {
    const parts = raw.split(/\s*\t\s*|\s{2,}|\s+/).filter(Boolean)
    if (parts.length < 2) {
      return { raw, slot: parts[0] || '', mapId: '', status: 'error', error: '缺少 slot 或 ID' }
    }
    const slot = parts[0].toUpperCase()
    const mapId = extractMapId(parts.slice(1).join(' '))
    if (!mapId) return { raw, slot, mapId: '', status: 'error', error: '无法提取 mapID' }
    return { raw, slot, mapId, status: 'pending' }
  })
}

async function fetchBeatmap(mapId: string): Promise<BeatmapApiResponse> {
  const res = await fetch(`/api/osu/beatmap?id=${mapId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatLength(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '?'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function BulkImporter({ onImport, onClose, existingRoundCount }: Props) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [running, setRunning] = useState(false)
  const [roundName, setRoundName] = useState('')
  const [roundAbbr, setRoundAbbr] = useState('')

  const parse = () => {
    const parsed = parseInput(text)
    if (parsed.length > 200) {
      alert('单次导入最多 200 行，请分批处理')
      return
    }
    setRows(parsed)
  }

  const fetchAll = async () => {
    setRunning(true)
    const next = [...rows]
    for (let i = 0; i < next.length; i++) {
      if (next[i].status === 'error' || !next[i].mapId) continue
      next[i] = { ...next[i], status: 'fetching' }
      setRows([...next])
      try {
        const meta = await fetchBeatmap(next[i].mapId)
        next[i] = { ...next[i], status: 'ok', meta }
      } catch (err) {
        next[i] = { ...next[i], status: 'error', error: err instanceof Error ? err.message : String(err) }
      }
      setRows([...next])
      await new Promise((r) => setTimeout(r, 200))
    }
    setRunning(false)
  }

  const okRows = rows.filter((r) => r.status === 'ok' && r.meta)
  const canImport = okRows.length > 0 && roundAbbr.trim()

  const doImport = () => {
    const slotCounters: Record<string, number> = {}
    const maps: ExtendedMap[] = okRows.map((r) => {
      const meta = r.meta!
      const category = detectCategory(r.slot)
      const realTypes = REAL_TYPES[category] || []
      const realType = realTypes.length > 0 ? realTypes[0].id : ''
      const type = category === 'SPECIAL' ? r.slot.replace(/\d+$/, '') : category
      slotCounters[type] = (slotCounters[type] || 0) + 1
      return {
        slot: r.slot,
        type,
        realType,
        name: `${meta.artist} - ${meta.title} [${meta.version}]`,
        difficulty: 0,
        beatmapId: Number(meta.beatmapId),
        beatmapsetId: Number(meta.beatmapsetId),
        category,
      }
    })

    const order = existingRoundCount + 1
    const round: RoundWithMeta = {
      id: `round-${order}`,
      name: roundName.trim() || roundAbbr.trim(),
      abbreviation: roundAbbr.trim(),
      order,
      difficulty: { min: 0, max: 0, average: 0 },
      maps: maps.map(({ category, ...rest }) => rest),
      _maps: maps,
      _typeDiffs: { rc: 0, rcMin: 0, rcMax: 0, hbRf: 0, hbLn: 0, hbMin: 0, hbMax: 0, ln: 0, lnMin: 0, lnMax: 0, sv: 0, svMin: 0, svMax: 0 },
      _typeDiffsLocked: { rc: false, hbRf: false, hbLn: false, ln: false, sv: false },
      _diffMode: 'perMap',
    }
    onImport(round)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-medium text-gray-900">从主表格批量导入图池</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <div className="text-xs text-gray-500 leading-relaxed">
            从 Google 主表格选中 <strong>slot 列</strong> 和 <strong>map link/ID 列</strong>（两列），复制粘贴到下方。每行格式自由：tab 或多空格分隔皆可。<br />
            支持的 ID 格式：纯数字、<code>osu.ppy.sh/b/数字</code>、<code>osu.ppy.sh/beatmapsets/X#mode/数字</code>。
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'RC1\thttps://osu.ppy.sh/b/5318853\nRC2\t5318764\nHB1\t5318882\nTB\t5318924'}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:outline-none focus:border-purple-400"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={parse}
              disabled={!text.trim() || running}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 disabled:opacity-40"
            >
              解析
            </button>
            <button
              onClick={fetchAll}
              disabled={rows.length === 0 || running || rows.every((r) => r.status === 'ok' || r.status === 'error')}
              className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-40"
            >
              {running ? '查询中...' : '调 osu! API 拉元数据'}
            </button>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500 ml-auto">
                {okRows.length}/{rows.length} 成功
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <div className="border border-gray-200 rounded text-xs">
              <div className="grid grid-cols-[60px_80px_1fr] gap-2 px-2 py-1.5 bg-gray-50 border-b border-gray-200 font-medium text-gray-500">
                <span>Slot</span>
                <span>Map ID</span>
                <span>结果</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {rows.map((r, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-[60px_80px_1fr] gap-2 px-2 py-1 border-b border-gray-100 ${
                      r.status === 'error' ? 'bg-yellow-50' : r.status === 'ok' ? '' : 'bg-blue-50'
                    }`}
                  >
                    <span className="font-mono text-gray-700">{r.slot}</span>
                    <span className="font-mono text-gray-500">{r.mapId || '—'}</span>
                    <span className="truncate">
                      {r.status === 'ok' && r.meta && (
                        <>
                          <span className="text-gray-700">{r.meta.artist} - {r.meta.title} [{r.meta.version}]</span>
                          <span className="text-gray-400 ml-2">
                            {r.meta.bpm ? `${Math.round(r.meta.bpm)}bpm` : ''} {formatLength(r.meta.length)}
                            {r.meta.mode !== '3' && <span className="text-orange-600 ml-1">⚠ 非 mania (mode={r.meta.mode})</span>}
                          </span>
                        </>
                      )}
                      {r.status === 'fetching' && <span className="text-blue-600">查询中...</span>}
                      {r.status === 'error' && <span className="text-yellow-700">{r.error}</span>}
                      {r.status === 'pending' && <span className="text-gray-400">待查询</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {okRows.length > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">轮次名称（可选）</label>
                <input
                  type="text"
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  placeholder="Grand Finals"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">缩写</label>
                <input
                  type="text"
                  value={roundAbbr}
                  onChange={(e) => setRoundAbbr(e.target.value)}
                  placeholder="GF"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
            取消
          </button>
          <button
            onClick={doImport}
            disabled={!canImport}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-40"
          >
            导入为新轮次（{okRows.length} 张）
          </button>
        </div>
      </div>
    </div>
  )
}
