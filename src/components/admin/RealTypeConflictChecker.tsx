'use client'

import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/lib/i18n'
import { tournaments as allTournaments } from '@/generated/tournaments'
import type { Tournament } from '@/lib/types'

// 一处 beatmapId 的具体用法（用于展示 + 定位改哪个文件）
interface Usage {
  tournamentId: string
  tournamentAbbr: string
  roundId: string
  roundAbbr: string
  slot: string
  realType: string
  name?: string
}

// 一组冲突：同一 beatmapId 但 realType 不一致
interface Conflict {
  beatmapId: number
  name: string
  realTypes: string[] // 去重后的所有 realType
  mostCommon: string
  usages: Usage[]
}

// 遍历 bundle 数据，找出同一 beatmapId 下 realType 不一致的组。
function findConflicts(tournaments: Tournament[]): Conflict[] {
  const index = new Map<number, Usage[]>()
  for (const t of tournaments) {
    if (!t?.rounds) continue
    for (const r of t.rounds) {
      if (!r?.maps) continue
      for (const m of r.maps) {
        if (!m.beatmapId) continue
        if (!index.has(m.beatmapId)) index.set(m.beatmapId, [])
        index.get(m.beatmapId)!.push({
          tournamentId: t.id,
          tournamentAbbr: t.abbreviation || t.id,
          roundId: r.id,
          roundAbbr: r.abbreviation || r.name || r.id,
          slot: m.slot,
          realType: m.realType,
          name: m.name,
        })
      }
    }
  }

  const conflicts: Conflict[] = []
  for (const [beatmapId, usages] of index) {
    if (usages.length < 2) continue
    const counts = new Map<string, number>()
    for (const u of usages) counts.set(u.realType, (counts.get(u.realType) || 0) + 1)
    if (counts.size < 2) continue // 全一致，非冲突

    let mostCommon = ''
    let max = 0
    for (const [rt, c] of counts) {
      if (c > max) {
        max = c
        mostCommon = rt
      }
    }
    conflicts.push({
      beatmapId,
      name: usages.find((u) => u.name)?.name || String(beatmapId),
      realTypes: Array.from(counts.keys()),
      mostCommon,
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

  // beatmapId -> 用户选定的统一目标 realType（默认多数派）
  const [choices, setChoices] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const c of conflicts) init[c.beatmapId] = c.mostCommon
    return init
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 有多少组被用户实际选择了（与 mostCommon 无关，只要有目标就算待应用）
  const pendingCount = useMemo(() => {
    let n = 0
    for (const c of conflicts) {
      // 若该组内已有 usage 的 realType 不等于选定目标，就需要改
      if (c.usages.some((u) => u.realType !== choices[c.beatmapId])) n++
    }
    return n
  }, [conflicts, choices])

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

    for (const c of conflicts) {
      const target = choices[c.beatmapId]
      for (const u of c.usages) {
        if (u.realType === target) continue
        const draft = getDraft(u.tournamentId)
        if (!draft) continue
        const round = draft.rounds.find((r) => r.id === u.roundId)
        const map = round?.maps.find((m) => m.slot === u.slot && m.beatmapId === c.beatmapId)
        if (map) map.realType = target
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
  }, [conflicts, choices, pendingCount, t])

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('rtConflict.title')}</h3>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{t('rtConflict.subtitle')}</p>
        </div>
        {canSave && conflicts.length > 0 && (
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

      {conflicts.length === 0 && (
        <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('rtConflict.none')}</div>
      )}

      {conflicts.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {conflicts.map((c) => (
            <div key={c.beatmapId} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <a
                    href={`https://osu.ppy.sh/b/${c.beatmapId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-purple-600 dark:text-purple-300 hover:underline font-mono truncate"
                  >
                    {c.name}
                  </a>
                  <div className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                    {t('rtConflict.conflictTypes', { types: c.realTypes.join(' / ') })}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400 shrink-0">
                  {t('rtConflict.unifyTo')}
                  <select
                    value={choices[c.beatmapId]}
                    onChange={(e) => setChoices((prev) => ({ ...prev, [c.beatmapId]: e.target.value }))}
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
              </div>
              <div className="mt-2 pl-2 border-l-2 border-gray-100 dark:border-neutral-800 space-y-0.5">
                {c.usages.map((u, i) => (
                  <div key={i} className="text-xs text-gray-500 dark:text-neutral-400 flex items-center gap-2">
                    <span
                      className={`font-mono px-1.5 py-0.5 rounded ${u.realType === choices[c.beatmapId] ? 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'}`}
                    >
                      {u.realType}
                    </span>
                    <span className="truncate">{u.tournamentAbbr} · {u.roundAbbr} · {u.slot}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
