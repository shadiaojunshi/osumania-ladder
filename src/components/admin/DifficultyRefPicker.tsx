'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments } from '@/generated/tournaments'
import {
  findAutoRightAnchor,
  getRefValue,
  interpolateAt,
  listEligibleRounds,
  type RefField,
  type RefPosition,
  type RefType,
} from '@/lib/referenceData'

// 模块级缓存:整个 admin 会话只 fetch 一次白名单。
let whitelistPromise: Promise<Set<string>> | null = null
function fetchWhitelist(): Promise<Set<string>> {
  if (!whitelistPromise) {
    whitelistPromise = fetch('/api/ref-tournaments')
      .then((r) => (r.ok ? r.json() : { data: { tournamentIds: [] } }))
      .then(
        (d: { data?: { tournamentIds?: string[] } }) =>
          new Set<string>(d.data?.tournamentIds || [])
      )
      .catch(() => new Set<string>())
  }
  return whitelistPromise
}
// 让 RefTournamentsEditor 保存后清缓存,下个 picker 打开时重拉。
export function invalidateRefWhitelist() {
  whitelistPromise = null
}

interface Props {
  // 当前数值,展开时用于显示对比;不必回填到 picker 状态
  value: number
  // Apply 时调用,把算好的数字写回
  onChange: (n: number) => void
  // 目标 type:控制候选过滤;不在 popover 里再让用户切了
  type: RefType
  // 'rf' 或 'ln':HB / TB 双值 slot 时给两个 picker 各传一个
  field: RefField
  // 如果传了,把这个 (tournamentId, roundId, type) 从列表里去掉,防自引用
  excludeRef?: { tournamentId: string; roundId: string; type: RefType }
}

const POSITIONS_WITH_RIGHT: RefPosition[] = [
  'leftMinus',
  'left',
  'leftPlus',
  'midHalf',
  'rightMinus',
  'right',
]

