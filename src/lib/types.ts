export interface BeatmapMeta {
  slot: string
  type: string
  realType: string
  name: string
  difficulty: number
  difficultyLn?: number
  // true = 这张图的难度不参与统计(本轮/该键型的平均值)也不进 ladder 框高。
  // 默认不勾选(字段缺席即参与),判断统一走 src/lib/difficultyCount.ts。
  excludeFromDifficulty?: boolean
  // 「临时归类到别的键型包」:只在**合包**时把这张图放进所填键型的包,realType 一个字不改。
  // 默认不填(字段缺席即按 realType 正常进包),判断统一走 src/lib/packAs.ts。
  packAs?: string
  beatmapId?: number
  beatmapsetId?: number
  oszUrl?: string
}

export interface RoundDifficulty {
  min: number
  max: number
  average: number
}

export interface TypeDifficulty {
  rf?: number
  ln?: number
}

export interface Round {
  id: string
  name: string
  abbreviation: string
  order: number
  isQualifier?: boolean
  bestOf?: number
  difficulty: RoundDifficulty
  typeDifficulties?: Record<string, TypeDifficulty>
  maps: BeatmapMeta[]
}

export interface Tournament {
  id: string
  name: string
  abbreviation: string
  forumUrl?: string
  wikiUrl?: string
  sheetUrl?: string
  keyCount: number
  year: number
  priority?: number
  tags?: string[]
  rounds: Round[]
  customTypes?: MapTypeDefinition[]
}

export interface MapTypeDefinition {
  id: string
  name: string
  parentType?: string
  color?: string
}

export interface DanLevel {
  id: string
  name: string
  numericValue: number
  color: string
}

export interface DanScale {
  id: string
  name: string
  type: 'rice' | 'ln'
  levels: DanLevel[]
}

export interface ReferencePoint {
  label: string
  difficulty: number
  type?: 'rice' | 'ln' | 'both'
}

export interface MapTypeConfig {
  id: string
  name: string
  color: string
  subtypes: string[]
}

export interface GlobalConfig {
  mapTypes: Record<string, MapTypeConfig>
  defaultRfLnOffset: number
  difficultyRange: { min: number; max: number }
}

export type ViewMode = 'tournament' | 'round' | 'type'

export interface ViewState {
  mode: ViewMode
  zoom: number
  rowHeight: number
  columnWidth: number
  rfLnOffset: number
  activeFilter: string | null
  searchQuery: string
  scrollX: number
}
