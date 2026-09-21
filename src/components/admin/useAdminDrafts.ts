'use client'

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'

/** One writer per authenticated UID, held by a browser Web Lock. Drafts and pending
 * requests are written synchronously before callers start network operations.
 * Unsupported/denied storage fails closed; old unscoped drafts are never auto-claimed.
 */
export function useAdminDrafts<T>(uid?: string) {
  const [entries, setEntriesState] = useState<Record<string, T>>({})
  const entriesRef = useRef(entries)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [legacy, setLegacy] = useState(false)
  const session = useRef<{ uid: string; key: string; aux: Record<string, unknown> } | null>(null)
  const persist = useCallback((next: Record<string, T>, aux?: Record<string, unknown>) => {
    const current = session.current
    if (!current || current.uid !== uid) throw new Error('草稿尚未加载，或已在另一个标签页编辑。请关闭另一页后刷新。')
    const nextAux = aux ?? current.aux
    try {
      localStorage.setItem(current.key, JSON.stringify({ version: 3, entries: next, aux: nextAux }))
    } catch {
      // 写不进去（配额满 / 隐私模式）必须让界面**说出来**：调用点大多是事件处理器，
      // 那里的异常浏览器不会展示，用户点了「暂存」什么都没发生，会以为已经暂存。
      // 草稿是整份 tournament JSON（数据总量约 1.65 MB，上限约 5 MB），这不是假想场景。
      // 仍然把异常抛出去：调用方要靠它中止后续网络操作、不要报成功。
      setError('草稿没能写入本机存储（空间满或被禁用），这次修改没有暂存。')
      throw new Error('草稿没能写入本机存储，这次修改没有暂存。')
    }
    setError('')
    current.aux = nextAux
  }, [uid])
  const setEntries = useCallback((action: SetStateAction<Record<string, T>>) => {
    const next = typeof action === 'function' ? action(entriesRef.current) : action
    persist(next)
    entriesRef.current = next
    setEntriesState(next)
  }, [persist])
  /** 认领旧草稿只该发生一次。标记按 uid 记，v1/v2 备份本身不动（站长要求保留）。
   * 想让横幅再出现一次：删掉 `osumania-ladder:staged-tournaments:claimed:<uid>` 即可。
   * 没有这个标记的话，横幅每次进 admin 都还在 —— 用户无法判断导入到底有没有生效。 */
  const claimLegacy = useCallback(() => {
    if (!uid) return
    try {
      localStorage.setItem(`osumania-ladder:staged-tournaments:claimed:${encodeURIComponent(uid)}`, '1')
    } catch { /* 记不住就下次再问一遍，宁可多问一次 */ }
    setLegacy(false)
  }, [uid])
  const readAux = useCallback(<V,>(key: string) => session.current?.aux[key] as V | undefined, [])
  const writeAux = useCallback((key: string, value: unknown) => {
    persist(entriesRef.current, { ...session.current?.aux, [key]: value })
  }, [persist])
  useEffect(() => {
    let release: (() => void) | undefined
    let disposed = false
    queueMicrotask(() => { if (!disposed) { setReady(false); setError(''); setEntriesState({}); entriesRef.current = {} } })
    if (!uid) return () => { disposed = true }
    const key = `osumania-ladder:staged-tournaments:v3:${encodeURIComponent(uid)}`
    const acquire = async () => {
      if (!navigator.locks) throw new Error('此浏览器不支持草稿标签页保护，请使用新版浏览器。')
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (disposed) return
        if (!lock) throw new Error('另一个标签页正在编辑此账号的草稿。关闭另一页后刷新即可。')
        const raw = localStorage.getItem(key)
        const stored = raw ? JSON.parse(raw) : { entries: {}, aux: {} }
        if (!stored.entries || typeof stored.entries !== 'object' || Array.isArray(stored.entries)) throw new Error('草稿文件损坏，请先导出本地存储，勿清空。')
        const acquired = { uid, key, aux: stored.aux ?? {} }
        session.current = acquired
        entriesRef.current = stored.entries
        setEntriesState(stored.entries)
        setLegacy(!!(localStorage.getItem('osumania-ladder:staged-tournaments:v2') || localStorage.getItem('osumania-ladder:staged-tournaments:v1'))
          && !localStorage.getItem(`osumania-ladder:staged-tournaments:claimed:${encodeURIComponent(uid)}`))
        setReady(true)
        await new Promise<void>(resolve => { release = resolve })
        if (session.current === acquired) session.current = null
      })
    }
    acquire().catch(e => { if (!disposed) setError((e as Error).message) })
    return () => { disposed = true; session.current = null; release?.() }
  }, [uid])
  return { entries, entriesRef, setEntries, ready, error, legacy, claimLegacy, readAux, writeAux }
}
