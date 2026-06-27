'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT, type MessageKey } from '@/lib/i18n'
import { tournaments } from '@/generated/tournaments'
import {
  findAnchorContext,
  interpolateAnchored,
  resolveLadder,
  type AnchorContext,
  type LadderEntry,
  type RefField,
  type RefPosition,
  type RefType,
} from '@/lib/referenceData'

// 模块级缓存:整个 admin 会话只 fetch 一次标尺。
let ladderPromise: Promise<LadderEntry[]> | null = null
function fetchLadder(): Promise<LadderEntry[]> {
  if (!ladderPromise) {
    ladderPromise = fetch('/api/ref-ladder')
      .then((r) => (r.ok ? r.json() : { data: { entries: [] } }))
      .then((d: { data?: { entries?: LadderEntry[] } }) => d.data?.entries || [])
      .catch(() => [])
  }
  return ladderPromise
}
// 让 RefLadderEditor 保存后清缓存,下个 picker 打开时重拉。
export function invalidateRefLadder() {
  ladderPromise = null
}

interface Props {
  // 当前数值,展开时用于显示对比
  value: number
  // Apply 时调用,把算好的数字写回
  onChange: (n: number) => void
  // 目标 type:控制候选过滤
  type: RefType
  // 'rf' 或 'ln':HB / TB 双值 slot 时给两个 picker 各传一个
  field: RefField
  // 防自引用
  excludeRef?: { tournamentId: string; roundId: string; type: RefType }
}

const POSITIONS: RefPosition[] = [
  'anchorMinus',
  'anchor',
  'anchorPlus',
  'midHalf',
  'nextMinus',
  'next',
]

