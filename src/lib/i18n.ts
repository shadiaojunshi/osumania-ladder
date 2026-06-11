'use client'

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
export function useT() {
  const lang = usePrefsStore((s) => s.lang)
  const table = dict[lang]
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    const raw = table[key] ?? messagesZh[key] ?? key
    return format(raw, vars)
  }
}

// 在没法用 hook 的位置(纯函数 / 服务端 / 不想触发 rerender)用这个。
export function getT(lang: 'zh' | 'en') {
  const table = dict[lang]
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    const raw = table[key] ?? messagesZh[key] ?? key
    return format(raw, vars)
  }
}
