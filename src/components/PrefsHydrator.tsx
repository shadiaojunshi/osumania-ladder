'use client'

import { useEffect } from 'react'
import { usePrefsStore } from '@/stores/prefsStore'

const TITLE: Record<'zh' | 'en', string> = {
  zh: 'osu!mania 难度天梯榜',
  en: 'osu!mania Difficulty Ladder',
}

export function PrefsHydrator() {
  const lang = usePrefsStore((s) => s.lang)
  useEffect(() => {
    usePrefsStore.getState().hydrate()
  }, [])
  // 切换语言时同步浏览器标签;layout metadata 是 SSR 静态的,改不了。
  useEffect(() => {
    document.title = TITLE[lang]
  }, [lang])
  return null
}
