'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BeatmapMeta } from '@/lib/types'
import { useT, type MessageKey } from '@/lib/i18n'
import { DifficultyRefPicker } from './DifficultyRefPicker'
import type { RefType } from '@/lib/referenceData'
import type { MapHistorySummary } from '@/hooks/useMapHistory'
import { classifySetConflict } from '@/lib/mapConflictDetection'
import { normalizeRealType } from '@/lib/realType'
import { CATEGORY_COLORS, defaultRealTypeFor, needsDualDifficulty, realTypeOptionsFor, type MapCategory } from '@/lib/realTypeCatalog'
import { estimateBeatmapDifficulty, ManiaAnalysisError, type ManiaAnalysisEstimate } from '@/lib/maniaAnalyserClient'
import {
  DIFFICULTY_MAX,
  DIFFICULTY_WARN_ABOVE,
  collectOutOfRange,
  formatDifficulty,
  formatOutOfRange,
  shouldAcceptDifficultyInput,
} from '@/lib/difficultyLimits'
import { ManiaChartButton } from '@/components/chart/ManiaChartButton'

// 键型目录(REAL_TYPES / 默认键型 / 颜色)已抽到 src/lib/realTypeCatalog.ts —— 那是纯数据模块,
// 可以被 node --test 直接导入锁住"默认键型必须是 Pending"这类规则。
// 这里继续 re-export,免得散落各处的 `from './MapSlotEditor'` 全都要改。
export { REAL_TYPES, PENDING_REAL_TYPE_BY_CATEGORY, CATEGORY_COLORS, needsDualDifficulty } from '@/lib/realTypeCatalog'
export type { MapCategory } from '@/lib/realTypeCatalog'

const CATEGORIES: { id: MapCategory; label: string; labelKey?: MessageKey }[] = [
  { id: 'RC', label: 'RC' },
  { id: 'LN', label: 'LN' },
  { id: 'HB', label: 'HB' },
  { id: 'SV', label: 'SV' },
  { id: 'TB', label: 'TB' },
  { id: 'SPECIAL', label: '特殊', labelKey: 'mapSlot.cat.special' },
]

export interface ExtendedMap extends BeatmapMeta {
  category: MapCategory
}

interface Props {
  map: ExtendedMap
  onChange: (map: ExtendedMap) => void
  onRemove: () => void
  getMapHistory?: (beatmapId: number | undefined, beatmapsetId: number | undefined) => MapHistorySummary | null
  enableEstimation?: boolean
  estimateSignal?: number
  tournamentId?: string
  roundId?: string
}

// `needsDualDifficulty` 已移到 `@/lib/realTypeCatalog`(纯数据模块),这里 import + re-export,
// 免得散落各处的 `from './MapSlotEditor'` 全都要改(与上面键型目录同一个做法)。
function getDiffLabel(category: MapCategory): string {
  switch (category) {
    case 'RC': case 'SV': return 'rf'
    case 'LN': return 'ln'
    case 'HB': case 'TB': case 'SPECIAL': return 'rf'
  }
}

// MapCategory → RefType。picker 只认 RC/HB/LN/SV/TB,SPECIAL 当 RC 处理(常见情况)
function toRefType(category: MapCategory): RefType {
  switch (category) {
    case 'RC': return 'RC'
    case 'HB': return 'HB'
    case 'LN': return 'LN'
    case 'SV': return 'SV'
    case 'TB': return 'TB'
    case 'SPECIAL': return 'RC'
  }
}

function labelToNumeric(label: string): number | null {
  const text = String(label || '').trim().toLowerCase()
  if (!text || /^(?:-|invalid|unknown|<)/i.test(text)) return null
  const gradeOffsets: Record<string, number> = {
    'mid/low': -0.2,
    'low/mid': -0.2,
    low: -0.4,
    'mid/high': 0.2,
    high: 0.4,
    mid: 0,
  }
  const grade = Object.entries(gradeOffsets).find(([name]) => text.endsWith(name))
  const offset = grade?.[1] || 0
  const numbered = text.match(/(?:reform|regular|ln)\s*(-?\d+(?:\.\d+)?)/i)
  if (numbered) return Number(numbered[1]) + offset
  const levels: Record<string, number> = {
    alpha: 11, beta: 12, gamma: 13, delta: 14, epsilon: 15,
    zeta: 16, eta: 17, theta: 18, iota: 19, kappa: 20,
    zenith: 10, stellium: 10,
  }
  const found = Object.entries(levels).find(([name]) => new RegExp(`\\b${name}\\b`, 'i').test(text))
  return found ? found[1] + offset : null
}

