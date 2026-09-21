'use client'

import { useEffect, useRef, useState } from 'react'

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string
  remove(id: string): void
}
declare global { interface Window { turnstile?: TurnstileApi } }
let loading: Promise<void> | undefined
function load() {
  if (window.turnstile) return Promise.resolve()
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error('Challenge unavailable')) }
    document.head.appendChild(script)
  })
  return loading
}

export function TurnstileChallenge({ siteKey, onToken, errorText, retryText }: { siteKey: string; onToken: (token: string) => void; errorText: string; retryText: string }) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { callback.current = onToken }, [onToken])
  useEffect(() => {
    let disposed = false
    let widget: string | undefined
    load().then(() => {
      if (disposed || !container.current || !window.turnstile) return
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey, action: 'feedback_submit', theme: 'auto',
        callback: (token: string) => callback.current(token),
        'expired-callback': () => callback.current(''),
        'error-callback': () => { callback.current(''); setFailed(true) },
      })
    }).catch(() => { if (!disposed) setFailed(true) })
    return () => { disposed = true; if (widget) window.turnstile?.remove(widget) }
  }, [siteKey, attempt])
  return <div><div ref={container} />{failed && <div><p role="alert" className="text-sm text-red-600">{errorText}</p><button className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => { callback.current(''); setFailed(false); setAttempt(value => value + 1) }}>{retryText}</button></div>}</div>
}
