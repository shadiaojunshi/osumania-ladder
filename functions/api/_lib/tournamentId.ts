export function isValidTournamentId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(id)
}

export function isMatchingTournamentId(id: string, tournament: { id?: unknown } | null): boolean {
  return isValidTournamentId(id) && tournament?.id === id
}
