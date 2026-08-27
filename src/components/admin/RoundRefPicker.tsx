'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments } from '@/generated/tournaments'
import { fetchLadder } from './DifficultyRefPicker'
import {
  baseLadderRounds,
  resolveLadder,
  sampleLadderAtPos,
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
  // 本比赛所有轮缩写(易→难顺序),用于非标准轮靠邻居标准轮反推档位
  siblingAbbrs?: string[]
  // 当前轮在 siblingAbbrs 中的下标
  roundIndex?: number
  // Apply 时把 6 个值写回
  onApply: (values: RoundRefValues) => void
  // 防自引用
  excludeRef?: { tournamentId: string; roundId: string }
}

// 标准淘汰轮的难度序(easy→hard)。用于当前轮不是 MWC 直接同名轮时,
// 锚到最近的 MWC 标准轮 + 偏移(1 格 = 标尺相邻一项)。
// 例:本轮 RO64,MWC 没有 RO64,但有 RO32 → 锚 MWC RO32,偏移 -1(RO64 比 RO32 低一档)。
// 不含 RO256:MWC 是世界杯性质,不设也不显示这么低的轮;显示一律用 "MWC RO32-N" 形式。
const STANDARD_ROUND_RANK: Record<string, number> = {
  RO128: 1,
  RO64: 2,
  RO32: 3,
  RO16: 4,
  QF: 5,
  SF: 6,
  F: 7,
  GF: 8,
}

function standardRank(abbr: string): number | undefined {
  return STANDARD_ROUND_RANK[abbr.trim().toUpperCase()]
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

export function RoundRefPicker({ roundAbbr, siblingAbbrs, roundIndex, onApply, excludeRef }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<LadderEntry[] | null>(null)
  const [baseRoundKey, setBaseRoundKey] = useState<string>('')
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
  const usingFallbackBase = baseRounds.length > 0 && baseRounds[0].isFallback

  // 当前轮缩写自动匹配:
  // 1. 优先 MWC 同名轮(偏移 0)。
  // 2. 否则若本轮是标准轮(RO256..GF),锚到 rank 最接近的 MWC 标准轮,
  //    偏移 = 本轮 rank - 该 MWC 轮 rank(可正可负)。
  //    例:本轮 RO64(rank2),MWC 最低是 RO32(rank3)→ 锚 RO32,偏移 -1。
  // 3. 都不行(非标准轮 / MWC 无标准轮)→ 无自动匹配,用户手选。
  const autoMatch = useMemo<{ key: string; roundId: string; roundAbbr: string; offset: number; exact: boolean; isFallback: boolean } | null>(() => {
    if (baseRounds.length === 0) return null
    const exact = baseRounds.find(
      (r) => r.roundAbbr.toLowerCase() === roundAbbr.trim().toLowerCase()
    )
    if (exact) return { key: exact.key, roundId: exact.roundId, roundAbbr: exact.roundAbbr, offset: 0, exact: true, isFallback: exact.isFallback }

    // 本轮 rank:先看自身是否标准轮;不是就顺着后面的兄弟轮找第一个标准轮,
    // 用它的 rank 减去间隔步数反推(淘汰赛里非标准轮的下一/下下轮通常就是标准轮)。
    let myRank = standardRank(roundAbbr)
    if (myRank === undefined && siblingAbbrs && roundIndex !== undefined) {
      for (let j = roundIndex + 1; j < siblingAbbrs.length; j++) {
        const rk = standardRank(siblingAbbrs[j])
        if (rk !== undefined) { myRank = rk - (j - roundIndex); break }
      }
      // 后面没有标准轮,再往前找(用前一个标准轮 + 间隔)
      if (myRank === undefined) {
        for (let j = roundIndex - 1; j >= 0; j--) {
          const rk = standardRank(siblingAbbrs[j])
          if (rk !== undefined) { myRank = rk + (roundIndex - j); break }
        }
      }
    }
    if (myRank === undefined) return null
    // MWC 里带标准 rank 的轮,取 rank 与本轮最接近的一个
    let best: { key: string; roundId: string; roundAbbr: string; rank: number; isFallback: boolean } | null = null
    for (const r of baseRounds) {
      const rk = standardRank(r.roundAbbr)
      if (rk === undefined) continue
      if (!best || Math.abs(rk - myRank) < Math.abs(best.rank - myRank)) {
        best = { key: r.key, roundId: r.roundId, roundAbbr: r.roundAbbr, rank: rk, isFallback: r.isFallback }
      }
    }
    if (!best) return null
    return { key: best.key, roundId: best.roundId, roundAbbr: best.roundAbbr, offset: myRank - best.rank, exact: false, isFallback: best.isFallback }
  }, [baseRounds, roundAbbr, siblingAbbrs, roundIndex])

  useEffect(() => {
    if (!open) return
    if (baseRounds.length === 0) { setBaseRoundKey(''); return }
    if (!baseRounds.find((r) => r.key === baseRoundKey)) {
      setBaseRoundKey(autoMatch?.key || baseRounds[0].key)
      // 非精确匹配时把推断出的偏移预填进去(如 RO64 → RO32 -1)
      if (autoMatch && !autoMatch.exact) setOffset(String(autoMatch.offset))
    }
  }, [open, baseRounds, autoMatch, baseRoundKey])

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

  // 基准轮在真实轮位轴上的坐标(pos)。找不到为 null。
  const basePos = useMemo(
    () => baseRounds.find((r) => r.key === baseRoundKey)?.pos ?? null,
    [baseRounds, baseRoundKey]
  )

  const offsetNum = useMemo(() => {
    const n = Number(offset)
    return Number.isFinite(n) ? n : 0
  }, [offset])

  // 预览每个字段的插值结果。offset 现在是"标准轮数",在真实轮位轴上取值。
  const preview = useMemo(() => {
    if (!entries || basePos === null) return null
    const result: RoundRefValues = { rc: 0, hbRf: 0, hbLn: 0, ln: 0, tbRf: 0, tbLn: 0 }
    for (const f of FIELDS) {
      const ladder = resolveLadder(tournaments, entries, f.type, f.field, excludeRef)
      const v = sampleLadderAtPos(ladder, basePos, offsetNum)
      result[f.key] = v ?? 0
    }
    return result
  }, [entries, basePos, offsetNum, excludeRef])

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
        className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded border border-purple-400 dark:border-purple-500 bg-purple-600 text-white shadow-sm hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500"
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
                      value={baseRoundKey}
                      onChange={(e) => setBaseRoundKey(e.target.value)}
                      className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                    >
                      {baseRounds.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.isFallback ? `${r.tournamentAbbr} · ${r.roundAbbr}` : `MWC ${r.roundAbbr}`}
                        </option>
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
                  {usingFallbackBase ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      {t('roundRef.fallbackBase')}
                    </p>
                  ) : autoMatch && (autoMatch.exact || autoMatch.offset === 0) ? (
                    <p className="text-[10px] text-green-600 dark:text-green-400">
                      {t('roundRef.autoMatched', { round: autoMatch.roundAbbr })}
                    </p>
                  ) : autoMatch ? (
                    <p className="text-[10px] text-green-600 dark:text-green-400">
                      {t('roundRef.resolvedMatch', {
                        round: roundAbbr || '?',
                        base: autoMatch.roundAbbr,
                        offset: autoMatch.offset > 0 ? `+${autoMatch.offset}` : String(autoMatch.offset),
                      })}
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
