'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments } from '@/generated/tournaments'
import { fetchLadder } from './DifficultyRefPicker'
import {
  baseLadderRounds,
  resolveLadder,
  sampleLadderAtOffset,
  type LadderEntry,
  type RefField,
  type RefType,
} from '@/lib/referenceData'

// 整轮「参考」结果:6 个非 SV 值(SV 不碰)。
export interface RoundRefValues {
  rc: number
  hbRf: number
  hbLn: number
  ln: number
  tbRf: number
  tbLn: number
}

interface Props {
  // 当前轮缩写,用于自动匹配基准(MWC)同名轮
  roundAbbr: string
  // Apply 时把 6 个值写回
  onApply: (values: RoundRefValues) => void
  // 防自引用
  excludeRef?: { tournamentId: string; roundId: string }
}

// 每个目标字段 → (type, field)。SV 排除。
const FIELDS: { key: keyof RoundRefValues; type: RefType; field: RefField; label: string }[] = [
  { key: 'rc', type: 'RC', field: 'rf', label: 'RC' },
  { key: 'hbRf', type: 'HB', field: 'rf', label: 'HB(rf)' },
  { key: 'hbLn', type: 'HB', field: 'ln', label: 'HB(ln)' },
  { key: 'ln', type: 'LN', field: 'ln', label: 'LN' },
  { key: 'tbRf', type: 'TB', field: 'rf', label: 'TB(rf)' },
  { key: 'tbLn', type: 'TB', field: 'ln', label: 'TB(ln)' },
]

export function RoundRefPicker({ roundAbbr, onApply, excludeRef }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<LadderEntry[] | null>(null)
  const [baseRoundId, setBaseRoundId] = useState<string>('')
  const [offset, setOffset] = useState<string>('0')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)

  useEffect(() => {
    let alive = true
    fetchLadder().then((e) => { if (alive) setEntries(e) })
    return () => { alive = false }
  }, [])

  // 基准比赛(MWC)在标尺里的各轮
  const baseRounds = useMemo(
    () => (entries ? baseLadderRounds(tournaments, entries) : []),
    [entries]
  )

  // 当前轮缩写自动匹配基准同名轮
  const autoMatch = useMemo(
    () => baseRounds.find((r) => r.roundAbbr.toLowerCase() === roundAbbr.trim().toLowerCase()),
    [baseRounds, roundAbbr]
  )

  useEffect(() => {
    if (!open) return
    if (baseRounds.length === 0) { setBaseRoundId(''); return }
    if (!baseRounds.find((r) => r.roundId === baseRoundId)) {
      setBaseRoundId(autoMatch?.roundId || baseRounds[0].roundId)
    }
  }, [open, baseRounds, autoMatch, baseRoundId])

  useEffect(() => {
    if (!open) { setPopoverPos(null); return }
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const w = 300
    const margin = 8
    const minHeight = 220
    let left = rect.right - w
    if (left < margin) left = margin
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    let top: number, maxHeight: number
    if (spaceBelow >= minHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4
      maxHeight = window.innerHeight - top - margin
    } else {
      maxHeight = spaceAbove
      top = margin
    }
    setPopoverPos({ top, left, maxHeight })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const baseIndex = useMemo(
    () => baseRounds.find((r) => r.roundId === baseRoundId)?.ladderIndex ?? -1,
    [baseRounds, baseRoundId]
  )

  const offsetNum = useMemo(() => {
    const n = Number(offset)
    return Number.isFinite(n) ? n : 0
  }, [offset])

  // 预览每个字段的插值结果
  const preview = useMemo(() => {
    if (!entries || baseIndex < 0) return null
    const result: RoundRefValues = { rc: 0, hbRf: 0, hbLn: 0, ln: 0, tbRf: 0, tbLn: 0 }
    for (const f of FIELDS) {
      const ladder = resolveLadder(tournaments, entries, f.type, f.field, excludeRef)
      const v = sampleLadderAtOffset(ladder, baseIndex, offsetNum)
      result[f.key] = v ?? 0
    }
    return result
  }, [entries, baseIndex, offsetNum, excludeRef])

  const apply = () => {
    if (!preview) return
    onApply(preview)
    setOpen(false)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('roundRef.title')}
        className="px-2 py-0.5 text-xs border border-purple-200 dark:border-purple-800 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
      >
        {t('roundRef.button')}
      </button>

      {open && popoverPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-50 w-[300px] bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-y-auto"
            style={{ top: popoverPos.top, left: popoverPos.left, maxHeight: popoverPos.maxHeight }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 space-y-2 text-xs">
              <div className="font-medium text-gray-700 dark:text-neutral-200">
                {t('roundRef.title')}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-neutral-500">{t('roundRef.hint')}</p>

              {entries === null ? (
                <p className="text-gray-400 dark:text-neutral-500 py-4 text-center">{t('admin.loading')}</p>
              ) : baseRounds.length === 0 ? (
                <p className="text-gray-400 dark:text-neutral-500 py-4 text-center">{t('roundRef.noBase')}</p>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500 dark:text-neutral-400 shrink-0">{t('roundRef.base')}</span>
                    <select
                      value={baseRoundId}
                      onChange={(e) => setBaseRoundId(e.target.value)}
                      className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                    >
                      {baseRounds.map((r) => (
                        <option key={r.roundId} value={r.roundId}>MWC {r.roundAbbr}</option>
                      ))}
                    </select>
                    <span className="text-gray-500 dark:text-neutral-400">+</span>
                    <input
                      type="number"
                      step="any"
                      value={offset}
                      onChange={(e) => setOffset(e.target.value)}
                      className="w-14 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                    />
                  </div>
                  {autoMatch ? (
                    <p className="text-[10px] text-green-600 dark:text-green-400">
                      {t('roundRef.autoMatched', { round: autoMatch.roundAbbr })}
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      {t('roundRef.noAutoMatch', { round: roundAbbr || '?' })}
                    </p>
                  )}

                  {preview && (
                    <div className="grid grid-cols-3 gap-1 pt-1 border-t border-gray-100 dark:border-neutral-800">
                      {FIELDS.map((f) => (
                        <div key={f.key} className="flex flex-col items-center">
                          <span className="text-[9px] text-gray-400 dark:text-neutral-500">{f.label}</span>
                          <span className="tabular-nums text-gray-700 dark:text-neutral-200">
                            {preview[f.key] > 0 ? preview[f.key].toFixed(2) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-2 py-1 rounded bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
                >
                  {t('refPicker.cancel')}
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={!preview}
                  className="px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('roundRef.apply')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
