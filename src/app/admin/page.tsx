'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { TournamentForm } from '@/components/admin/TournamentForm'
import { JsonPreview } from '@/components/admin/JsonPreview'
import { ReferencesEditor } from '@/components/admin/ReferencesEditor'
import { RefLadderEditor } from '@/components/admin/RefLadderEditor'
import { MapUploader } from '@/components/admin/MapUploader'
import { PackLinksEditor } from '@/components/admin/PackLinksEditor'
import { AdminsManager } from '@/components/admin/AdminsManager'
import { TrashManager } from '@/components/admin/TrashManager'
import { AuditLog } from '@/components/admin/AuditLog'
import type { Tournament } from '@/lib/types'
import { useT, type MessageKey } from '@/lib/i18n'

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

type Tab = 'create' | 'manage' | 'references' | 'refLadder' | 'upload' | 'packs' | 'admins' | 'trash' | 'audit'

export default function AdminPage() {
  const t = useT()
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [existingList, setExistingList] = useState<TournamentListItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingSha, setEditingSha] = useState<string | null>(null)
  const [editInitialData, setEditInitialData] = useState<Tournament | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tab, setTab] = useState<Tab>('create')
  const [loadingList, setLoadingList] = useState(false)

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
      fetchList()
    } catch (e) {
      setSubmitStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/tournaments/${id}`)
      if (!res.ok) throw new Error(t('admin.load.error'))
      const { tournament: data, sha } = await res.json()
      setEditingId(id)
      setEditingSha(sha)
      setEditInitialData(data)
      setTab('create')
    } catch {
      alert(t('admin.load.errorAlert'))
    }
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
          {tabBtn('upload', t('admin.tab.upload'))}
          {tabBtn('packs', t('admin.tab.packs'))}
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
              <TournamentForm onUpdate={setTournament} initialData={editInitialData} submitSuccess={submitStatus?.type === 'success'} />
              <JsonPreview
                tournament={tournament}
                onSubmit={handleSubmit}
                submitting={submitting}
                submitStatus={submitStatus}
                isEditing={!!editingId}
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
                    <span className="text-sm text-gray-700 dark:text-neutral-200 font-mono">{item.id}</span>
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

        {tab === 'upload' && <MapUploader />}

        {tab === 'packs' && <PackLinksEditor />}

        {tab === 'trash' && isAdmin && <TrashManager />}
        {tab === 'admins' && isAdmin && <AdminsManager />}
        {tab === 'audit' && isAdmin && <AuditLog />}
      </main>
    </div>
  )
}
