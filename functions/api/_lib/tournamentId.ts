// 比赛 id 的唯一判定:只允许字母、数字、连字符,且不能以连字符开头。
// R13 起同时卡长度 —— 必须与 validation.ts 的 LIMITS.maxIdLength 一致(写路径也卡 128);
// 否则 /api/maps/* 这类只调本函数的端点会接受比写路径长得多的 id,白跑一次 R2 / GitHub。
// 全库真实 id 最长 46 字符,收紧不会挡住任何现有比赛。
export const MAX_TOURNAMENT_ID_LENGTH = 128

export function isValidTournamentId(id: string): boolean {
  return typeof id === 'string'
    && id.length <= MAX_TOURNAMENT_ID_LENGTH
    && /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(id)
}

export function isMatchingTournamentId(id: string, tournament: { id?: unknown } | null): boolean {
  return isValidTournamentId(id) && tournament?.id === id
}
