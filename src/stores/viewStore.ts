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

  setMode: (mode: ViewMode) => void
  setZoom: (zoom: number) => void
  setRowHeight: (h: number) => void
  setColumnWidth: (w: number) => void
  setRfLnOffset: (offset: number) => void
  setActiveFilter: (filter: string | null) => void
  setSearchQuery: (query: string) => void
  setSortMode: (sort: SortMode) => void
  setCustomOrder: (order: string[] | null) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  mode: 'round',
  zoom: 2,
  rowHeight: 100,
  columnWidth: 160,
  rfLnOffset: 0,
  activeFilter: null,
  searchQuery: '',
  sortMode: 'default',
  customOrder: null,

  setMode: (mode) => set({ mode }),
  setZoom: (zoom) => set({ zoom }),
  setRowHeight: (h) => set({ rowHeight: h }),
  setColumnWidth: (w) => set({ columnWidth: w }),
  setRfLnOffset: (offset) => set({ rfLnOffset: offset }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortMode: (sortMode) => set({ sortMode, customOrder: null }),
  setCustomOrder: (customOrder) => set({ customOrder, sortMode: 'default' }),
}))
