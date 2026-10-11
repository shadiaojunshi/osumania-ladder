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

// 语言的事实来源就是 zustand store(prefsStore),t 在**调用时**直接读它。
// STABLE_T 是模块级常量,引用永远不变 —— 放进任何依赖数组都安全;
// 切语言时组件按 zustand 订阅正常 rerender,t 自然读到新的 lang。
//
// 早先这里是一个模块级可变对象 `langRef`,由 useT() 在**渲染期**写入:
// 那既属于"渲染期改外部可变状态"(react-hooks/immutability 报的就是这个),
// 也让每次 render 都在偷偷改一份共享变量。store 本来就能直接读,这个中间层是多余的。
const STABLE_T = (key: MessageKey, vars?: Record<string, string | number>): string => {
  const raw = dict[usePrefsStore.getState().lang][key] ?? messagesZh[key] ?? key
  return format(raw, vars)
}

// 主路径: 在组件里 const t = useT();t('key')。
// 这里只需**订阅** lang 一字段(主题切换不会触发翻译重渲染);取值由 STABLE_T 自己做。
export function useT() {
  usePrefsStore((s) => s.lang)
  return STABLE_T
}

// 在没法用 hook 的位置(纯函数 / 服务端 / 不想触发 rerender)用这个。
export function getT(lang: 'zh' | 'en') {
  const table = dict[lang]
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    const raw = table[key] ?? messagesZh[key] ?? key
    return format(raw, vars)
  }
}
