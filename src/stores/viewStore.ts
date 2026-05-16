import { create } from 'zustand'
import type { ViewMode } from '@/lib/types'

interface ViewStore {
  mode: ViewMode
  zoom: number
  rowHeight: number
  columnWidth: number
  rfLnOffset: number
  activeFilter: string | null
  searchQuery: string

  setMode: (mode: ViewMode) => void
  setZoom: (zoom: number) => void
  setRowHeight: (h: number) => void
  setColumnWidth: (w: number) => void
  setRfLnOffset: (offset: number) => void
  setActiveFilter: (filter: string | null) => void
  setSearchQuery: (query: string) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  mode: 'round',
  zoom: 1,
  rowHeight: 40,
  columnWidth: 160,
  rfLnOffset: 0,
  activeFilter: null,
  searchQuery: '',

  setMode: (mode) => set({ mode }),
  setZoom: (zoom) => set({ zoom }),
  setRowHeight: (h) => set({ rowHeight: h }),
  setColumnWidth: (w) => set({ columnWidth: w }),
  setRfLnOffset: (offset) => set({ rfLnOffset: offset }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
