'use client'

import { create } from 'zustand'

export type Theme = 'light' | 'dark'
export type Lang = 'zh' | 'en'

interface PrefsStore {
  theme: Theme
  lang: Lang
  setTheme: (t: Theme) => void
  setLang: (l: Lang) => void
  toggleTheme: () => void
  hydrate: () => void
}

// store 初始值必须 SSR/CSR 一致,否则 hydration mismatch 会让整棵 client tree 的事件绑定失效。
// 真实首选项由 <PrefsHydrator/> 在 mount 后从 localStorage 读出再 setState。
// (首屏颜色由 layout.tsx 的 inline FOUC script 通过 <html class="dark"> 直接落到 DOM,
//  不依赖 store,所以不会闪烁;闪烁的只有 ControlBar 的主题切换按钮文案那一帧。)
export const usePrefsStore = create<PrefsStore>((set, get) => ({
  theme: 'light',
  lang: 'zh',
  setTheme: (theme) => {
    set({ theme })
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('theme', theme) } catch {}
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
  },
  setLang: (lang) => {
    set({ lang })
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('lang', lang) } catch {}
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    }
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
  hydrate: () => {
    if (typeof window === 'undefined') return
    let theme: Theme = 'light'
    let lang: Lang = 'zh'
    try {
      const t = localStorage.getItem('theme')
      if (t === 'dark' || t === 'light') theme = t
      else theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      const l = localStorage.getItem('lang')
      if (l === 'zh' || l === 'en') lang = l
      else lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
    } catch {}
    set({ theme, lang })
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  },
}))