function EstimateHint({
  estimate,
  status,
  field,
  onApply,
  onEstimate,
  errorKey,
}: {
  estimate: ManiaAnalysisEstimate | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  field: 'rc' | 'ln'
  onApply: (value: number) => void
  onEstimate: () => void
  errorKey?: MessageKey
}) {
  const t = useT()
  if (status === 'idle') return (
    <button type="button" onClick={onEstimate} className="text-[10px] text-emerald-700 dark:text-emerald-300 hover:underline">
      {t('mapSlot.estimate.run')}
    </button>
  )
  if (status === 'loading') return <span className="text-[10px] text-gray-400 dark:text-neutral-500">{t('mapSlot.estimate.loading')}</span>
  if (status === 'error') return <button type="button" onClick={onEstimate} className="text-[10px] text-gray-400 dark:text-neutral-500 hover:underline" title={t(errorKey || 'mapSlot.estimate.unavailable')}>{t('mapSlot.estimate.unavailableShort')}</button>
  if (!estimate) return null
  const label = field === 'ln' ? estimate.lnLabel : estimate.rcLabel
  const parsed = field === 'ln' ? labelToNumeric(estimate.lnLabel) : (estimate.rcNumeric ?? labelToNumeric(estimate.rcLabel))
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 whitespace-nowrap" title={`${t(estimate.source === 'r2' ? 'mapSlot.estimate.uploadedSource' : 'mapSlot.estimate.onlineSource')} ${t('mapSlot.estimate.source')}`}>
      <span>{t('mapSlot.estimate.prefix')} {label}{parsed != null ? ` (${parsed.toFixed(2)})` : ''}</span>
      {parsed != null && (
        <button
          type="button"
          onClick={() => onApply(parsed)}
          className="px-1 py-0.5 border border-emerald-300 dark:border-emerald-700 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
        >
          {t('mapSlot.estimate.apply')}
        </button>
      )}
      <button type="button" onClick={onEstimate} className="hover:underline">{t('mapSlot.estimate.refresh')}</button>
    </span>
  )
}

