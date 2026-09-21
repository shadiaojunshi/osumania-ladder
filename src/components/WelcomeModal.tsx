'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { WELCOME_LINES } from '@/lib/welcomeText'

// "不再显示"的标记。带版本号：将来若想再弹一次（比如换了公告），换个键名即可。
const DISMISS_KEY = 'welcome-dismissed-v1'

/**
 * 首次进入网站时的欢迎框 + 右下角常驻的"关于本站"入口。
 *
 * 几条刻意的设计：
 *   - **首帧不渲染**（mounted 之前 return null）：localStorage 只能在客户端读，
 *     服务端先渲染出浮层会造成 hydration mismatch，而本项目对 hydration 很敏感
 *     （见 prefsStore 的注释：mismatch 会让整棵 client tree 的事件绑定失效）。
 *   - **正文不做翻译**：WELCOME_LINES 是站长给的公告原文，中英模式下都原样展示；
 *     只有按钮文案走 i18n。
 *   - **右下角入口永远在**（关掉浮层后出现）：这是"不再显示"之后唯一的再入口，
 *     所以它不能跟着手机端/小屏隐藏。
 *   - **偷不到 localStorage 也照样弹一次**（隐私模式会抛异常），只是这次的
 *     "不再显示"记不住 —— 宁可多弹一次，也不要永远不弹。
 */
export function WelcomeModal() {
  const t = useT()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      dismissed = false
    }
    // 先读存储、再改 state。`queueMicrotask` 是全项目既有的写法（feedback / admin 里
    // 同样用法）：既保住"水合那一帧 mounted=false"，也不触发
    // react-hooks 的 set-state-in-effect。
    queueMicrotask(() => {
      setMounted(true)
      if (!dismissed) setOpen(true)
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    if (dontShowAgain) {
      try {
        localStorage.setItem(DISMISS_KEY, '1')
      } catch {
        /* 记不住就算了，下次还会弹 */
      }
    }
  }, [dontShowAgain])

  const reopen = useCallback(() => {
    setDontShowAgain(false)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!mounted) return null

  const [title, ...paragraphs] = WELCOME_LINES

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-modal-title"
          onClick={close}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-3 dark:border-neutral-800">
              <h2 id="welcome-modal-title" className="flex-1 text-base font-bold text-purple-700 dark:text-purple-300">
                {title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t('welcome.close')}
                className="shrink-0 rounded px-2 py-0.5 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm leading-7 text-gray-700 dark:text-neutral-200">
              {paragraphs.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 dark:border-neutral-800">
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="h-4 w-4 accent-purple-600"
                />
                {t('welcome.dontShowAgain')}
              </label>
              <button
                type="button"
                onClick={close}
                className="rounded bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              >
                {t('welcome.start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={reopen}
          className="fixed bottom-4 right-4 z-40 rounded-full border border-purple-200 bg-white/95 px-3 py-1.5 text-xs text-purple-700 shadow-md backdrop-blur transition-colors hover:border-purple-300 hover:bg-purple-50 dark:border-purple-800 dark:bg-neutral-900/95 dark:text-purple-300 dark:hover:bg-neutral-800"
        >
          {t('welcome.reopen')}
        </button>
      )}
    </>
  )
}