export function DifficultyRefPicker({ value, onChange, type, field, excludeRef }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // 锚点 = 标尺解析后列表里的下标(字符串形式存,select 用)
  const [anchorKey, setAnchorKey] = useState<string>('')
  const [position, setPosition] = useState<RefPosition>('anchor')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{
    top: number
    left: number
    maxHeight: number
  } | null>(null)
  const [entries, setEntries] = useState<LadderEntry[] | null>(null)

  useEffect(() => {
    let alive = true
    fetchLadder().then((e) => {
      if (alive) setEntries(e)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setPopoverPos(null)
      return
    }
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const popoverWidth = 320
    const margin = 8
    const minHeight = 200

    let left = rect.right - popoverWidth
    if (left < margin) left = margin
    if (left + popoverWidth > window.innerWidth - margin)
      left = window.innerWidth - popoverWidth - margin

    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    let top: number
    let maxHeight: number
    if (spaceBelow >= minHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4
      maxHeight = window.innerHeight - top - margin
    } else {
      maxHeight = spaceAbove
      top = margin
    }
    setPopoverPos({ top, left, maxHeight })
  }, [open])

  // 解析标尺到当前 (type,field)。保留 value=null 的项(占位),
  // 锚点候选则只取有数据的(下面 anchorOptions 过滤)。
  const ladder = useMemo(() => {
    if (!entries) return []
    return resolveLadder(tournaments, entries, type, field, excludeRef)
  }, [entries, type, field, excludeRef])

  // 锚点候选:value 非 null 的项,带它在 ladder 里的真实下标。
  const anchorOptions = useMemo(
    () =>
      ladder
        .map((r, idx) => ({ idx, r }))
        .filter((x) => x.r.value !== null),
    [ladder]
  )

  // 打开时初始化默认锚点:第一个有数据的项
  useEffect(() => {
    if (!open) return
    if (anchorOptions.length === 0) {
      setAnchorKey('')
      return
    }
    if (!anchorOptions.find((o) => String(o.idx) === anchorKey)) {
      setAnchorKey(String(anchorOptions[0].idx))
    }
  }, [open, anchorOptions, anchorKey])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const ctx: AnchorContext | null = useMemo(() => {
    if (anchorKey === '') return null
    const idx = Number(anchorKey)
    if (!Number.isInteger(idx)) return null
    return findAnchorContext(ladder, idx)
  }, [ladder, anchorKey])

  // 当前 position 在 ctx 下不可用就回退到 anchor
  useEffect(() => {
    if (!ctx) return
    if (interpolateAnchored(ctx, position) === null) {
      setPosition('anchor')
    }
  }, [ctx, position])

  const previewVal = ctx ? interpolateAnchored(ctx, position) : null

  const apply = () => {
    if (previewVal === null) return
    onChange(previewVal)
    setOpen(false)
  }

  const positionLabel = (pos: RefPosition): string => {
    const anchor = ctx?.anchor.roundAbbr || '?'
    const next = ctx?.next?.roundAbbr || '?'
    return t(positionKey(pos), { anchor, next })
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('refPicker.title')}
        className="px-1.5 py-1 text-[10px] border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:text-purple-600 dark:hover:text-purple-300"
      >
        {t('refPicker.button')}
      </button>

      {open && popoverPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            ref={popoverRef}
            className="fixed z-50 w-80 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-y-auto"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              maxHeight: popoverPos.maxHeight,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-700 dark:text-neutral-200">
                  {t('refPicker.title')}{' '}
                  <span className="text-gray-400 dark:text-neutral-500">
                    {type} ({field})
                  </span>
                </div>
                {value > 0 && (
                  <div className="text-gray-400 dark:text-neutral-500">
                    {t('refPicker.current', { value: value.toFixed(1) })}
                  </div>
                )}
              </div>

              {entries === null ? (
                <p className="text-gray-400 dark:text-neutral-500 py-4 text-center">
                  {t('admin.loading')}
                </p>
              ) : anchorOptions.length === 0 ? (
                <p className="text-gray-400 dark:text-neutral-500 py-4 text-center">
                  {entries.length === 0
                    ? t('refPicker.ladderEmpty')
                    : t('refPicker.noRounds', { type })}
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-gray-500 dark:text-neutral-400 mb-1">
                      {t('refPicker.anchorRound')}
                    </label>
                    <select
                      value={anchorKey}
                      onChange={(e) => setAnchorKey(e.target.value)}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                    >
                      {anchorOptions.map((o) => (
                        <option key={o.idx} value={String(o.idx)}>
                          {o.r.label} · {o.r.value!.toFixed(1)}
                        </option>
                      ))}
                    </select>
                    {ctx && (
                      <p className="text-[10px] text-gray-400 dark:text-neutral-500 mt-1">
                        {t('refPicker.adjacency', {
                          prev: ctx.prev?.roundAbbr || '—',
                          anchor: ctx.anchor.roundAbbr,
                          next: ctx.next?.roundAbbr || '—',
                        })}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-500 dark:text-neutral-400 mb-1">
                      {t('refPicker.position')}
                    </label>
                    <div className="space-y-0.5">
                      {POSITIONS.map((pos) => {
                        const previewAt = ctx ? interpolateAnchored(ctx, pos) : null
                        const disabled = previewAt === null
                        return (
                          <label
                            key={pos}
                            className={`flex items-center gap-1.5 cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <input
                              type="radio"
                              checked={position === pos}
                              disabled={disabled}
                              onChange={() => setPosition(pos)}
                              className="accent-purple-600"
                            />
                            <span className="text-gray-700 dark:text-neutral-300 flex-1">
                              {positionLabel(pos)}
                            </span>
                            {previewAt !== null && (
                              <span className="text-gray-400 dark:text-neutral-500 tabular-nums">
                                {previewAt.toFixed(1)}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-neutral-800">
                <div className="text-gray-500 dark:text-neutral-400">
                  {previewVal !== null
                    ? t('refPicker.preview', { value: previewVal.toFixed(1) })
                    : t('refPicker.previewNoData')}
                </div>
                <div className="flex gap-1">
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
                    disabled={previewVal === null}
                    className="px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {previewVal !== null
                      ? t('refPicker.apply', { value: previewVal.toFixed(1) })
                      : t('refPicker.apply', { value: '?' })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function positionKey(pos: RefPosition): MessageKey {
  return `refPicker.position.${pos}` as MessageKey
}
