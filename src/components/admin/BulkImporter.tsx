'use client'

import { useState, useRef } from 'react'
import type { RoundWithMeta } from './RoundEditor'
import type { ExtendedMap, MapCategory } from './MapSlotEditor'
import { REAL_TYPES } from './MapSlotEditor'
import { findMatchingTemplate, applyTemplateRealTypes } from '@/lib/poolTemplates'
import { useT, type MessageKey } from '@/lib/i18n'

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
  groupIndex: number
  status: RowStatus
  meta?: BeatmapApiResponse
  error?: string
  errorKey?: MessageKey
}

interface GroupMeta {
  name: string
  abbreviation: string
  isQualifier: boolean
}

type Step = 'input' | 'confirm' | 'fetch'

interface Props {
  onImport: (rounds: RoundWithMeta[]) => void
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
  const lines = text.split(/\r?\n/)
  const rows: ParsedRow[] = []
  let groupIndex = 0
  const seenSlotsInGroup = new Set<string>()

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      if (seenSlotsInGroup.size > 0) {
        groupIndex++
        seenSlotsInGroup.clear()
      }
      continue
    }

    const parts = line.split(/\s*\t\s*|\s{2,}|\s+/).filter(Boolean)
    if (parts.length < 2) {
      rows.push({ raw: line, slot: parts[0] || '', mapId: '', groupIndex, status: 'error', errorKey: 'bulk.parseError.missingSlotOrId' })
      continue
    }
    const slot = parts[0].toUpperCase()
    const mapId = extractMapId(parts.slice(1).join(' '))

    if (seenSlotsInGroup.has(slot)) {
      groupIndex++
      seenSlotsInGroup.clear()
    }
    seenSlotsInGroup.add(slot)

    if (!mapId) {
      rows.push({ raw: line, slot, mapId: '', groupIndex, status: 'error', errorKey: 'bulk.parseError.cannotExtract' })
      continue
    }
    rows.push({ raw: line, slot, mapId, groupIndex, status: 'pending' })
  }
  return rows
}

const ELIM_NAMES: { name: string; abbr: string }[] = [
  { name: 'Grand Finals', abbr: 'GF' },
  { name: 'Finals', abbr: 'F' },
  { name: 'Semifinals', abbr: 'SF' },
  { name: 'Quarterfinals', abbr: 'QF' },
  { name: 'Round of 16', abbr: 'RO16' },
  { name: 'Round of 32', abbr: 'RO32' },
  { name: 'Round of 64', abbr: 'RO64' },
  { name: 'Round of 128', abbr: 'RO128' },
]

function buildDefaultGroupMetas(groupCount: number, qualifierMask: boolean[]): GroupMeta[] {
  const result: GroupMeta[] = []
  const elimCount = qualifierMask.filter((q) => !q).length
  let elimAssigned = 0

  for (let i = 0; i < groupCount; i++) {
    if (qualifierMask[i]) {
      const qualIdx = qualifierMask.slice(0, i + 1).filter((q) => q).length
      const totalQuals = qualifierMask.filter((q) => q).length
      result.push({
        name: totalQuals > 1 ? `Qualifiers ${qualIdx}` : 'Qualifiers',
        abbreviation: totalQuals > 1 ? `Qual${qualIdx}` : 'Qual',
        isQualifier: true,
      })
    } else {
      const remainingFromEnd = elimCount - elimAssigned - 1
      const preset = ELIM_NAMES[remainingFromEnd] || { name: `Round ${i + 1}`, abbr: `R${i + 1}` }
      result.push({ name: preset.name, abbreviation: preset.abbr, isQualifier: false })
      elimAssigned++
    }
  }
  return result
}

// 已知错误带 errorKey,可被 i18n 翻译;未知错误(API 原文)走 message。
class BulkFetchError extends Error {
  errorKey?: MessageKey
  constructor(message: string, errorKey?: MessageKey) {
    super(message)
    this.errorKey = errorKey
  }
}

