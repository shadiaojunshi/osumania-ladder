'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments } from '@/generated/tournaments'
import {
  getRefValue,
  interpolate,
  listEligibleRounds,
  nextRoundInTournament,
  type RefType,
  type RefField,
} from '@/lib/referenceData'

interface Props {
  // 当前数值,展开时用于显示对比;不必回填到 picker 状态
  value: number
  // Apply 时调用,把算好的数字写回
  onChange: (n: number) => void
  // 目标 type:控制初始选中 + 列表过滤
  type: RefType
  // 'rf' 或 'ln':HB 双值 slot 时给两个 picker 各传一个
  field: RefField
  // 如果传了,把这个 (tournamentId, roundId, type) 从列表里去掉,防自引用
  excludeRef?: { tournamentId: string; roundId: string; type: RefType }
}

const TYPES: RefType[] = ['RC', 'HB', 'LN', 'SV', 'TB']

export function DifficultyRefPicker({ value, onChange, type, field, excludeRef }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [pickerType, setPickerType] = useState<RefType>(type)
  const [tournamentId, setTournamentId] = useState<string>('')
  const [leftRoundId, setLeftRoundId] = useState<string>('')
  const [rightRoundId, setRightRoundId] = useState<string>('')
  const [position, setPosition] = useState<0 | 1 | 2 | 3>(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  // popover 用 fixed 定位防外层 overflow-hidden 截断,在 open 时算 button 位置
  useEffect(() => {
    if (!open) {
      setPopoverPos(null)
      return
    }
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const popoverWidth = 320 // w-80
    // 默认右对齐 button,水平不溢出 viewport
    let left = rect.right - popoverWidth
    if (left < 8) left = 8
    if (left + popoverWidth > window.innerWidth - 8)
      left = window.innerWidth - popoverWidth - 8
    setPopoverPos({ top: rect.bottom + 4, left })
  }, [open])

  // 候选 round 列表,跟 (pickerType, field) 联动
  const eligible = useMemo(() => {
    const list = listEligibleRounds(tournaments, pickerType, field)
    if (!excludeRef) return list
    return list.filter(
      (r) =>
        !(
          r.tournamentId === excludeRef.tournamentId &&
          r.roundId === excludeRef.roundId &&
          pickerType === excludeRef.type
        )
    )
  }, [pickerType, field, excludeRef])

  // 按 tournament 分组方便下拉选择
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

  // 打开 popover 时初始化默认选中:第一个比赛 + 头两轮
  useEffect(() => {
    if (!open) return
    if (tournamentOptions.length === 0) {
      setTournamentId('')
      setLeftRoundId('')
      setRightRoundId('')
      return
    }
    if (!tournamentOptions.find((tn) => tn.id === tournamentId)) {
      setTournamentId(tournamentOptions[0].id)
    }
    // 见下面那个 effect 联动 left/right
  }, [open, tournamentOptions, tournamentId])

  // tournamentId 或 pickerType 变了 → 重选 left/right
  useEffect(() => {
    if (!open || !tournamentId) return
    const rounds = eligible.filter((r) => r.tournamentId === tournamentId)
    if (rounds.length === 0) {
      setLeftRoundId('')
      setRightRoundId('')
      return
    }
    const leftStillValid = rounds.find((r) => r.roundId === leftRoundId)
    const newLeftId = leftStillValid ? leftRoundId : rounds[0].roundId
    if (newLeftId !== leftRoundId) setLeftRoundId(newLeftId)

    const tn = tournaments.find((tt) => tt.id === tournamentId)
    if (!tn) return
    const next = nextRoundInTournament(tn, newLeftId, pickerType, field)
    const rightStillValid = rounds.find((r) => r.roundId === rightRoundId)
    if (rightStillValid && rightRoundId !== newLeftId) {
      // 保留用户已选的 right 不动
    } else if (next) {
      setRightRoundId(next.roundId)
    } else {
      // 没有下一轮 → right 跟 left 同
      setRightRoundId(newLeftId)
    }
  }, [open, tournamentId, pickerType, field, eligible, leftRoundId, rightRoundId])

  // 同轮锁 position=0
  useEffect(() => {
    if (leftRoundId && rightRoundId && leftRoundId === rightRoundId && position !== 0) {
      setPosition(0)
    }
  }, [leftRoundId, rightRoundId, position])

  // Esc 关
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const tn = tournaments.find((tt) => tt.id === tournamentId)
  const leftVal = tn ? getRefValue(tn, leftRoundId, pickerType, field) : null
  const rightVal = tn ? getRefValue(tn, rightRoundId, pickerType, field) : null
  const sameRound = leftRoundId === rightRoundId
  const hasData = leftVal !== null && rightVal !== null
  const previewVal = hasData ? interpolate(leftVal!, rightVal!, position) : null

  const leftRoundAbbr =
    tournamentRounds.find((r) => r.roundId === leftRoundId)?.roundAbbr || ''
  const rightRoundAbbr =
    tournamentRounds.find((r) => r.roundId === rightRoundId)?.roundAbbr || ''

  const apply = () => {
    if (previewVal === null) return
    onChange(previewVal)
    setOpen(false)
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
            className="fixed z-50 w-80 p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <PopoverBody
              t={t}
              value={value}
              pickerType={pickerType}
              setPickerType={setPickerType}
              tournamentId={tournamentId}
              setTournamentId={setTournamentId}
              tournamentOptions={tournamentOptions}
              tournamentRounds={tournamentRounds}
              leftRoundId={leftRoundId}
              setLeftRoundId={setLeftRoundId}
              rightRoundId={rightRoundId}
              setRightRoundId={setRightRoundId}
              position={position}
              setPosition={setPosition}
              sameRound={sameRound}
              leftRoundAbbr={leftRoundAbbr}
              rightRoundAbbr={rightRoundAbbr}
              previewVal={previewVal}
              onCancel={() => setOpen(false)}
              onApply={apply}
            />
          </div>
        </>
      )}
    </div>
  )
}

