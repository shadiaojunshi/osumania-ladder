'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { TournamentForm } from '@/components/admin/TournamentForm'
import { JsonPreview } from '@/components/admin/JsonPreview'
import { ReferencesEditor } from '@/components/admin/ReferencesEditor'
import { RefLadderEditor } from '@/components/admin/RefLadderEditor'
import { DifficultyFitTool } from '@/components/admin/DifficultyFitTool'
import { MapUploader } from '@/components/admin/MapUploader'
import { PackLinksEditor } from '@/components/admin/PackLinksEditor'
import { RealTypeConflictChecker } from '@/components/admin/RealTypeConflictChecker'
import { RealTypeMapBrowser } from '@/components/admin/RealTypeMapBrowser'
import { AdminsManager } from '@/components/admin/AdminsManager'
import { TrashManager } from '@/components/admin/TrashManager'
import { AuditLog } from '@/components/admin/AuditLog'
import type { Tournament } from '@/lib/types'
import { useT, type MessageKey } from '@/lib/i18n'
import { findPendingMaps } from '@/lib/tournamentDiagnostics'

type Role = 'readonly' | 'contributor' | 'admin' | 'owner'

const ROLE_RANK: Record<Role, number> = { readonly: 0, contributor: 1, admin: 2, owner: 3 }
const ROLE_LABEL_KEYS: Record<Role, MessageKey> = {
  readonly: 'admin.role.readonly',
  contributor: 'admin.role.contributor',
  admin: 'admin.role.admin',
  owner: 'admin.role.owner',
}

interface SessionUser {
  uid: string
  username: string
  role: Role
}

interface TournamentListItem {
  id: string
  sha: string
}

type Tab = 'create' | 'manage' | 'references' | 'refLadder' | 'difficultyFit' | 'upload' | 'packs' | 'realTypeMaps' | 'rtConflict' | 'admins' | 'trash' | 'audit'

// 每份暂存草稿都要带「编辑基准」:读取该文件时的 blob sha。
//   baseSha: string → 编辑既有文件,提交时用它做乐观锁
//   baseSha: null   → 新建(预期服务器上不存在),撞名会被服务端拒绝
//   legacy: true    → 从 v1 旧格式迁来的草稿,没有基准,只允许查看/导出,不允许提交
interface StagedEntry {
  data: Tournament
  baseSha: string | null
  baseline: Tournament | null
  legacy?: boolean
}

interface EditConflict {
  id: string
  reason: string
  expected: string | null
  actual: string | null
}

const STAGED_TOURNAMENTS_KEY_V1 = 'osumania-ladder:staged-tournaments:v1'
const STAGED_TOURNAMENTS_KEY = 'osumania-ladder:staged-tournaments:v2'

