import { useMemo } from 'react'
import type { Tournament } from '@/lib/types'

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
  totalUses: number
  tournaments: string[]
  types: Map<string, number>  // type -> 使用次数
  mostCommonType: string
  usages: MapUsage[]
}

/**
 * 构建 beatmapsetId -> 使用历史 的索引
 * 用于在录入新比赛时检测谱面是否在其他比赛中出现过
 */
export function useMapHistory(tournaments: Tournament[]) {
  // 构建索引：beatmapsetId -> MapUsage[]
  const historyIndex = useMemo(() => {
    const index = new Map<number, MapUsage[]>()

    for (const tournament of tournaments) {
      for (const round of tournament.rounds) {
        for (const map of round.maps) {
          // 只索引有 beatmapsetId 的谱面
          if (!map.beatmapsetId) continue

          if (!index.has(map.beatmapsetId)) {
            index.set(map.beatmapsetId, [])
          }

          index.get(map.beatmapsetId)!.push({
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            tournamentAbbr: tournament.abbreviation,
            roundId: round.id,
            roundName: round.name,
            roundAbbr: round.abbreviation,
            slot: map.slot,
            type: map.type,
            realType: map.realType,
            difficulty: map.difficulty,
            beatmapId: map.beatmapId,
            beatmapsetId: map.beatmapsetId,
            name: map.name,
          })
        }
      }
    }

    return index
  }, [tournaments])

  /**
   * 查询指定 beatmapsetId 的使用历史
   */
  const getMapHistory = (beatmapsetId: number | undefined): MapHistorySummary | null => {
    if (!beatmapsetId) return null

    const usages = historyIndex.get(beatmapsetId)
    if (!usages || usages.length === 0) return null

    // 统计每个 type 的使用次数
    const typeCounts = new Map<string, number>()
    const tournaments = new Set<string>()

    for (const usage of usages) {
      typeCounts.set(usage.type, (typeCounts.get(usage.type) || 0) + 1)
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

    return {
      totalUses: usages.length,
      tournaments: Array.from(tournaments),
      types: typeCounts,
      mostCommonType,
      usages,
    }
  }

  return { getMapHistory }
}
