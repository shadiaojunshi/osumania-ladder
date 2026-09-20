'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments as allTournaments } from '@/generated/tournaments'
import type { Tournament } from '@/lib/types'
import { classifySetConflict, extractRate, extractVersionName } from '@/lib/mapConflictDetection'
import { isUsableBeatmapId } from '@/lib/beatmapIds'
import { findPendingMaps } from '@/lib/tournamentDiagnostics'
import { normalizeRealType } from '@/lib/realType'

// 一处谱面用法（用于展示 + 定位改哪个文件）
interface Usage {
  tournamentId: string
  tournamentAbbr: string
  roundId: string
  roundIndex: number
  roundAbbr: string
  slot: string
  realType: string
  name?: string
  beatmapId: number
  beatmapsetId?: number
  rate?: number // 仅倍速冲突用于展示
  /**
   * 版本名（osu! 的 difficulty name），从 `name` 的末尾方括号取。
   *
   * 用途：同 set 那几行光看槽位（`RC7` / `RC6`）分不清「同 set 里两张不同的谱面」和
   * 「同一张谱的倍速版本」—— 把版本名并排显示出来就一眼能看出来。
   * 历史手传的数据里 `name` 可能就是槽位记号，那种取不到（为 null）。
   */
  versionName?: string | null
}

type ConflictKind = 'bid' | 'rateSet' | 'setReview'

// 一组冲突：同一 beatmapId(bid) 或同一 beatmapset 内倍速变体(rateSet)的 realType 不一致
interface Conflict {
  key: string // 'b:<beatmapId>' | 's:<beatmapsetId>'
  kind: ConflictKind
  linkId: number // 外链用：bid→beatmapId, rateSet→beatmapsetId
  name: string
  realTypes: string[]
  mostCommon: string
  usages: Usage[]
}

// 勾选与目标选择存本地:站长常常分几次改,刷新后不该丢。
// 只存"选择",不存任何比赛数据;键里带版本号,以后结构变了直接换键。
const SELECTION_STORAGE_KEY = 'osumania-ladder:realtime-conflict-selection:v1'

interface StoredSelection {
  choices: Record<string, string>
  selected: Record<string, boolean>
}

function readStoredSelection(): Partial<StoredSelection> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSelection>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeStoredSelection(value: StoredSelection): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 存储被禁用/超限时静默失败:这只影响"下次还记得选择",不影响保存流程。
  }
}

function majority(realTypes: string[]): string {
  const counts = new Map<string, number>()
  for (const rt of realTypes) counts.set(rt, (counts.get(rt) || 0) + 1)
  let best = ''
  let max = 0
  for (const [rt, c] of counts) if (c > max) { max = c; best = rt }
  return best
}

// 同一比赛里两个 round 用了同一个 id。R2 的 key 是 maps/{tid}/{rid}/{slot}.osz,
// round id 重复 = 上传互相覆盖 + 补丁按 roundId 定位写串(SSR 的 SF/F 事故根源)。
export function findDuplicateRoundIds(tournaments: Tournament[]): { tournamentId: string; tournamentAbbr: string; roundId: string; rounds: string[] }[] {
  const result: { tournamentId: string; tournamentAbbr: string; roundId: string; rounds: string[] }[] = []
  for (const tournament of tournaments) {
    const byId = new Map<string, string[]>()
    for (const round of tournament.rounds || []) {
      if (!byId.has(round.id)) byId.set(round.id, [])
      byId.get(round.id)!.push(round.abbreviation || round.name || round.id)
    }
    for (const [roundId, abbrs] of byId) {
      if (abbrs.length < 2) continue
      result.push({
        tournamentId: tournament.id,
        tournamentAbbr: tournament.abbreviation || tournament.id,
        roundId,
        rounds: abbrs,
      })
    }
  }
  return result
}

