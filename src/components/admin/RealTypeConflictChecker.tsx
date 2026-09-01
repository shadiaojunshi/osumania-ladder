'use client'

import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments as allTournaments } from '@/generated/tournaments'
import type { Tournament } from '@/lib/types'
import { classifySetConflict, extractRate } from '@/lib/mapConflictDetection'
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
        }
        if (m.beatmapId) {
          if (!byBid.has(m.beatmapId)) byBid.set(m.beatmapId, [])
          byBid.get(m.beatmapId)!.push(usage)
        }
        if (m.beatmapsetId) {
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
    return init
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 有多少组被用户实际选择了（与 mostCommon 无关，只要有目标就算待应用）
  const pendingCount = useMemo(() => {
    let n = 0
    for (const c of saveableConflicts) {
      // 若该组内已有 usage 的 realType 不等于选定目标，就需要改
      if (c.usages.some((u) => u.realType !== choices[c.key])) n++
    }
    return n
  }, [saveableConflicts, choices])

  const handleSave = useCallback(async () => {
    // 按 tournamentId 聚合出要写回的完整 JSON（深拷贝 bundle 数据后改 realType）
    const affected = new Map<string, Tournament>()
    const getDraft = (tid: string): Tournament | null => {
      if (affected.has(tid)) return affected.get(tid)!
      const src = allTournaments.find((x) => x.id === tid)
      if (!src) return null
      const draft = JSON.parse(JSON.stringify(src)) as Tournament
      affected.set(tid, draft)
      return draft
    }

    for (const c of saveableConflicts) {
      const target = choices[c.key]
      for (const u of c.usages) {
        if (u.realType === target) continue
        const draft = getDraft(u.tournamentId)
        if (!draft) continue
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
        if (map) map.realType = normalizeRealType(target)
      }
    }

    if (affected.size === 0) {
      setStatus({ type: 'error', message: t('rtConflict.nothingToSave') })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      const changes: Record<string, Tournament> = {}
      for (const [tid, draft] of affected) changes[tid] = draft
      const res = await fetch('/api/tournaments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes,
          summary: `Unify realType across ${affected.size} tournaments (${pendingCount} maps)`,
        }),
      })
      const dataRes = await res.json()
      if (!res.ok) throw new Error(dataRes.error || t('rtConflict.saveFailed'))
      setStatus({ type: 'success', message: t('rtConflict.saved', { n: String(affected.size) }) })
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }, [saveableConflicts, choices, pendingCount, t])

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
            disabled={saving || pendingCount === 0}
            className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 shrink-0"
          >
            {saving ? t('rtConflict.saving') : t('rtConflict.saveAndRebuild', { n: String(pendingCount) })}
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

      {conflicts.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {conflicts.map((c) => (
            <div key={c.key} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
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
                <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-neutral-300">
                  {map.tournamentAbbr} · {map.roundAbbr} · {map.slot}
                  {map.name ? ` · ${map.name}` : ''}
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
