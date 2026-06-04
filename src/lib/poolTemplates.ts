import type { MapCategory } from '@/components/admin/MapSlotEditor'

export interface PoolTemplate {
  label: string
  maps: { type: MapCategory; realType: string }[]
}

export const QUALIFIER_TEMPLATES: Record<number, PoolTemplate[]> = {
  7: [{ label: '3RC 2LN 2HB', maps: [
    { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'TC' },
    { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' },
    { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
  ]}],
  8: [
    { label: '1SV 3RC 2LN 2HB', maps: [
      { type: 'SV', realType: 'SV1' },
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'TC' },
      { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
    ]},
    { label: '4RC 2LN 2HB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'CJ' },
      { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
    ]},
  ],
  9: [{ label: '1SV 4RC 2LN 2HB', maps: [
    { type: 'SV', realType: 'SV1' },
    { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'CJ' },
    { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' },
    { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
  ]}],
}

export const MATCH_TEMPLATES: Record<number, PoolTemplate[]> = {
  7: [
    { label: '4RC 2HB 2LN 1SV 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'TC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
      { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' },
      { type: 'SV', realType: 'SV1' }, { type: 'TB', realType: 'TB' },
    ]},
    { label: '4RC 2HB 2LN 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'TC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
      { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' },
      { type: 'TB', realType: 'TB' },
    ]},
  ],
  9: [
    { label: '5RC 2HB 3LN 2SV 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'MX' }, { type: 'RC', realType: 'DP' }, { type: 'RC', realType: 'TC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' },
      { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'LNMX' },
      { type: 'SV', realType: 'SV1' }, { type: 'SV', realType: 'SV2' }, { type: 'TB', realType: 'TB' },
    ]},
    { label: '6RC 3HB 3LN 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'CJ' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'WTC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' }, { type: 'HB', realType: 'HB3' },
      { type: 'LN', realType: 'RE' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'LNMX' },
      { type: 'TB', realType: 'TB' },
    ]},
  ],
  11: [
    { label: '6RC 3HB 3LN 2SV 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'CJ' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'WTC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' }, { type: 'HB', realType: 'HB3' },
      { type: 'LN', realType: 'CO' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'LNMX' },
      { type: 'SV', realType: 'SV1' }, { type: 'SV', realType: 'SV2' }, { type: 'TB', realType: 'TB' },
    ]},
    { label: '7RC 3HB 4LN 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'CJ' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'TC' }, { type: 'RC', realType: 'WTC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' }, { type: 'HB', realType: 'HB3' },
      { type: 'LN', realType: 'CO' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'JW' }, { type: 'LN', realType: 'SW' },
      { type: 'TB', realType: 'TB' },
    ]},
  ],
  13: [
    { label: '7RC 3HB 4LN 2SV 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'CJ' }, { type: 'RC', realType: 'DP' }, { type: 'RC', realType: 'STC' }, { type: 'RC', realType: 'JTC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' }, { type: 'HB', realType: 'HB3' },
      { type: 'LN', realType: 'CO' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'JW' }, { type: 'LN', realType: 'SW' },
      { type: 'SV', realType: 'SV1' }, { type: 'SV', realType: 'SV2' }, { type: 'TB', realType: 'TB' },
    ]},
    { label: '8RC 4HB 4LN 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'CJ' }, { type: 'RC', realType: 'DP' }, { type: 'RC', realType: 'STC' }, { type: 'RC', realType: 'JTC' }, { type: 'RC', realType: 'WTC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' }, { type: 'HB', realType: 'HB3' }, { type: 'HB', realType: 'HB4' },
      { type: 'LN', realType: 'CO' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'JW' }, { type: 'LN', realType: 'SW' },
      { type: 'TB', realType: 'TB' },
    ]},
    { label: '8RC 3HB 5LN 1TB', maps: [
      { type: 'RC', realType: 'SS' }, { type: 'RC', realType: 'JS' }, { type: 'RC', realType: 'SA' }, { type: 'RC', realType: 'CJ' }, { type: 'RC', realType: 'DP' }, { type: 'RC', realType: 'STC' }, { type: 'RC', realType: 'JTC' }, { type: 'RC', realType: 'WTC' },
      { type: 'HB', realType: 'HB1' }, { type: 'HB', realType: 'HB2' }, { type: 'HB', realType: 'HB3' },
      { type: 'LN', realType: 'CO' }, { type: 'LN', realType: 'DE' }, { type: 'LN', realType: 'JW' }, { type: 'LN', realType: 'SW' }, { type: 'LN', realType: 'LNMX' },
      { type: 'TB', realType: 'TB' },
    ]},
  ],
}

export function getTemplatesByBestOf(bestOf: number, isQualifier: boolean): PoolTemplate[] {
  return isQualifier ? (QUALIFIER_TEMPLATES[bestOf] || []) : (MATCH_TEMPLATES[bestOf] || [])
}

function countByType(types: MapCategory[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of types) out[t] = (out[t] || 0) + 1
  return out
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false
  return true
}

// 按"map 数 + 每个 type 的张数"匹配模板,顺序无关。
// 例如用户粘贴 RC1/RC2/RC3/HB1/HB2/LN1/LN2/SV1/TB,资格赛 false
// → 在所有 MATCH_TEMPLATES 里找 9 张且 RC=3,HB=2,LN=2,SV=1,TB=1 的;命中第一个返回。
export function findMatchingTemplate(
  categories: MapCategory[],
  isQualifier: boolean,
): PoolTemplate | null {
  const allTemplates = isQualifier
    ? Object.values(QUALIFIER_TEMPLATES).flat()
    : Object.values(MATCH_TEMPLATES).flat()
  const counts = countByType(categories)
  for (const tpl of allTemplates) {
    if (tpl.maps.length !== categories.length) continue
    const tplCounts = countByType(tpl.maps.map((m) => m.type))
    if (sameCounts(counts, tplCounts)) return tpl
  }
  return null
}

// 在已知模板匹配的前提下,按用户输入中各 type 的"出现顺序"对位取模板里同 type 的 realType。
// 例如模板 RC 列表是 [SS, JS, TC],用户的三张 RC 分别按出现顺序拿到 SS/JS/TC。
export function applyTemplateRealTypes(
  categories: MapCategory[],
  template: PoolTemplate,
): string[] {
  const tplByType: Record<string, string[]> = {}
  for (const m of template.maps) {
    if (!tplByType[m.type]) tplByType[m.type] = []
    tplByType[m.type].push(m.realType)
  }
  const cursors: Record<string, number> = {}
  return categories.map((cat) => {
    const list = tplByType[cat] || []
    const idx = cursors[cat] || 0
    cursors[cat] = idx + 1
    return list[idx] || ''
  })
}