// 遍历 bundle 数据，找出同 BID 冲突、可识别的倍速 set 冲突，以及只供人工核对的同 set 差异。
function findConflicts(tournaments: Tournament[]): Conflict[] {
  const byBid = new Map<number, Usage[]>()
  const bySet = new Map<number, Usage[]>()
  for (const t of tournaments) {
    if (!t?.rounds) continue
    for (const [roundIndex, r] of t.rounds.entries()) {
      if (!r?.maps) continue
      for (const m of r.maps) {
        const usage: Usage = {
          tournamentId: t.id,
          tournamentAbbr: t.abbreviation || t.id,
          roundId: r.id,
          roundIndex,
          roundAbbr: r.abbreviation || r.name || r.id,
          slot: m.slot,
          realType: normalizeRealType(m.realType),
          name: m.name,
          beatmapId: m.beatmapId || 0,
          beatmapsetId: m.beatmapsetId,
          rate: extractRate(m.name),
          versionName: extractVersionName(m.name),
        }
        // 占位 ID（0/1/负数）不参与分组：它们不是真实 ID，混进来会把无关谱面粘成
        // 一组"同 set/BID 冲突"（MKTC 2025 的 36 张就是 `BeatmapSetID:1`）。
        if (isUsableBeatmapId(m.beatmapId)) {
          if (!byBid.has(m.beatmapId)) byBid.set(m.beatmapId, [])
          byBid.get(m.beatmapId)!.push(usage)
        }
        if (isUsableBeatmapId(m.beatmapsetId)) {
          if (!bySet.has(m.beatmapsetId)) bySet.set(m.beatmapsetId, [])
          bySet.get(m.beatmapsetId)!.push(usage)
        }
      }
    }
  }

  const conflicts: Conflict[] = []

  // 1) 同一 beatmapId 的 realType 不一致
  for (const [beatmapId, usages] of byBid) {
    if (usages.length < 2) continue
    const rts = usages.map((u) => u.realType)
    if (new Set(rts).size < 2) continue
    conflicts.push({
      key: `b:${beatmapId}`,
      kind: 'bid',
      linkId: beatmapId,
      name: usages.find((u) => u.name)?.name || String(beatmapId),
      realTypes: Array.from(new Set(rts)),
      mostCommon: majority(rts),
      usages,
    })
  }

  // 2) 同一 beatmapset 的 realType 不一致。能识别倍率的允许人工选择统一；
  // 无法确认倍率关系的普通多难度只列为待核对，绝不进入批量保存。
  const bidConflictIds = new Set(conflicts.map((c) => c.linkId))
  for (const [beatmapsetId, usages] of bySet) {
    const kind = classifySetConflict(usages)
    if (!kind) continue
    const rts = usages.map((u) => u.realType)
    // 该 set 若只含单个 beatmapId 且已被 bid 冲突覆盖，则不重复报
    const distinctBids = new Set(usages.map((u) => u.beatmapId))
    if (distinctBids.size === 1 && bidConflictIds.has([...distinctBids][0])) continue
    conflicts.push({
      key: `s:${beatmapsetId}`,
      kind,
      linkId: beatmapsetId,
      name: usages.find((u) => u.name)?.name || String(beatmapsetId),
      realTypes: Array.from(new Set(rts)),
      mostCommon: majority(rts),
      usages,
    })
  }

  // 冲突多的排前面
  conflicts.sort((a, b) => b.usages.length - a.usages.length)
  return conflicts
}

