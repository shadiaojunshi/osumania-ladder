export interface PackCsvCollection {
  realType: string
  url: string
  sourceObjectKeys: string[]
  mapCount: number
  exportedAt: string
}

// Never present last generation's CSV as matching a newly rebuilt collection.
export function currentPackCsv(parts: { realType: string; objectKey?: string }[], collections: PackCsvCollection[]) {
  const csv = collections.find(c => c.realType === parts[0]?.realType)
  if (!csv || parts.some(p => !p.objectKey) || !csv.url.startsWith('https://')) return undefined
  const keys = parts.map(p => p.objectKey!).sort()
  const sourceKeys = [...csv.sourceObjectKeys].sort()
  return JSON.stringify(keys) === JSON.stringify(sourceKeys) ? csv : undefined
}