// 把 popover 内容拆出来,免得主组件函数过长。
interface PopoverBodyProps {
  t: ReturnType<typeof useT>
  value: number
  pickerType: RefType
  setPickerType: (v: RefType) => void
  tournamentId: string
  setTournamentId: (v: string) => void
  tournamentOptions: { id: string; abbr: string; year: number }[]
  tournamentRounds: { roundId: string; roundAbbr: string }[]
  leftRoundId: string
  setLeftRoundId: (v: string) => void
  rightRoundId: string
  setRightRoundId: (v: string) => void
  position: 0 | 1 | 2 | 3
  setPosition: (v: 0 | 1 | 2 | 3) => void
  sameRound: boolean
  leftRoundAbbr: string
  rightRoundAbbr: string
  previewVal: number | null
  onCancel: () => void
  onApply: () => void
}

function PopoverBody(p: PopoverBodyProps) {
  const {
    t,
    value,
    pickerType,
    setPickerType,
    tournamentId,
    setTournamentId,
    tournamentOptions,
    tournamentRounds,
    leftRoundId,
    setLeftRoundId,
    rightRoundId,
    setRightRoundId,
    position,
    setPosition,
    sameRound,
    leftRoundAbbr,
    rightRoundAbbr,
    previewVal,
    onCancel,
    onApply,
  } = p

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-medium text-gray-700 dark:text-neutral-200">
          {t('refPicker.title')}
        </div>
        {value > 0 && (
          <div className="text-gray-400 dark:text-neutral-500">
            {t('refPicker.current', { value: value.toFixed(1) })}
          </div>
        )}
      </div>

      {/* Type selector */}
      <div>
        <label className="block text-gray-500 dark:text-neutral-400 mb-1">
          {t('refPicker.type')}
        </label>
        <div className="flex gap-1">
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setPickerType(ty)}
              className={`px-2 py-0.5 rounded ${pickerType === ty ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300'}`}
            >
              {ty}
            </button>
          ))}
        </div>
      </div>

      {/* Tournament dropdown */}
      <div>
        <label className="block text-gray-500 dark:text-neutral-400 mb-1">
          {t('refPicker.tournament')}
        </label>
        <select
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value)}
          className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100"
        >
          {tournamentOptions.length === 0 && (
            <option value="">
              {t('refPicker.noRounds', { type: pickerType })}
            </option>
          )}
          {tournamentOptions.map((tn) => (
            <option key={tn.id} value={tn.id}>
              {tn.abbr} ({tn.year})
            </option>
          ))}
        </select>
      </div>

      {/* Left/right round */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-gray-500 dark:text-neutral-400 mb-1">
            {t('refPicker.leftRound')}
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
        </div>
        <div>
          <label className="block text-gray-500 dark:text-neutral-400 mb-1">
            {t('refPicker.rightRound')}
          </label>
          <select
            value={rightRoundId}
            onChange={(e) => setRightRoundId(e.target.value)}
            disabled={tournamentRounds.length === 0}
            className="w-full px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 disabled:opacity-50"
          >
            {tournamentRounds.map((r) => (
              <option key={r.roundId} value={r.roundId}>
                {r.roundAbbr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Position radios */}
      <div>
        <label className="block text-gray-500 dark:text-neutral-400 mb-1">
          {t('refPicker.position')}
        </label>
        <div className="space-y-0.5">
          {([0, 1, 2, 3] as const).map((pos) => {
            const disabled = sameRound && pos !== 0
            const label =
              pos === 0
                ? t('refPicker.position.left', { round: leftRoundAbbr })
                : pos === 1
                  ? t('refPicker.position.third1')
                  : pos === 2
                    ? t('refPicker.position.third2')
                    : t('refPicker.position.right', { round: rightRoundAbbr })
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
                <span className="text-gray-700 dark:text-neutral-300">{label}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Preview + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-neutral-800">
        <div className="text-gray-500 dark:text-neutral-400">
          {previewVal !== null
            ? t('refPicker.preview', { value: previewVal.toFixed(1) })
            : t('refPicker.previewNoData')}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 rounded bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
          >
            {t('refPicker.cancel')}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={previewVal === null}
            className="px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {previewVal !== null
              ? t('refPicker.apply', { value: previewVal.toFixed(1) })
              : t('refPicker.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
