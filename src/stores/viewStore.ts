import { create } from 'zustand'
import type { ViewMode } from '@/lib/types'

export type SortMode = 'default' | 'difficulty-asc' | 'difficulty-desc'

interface ViewStore {
  mode: ViewMode
  zoom: number
  rowHeight: number
  columnWidth: number
  rfLnOffset: number
  activeFilter: string | null
  searchQuery: string
  sortMode: SortMode
  customOrder: string[] | null
  hideQualifiers: boolean
  yearFilter: number | null
  roundFilter: string | null
  roundBorderAlways: boolean

  setMode: (mode: ViewMode) => void
  setZoom: (zoom: number) => void
  setRowHeight: (h: number) => void
  setColumnWidth: (w: number) => void
  setRfLnOffset: (offset: number) => void
  setActiveFilter: (filter: string | null) => void
  setSearchQuery: (query: string) => void
  setSortMode: (sort: SortMode) => void
  setCustomOrder: (order: string[] | null) => void
  setHideQualifiers: (hide: boolean) => void
  setYearFilter: (year: number | null) => void
  setRoundFilter: (round: string | null) => void
  setRoundBorderAlways: (b: boolean) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  mode: 'round',
  zoom: 2,
  rowHeight: 100,
  columnWidth: 140,
  rfLnOffset: 0,
  activeFilter: null,
  searchQuery: '',
  sortMode: 'default',
  customOrder: null,
  hideQualifiers: false,
  yearFilter: null,
  roundFilter: null,
  // 默认关闭（站长 2026-09-18：默认常驻白边太吵）。本轮不持久化，
  // 刷新回到默认，页面内手动开关仍有效。
  roundBorderAlways: false,

  setMode: (mode) => set({ mode }),
  setZoom: (zoom) => set({ zoom }),
  setRowHeight: (h) => set({ rowHeight: h }),
  setColumnWidth: (w) => set({ columnWidth: w }),
  setRfLnOffset: (offset) => set({ rfLnOffset: offset }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortMode: (sortMode) => set({ sortMode, customOrder: null }),
  setCustomOrder: (customOrder) => set({ customOrder, sortMode: 'default' }),
  setHideQualifiers: (hideQualifiers) => set({ hideQualifiers }),
  setYearFilter: (yearFilter) => set({ yearFilter }),
  setRoundFilter: (roundFilter) => set({ roundFilter }),
  setRoundBorderAlways: (roundBorderAlways) => set({ roundBorderAlways }),
}))
