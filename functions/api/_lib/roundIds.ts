// Round id 唯一性校验 —— 保存端点的最后防线。
//
// 背景:R2 谱面 key 是 maps/{tid}/{rid}/{slot}.osz,两个 round 用同一个 id 时
// 上传会互相覆盖,按 roundId/slot 定位的元数据补丁也会写串(SSR 的 SF/F 曾同用
// round-8,数据互吞)。前端 tab 有体检展示,这里保证坏数据进不了 GitHub。

interface RoundLike {
  id?: unknown
  abbreviation?: unknown
  name?: unknown
}

export function findDuplicateRoundIds(tournament: { rounds?: unknown } | null | undefined): {
  roundId: string
  rounds: string[]
}[] {
  const rounds = tournament?.rounds
  if (!Array.isArray(rounds)) return []

  const byId = new Map<string, string[]>()
  for (const raw of rounds) {
    const round = raw as RoundLike
    if (typeof round?.id !== 'string' || !round.id) continue
    const label = (typeof round.abbreviation === 'string' && round.abbreviation)
      || (typeof round.name === 'string' && round.name)
      || round.id
    if (!byId.has(round.id)) byId.set(round.id, [])
    byId.get(round.id)!.push(label)
  }

  const result: { roundId: string; rounds: string[] }[] = []
  for (const [roundId, labels] of byId) {
    if (labels.length >= 2) result.push({ roundId, rounds: labels })
  }
  return result
}