async function fetchBeatmap(mapId: string): Promise<BeatmapApiResponse> {
  const res = await fetch(`/api/osu/beatmap?id=${mapId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = body as { error?: string; status?: number }
    if (res.status === 429 || err.status === 429) {
      throw new BulkFetchError('rate-limited', 'bulk.error.rateLimited')
    }
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatLength(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '?'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const GROUP_COLORS = ['bg-purple-100', 'bg-blue-100', 'bg-emerald-100', 'bg-pink-100', 'bg-amber-100', 'bg-indigo-100', 'bg-teal-100', 'bg-rose-100']

export function BulkImporter({ onImport, onClose, existingRoundCount }: Props) {
  const t = useT()
  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [running, setRunning] = useState(false)
  const [groupMetas, setGroupMetas] = useState<GroupMeta[]>([])
  // 用户点击"返回确认"时把它置 true，循环每轮检查、立刻跳出。
  const abortRef = useRef(false)

  const groupCount = rows.length > 0 ? Math.max(...rows.map((r) => r.groupIndex)) + 1 : 0

  const groupSizes: number[] = Array.from({ length: groupCount }, () => 0)
  for (const r of rows) groupSizes[r.groupIndex]++

  const groupHasTb: boolean[] = Array.from({ length: groupCount }, () => false)
  for (const r of rows) {
    if (/^TB/i.test(r.slot)) groupHasTb[r.groupIndex] = true
  }

  const parse = () => {
    const parsed = parseInput(text)
    if (parsed.length > 200) {
      alert(t('bulk.parseError.tooMany'))
      return
    }
    setRows(parsed)
    const gc = parsed.length > 0 ? Math.max(...parsed.map((r) => r.groupIndex)) + 1 : 0
    const tbMask: boolean[] = Array.from({ length: gc }, () => false)
    for (const r of parsed) if (/^TB/i.test(r.slot)) tbMask[r.groupIndex] = true
    const qualifierMask = tbMask.map((hasTb) => !hasTb)
    setGroupMetas(buildDefaultGroupMetas(gc, qualifierMask))
    setStep('confirm')
  }

  const toggleQualifier = (index: number) => {
    const newMask = groupMetas.map((m, i) => (i === index ? !m.isQualifier : m.isQualifier))
    setGroupMetas(buildDefaultGroupMetas(groupCount, newMask))
  }

  const updateGroupMeta = (index: number, key: keyof GroupMeta, value: string | boolean) => {
    setGroupMetas((prev) => prev.map((g, i) => (i === index ? { ...g, [key]: value } : g)))
  }

  const startFetch = async () => {
    setStep('fetch')
    setRunning(true)
    abortRef.current = false
    const next = [...rows]
    for (let i = 0; i < next.length; i++) {
      if (abortRef.current) break
      if (next[i].status === 'ok' || !next[i].mapId) continue
      next[i] = { ...next[i], status: 'fetching' }
      setRows([...next])
      try {
        const meta = await fetchBeatmap(next[i].mapId)
        next[i] = { ...next[i], status: 'ok', meta, error: undefined, errorKey: undefined }
      } catch (err) {
        if (err instanceof BulkFetchError && err.errorKey) {
          next[i] = { ...next[i], status: 'error', error: undefined, errorKey: err.errorKey }
        } else {
          next[i] = { ...next[i], status: 'error', error: err instanceof Error ? err.message : String(err), errorKey: undefined }
        }
      }
      setRows([...next])
      if (abortRef.current) break
      await new Promise((r) => setTimeout(r, 400))
    }
    setRunning(false)
  }

  const retryFailed = async () => {
    setRunning(true)
    abortRef.current = false
    const next = [...rows]
    for (let i = 0; i < next.length; i++) {
      if (abortRef.current) break
      if (next[i].status === 'ok' || !next[i].mapId) continue
      next[i] = { ...next[i], status: 'fetching' }
      setRows([...next])
      try {
        const meta = await fetchBeatmap(next[i].mapId)
        next[i] = { ...next[i], status: 'ok', meta, error: undefined, errorKey: undefined }
      } catch (err) {
        if (err instanceof BulkFetchError && err.errorKey) {
          next[i] = { ...next[i], status: 'error', error: undefined, errorKey: err.errorKey }
        } else {
          next[i] = { ...next[i], status: 'error', error: err instanceof Error ? err.message : String(err), errorKey: undefined }
        }
      }
      setRows([...next])
      if (abortRef.current) break
      await new Promise((r) => setTimeout(r, 400))
    }
    setRunning(false)
  }

  const goBackToConfirm = () => {
    abortRef.current = true
    // 把"查询中"的行回退成 pending，避免视觉上一直停在 fetching
    setRows((prev) => prev.map((r) => (r.status === 'fetching' ? { ...r, status: 'pending' } : r)))
    setStep('confirm')
  }

  const failedCount = rows.filter((r) => r.status === 'error' && r.mapId).length
  const okRows = rows.filter((r) => r.status === 'ok' && r.meta)
  const importableRows = rows.filter((r) => r.slot)
  const groupedAll: ParsedRow[][] = []
  for (const r of importableRows) {
    if (!groupedAll[r.groupIndex]) groupedAll[r.groupIndex] = []
    groupedAll[r.groupIndex].push(r)
  }
  const allAbbrFilled = groupMetas.every((m, i) => groupSizes[i] === 0 || m.abbreviation.trim())
  const canImport = importableRows.length > 0 && allAbbrFilled && !running

  const doImport = () => {
    const rounds: RoundWithMeta[] = []
    let orderCursor = existingRoundCount

    groupedAll.forEach((groupRows, gi) => {
      if (!groupRows || groupRows.length === 0) return
      const meta = groupMetas[gi]
      orderCursor++

      // 优先尝试按"张数 + 各 type 计数"匹配预设模板;命中就按出现顺序对位填 realType
      const categories = groupRows.map((r) => detectCategory(r.slot))
      const template = findMatchingTemplate(categories, meta.isQualifier)
      const matchedRealTypes = template ? applyTemplateRealTypes(categories, template) : null

      // 如果本轮只有一张 TB 且 slot 写成了 TB1,统一改成 TB(单张约定);
      // 跟 RoundEditor.addMap 和 generate-pack.js 显示规则对齐。
      const tbCount = groupRows.filter((r) => /^TB/i.test(r.slot)).length

      const maps: ExtendedMap[] = groupRows.map((r, ri) => {
        const m = r.meta
        const category = categories[ri]
        const realTypes = REAL_TYPES[category] || []
        const fallbackRealType = realTypes.length > 0 ? realTypes[0].id : ''
        const realType = matchedRealTypes?.[ri] || fallbackRealType
        const type = category === 'SPECIAL' ? r.slot.replace(/\d+$/, '') : category
        const slot = tbCount === 1 && /^TB1?$/i.test(r.slot) ? 'TB' : r.slot
        return {
          slot,
          type,
          realType,
          name: m ? `${m.artist} - ${m.title} [${m.version}]` : '',
          difficulty: 0,
          ...(m && { beatmapId: Number(m.beatmapId), beatmapsetId: Number(m.beatmapsetId) }),
          category,
        }
      })

      rounds.push({
        id: `round-${orderCursor}`,
        name: meta.name.trim() || meta.abbreviation.trim(),
        abbreviation: meta.abbreviation.trim(),
        order: orderCursor,
        isQualifier: meta.isQualifier || undefined,
        difficulty: { min: 0, max: 0, average: 0 },
        maps: maps.map(({ category, ...rest }) => rest),
        _maps: maps,
        _typeDiffs: { rc: 0, rcMin: 0, rcMax: 0, hbRf: 0, hbLn: 0, hbMin: 0, hbMax: 0, ln: 0, lnMin: 0, lnMax: 0, sv: 0, svMin: 0, svMax: 0, tbRf: 0, tbLn: 0, tbMin: 0, tbMax: 0 },
        _typeDiffsLocked: { rc: false, hbRf: false, hbLn: false, ln: false, sv: false, tbRf: false, tbLn: false },
        _diffMode: 'summary',
      })
    })

    onImport(rounds)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">
            {t('bulk.title')}
            <span className="ml-2 text-xs text-gray-400 dark:text-neutral-500">
              {step === 'input' && t('bulk.step.input')}
              {step === 'confirm' && t('bulk.step.confirm')}
              {step === 'fetch' && t('bulk.step.fetch')}
            </span>
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {step === 'input' && (
            <>
              <div
                className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: t('bulk.input.hint.html') }}
              />

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  t('bulk.input.placeholder.header') + '\n\n' +
                  'RC1\thttps://osu.ppy.sh/b/5318853\n' +
                  'RC2\t5318764\n' +
                  'HB1\t5318882\n' +
                  '\n' +
                  'RC1\t5308399\n' +
                  'RC2\t5308425\n' +
                  'HB1\t5308454\n' +
                  'TB\t5308499\n' +
                  '\n' +
                  'RC1\t5300120\n' +
                  'HB1\t5300188\n' +
                  'TB\t5300210\n'
                }
                rows={14}
                className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-xs font-mono bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
              />
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
                <span dangerouslySetInnerHTML={{ __html: t('bulk.confirm.detected.html', { n: String(groupCount) }) }} />
                <br />
                <span dangerouslySetInnerHTML={{ __html: t('bulk.confirm.hint.html') }} />
              </div>

              <div className="border border-gray-200 dark:border-neutral-800 rounded">
                <div className="grid grid-cols-[40px_70px_1fr_1fr_60px] gap-2 px-2 py-1.5 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800 font-medium text-xs text-gray-500 dark:text-neutral-400">
                  <span>{t('bulk.col.round')}</span>
                  <span>{t('bulk.col.type')}</span>
                  <span>{t('bulk.col.name')}</span>
                  <span>{t('bulk.col.abbr')}</span>
                  <span className="text-right">{t('bulk.col.maps')}</span>
                </div>
                {groupMetas.map((m, gi) => {
                  if (groupSizes[gi] === 0) return null
                  const groupColor = GROUP_COLORS[gi % GROUP_COLORS.length]
                  const typeLabel = m.isQualifier ? t('bulk.type.qual') : t('bulk.type.elim')
                  return (
                    <div key={gi} className="grid grid-cols-[40px_70px_1fr_1fr_60px] gap-2 px-2 py-1.5 border-b border-gray-100 dark:border-neutral-800 items-center">
                      <span className={`font-mono text-center text-gray-700 dark:text-neutral-200 rounded text-xs py-1 ${groupColor}`}>
                        {gi + 1}
                      </span>
                      <button
                        onClick={() => toggleQualifier(gi)}
                        className={`text-xs px-2 py-1 rounded ${m.isQualifier ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-200' : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300'}`}
                        title={t('bulk.toggleTitle', { type: typeLabel })}
                      >
                        {typeLabel}
                      </button>
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) => updateGroupMeta(gi, 'name', e.target.value)}
                        placeholder={t('bulk.placeholder.roundName')}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
                      />
                      <input
                        type="text"
                        value={m.abbreviation}
                        onChange={(e) => updateGroupMeta(gi, 'abbreviation', e.target.value)}
                        placeholder={t('bulk.placeholder.roundAbbr')}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
                      />
                      <span className="text-xs text-gray-400 dark:text-neutral-500 text-right">
                        {groupSizes[gi]}{!groupHasTb[gi] && <span className="text-orange-600 ml-1" title={t('bulk.noTb')}>⚐</span>}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="text-xs text-gray-400 dark:text-neutral-500">
                {t('bulk.summary', { total: String(rows.length), valid: String(rows.filter((r) => r.mapId).length) })}
              </div>
            </>
          )}

          {step === 'fetch' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  {t('bulk.fetch.progress', { ok: String(okRows.length), total: String(rows.filter((r) => r.mapId).length) })}
                  {failedCount > 0 && <span className="text-yellow-700 dark:text-yellow-300 ml-2">{t('bulk.fetch.failed', { n: String(failedCount) })}</span>}
                </span>
                {!running && failedCount > 0 && (
                  <button
                    onClick={retryFailed}
                    className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 ml-auto"
                  >
                    {t('bulk.fetch.retry')}
                  </button>
                )}
              </div>

              <div className="border border-gray-200 dark:border-neutral-800 rounded text-xs">
                <div className="grid grid-cols-[40px_60px_80px_1fr] gap-2 px-2 py-1.5 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800 font-medium text-gray-500 dark:text-neutral-400">
                  <span>{t('bulk.col.round')}</span>
                  <span>{t('bulk.col.slot')}</span>
                  <span>{t('bulk.col.mapId')}</span>
                  <span>{t('bulk.col.result')}</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {rows.map((r, i) => {
                    const groupColor = GROUP_COLORS[r.groupIndex % GROUP_COLORS.length]
                    return (
                      <div
                        key={i}
                        className={`grid grid-cols-[40px_60px_80px_1fr] gap-2 px-2 py-1 border-b border-gray-100 dark:border-neutral-800 ${
                          r.status === 'error' ? 'bg-yellow-50 dark:bg-yellow-900/30' : r.status === 'ok' ? '' : 'bg-blue-50 dark:bg-blue-900/30'
                        }`}
                      >
                        <span className={`font-mono text-center text-gray-700 dark:text-neutral-200 rounded text-[10px] ${groupColor}`}>
                          {r.groupIndex + 1}
                        </span>
                        <span className="font-mono text-gray-700 dark:text-neutral-200">{r.slot}</span>
                        <span className="font-mono text-gray-500 dark:text-neutral-400">{r.mapId || '—'}</span>
                        <span className="truncate">
                          {r.status === 'ok' && r.meta && (
                            <>
                              <span className="text-gray-700 dark:text-neutral-200">{r.meta.artist} - {r.meta.title} [{r.meta.version}]</span>
                              <span className="text-gray-400 dark:text-neutral-500 ml-2">
                                {r.meta.bpm ? `${Math.round(r.meta.bpm)}bpm` : ''} {formatLength(r.meta.length)}
                                {r.meta.mode !== '3' && <span className="text-orange-600 dark:text-orange-300 ml-1">{t('bulk.fetch.notMania', { mode: r.meta.mode })}</span>}
                              </span>
                            </>
                          )}
                          {r.status === 'fetching' && <span className="text-blue-600 dark:text-blue-300">{t('bulk.fetch.fetching')}</span>}
                          {r.status === 'error' && <span className="text-yellow-700 dark:text-yellow-300">{r.errorKey ? t(r.errorKey) : r.error}</span>}
                          {r.status === 'pending' && <span className="text-gray-400 dark:text-neutral-500">{t('bulk.fetch.pending')}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-neutral-800 flex items-center justify-end gap-2 shrink-0">
          {step === 'input' && (
            <>
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-neutral-300 hover:text-gray-800 dark:hover:text-neutral-100">
                {t('bulk.cancel')}
              </button>
              <button
                onClick={parse}
                disabled={!text.trim()}
                className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-40"
              >
                {t('bulk.parse')}
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button onClick={() => setStep('input')} className="px-3 py-1.5 text-sm text-gray-600 dark:text-neutral-300 hover:text-gray-800 dark:hover:text-neutral-100">
                {t('bulk.backToInput')}
              </button>
              <button
                onClick={startFetch}
                disabled={rows.filter((r) => r.mapId).length === 0}
                className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-40"
              >
                {t('bulk.confirmAndFetch')}
              </button>
            </>
          )}

          {step === 'fetch' && (
            <>
              <button onClick={goBackToConfirm} className="px-3 py-1.5 text-sm text-gray-600 dark:text-neutral-300 hover:text-gray-800 dark:hover:text-neutral-100">
                {running ? t('bulk.backToConfirmRunning') : t('bulk.backToConfirm')}
              </button>
              <button
                onClick={doImport}
                disabled={!canImport}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-40"
              >
                {t('bulk.import', {
                  rounds: String(groupedAll.filter((g) => g && g.length > 0).length),
                  maps: String(importableRows.length),
                  failedNote: failedCount > 0 ? t('bulk.import.failedNote', { n: String(failedCount) }) : '',
                })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