export function RealTypeConflictChecker({ canSave }: { canSave: boolean }) {
  const t = useT()
  const conflicts = useMemo(() => findConflicts(allTournaments), [])
  const pendingMaps = useMemo(() => findPendingMaps(allTournaments), [])
  const duplicateRoundIds = useMemo(() => findDuplicateRoundIds(allTournaments), [])
  const saveableConflicts = useMemo(
    () => conflicts.filter((conflict) => conflict.kind !== 'setReview'),
    [conflicts],
  )

  // conflict.key -> 用户选定的统一目标 realType（默认多数派）
  const [choices, setChoices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of saveableConflicts) init[c.key] = c.mostCommon
    const stored = readStoredSelection()
    // 存过的选择优先(站长常常分几次改,选项别丢);没存过的仍按多数派预选。
    for (const c of saveableConflicts) if (stored?.choices?.[c.key]) init[c.key] = stored.choices[c.key]
    return init
  })

  // conflict.key -> 本次是否要改。**默认全不勾**:只有勾了的组才会被写回(站长要求)。
  const [selected, setSelected] = useState<Record<string, boolean>>(() => readStoredSelection()?.selected ?? {})

  // 拖拽框选:在勾选框上按下(用按下那一格的反向状态作为"刷子"),纵向拖过若干行就整段刷成
  // 同一个状态 —— 往上拖可以取消一整段。鼠标松开(含在列表外松开)结束。
  const dragRef = useRef<{ anchor: number; value: boolean } | null>(null)
  const selectableKeys = useMemo(
    () => conflicts.filter((c) => c.kind !== 'setReview').map((c) => c.key),
    [conflicts],
  )

  useEffect(() => {
    const stopDrag = () => { dragRef.current = null }
    window.addEventListener('mouseup', stopDrag)
    return () => window.removeEventListener('mouseup', stopDrag)
  }, [])

  const applyRange = (fromIndex: number, toIndex: number, value: boolean) => {
    const from = Math.min(fromIndex, toIndex)
    const to = Math.max(fromIndex, toIndex)
    setSelected((prev) => {
      const next = { ...prev }
      for (const key of selectableKeys.slice(from, to + 1)) next[key] = value
      return next
    })
  }

  const beginDragSelect = (key: string, checked: boolean, disabled: boolean) => {
    if (disabled) return
    const index = selectableKeys.indexOf(key)
    if (index < 0) return
    const value = !checked
    dragRef.current = { anchor: index, value }
    setSelected((prev) => ({ ...prev, [key]: value }))
  }

  const extendDragSelect = (key: string) => {
    const drag = dragRef.current
    if (!drag) return
    const index = selectableKeys.indexOf(key)
    if (index < 0) return
    applyRange(drag.anchor, index, drag.value)
  }

  useEffect(() => {
    writeStoredSelection({ choices, selected })
  }, [choices, selected])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 有差异的组(选了目标、且组里确实有不一致的用法)——这才有可改的东西
  const pendingConflicts = useMemo(
    () => saveableConflicts.filter((c) => c.usages.some((u) => u.realType !== choices[c.key])),
    [saveableConflicts, choices],
  )
  // 真正会被写回的:既勾了、又有差异。
  const selectedConflicts = useMemo(
    () => pendingConflicts.filter((c) => selected[c.key] === true),
    [pendingConflicts, selected],
  )
  const pendingCount = pendingConflicts.length

  const handleSave = useCallback(async () => {
    // 先按比赛聚合"要改哪些位置 + 改成什么"
    const wanted = new Map<string, { usage: Usage; target: string }[]>()
    // 只处理勾选了的组:没勾的保持原样(用户还没想好该改成什么)。
    for (const c of selectedConflicts) {
      const target = choices[c.key]
      for (const u of c.usages) {
        if (u.realType === target) continue
        const list = wanted.get(u.tournamentId) || []
        list.push({ usage: u, target: normalizeRealType(target) })
        wanted.set(u.tournamentId, list)
      }
    }

    if (wanted.size === 0) {
      setStatus({ type: 'error', message: t('rtConflict.nothingSelected') })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      // 逐场读取**权威版本 + 当前 blob sha** 作为编辑基准，再在上面打补丁。
      // 不能用构建时的数据包当基准：那是旧数据，会整体覆盖别人已保存的改动。
      const items: { id: string; tournament: Tournament; baseSha: string }[] = []
      for (const [tid, edits] of wanted) {
        const res = await fetch(`/api/tournaments/${tid}`)
        if (!res.ok) throw new Error(t('rtConflict.loadFailed', { id: tid }))
        const loaded = (await res.json()) as { tournament?: Tournament; sha?: string }
        if (!loaded.tournament || typeof loaded.sha !== 'string' || loaded.sha === '') {
          throw new Error(t('rtConflict.loadFailed', { id: tid }))
        }
        const draft = JSON.parse(JSON.stringify(loaded.tournament)) as Tournament
        for (const { usage: u, target } of edits) {
          // IDs are normally unique, but older data can contain duplicate IDs
          // (for example SSR SF/F both use round-8). Preserve the source index
          // so a conflict from the later round cannot be written into the first.
          const indexedRound = draft.rounds[u.roundIndex]
          const round = indexedRound?.id === u.roundId
            ? indexedRound
            : draft.rounds.find((r) => r.id === u.roundId)
          // 用 slot + 各 usage 自己的 beatmapId 定位（倍速变体每张 bid 不同）
          const map = round?.maps.find(
            (m) => m.slot === u.slot && (u.beatmapId ? m.beatmapId === u.beatmapId : m.name === u.name)
          )
          if (map) map.realType = target
        }
        items.push({ id: tid, tournament: draft, baseSha: loaded.sha })
      }

      const res = await fetch('/api/tournaments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          summary: `Unify realType across ${items.length} tournaments (${pendingCount} maps)`,
        }),
      })
      const dataRes = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        conflicts?: { id: string }[]
      }
      if (res.status === 409) {
        const ids = (dataRes.conflicts ?? []).map((c) => c.id).join(', ')
        throw new Error(t('rtConflict.editConflict', { ids: ids || '?' }))
      }
      if (!res.ok) throw new Error(dataRes.error || t('rtConflict.saveFailed'))
      setStatus({ type: 'success', message: t('rtConflict.saved', { n: String(items.length) }) })
      // 写过的组取消勾选:列表要等站点重建才会刷新,别让它们下次又被写一遍。
      setSelected((prev) => {
        const next = { ...prev }
        for (const c of selectedConflicts) delete next[c.key]
        return next
      })
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }, [selectedConflicts, choices, pendingCount, t])

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('rtConflict.title')}</h3>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{t('rtConflict.subtitle')}</p>
        </div>
        {canSave && saveableConflicts.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving || selectedConflicts.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 shrink-0"
          >
            {saving
              ? t('rtConflict.saving')
              : t('rtConflict.saveAndRebuild', { n: `${selectedConflicts.length} / ${pendingCount}` })}
          </button>
        )}
      </div>

      {status && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-200'}`}>
          {status.message}
        </div>
      )}

      {duplicateRoundIds.length > 0 && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800">
          <div className="font-medium mb-1">{t('rtConflict.dupRoundTitle', { n: duplicateRoundIds.length })}</div>
          {duplicateRoundIds.map((d) => (
            <div key={`${d.tournamentId}:${d.roundId}`} className="font-mono mt-0.5">
              {d.tournamentAbbr} · id={d.roundId} · {d.rounds.join(' + ')}
            </div>
          ))}
        </div>
      )}

      {conflicts.length === 0 && (
        <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('rtConflict.none')}</div>
      )}

      {canSave && pendingCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-3 flex-wrap rounded border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/20 px-3 py-2">
          <span className="text-xs text-purple-800 dark:text-purple-200">
            {t('rtConflict.select.selectedCount', { n: `${selectedConflicts.length} / ${pendingCount}` })}
          </span>
          <span className="text-xs text-purple-700/80 dark:text-purple-300/80">{t('rtConflict.select.dragHint')}</span>
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const c of pendingConflicts) next[c.key] = true
              setSelected(next)
            }}
            className="text-xs text-purple-700 dark:text-purple-300 underline"
          >
            {t('rtConflict.select.all')}
          </button>
          <button
            type="button"
            onClick={() => setSelected({})}
            className="text-xs text-purple-700 dark:text-purple-300 underline"
          >
            {t('rtConflict.select.clear')}
          </button>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {conflicts.map((c) => (
            <div key={c.key} className="px-4 py-3" onMouseEnter={() => extendDragSelect(c.key)}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {c.kind !== 'setReview' && (
                      <input
                        type="checkbox"
                        readOnly
                        checked={selected[c.key] === true}
                        disabled={!c.usages.some((u) => u.realType !== choices[c.key])}
                        onMouseDown={(e) => {
                          // 挡住原生切换:状态由 beginDragSelect 自己改,保证一次只切一次。
                          e.preventDefault()
                          beginDragSelect(c.key, selected[c.key] === true, !c.usages.some((u) => u.realType !== choices[c.key]))
                        }}
                        onKeyDown={(e) => {
                          // 键盘也能单独勾:空格/回车切换这一行(拖拽只解决批量)。
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault()
                            setSelected((prev) => ({ ...prev, [c.key]: !prev[c.key] }))
                          }
                        }}
                        title={t('rtConflict.select.tip')}
                        className="accent-purple-600 shrink-0 disabled:opacity-30 cursor-pointer"
                      />
                    )}
                    {c.kind === 'rateSet' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 shrink-0">
                        {t('rtConflict.rateBadge')}
                      </span>
                    )}
                    {c.kind === 'setReview' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200 shrink-0">
                        {t('rtConflict.reviewBadge')}
                      </span>
                    )}
                    <a
                      href={c.kind === 'bid' ? `https://osu.ppy.sh/b/${c.linkId}` : `https://osu.ppy.sh/s/${c.linkId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-purple-600 dark:text-purple-300 hover:underline font-mono truncate"
                    >
                      {c.name}
                    </a>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                    {t('rtConflict.conflictTypes', { types: c.realTypes.join(' / ') })}
                  </div>
                </div>
                {c.kind === 'setReview' ? (
                  <span className="max-w-sm text-xs text-amber-700 dark:text-amber-300">
                    {t('rtConflict.reviewHint')}
                  </span>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400 shrink-0">
                    {t('rtConflict.unifyTo')}
                    <select
                      value={choices[c.key]}
                      onChange={(e) => setChoices((prev) => ({ ...prev, [c.key]: e.target.value }))}
                      className="px-2 py-1 rounded border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200"
                    >
                      {c.realTypes.map((rt) => (
                        <option key={rt} value={rt}>
                          {rt}
                          {rt === c.mostCommon ? ` (${t('rtConflict.majority')})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="mt-2 pl-2 border-l-2 border-gray-100 dark:border-neutral-800 space-y-0.5">
                {c.usages.map((u, i) => (
                  <div key={i} className="text-xs text-gray-500 dark:text-neutral-400 flex items-center gap-2">
                    <span
                      className={`font-mono px-1.5 py-0.5 rounded ${c.kind === 'setReview' || u.realType === choices[c.key] ? 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'}`}
                    >
                      {u.realType}
                    </span>
                    {c.kind === 'rateSet' && (
                      <span className="tabular-nums text-gray-400 dark:text-neutral-500 shrink-0">{(u.rate ?? 1)}x</span>
                    )}
                    <span className="truncate">{u.tournamentAbbr} · {u.roundAbbr} · {u.slot}</span>
                    {/* 倍速冲突那行已经用 `1.05x` 表达了版本差异，这里就不重复。 */}
                    {c.kind !== 'rateSet' && u.versionName && (
                      <span
                        className="shrink-0 text-purple-600 dark:text-purple-300"
                        title={u.name}
                      >
                        · {u.versionName}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-neutral-800">
        <div className="px-4 py-3 bg-gray-50 dark:bg-neutral-900/50">
          <h4 className="text-sm font-medium text-gray-900 dark:text-neutral-100">
            {t('rtConflict.pendingTitle', { n: String(pendingMaps.length) })}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
            {t('rtConflict.pendingHint')}
          </p>
        </div>
        {pendingMaps.length === 0 ? (
          <div className="px-4 py-5 text-center text-sm text-gray-400 dark:text-neutral-500">
            {t('rtConflict.pendingNone')}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-neutral-800">
            {pendingMaps.map((map, index) => (
              <div key={`${map.tournamentId}:${map.roundId}:${map.slot}:${index}`} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <span className="w-12 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-center font-mono text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  {map.realType}
                </span>
                {/* 以前这里接的是完整曲名，被 `truncate` 截掉后恰好看不到**末尾的版本名** ——
                    而那正是用来分辨「同 set 不同谱面」与「同一谱的倍速」的东西。
                    现在版本名单独摆出来，完整曲名放 title。 */}
                <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-neutral-300" title={map.name || undefined}>
                  {map.tournamentAbbr} · {map.roundAbbr} · {map.slot}
                  {map.versionName ? (
                    <span className="text-purple-600 dark:text-purple-300"> · {map.versionName}</span>
                  ) : map.name && map.name !== map.slot ? (
                    ` · ${map.name}`
                  ) : (
                    ''
                  )}
                </span>
                {map.beatmapId && (
                  <a
                    href={`https://osu.ppy.sh/b/${map.beatmapId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-purple-600 hover:underline dark:text-purple-300"
                  >
                    BID {map.beatmapId}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
