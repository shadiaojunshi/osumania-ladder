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
  types: Map<string, number>  // type(大键型) -> 使用次数
  mostCommonType: string
  realTypes: Map<string, number>  // realType(真实类型) -> 使用次数
  mostCommonRealType: string
  usages: MapUsage[]
}

/**
 * 构建 beatmapId -> 使用历史 的索引
 * 用于在录入新比赛时检测谱面是否在其他比赛中出现过。
 * 注意:用 beatmapId(具体难度 id)而非 beatmapsetId 做 key。
 * 同一 beatmapset 下的 Hard / Insane / EX 是不同难度、不同 beatmapId,
 * 不能算作同一张图;只有 beatmapId 完全一致才是真正重复使用的同一张谱面。
 */
export function useMapHistory(tournaments: Tournament[]) {
  // 构建索引：beatmapId -> MapUsage[]
  const historyIndex = useMemo(() => {
    const index = new Map<number, MapUsage[]>()

    for (const tournament of tournaments) {
      // 防御：清单式响应（{id, sha}[]）没有 rounds，直接跳过而不是崩掉整个树
      if (!tournament?.rounds) continue
      for (const round of tournament.rounds) {
        if (!round?.maps) continue
        for (const map of round.maps) {
          // 只索引有 beatmapId 的谱面(具体难度 id)。没有 BID 的图无法判定是否同一张,不参与。
          if (!map.beatmapId) continue

          if (!index.has(map.beatmapId)) {
            index.set(map.beatmapId, [])
          }

          index.get(map.beatmapId)!.push({
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
   * 查询指定 beatmapId 的使用历史
   */
  const getMapHistory = (beatmapId: number | undefined): MapHistorySummary | null => {
    if (!beatmapId) return null

    const usages = historyIndex.get(beatmapId)
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
