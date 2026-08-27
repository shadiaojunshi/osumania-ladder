/**
 * Canonical realType names used by the UI, diagnostics and pack generation.
 * Historical tournament files may contain aliases from before a rename.
 */
const REAL_TYPE_ALIASES: Record<string, string> = {
  WC: 'LNWC',
}

export function normalizeRealType(realType: string | undefined | null): string {
  const value = String(realType || '').trim()
  return REAL_TYPE_ALIASES[value] || value
}

export function isPendingRealType(realType: string | undefined | null): boolean {
  return ['PDRC', 'PDLN', 'PDHB', 'PDSV'].includes(normalizeRealType(realType))
}
