'use client'

import { useState, useEffect, useCallback } from 'react'
import { TournamentForm } from '@/components/admin/TournamentForm'
import { JsonPreview } from '@/components/admin/JsonPreview'
import { ReferencesEditor } from '@/components/admin/ReferencesEditor'
import { MapUploader } from '@/components/admin/MapUploader'
import { PackLinksEditor } from '@/components/admin/PackLinksEditor'
import { AdminsManager } from '@/components/admin/AdminsManager'
import { TrashManager } from '@/components/admin/TrashManager'
import { AuditLog } from '@/components/admin/AuditLog'
import type { Tournament } from '@/lib/types'

type Role = 'readonly' | 'contributor' | 'admin' | 'owner'

const ROLE_RANK: Record<Role, number> = { readonly: 0, contributor: 1, admin: 2, owner: 3 }
const ROLE_LABELS: Record<Role, string> = {
  readonly: '普通用户',
  contributor: '普通管理员',
  admin: '管理员',
  owner: '站长',
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

type Tab = 'create' | 'manage' | 'references' | 'upload' | 'packs' | 'admins' | 'trash' | 'audit'

export default function AdminPage() {
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
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '更新失败')
        setSubmitStatus({ type: 'success', message: `已更新 ${tournament.id}，网站将在几分钟内自动重建` })
      } else {
        const res = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tournament),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '提交失败')
        setSubmitStatus({ type: 'success', message: `已提交 ${tournament.id}，网站将在几分钟内自动重建` })
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
      if (!res.ok) throw new Error('加载失败')
      const { tournament: data, sha } = await res.json()
      setEditingId(id)
      setEditingSha(sha)
      setEditInitialData(data)
      setTab('create')
    } catch {
      alert('加载比赛数据失败')
    }
  }

  const handleDelete = async (id: string, sha: string) => {
    if (!confirm(`确定要删除 ${id} 吗？将移入回收站，30 天内可恢复。`)) return
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '删除失败')
      setSubmitStatus({ type: 'success', message: `已删除 ${id}（已移入回收站）` })
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    )
  }

  // ---------- 未登录 ----------
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 w-96">
          <h1 className="text-lg font-bold text-gray-900 mb-2">比赛数据录入</h1>
          <p className="text-sm text-gray-500 mb-6">使用 osu! 账号登录以继续</p>
          <button
            onClick={handleLogin}
            className="w-full px-4 py-2.5 bg-pink-500 text-white rounded-md text-sm font-medium hover:bg-pink-600 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
            使用 osu! 登录
          </button>
          <a href="/" className="block text-center text-xs text-gray-400 mt-4 hover:text-purple-600">
            ← 返回天梯榜
          </a>
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 leading-relaxed">
              登录后，普通用户仅可浏览。如需添加或编辑比赛数据，请在 QQ 上联系站长获取权限。
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------- 已登录但无录入权限（readonly）----------
  if (!has('contributor')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 w-96">
          <h1 className="text-lg font-bold text-gray-900 mb-2">权限不足</h1>
          <p className="text-sm text-gray-500 mb-1">
            你已登录为 <strong>{user.username}</strong>（#{user.uid}）
          </p>
          <p className="text-sm text-gray-500 mb-6">
            当前角色：{ROLE_LABELS[user.role]}。需要管理员授权才能录入数据。
          </p>
          <p className="text-xs text-gray-400 mb-6 leading-relaxed">
            请把你的 osu 用户 ID <strong className="font-mono">{user.uid}</strong> 发给站长，由站长在后台授权。
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleLogout}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200"
            >
              退出登录
            </button>
            <a href="/" className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 text-center">
              返回天梯榜
            </a>
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
      className={`px-4 py-2 rounded-md text-sm font-medium ${tab === key ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">比赛数据管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">添加、编辑或删除比赛数据，提交后自动更新网站</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-700">{user.username}</div>
              <div className="text-xs text-gray-400">{ROLE_LABELS[user.role]} · #{user.uid}</div>
            </div>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">退出</button>
            <a href="/" className="text-sm text-purple-600 hover:text-purple-800">← 返回天梯榜</a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          {tabBtn('create', editingId ? '编辑比赛' : '添加比赛')}
          {tabBtn('manage', `管理已有比赛 (${existingList.length})`)}
          {tabBtn('references', '参考点管理')}
          {tabBtn('upload', '上传谱面')}
          {tabBtn('packs', '合包管理')}
          {isAdmin && tabBtn('trash', '回收站')}
          {isAdmin && tabBtn('admins', '管理员管理')}
          {isAdmin && tabBtn('audit', '操作日志')}
        </div>

        {tab === 'create' && (
          <>
            {editingId && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center justify-between">
                <span className="text-sm text-blue-800">正在编辑: <strong>{editingId}</strong></span>
                <button onClick={handleNewTournament} className="text-xs text-blue-600 hover:text-blue-800">取消编辑，新建比赛</button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TournamentForm onUpdate={setTournament} initialData={editInitialData} />
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
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">已有比赛列表</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                点击编辑加载到表单{isAdmin ? '，或删除（移入回收站）' : ''}
              </p>
            </div>
            {loadingList && <div className="p-8 text-center text-gray-400 text-sm">加载中...</div>}
            {!loadingList && existingList.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">暂无比赛数据</div>
            )}
            {!loadingList && existingList.length > 0 && (
              <div className="divide-y divide-gray-100">
                {existingList.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                    <span className="text-sm text-gray-700 font-mono">{item.id}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(item.id)}
                        className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                      >
                        编辑
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(item.id, item.sha)}
                          className="px-3 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100"
                        >
                          删除
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

        {tab === 'upload' && (
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <MapUploader />
          </div>
        )}

        {tab === 'packs' && (
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <PackLinksEditor />
          </div>
        )}

        {tab === 'trash' && isAdmin && <TrashManager />}
        {tab === 'admins' && isAdmin && <AdminsManager />}
        {tab === 'audit' && isAdmin && <AuditLog />}
      </main>
    </div>
  )
}
