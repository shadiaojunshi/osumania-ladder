import { useMemo } from 'react'
import type { Tournament } from '@/lib/types'
import { normalizeRealType } from '@/lib/realType'
import { isUsableBeatmapId } from '@/lib/beatmapIds'

export interface MapUsage {
  tournamentId: string
  tournamentName: string
  tournamentAbbr: string
  roundId: string
  roundName: string
  roundAbbr: string
  slot: string
  type: string
  realType: string
  difficulty: number
  beatmapId?: number
  beatmapsetId?: number
  name?: string
}

export interface MapHistorySummary {
  matchKind: 'bid' | 'set'
  totalUses: number
  tournaments: string[]
  types: Map<string, number>  // type(大键型) -> 使用次数
  mostCommonType: string
  realTypes: Map<string, number>  // realType(真实类型) -> 使用次数
  mostCommonRealType: string
  usages: MapUsage[]
}

/**
 * 同时索引具体 BID 与 set。查询时优先返回同 BID 的精确历史；只有没有精确历史时，
 * 才返回同 set 的相关版本，供倍速版本和 set 更新后的人工核对使用。
 */
export function useMapHistory(tournaments: Tournament[], excludeTournamentId?: string) {
  const historyIndexes = useMemo(() => {
    const byBid = new Map<number, MapUsage[]>()
    const bySet = new Map<number, MapUsage[]>()

    for (const tournament of tournaments) {
      if (tournament.id === excludeTournamentId) continue
      // 防御：清单式响应（{id, sha}[]）没有 rounds，直接跳过而不是崩掉整个树
      if (!tournament?.rounds) continue
      for (const round of tournament.rounds) {
        if (!round?.maps) continue
        for (const map of round.maps) {
          const usage: MapUsage = {
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            tournamentAbbr: tournament.abbreviation,
            roundId: round.id,
            roundName: round.name,
            roundAbbr: round.abbreviation,
            slot: map.slot,
            type: map.type,
            realType: normalizeRealType(map.realType),
            difficulty: map.difficulty,
            beatmapId: map.beatmapId,
            beatmapsetId: map.beatmapsetId,
            name: map.name,
          }
          // 占位 ID（0/1/负数）不进索引：`BeatmapSetID:1` 会把 36 首无关的歌
          // 粘成"同一个 set"（MKTC 2025），于是每个槽位的"同 set 相关版本"
          // 与"同 set 共识"都是被污染的假信号。见 lib/beatmapIds.ts。
          if (isUsableBeatmapId(map.beatmapId)) {
            if (!byBid.has(map.beatmapId)) byBid.set(map.beatmapId, [])
            byBid.get(map.beatmapId)!.push(usage)
          }
          if (isUsableBeatmapId(map.beatmapsetId)) {
            if (!bySet.has(map.beatmapsetId)) bySet.set(map.beatmapsetId, [])
            bySet.get(map.beatmapsetId)!.push(usage)
          }
        }
      }
    }

    return { byBid, bySet }
  }, [tournaments, excludeTournamentId])

  /** 查询指定 BID；没有精确记录时回退到同 set 版本。 */
  const getMapHistory = (
    beatmapId: number | undefined,
    beatmapsetId: number | undefined,
  ): MapHistorySummary | null => {
    const bidUsages = beatmapId ? historyIndexes.byBid.get(beatmapId) : undefined
    const matchKind: 'bid' | 'set' = bidUsages?.length ? 'bid' : 'set'
    const usages = bidUsages?.length
      ? bidUsages
      : beatmapsetId
        ? historyIndexes.bySet.get(beatmapsetId)
        : undefined
    if (!usages || usages.length === 0) return null

    // 统计每个 type / realType 的使用次数
    const typeCounts = new Map<string, number>()
    const realTypeCounts = new Map<string, number>()
    const tournaments = new Set<string>()

    for (const usage of usages) {
      typeCounts.set(usage.type, (typeCounts.get(usage.type) || 0) + 1)
      if (usage.realType) {
        realTypeCounts.set(usage.realType, (realTypeCounts.get(usage.realType) || 0) + 1)
      }
      tournaments.add(usage.tournamentAbbr)
    }

    // 找出最常用的 type
    let mostCommonType = ''
    let maxCount = 0
    for (const [type, count] of typeCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        mostCommonType = type
      }
    }

    // 找出最常用的 realType
    let mostCommonRealType = ''
    let maxRealCount = 0
    for (const [rt, count] of realTypeCounts.entries()) {
      if (count > maxRealCount) {
        maxRealCount = count
        mostCommonRealType = rt
      }
    }

    return {
      matchKind,
      totalUses: usages.length,
      tournaments: Array.from(tournaments),
      types: typeCounts,
      mostCommonType,
      realTypes: realTypeCounts,
      mostCommonRealType,
      usages,
    }
  }

  return { getMapHistory }
}
