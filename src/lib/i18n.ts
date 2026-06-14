'use client'

import { useCallback } from 'react'
import { usePrefsStore } from '@/stores/prefsStore'
import { messagesZh } from './messages.zh'
import { messagesEn } from './messages.en'

type Messages = typeof messagesZh
export type MessageKey = keyof Messages

const dict = { zh: messagesZh, en: messagesEn } as const

// {var} 简单替换。值里没有 var 时直接 return 字符串,避免无谓 split。
function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k]
    return v === undefined ? `{${k}}` : String(v)
  })
}

// 主路径: 在组件里 const t = useT();t('key')。
// 选择器订阅 lang 一字段,主题切换不会触发翻译重渲染。
// useCallback 包一层是为了让 t 引用只在 lang 变时变化 —— 否则
// useCallback(fetchX, [t]) + useEffect(..., [fetchX]) 会形成
// fetch → setState → rerender → 新 t → 新 fetchX → effect 重跑的死循环。
export function useT() {
  const lang = usePrefsStore((s) => s.lang)
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      const raw = dict[lang][key] ?? messagesZh[key] ?? key
      return format(raw, vars)
    },
    [lang],
  )
}

// 在没法用 hook 的位置(纯函数 / 服务端 / 不想触发 rerender)用这个。
export function getT(lang: 'zh' | 'en') {
  const table = dict[lang]
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    const raw = table[key] ?? messagesZh[key] ?? key
    return format(raw, vars)
  }
}