export function MapSlotEditor({ map, onChange, onRemove, getMapHistory, enableEstimation = false, estimateSignal = 0, tournamentId, roundId }: Props) {
  const t = useT()
  const [showHistory, setShowHistory] = useState(false)
  const [estimate, setEstimate] = useState<ManiaAnalysisEstimate | null>(null)
  const [estimateStatus, setEstimateStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [estimateErrorKey, setEstimateErrorKey] = useState<MessageKey>()
  // 被拒绝的单图难度输入(超过上限)。保留原值是为了提示里能写清"你输入了多少"。
  const [rejectedDifficulty, setRejectedDifficulty] = useState<number | null>(null)
  const estimateGeneration = useRef(0)
  const canonicalRealType = normalizeRealType(map.realType)
  const dual = needsDualDifficulty(map.category)
  // 特殊槽位跨大类(列全部键型,含 PDEX);普通大类只看自己的列表。规则在 realTypeCatalog。
  const realTypeOptions = realTypeOptionsFor(map.category)

  const history = getMapHistory ? getMapHistory(map.beatmapId, map.beatmapsetId) : null

  const canEstimate = enableEstimation && (!!map.beatmapId || !!(tournamentId && roundId && map.slot)) && map.category !== 'SV'
  const hasEnteredDifficulty = map.category === 'HB' || map.category === 'TB' || map.category === 'SPECIAL'
    ? (map.difficulty || 0) > 0 || (map.difficultyLn || 0) > 0
    : (map.difficulty || 0) > 0
  const runEstimate = useCallback((retry = false) => {
    if (!canEstimate || estimateStatus === 'loading') return
    const generation = ++estimateGeneration.current
    setEstimateErrorKey(undefined)
    setEstimateStatus('loading')
    estimateBeatmapDifficulty({ beatmapId: map.beatmapId, tournamentId, roundId, slot: map.slot }, retry)
      .then((value) => {
        if (generation !== estimateGeneration.current) return
        setEstimate(value)
        setEstimateStatus('ready')
      })
      .catch((error) => {
        if (generation !== estimateGeneration.current) return
        setEstimate(null)
        const status = error instanceof ManiaAnalysisError ? error.status : 0
        setEstimateErrorKey(status === 401 ? 'mapSlot.estimate.sessionExpired'
          : status === 429 ? 'mapSlot.estimate.rateLimited'
            : status === 404 ? 'mapSlot.estimate.noFile'
              : status === 422 ? 'mapSlot.estimate.invalidUpload'
                : 'mapSlot.estimate.unavailable')
        setEstimateStatus('error')
      })
  }, [canEstimate, estimateStatus, map.beatmapId, map.slot, tournamentId, roundId])

  useEffect(() => {
    setEstimate(null)
    setEstimateStatus('idle')
    setEstimateErrorKey(undefined)
    // Late responses must not fill another slot after editing/removing a row.
    return () => { estimateGeneration.current++ }
  }, [map.beatmapId, map.category, map.slot, tournamentId, roundId])

  useEffect(() => {
    if (estimateSignal > 0) runEstimate(false)
    // Request state changes must not restart a batch signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateSignal])

  // Empty map difficulties are useful candidates for an automatic suggestion.
  // The estimator only fills the read-only hint; applying the value remains an
  // explicit user action, so an automatic request can never overwrite data.
  useEffect(() => {
    if (!canEstimate || hasEnteredDifficulty || estimateStatus !== 'idle') return
    const timer = window.setTimeout(() => runEstimate(false), 250)
    return () => window.clearTimeout(timer)
  }, [canEstimate, estimateStatus, hasEnteredDifficulty, map.beatmapId, runEstimate])

  // 检测类型冲突:大键型(type)或真实类型(realType)只要和历史不一致就提示。
  // 之前只在大键型不同才弹,导致同为 RC 但 realType 不同(如 Stream vs Jack)不提示。
  const exactHistory = history?.matchKind === 'bid'
  const rateSetConflict = history?.matchKind === 'set'
    && classifySetConflict([
      ...history.usages.map((usage) => ({
        beatmapId: usage.beatmapId || 0,
        beatmapsetId: usage.beatmapsetId,
        realType: usage.realType,
        name: usage.name,
      })),
      {
        beatmapId: map.beatmapId || 0,
        beatmapsetId: map.beatmapsetId,
        realType: canonicalRealType,
        name: map.name,
      },
    ]) === 'rateSet'
  const typeConflict = exactHistory && history &&
    history.totalUses > 0 &&
    map.type !== history.mostCommonType &&
    history.types.has(map.type) === false  // 当前 type 从未被用过
  const realTypeConflict = exactHistory && history &&
    history.totalUses > 0 &&
    !!canonicalRealType &&
    !!history.mostCommonRealType &&
    canonicalRealType !== history.mostCommonRealType &&
    history.realTypes.has(canonicalRealType) === false  // 当前 realType 从未被用过
  const hasTypeConflict = typeConflict || realTypeConflict || rateSetConflict

  const updateField = <K extends keyof ExtendedMap>(key: K, value: ExtendedMap[K]) => {
    onChange({ ...map, [key]: value })
  }

  // 单图难度输入:超过上限拒绝本次输入(不截断 —— 截断会把 190 这类明显笔误
  // 变成"看起来合理"的 25),超过警告线只提示、值照存。
  const setDifficultyField = (field: 'difficulty' | 'difficultyLn', raw: string) => {
    if (!shouldAcceptDifficultyInput(raw)) {
      setRejectedDifficulty(Number(raw))
      return
    }
    const value = Number(raw)
    setRejectedDifficulty(null)
    if (field === 'difficulty') updateField('difficulty', value)
    else updateField('difficultyLn', value || undefined)
  }

  // 本图的难度越界项。按当前 map 算而不是按输入事件算 —— 这样从导入的 JSON
  // 或自动计算带上来的越界值同样会被提示。键用界面上的标注('rf'/'ln')。
  const diffOutOfRange = collectOutOfRange({
    [getDiffLabel(map.category)]: map.difficulty,
    ...(dual ? { ln: map.difficultyLn } : {}),
  })
  const diffOver = diffOutOfRange.filter((item) => item.level === 'over')
  const diffWarn = diffOutOfRange.filter((item) => item.level === 'warn')

  // 清空本图难度框(HB/TB/SPECIAL 同时清 rf+ln 两框)。清空后该 type 若未 lock
  // 会自动回落到平均难度,方便"直接用平均"。
  const clearDifficulty = () => {
    onChange({ ...map, difficulty: 0, difficultyLn: dual ? undefined : map.difficultyLn })
  }
  const hasDiff = (map.difficulty || 0) > 0 || (dual && (map.difficultyLn || 0) > 0)

  const handleCategoryChange = (category: MapCategory) => {
    onChange({
      ...map,
      category,
      type: category === 'SPECIAL' ? map.type : category,
      // 改大类后默认回到该大类的 Pending 键型(以前是列表第一个:SS/HB1/RE/SV1,
      // 于是没手动改的图全被记成第一个键型 —— 站长反馈的误标来源)。
      realType: defaultRealTypeFor(category, map.realType),
      difficultyLn: needsDualDifficulty(category) ? (map.difficultyLn || undefined) : undefined,
    })
  }

  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${
      hasTypeConflict
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-700'
        : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-100 dark:border-neutral-800'
    }`}>
      <div
        className="category-swatch w-1.5 self-stretch rounded-full shrink-0"
        style={{ background: CATEGORY_COLORS[map.category] || '#9ca3af' }}
      />

      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {/* 历史提示横幅 */}
        {history && history.totalUses > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                hasTypeConflict
                  ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700'
                  : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
              }`}
              title={t('mapSlot.history.title')}
            >
              {hasTypeConflict ? '⚠️' : '📋'}
              <span>
                {history.matchKind === 'set'
                  ? t('mapSlot.history.relatedSet', { n: history.totalUses })
                  : t('mapSlot.history.used', { n: history.totalUses })}
              </span>
              <span className="text-[10px]">
                ({history.mostCommonType})
              </span>
              <span>{showHistory ? '▼' : '▶'}</span>
            </button>

            {hasTypeConflict && (
              <span className="text-yellow-700 dark:text-yellow-300 text-xs">
                {rateSetConflict
                  ? t('mapSlot.history.rateSetConflict', {
                      current: canonicalRealType,
                      suggested: history.mostCommonRealType,
                    })
                  : typeConflict
                  ? t('mapSlot.history.conflict', {
                      current: map.type,
                      suggested: history.mostCommonType,
                    })
                  : t('mapSlot.history.conflictRealType', {
                      current: canonicalRealType,
                      suggested: history.mostCommonRealType,
                    })}
              </span>
            )}
          </div>
        )}

        {/* 展开的历史记录 */}
        {showHistory && history && (
          <div className="border border-blue-200 dark:border-blue-800 rounded bg-white dark:bg-neutral-900 p-2 text-xs">
            <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">
              {t('mapSlot.history.previous')}:
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {history.usages.slice(0, 10).map((usage, i) => (
                <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-neutral-400">
                  <span className="font-mono text-[10px]">
                    {usage.tournamentAbbr} {usage.roundAbbr}
                  </span>
                  <span className="font-mono text-[10px]">{usage.slot}</span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    usage.type === map.type
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400'
                  }`}>
                    {usage.type} ({usage.realType})
                  </span>
                </div>
              ))}
              {history.usages.length > 10 && (
                <div className="text-gray-400 dark:text-neutral-500 text-[10px] italic">
                  {t('mapSlot.history.more', { n: history.usages.length - 10 })}
                </div>
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-blue-100 dark:border-blue-900">
              <div className="text-gray-500 dark:text-neutral-400 text-[10px]">
                {t('mapSlot.history.summary')}:
                {Array.from(history.types.entries()).map(([type, count]) => (
                  <span key={type} className="ml-2">
                    {type}×{count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={map.slot}
            onChange={(e) => updateField('slot', e.target.value)}
            className="w-14 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs font-mono text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
            title={t('mapSlot.slot.title')}
          />

          <select
            value={map.category}
            onChange={(e) => handleCategoryChange(e.target.value as MapCategory)}
            className="px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.labelKey ? t(c.labelKey) : c.label}</option>
            ))}
          </select>

          {map.category === 'SPECIAL' && (
            <input
              type="text"
              value={map.type}
              onChange={(e) => updateField('type', e.target.value.toUpperCase())}
              placeholder={t('mapSlot.special.placeholder')}
              className="w-16 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs font-mono text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
              title={t('mapSlot.special.title')}
            />
          )}

          {realTypeOptions.length > 0 && (
            <select
              value={canonicalRealType}
              onChange={(e) => updateField('realType', normalizeRealType(e.target.value))}
              className="px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs flex-1 min-w-0 bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
            >
              {/* 当前值不在列表里时,浏览器会**显示第一个选项**(看起来就像"默认是 SS")。
                  这里显式给出占位项,别让空值/自定义值假装成了某个具体键型。 */}
              {!canonicalRealType && <option value="">{t('mapSlot.realType.unset')}</option>}
              {canonicalRealType && !realTypeOptions.some((rt) => rt.id === canonicalRealType) && (
                <option value={canonicalRealType}>{`${canonicalRealType} (${t('mapSlot.realType.notListed')})`}</option>
              )}
              {realTypeOptions.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          )}

          {realTypeOptions.length === 0 && (
            <input
              type="text"
              value={canonicalRealType}
              onChange={(e) => updateField('realType', e.target.value)}
              placeholder={t('mapSlot.realType.custom')}
              className="px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs flex-1 min-w-0 bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <input
              type="number"
              step="any"
              min="0"
              max={DIFFICULTY_MAX}
              value={map.difficulty || ''}
              onChange={(e) => setDifficultyField('difficulty', e.target.value)}
              placeholder={getDiffLabel(map.category)}
              className="w-16 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
            />
            <span className="text-xs text-gray-400 dark:text-neutral-500">{getDiffLabel(map.category)}</span>
            <DifficultyRefPicker
              value={map.difficulty || 0}
              onChange={(n) => updateField('difficulty', n)}
              type={toRefType(map.category)}
              field={map.category === 'LN' ? 'ln' : 'rf'}
            />
            {canEstimate && (
              <EstimateHint
                estimate={estimate}
                status={estimateStatus}
                errorKey={estimateErrorKey}
                field={map.category === 'LN' ? 'ln' : 'rc'}
                onApply={(value) => updateField('difficulty', value)}
                onEstimate={() => runEstimate(true)}
              />
            )}
          </div>

          {dual && (
            <div className="flex flex-wrap items-center gap-1">
              <input
                type="number"
                step="any"
                min="0"
                max={DIFFICULTY_MAX}
                value={map.difficultyLn || ''}
                onChange={(e) => setDifficultyField('difficultyLn', e.target.value)}
                placeholder="ln"
                className="w-16 px-1.5 py-1 border border-gray-200 dark:border-neutral-700 rounded text-xs text-center bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
              />
              <span className="text-xs text-gray-400 dark:text-neutral-500">ln</span>
              <DifficultyRefPicker
                value={map.difficultyLn || 0}
                onChange={(n) => updateField('difficultyLn', n || undefined)}
                type={toRefType(map.category)}
                field="ln"
              />
              {canEstimate && (
                <EstimateHint
                  estimate={estimate}
                  status={estimateStatus}
                  errorKey={estimateErrorKey}
                  field="ln"
                  onApply={(value) => updateField('difficultyLn', value)}
                  onEstimate={() => runEstimate(true)}
                />
              )}
            </div>
          )}

          {/* 不参与难度统计:勾上后这张图的难度不进"本轮/该键型"的平均值,也从 ladder 框高里排除。 */}
          <label
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400 cursor-pointer select-none"
            title={t('map.exclude.tip')}
          >
            <input
              type="checkbox"
              checked={map.excludeFromDifficulty === true}
              onChange={(e) => onChange({ ...map, excludeFromDifficulty: e.target.checked ? true : undefined })}
              className="accent-purple-500"
            />
            {t('map.exclude.label')}
          </label>

          {rejectedDifficulty !== null && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('diff.limit.rejected', { max: DIFFICULTY_MAX, value: formatDifficulty(rejectedDifficulty) })}
            </p>
          )}
          {diffOver.length > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('diff.limit.overFields', { max: DIFFICULTY_MAX, fields: formatOutOfRange(diffOver) })}
            </p>
          )}
          {diffWarn.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('slot.diff.warn', { warn: DIFFICULTY_WARN_ABOVE, fields: formatOutOfRange(diffWarn) })}
            </p>
          )}

          {hasDiff && (
            <button
              type="button"
              onClick={clearDifficulty}
              title={t('mapSlot.clearDiff')}
              className="px-1.5 py-1 text-[10px] border border-gray-200 dark:border-neutral-700 rounded text-gray-400 dark:text-neutral-500 hover:text-red-500 hover:border-red-300 dark:hover:border-red-800"
            >
              {t('mapSlot.clearDiff.short')}
            </button>
          )}

          <ManiaChartButton
            target={{ beatmapId: map.beatmapId, tournamentId, roundId, slot: map.slot }}
            heading={`${map.slot}${map.name ? ` · ${map.name}` : ''}`}
            className="px-1.5 py-1 text-[10px] border border-purple-200 dark:border-purple-900 rounded text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30"
          />
        </div>
      </div>

      <button
        onClick={onRemove}
        className="text-gray-300 dark:text-neutral-600 hover:text-red-500 shrink-0 mt-1"
        title={t('mapSlot.remove')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
