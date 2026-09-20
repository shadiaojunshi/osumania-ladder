import type { Round, Tournament } from './types'

export interface LadderHover {
  round: Round
  tournament: Tournament
  x: number
  y: number
  type?: string
  slot?: string
}

// 内容继续跟随指针命中的轮次；同一比赛的一次 hover 会话只定位一次。
export function updateLadderHover(current: LadderHover | null, next: LadderHover, lockPosition: boolean): LadderHover {
  const anchor = lockPosition && current?.tournament === next.tournament ? current : next
  if (current?.round === next.round && current.tournament === next.tournament &&
    current.type === next.type && current.slot === next.slot && current.x === anchor.x && current.y === anchor.y) return current
  return { ...next, x: anchor.x, y: anchor.y }
}