export default function AdminPage() {
  const t = useT()
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [existingList, setExistingList] = useState<TournamentListItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingSha, setEditingSha] = useState<string | null>(null)
  // 打开编辑时的权威内容:作为冲突对比的基准快照
  const [editingBaseline, setEditingBaseline] = useState<Tournament | null>(null)
  // 当前编辑对象来自「无基准的旧草稿」→ 只允许查看/导出,不允许保存
  const [editingLegacy, setEditingLegacy] = useState(false)
  const [editInitialData, setEditInitialData] = useState<Tournament | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error' | 'local'; message: string } | null>(null)
  const [conflicts, setConflicts] = useState<EditConflict[]>([])
  const [saveSignal, setSaveSignal] = useState(0)
  const [stagedChanges, setStagedChanges] = useState<Record<string, StagedEntry>>({})
  const [stagedChangesLoaded, setStagedChangesLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('create')
  const [loadingList, setLoadingList] = useState(false)
  // 编辑/新建表单是否有未保存修改(由 TournamentForm 冒泡上来),用于切栏拦截
  const [formDirty, setFormDirty] = useState(false)
  // 上传页是否有暂存未保存的元数据(由 MapUploader 冒泡上来),用于切栏拦截
  const [uploadDirty, setUploadDirty] = useState(false)

  useEffect(() => {
    const sanitize = (value: unknown, id: string): StagedEntry | null => {
      if (!value || typeof value !== 'object') return null
      const entry = value as Partial<StagedEntry>
      const data = entry.data as Tournament | undefined
      if (!data || data.id !== id) return null
      return {
        data,
        baseSha: typeof entry.baseSha === 'string' ? entry.baseSha : null,
        baseline: (entry.baseline as Tournament | undefined) ?? null,
        legacy: !!entry.legacy,
      }
    }

    try {
      const rawV2 = window.localStorage.getItem(STAGED_TOURNAMENTS_KEY)
      if (rawV2) {
        const parsed = JSON.parse(rawV2) as Record<string, unknown>
        const valid: Record<string, StagedEntry> = {}
        for (const [id, value] of Object.entries(parsed)) {
          const entry = sanitize(value, id)
          if (entry) valid[id] = entry
        }
        setStagedChanges(valid)
      } else {
        // v1 旧格式只有整份 JSON、没有编辑基准。迁移为 legacy 草稿:
        // 可以查看/导出,但不能直接提交(否则会静默覆盖别人已保存的改动)。
        const rawV1 = window.localStorage.getItem(STAGED_TOURNAMENTS_KEY_V1)
        if (rawV1) {
          const parsed = JSON.parse(rawV1) as Record<string, Tournament>
          const migrated: Record<string, StagedEntry> = {}
          for (const [id, value] of Object.entries(parsed)) {
            if (!value || value.id !== id) continue
            migrated[id] = { data: value, baseSha: null, baseline: null, legacy: true }
          }
          setStagedChanges(migrated)
          window.localStorage.removeItem(STAGED_TOURNAMENTS_KEY_V1)
        }
      }
    } catch {
      window.localStorage.removeItem(STAGED_TOURNAMENTS_KEY)
    } finally {
      setStagedChangesLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!stagedChangesLoaded) return
    if (Object.keys(stagedChanges).length === 0) {
      window.localStorage.removeItem(STAGED_TOURNAMENTS_KEY)
    } else {
      window.localStorage.setItem(STAGED_TOURNAMENTS_KEY, JSON.stringify(stagedChanges))
    }
  }, [stagedChanges, stagedChangesLoaded])

  // 角色判断
  const has = useCallback(
    (min: Role) => !!user && ROLE_RANK[user.role] >= ROLE_RANK[min],
    [user],
  )
  const isAdmin = has('admin')

  // 登录态检查
  useEffect(() => {
    // dev 本地绕过: functions/api/auth/* 是 Cloudflare Pages Functions,
    // next dev 不 serve, fetch 必然 404。给一个 mock owner session 让前端按钮可点。
    // 注意: 真正调用后端 API 的按钮(提交/删除/上传等)在本地还是会 404,
    // 要测后端必须用 `wrangler pages dev` 而不是 `next dev`。
    // process.env.NODE_ENV 在打包时被替换为字面量,prod build 会 tree-shake 这段。
    if (process.env.NODE_ENV === 'development') {
      setUser({ uid: 'dev', username: 'dev-owner', role: 'owner' })
      setAuthLoading(false)
      return
    }
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [])

  const fetchList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/tournaments')
      if (res.ok) {
        const data = await res.json()
        setExistingList(data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchList()
  }, [user, fetchList])

  const handleLogin = () => {
    window.location.href = '/api/auth/login'
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    setUser(null)
  }

  const handleSubmit = async () => {
    if (!tournament) return
    if (editingLegacy) {
      setSubmitStatus({ type: 'error', message: t('admin.base.legacyBlocked') })
      return
    }
    if (!editingId && !confirmPendingMaps(tournament, t('admin.pending.action.submit'))) return
    setSubmitting(true)
    setSubmitStatus(null)

    try {
      if (editingId && editingSha) {
        const res = await fetch(`/api/tournaments/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament, sha: editingSha }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('admin.update.error'))
        setSubmitStatus({ type: 'success', message: t('admin.update.success', { id: tournament.id }) })
      } else {
        const res = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tournament),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('admin.create.error'))
        setSubmitStatus({ type: 'success', message: t('admin.create.success', { id: tournament.id }) })
      }
      setStagedChanges((current) => {
        const next = { ...current }
        delete next[tournament.id]
        return next
      })
      setSaveSignal((current) => current + 1)
      setFormDirty(false)
      fetchList()
    } catch (e) {
      setSubmitStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleStage = () => {
    if (!tournament) return
    if (editingLegacy) {
      setSubmitStatus({ type: 'error', message: t('admin.base.legacyBlocked') })
      return
    }
    if (!editingId && !confirmPendingMaps(tournament, t('admin.pending.action.stage'))) return
    // 编辑既有文件却没有基准(例如刚被清过草稿) → 拒绝暂存,避免拿不确定的基准提交
    if (editingId && !editingSha) {
      setSubmitStatus({ type: 'error', message: t('admin.base.missing') })
      return
    }
    const entry: StagedEntry = {
      data: tournament,
      baseSha: editingId ? editingSha : null,
      baseline: editingId ? editingBaseline : null,
      legacy: false,
    }
    setStagedChanges((current) => ({ ...current, [tournament.id]: entry }))
    setSubmitStatus({
      type: 'local',
      message: t('admin.stage.success', { id: tournament.id }),
    })
    setSaveSignal((current) => current + 1)
    setFormDirty(false)
  }

  const confirmPendingMaps = (value: Tournament, action: string): boolean => {
    const pending = findPendingMaps(value, { excludeSv: true })
    if (pending.length === 0) return true
    const details = pending
      .map((map) => `${map.roundAbbr} ${map.slot} -> ${map.realType} (BID ${map.beatmapId || '?'})`)
      .join('\n')
    return window.confirm(t('admin.pending.confirm', { action, details }))
  }

  const handleSubmitStaged = async () => {
    const entries = Object.entries(stagedChanges)
    if (entries.length === 0) return

    // 无基准的旧草稿不能悄悄提交 —— 那正是"拿旧 JSON 配新 SHA 覆盖别人改动"的路径。
    const legacyIds = entries.filter(([, entry]) => entry.legacy).map(([id]) => id)
    if (legacyIds.length > 0) {
      setSubmitStatus({ type: 'error', message: t('admin.stage.legacyBlocked', { ids: legacyIds.join(', ') }) })
      return
    }

    const count = entries.length
    // 提交快照:请求期间新加/改写的草稿不能被清掉
    const snapshot = new Map(entries)
    setBatchSubmitting(true)
    setSubmitStatus(null)
    setConflicts([])
    try {
      const res = await fetch('/api/tournaments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: entries.map(([id, entry]) => ({
            id,
            tournament: entry.data,
            baseSha: entry.baseSha,
          })),
          summary: `Batch update tournaments (${count} files)`,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        conflicts?: EditConflict[]
      }

      if (res.status === 409) {
        // 整批未写入:保留全部草稿与当前编辑内容,只把冲突摊开给用户处理
        setConflicts(payload.conflicts ?? [])
        setSubmitStatus({ type: 'error', message: payload.error || t('admin.stage.submitError') })
        return
      }
      if (!res.ok) throw new Error(payload.error || t('admin.stage.submitError'))

      setStagedChanges((current) => {
        const next = { ...current }
        for (const [id, entry] of snapshot) {
          if (next[id] === entry) delete next[id]
        }
        return next
      })
      setConflicts([])
      setSubmitStatus({ type: 'success', message: t('admin.stage.submitSuccess', { n: count }) })
      setSaveSignal((current) => current + 1)
      setFormDirty(false)
      fetchList()
    } catch (error) {
      setSubmitStatus({ type: 'error', message: (error as Error).message })
    } finally {
      setBatchSubmitting(false)
    }
  }

  const handleClearStaged = () => {
    if (!window.confirm(t('admin.stage.clearConfirm'))) return
    setStagedChanges({})
    setSubmitStatus(null)
  }

  // 读取权威版本 + 它当前的 blob sha。编辑基准必须来自这里,不能用构建时的数据包。
  const fetchAuthoritative = useCallback(async (id: string): Promise<{ tournament: Tournament; sha: string } | null> => {
    try {
      const res = await fetch(`/api/tournaments/${id}`)
      if (!res.ok) return null
      const data = (await res.json()) as { tournament?: Tournament; sha?: string }
      if (!data.tournament || typeof data.sha !== 'string' || data.sha === '') return null
      return { tournament: data.tournament, sha: data.sha }
    } catch {
      return null
    }
  }, [])

  const handleStageMapChange = async (change: {
    tournamentId: string
    roundId: string
    roundIndex: number
    slot: string
    beatmapId?: number
    realType: string
  }) => {
    // 未暂存 → 先取权威版本 + 当时的 sha 作为基准(不能用构建时数据包:那是旧数据)。
    let fetchedBase: StagedEntry | null = null
    if (!stagedChanges[change.tournamentId]) {
      const loaded = await fetchAuthoritative(change.tournamentId)
      if (!loaded) {
        setSubmitStatus({ type: 'error', message: t('realTypeMaps.stageFailed', { id: change.tournamentId }) })
        return
      }
      fetchedBase = { data: loaded.tournament, baseSha: loaded.sha, baseline: loaded.tournament, legacy: false }
    }

    let stagedOk = false
    setStagedChanges((current) => {
      // 补丁一律打在**最新的**暂存状态上:连续两次改动同一比赛、或先暂存再改动,
      // 都不会出现后一次覆盖前一次补丁的问题。
      const base = current[change.tournamentId] ?? fetchedBase
      if (!base) return current
      const draft = JSON.parse(JSON.stringify(base.data)) as Tournament
      // Legacy tournament files can reuse a round id (SSR SF/F both use round-8).
      // Prefer the browser-provided index, with the id as a compatibility fallback.
      const round = draft.rounds[change.roundIndex] || draft.rounds.find((item) => item.id === change.roundId)
      const map = round?.maps.find((item) =>
        item.slot === change.slot && (change.beatmapId ? item.beatmapId === change.beatmapId : true),
      )
      if (!map) return current
      map.realType = change.realType
      stagedOk = true
      return { ...current, [change.tournamentId]: { ...base, data: draft } }
    })
    setSubmitStatus(stagedOk
      ? { type: 'local', message: t('realTypeMaps.stagedOne') }
      : { type: 'error', message: t('realTypeMaps.stageFailed', { id: change.tournamentId }) })
  }

  // 把某份草稿导出成 JSON 文件:冲突时先留一份,再决定载入最新版本。
  const handleExportDraft = (id: string) => {
    const entry = stagedChanges[id]
    if (!entry) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(entry.data, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${id}.draft.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setSubmitStatus({ type: 'local', message: t('admin.stage.exported', { id }) })
  }

  // 载入最新版本 = 以权威内容为准重新开始(会先确认)。刻意不做"旧 JSON 配新 SHA 直接提交"。
  const handleReloadLatest = async (id: string) => {
    if (!window.confirm(t('admin.stage.reloadLatestConfirm', { id }))) return
    const loaded = await fetchAuthoritative(id)
    if (!loaded) {
      setSubmitStatus({ type: 'error', message: t('admin.base.loadFailed', { id }) })
      return
    }
    setStagedChanges((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setConflicts((current) => current.filter((conflict) => conflict.id !== id))
    setSubmitStatus({ type: 'local', message: t('admin.stage.reloaded', { id }) })
  }

  const handleTournamentUpdate = useCallback((value: Tournament | null) => {
    setTournament(value)
    setSubmitStatus(null)
  }, [])

  const handleEdit = async (id: string) => {
    const loaded = await fetchAuthoritative(id)
    if (!loaded) {
      alert(t('admin.load.errorAlert'))
      return
    }
    const staged = stagedChanges[id]
    setEditingId(id)
    // 基准快照要和 baseSha 是同一份内容:打开已暂存草稿时优先用草稿自己的 baseline,
    // 否则会出现 baseline=最新内容 / baseSha=旧版本 的不一致。
    setEditingBaseline(staged?.baseline ?? loaded.tournament)
    if (staged?.legacy) {
      // 旧格式草稿没有编辑基准 → 打开仅供查看/导出,保存被拒。
      setEditingSha(null)
      setEditingLegacy(true)
      setEditInitialData(staged.data)
      setSubmitStatus({ type: 'local', message: t('admin.base.legacyNotice') })
    } else if (staged) {
      // 用草稿自己的基准,而不是刚取到的最新 SHA —— 否则就绕过了乐观锁。
      setEditingSha(staged.baseSha)
      setEditingLegacy(false)
      setEditInitialData(staged.data)
      setSubmitStatus(null)
    } else {
      setEditingSha(loaded.sha)
      setEditingLegacy(false)
      setEditInitialData(loaded.tournament)
      setSubmitStatus(null)
    }
    setTab('create')
  }

  const handleDelete = async (id: string, sha: string) => {
    if (!confirm(t('admin.deleteConfirm', { id }))) return
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('admin.delete.error'))
      setSubmitStatus({ type: 'success', message: t('admin.delete.success', { id }) })
      fetchList()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleNewTournament = () => {
    setEditingId(null)
    setEditingSha(null)
    setEditingBaseline(null)
    setEditingLegacy(false)
    setEditInitialData(null)
    setTournament(null)
    setSubmitStatus(null)
  }

  // ---------- 加载中 ----------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-gray-400 dark:text-neutral-500 text-sm">{t('admin.loading')}</div>
      </div>
    )
  }

  // ---------- 未登录 ----------
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-8 w-96">
          <h1 className="text-lg font-bold text-gray-900 dark:text-neutral-100 mb-2">{t('admin.login.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">{t('admin.login.subtitle')}</p>
          <button
            onClick={handleLogin}
            className="w-full px-4 py-2.5 bg-pink-500 text-white rounded-md text-sm font-medium hover:bg-pink-600 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
            {t('admin.login.button')}
          </button>
          <Link href="/" className="block text-center text-xs text-gray-400 dark:text-neutral-500 mt-4 hover:text-purple-600 dark:hover:text-purple-300">
            {t('admin.user.back')}
          </Link>
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-neutral-800">
            <p className="text-xs text-gray-400 dark:text-neutral-500 leading-relaxed">
              {t('admin.login.note')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------- 已登录但无录入权限（readonly）----------
  if (!has('contributor')) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-8 w-96">
          <h1 className="text-lg font-bold text-gray-900 dark:text-neutral-100 mb-2">{t('admin.permission.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mb-1">
            {t('admin.permission.signedIn', { name: user.username, uid: user.uid })}
          </p>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
            {t('admin.permission.role', { role: t(ROLE_LABEL_KEYS[user.role]) })}
          </p>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mb-6 leading-relaxed">
            {t('admin.permission.howto', { uid: user.uid })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleLogout}
              className="flex-1 px-4 py-2 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 rounded-md text-sm font-medium hover:bg-gray-200 dark:hover:bg-neutral-700"
            >
              {t('admin.permission.logout')}
            </button>
            <Link href="/" className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 text-center">
              {t('admin.permission.back')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ---------- 已登录且有权限 ----------
  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => {
        if (key === tab) return
        // 正在 create 栏且有未保存修改时,离开前确认
        if (tab === 'create' && formDirty && key !== 'create') {
          if (!window.confirm(t('admin.leaveUnsaved'))) return
          setFormDirty(false)
        }
        // 正在 upload 栏且有暂存未保存的元数据时,离开前确认
        if (tab === 'upload' && uploadDirty && key !== 'upload') {
          if (!window.confirm(t('admin.leaveUnsaved'))) return
          setUploadDirty(false)
        }
        if (key === 'create') handleNewTournament()
        if (key === 'manage') fetchList()
        setTab(key)
      }}
      className={`px-4 py-2 rounded-md text-sm font-medium ${tab === key ? 'bg-purple-600 text-white' : 'bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 border border-gray-200 dark:border-neutral-700'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-neutral-100">{t('admin.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">{t('admin.subtitle')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-700 dark:text-neutral-200">{user.username}</div>
              <div className="text-xs text-gray-400 dark:text-neutral-500">{t(ROLE_LABEL_KEYS[user.role])} · #{user.uid}</div>
            </div>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200">{t('admin.user.logout')}</button>
            <Link href="/" className="text-sm text-purple-600 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200">{t('admin.user.back')}</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          {tabBtn('create', editingId ? t('admin.tab.editing') : t('admin.tab.create'))}
          {tabBtn('manage', t('admin.tab.manage', { n: existingList.length }))}
          {tabBtn('references', t('admin.tab.references'))}
          {tabBtn('refLadder', t('admin.tab.refLadder'))}
          {tabBtn('difficultyFit', t('admin.tab.difficultyFit'))}
          {tabBtn('upload', t('admin.tab.upload'))}
          {tabBtn('packs', t('admin.tab.packs'))}
          {tabBtn('realTypeMaps', t('admin.tab.realTypeMaps'))}
          {tabBtn('rtConflict', t('admin.tab.rtConflict'))}
          {isAdmin && tabBtn('trash', t('admin.tab.trash'))}
          {isAdmin && tabBtn('admins', t('admin.tab.admins'))}
          {isAdmin && tabBtn('audit', t('admin.tab.audit'))}
        </div>

        {tab === 'create' && (
          <>
            {editingId && (
              <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 flex items-center justify-between">
                <span className="text-sm text-blue-800 dark:text-blue-200">{t('admin.editing.banner', { id: editingId })}</span>
                <button onClick={handleNewTournament} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100">{t('admin.editing.cancel')}</button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TournamentForm
                onUpdate={handleTournamentUpdate}
                initialData={editInitialData}
                saveSignal={saveSignal}
                onDirtyChange={setFormDirty}
                baseSha={editingSha}
                onBaseShaChange={setEditingSha}
              />
              <JsonPreview
                tournament={tournament}
                onSubmit={handleSubmit}
                onStage={handleStage}
                onSubmitStaged={handleSubmitStaged}
                onClearStaged={handleClearStaged}
                submitting={submitting}
                batchSubmitting={batchSubmitting}
                submitStatus={submitStatus}
                isEditing={!!editingId}
                stagedCount={Object.keys(stagedChanges).length}
                legacyStagedIds={Object.entries(stagedChanges).filter(([, entry]) => entry.legacy).map(([id]) => id)}
                conflicts={conflicts}
                onExportDraft={handleExportDraft}
                onReloadLatest={handleReloadLatest}
                currentStaged={!!tournament && !!stagedChanges[tournament.id]}
              />
            </div>
          </>
        )}

        {tab === 'manage' && (
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800">
              <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('admin.list.title')}</h3>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                {isAdmin ? t('admin.list.subtitle.admin') : t('admin.list.subtitle.contributor')}
              </p>
            </div>
            {loadingList && <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admin.loading')}</div>}
            {!loadingList && existingList.length === 0 && (
              <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admin.list.empty')}</div>
            )}
            {!loadingList && existingList.length > 0 && (
              <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                {existingList.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-gray-700 dark:text-neutral-200 font-mono truncate">{item.id}</span>
                      {stagedChanges[item.id] && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-[10px] text-blue-700 dark:text-blue-200">
                          {t('json.stagedCurrent')}
                        </span>
                      )}
                      {stagedChanges[item.id]?.legacy && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-[10px] text-amber-800 dark:text-amber-200">
                          {t('admin.stage.legacyBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(item.id)}
                        className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
                      >
                        {t('admin.list.edit')}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(item.id, item.sha)}
                          className="px-3 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
                        >
                          {t('admin.list.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'references' && <ReferencesEditor />}

        {tab === 'refLadder' && <RefLadderEditor />}

        {tab === 'difficultyFit' && <DifficultyFitTool />}

        {tab === 'upload' && <MapUploader onDirtyChange={setUploadDirty} />}

        {tab === 'packs' && <PackLinksEditor />}

        {tab === 'realTypeMaps' && (
          <RealTypeMapBrowser
            canStage={has('contributor')}
            stagedCount={Object.keys(stagedChanges).length}
            onStageMapChange={handleStageMapChange}
          />
        )}

        {tab === 'rtConflict' && <RealTypeConflictChecker canSave={isAdmin} />}

        {tab === 'trash' && isAdmin && <TrashManager />}
        {tab === 'admins' && isAdmin && <AdminsManager />}
        {tab === 'audit' && isAdmin && <AuditLog />}
      </main>
    </div>
  )
}