export function DifficultyRefPicker({ value, onChange, type, field, excludeRef }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tournamentId, setTournamentId] = useState<string>('')
  const [leftRoundId, setLeftRoundId] = useState<string>('')
  const [position, setPosition] = useState<RefPosition>('left')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{
    top: number
    left: number
    maxHeight: number
  } | null>(null)
  const [whitelist, setWhitelist] = useState<Set<string> | null>(null)

  // 第一次 mount 拉白名单(模块级缓存,只 fetch 一次)
  useEffect(() => {
    let alive = true
    fetchWhitelist().then((s) => {
      if (alive) setWhitelist(s)
    })
    return () => {
      alive = false
    }
  }, [])

  // popover 用 fixed 定位防外层 overflow-hidden 截断,在 open 时算 button 位置;
  // 下方空间不够就翻到上方;高度按可用空间限制 + overflow scroll。
  useEffect(() => {
    if (!open) {
      setPopoverPos(null)
      return
    }
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const popoverWidth = 320 // w-80
    const margin = 8
    const minHeight = 200

    // 水平位置:右对齐 button,clamp 到 viewport
    let left = rect.right - popoverWidth
    if (left < margin) left = margin
    if (left + popoverWidth > window.innerWidth - margin)
      left = window.innerWidth - popoverWidth - margin

    // 垂直位置:优先放下方,空间不够才翻上方
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    let top: number
    let maxHeight: number
    if (spaceBelow >= minHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4
      maxHeight = window.innerHeight - top - margin
    } else {
      // 翻到上方
      maxHeight = spaceAbove
      top = margin
    }
    setPopoverPos({ top, left, maxHeight })
  }, [open])

  // 候选列表
  const eligible = useMemo(() => {
    const list = listEligibleRounds(tournaments, type, field, whitelist)
    if (!excludeRef) return list
    return list.filter(
      (r) =>
        !(
          r.tournamentId === excludeRef.tournamentId &&
          r.roundId === excludeRef.roundId &&
          type === excludeRef.type
        )
    )
  }, [type, field, excludeRef, whitelist])

  const tournamentOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { id: string; abbr: string; year: number }[] = []
    for (const r of eligible) {
      if (seen.has(r.tournamentId)) continue
      seen.add(r.tournamentId)
      out.push({ id: r.tournamentId, abbr: r.tournamentAbbr, year: r.year })
    }
    return out
  }, [eligible])

  const tournamentRounds = useMemo(
    () => eligible.filter((r) => r.tournamentId === tournamentId),
    [eligible, tournamentId]
  )

  // 打开时初始化默认选中:第一个比赛 + 第一个轮
  useEffect(() => {
    if (!open) return
    if (tournamentOptions.length === 0) {
      setTournamentId('')
      setLeftRoundId('')
      return
    }
    if (!tournamentOptions.find((tn) => tn.id === tournamentId)) {
      setTournamentId(tournamentOptions[0].id)
    }
  }, [open, tournamentOptions, tournamentId])

  useEffect(() => {
    if (!open || !tournamentId) return
    const rounds = eligible.filter((r) => r.tournamentId === tournamentId)
    if (rounds.length === 0) {
      setLeftRoundId('')
      return
    }
    const stillValid = rounds.find((r) => r.roundId === leftRoundId)
    if (!stillValid) setLeftRoundId(rounds[0].roundId)
  }, [open, tournamentId, eligible, leftRoundId])

  // Esc 关
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const tn = useMemo(
    () => tournaments.find((tt) => tt.id === tournamentId),
    [tournamentId]
  )
  const leftVal = tn ? getRefValue(tn, leftRoundId, type, field) : null
  const auto = tn ? findAutoRightAnchor(tn, leftRoundId, type, field) : null
  const hasRight = auto !== null
  const rightVal = auto?.value ?? null

  const leftAbbr =
    tournamentRounds.find((r) => r.roundId === leftRoundId)?.roundAbbr || ''
  const rightAbbr = auto?.roundAbbr || ''

  // 没有右锚点时只能选 'left',其他全 disable
  useEffect(() => {
    if (!hasRight && position !== 'left') setPosition('left')
  }, [hasRight, position])

  const previewVal =
    leftVal !== null && rightVal !== null
      ? interpolateAt(leftVal, rightVal, position)
      : leftVal !== null && position === 'left'
        ? leftVal
        : null

  const apply = () => {
    if (previewVal === null) return
    onChange(previewVal)
    setOpen(false)
  }

  const positionLabel = (pos: RefPosition): string => {
    if (!hasRight && pos !== 'left') {
      // disabled 的档位还是要展示,提示用户没有右锚点
      return t(positionKey(pos), { left: leftAbbr, right: '?' })
    }
    return t(positionKey(pos), { left: leftAbbr, right: rightAbbr })
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

              {whitelist === null ? (
                <p className="text-gray-400 dark:text-neutral-500 py-4 text-center">
                  {t('admin.loading')}
                </p>
              ) : tournamentOptions.length === 0 ? (
                <p className="text-gray-400 dark:text-neutral-500 py-4 text-center">
                  {whitelist.size === 0
                    ? t('refPicker.whitelistEmpty')
                    : t('refPicker.noRounds', { type })}
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-gray-500 dark:text-neutral-400 mb-1">
                      {t('refPicker.tournament')}
                    </label>
                    <select
                      value={tournamentId}
                      onChange={(e) => setTournamentId(e.target.value)}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
                    >
                      {tournamentOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.abbr} ({opt.year})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 dark:text-neutral-400 mb-1">
                      {t('refPicker.anchorRound')}
                    </label>
                    <select
                      value={leftRoundId}
                      onChange={(e) => setLeftRoundId(e.target.value)}
                      disabled={tournamentRounds.length === 0}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 disabled:opacity-50"
                    >
                      {tournamentRounds.map((r) => (
                        <option key={r.roundId} value={r.roundId}>
                          {r.roundAbbr}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 dark:text-neutral-500 mt-1">
                      {hasRight
                        ? t('refPicker.autoRight', { right: rightAbbr })
                        : t('refPicker.autoRightNone')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-gray-500 dark:text-neutral-400 mb-1">
                      {t('refPicker.position')}
                    </label>
                    <div className="space-y-0.5">
                      {POSITIONS_WITH_RIGHT.map((pos) => {
                        const disabled = !hasRight && pos !== 'left'
                        const previewAt =
                          leftVal !== null && rightVal !== null
                            ? interpolateAt(leftVal, rightVal, pos)
                            : pos === 'left' && leftVal !== null
                              ? leftVal
                              : null
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

function positionKey(pos: RefPosition):
  | 'refPicker.position.leftMinus'
  | 'refPicker.position.left'
  | 'refPicker.position.leftPlus'
  | 'refPicker.position.midHalf'
  | 'refPicker.position.rightMinus'
  | 'refPicker.position.right' {
  return `refPicker.position.${pos}` as
    | 'refPicker.position.leftMinus'
    | 'refPicker.position.left'
    | 'refPicker.position.leftPlus'
    | 'refPicker.position.midHalf'
    | 'refPicker.position.rightMinus'
    | 'refPicker.position.right'
}
