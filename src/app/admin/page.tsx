'use client'

import { useState, useEffect } from 'react'
import { TournamentForm } from '@/components/admin/TournamentForm'
import { JsonPreview } from '@/components/admin/JsonPreview'
import { ReferencesEditor } from '@/components/admin/ReferencesEditor'
import type { Tournament } from '@/lib/types'
import inviteData from '@data/invite-codes.json'

interface TournamentListItem {
  id: string
  sha: string
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [error, setError] = useState('')
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [existingList, setExistingList] = useState<TournamentListItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingSha, setEditingSha] = useState<string | null>(null)
  const [editInitialData, setEditInitialData] = useState<Tournament | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tab, setTab] = useState<'create' | 'manage' | 'references'>('create')
  const [loadingList, setLoadingList] = useState(false)

  const handleVerify = () => {
    if (inviteData.codes.includes(codeInput.trim())) {
      setAuthenticated(true)
      setError('')
    } else {
      setError('邀请码无效')
    }
  }

  const fetchList = async () => {
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
  }

  useEffect(() => {
    if (authenticated) fetchList()
  }, [authenticated])

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
        if (!res.ok) throw new Error('更新失败')
        setSubmitStatus({ type: 'success', message: `已更新 ${tournament.id}，网站将在几分钟内自动重建` })
      } else {
        const res = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tournament),
        })
        if (!res.ok) throw new Error('提交失败')
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
    if (!confirm(`确定要删除 ${id} 吗？此操作不可撤销。`)) return
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha }),
      })
      if (!res.ok) throw new Error('删除失败')
      setSubmitStatus({ type: 'success', message: `已删除 ${id}` })
      fetchList()
    } catch {
      alert('删除失败')
    }
  }

  const handleNewTournament = () => {
    setEditingId(null)
    setEditingSha(null)
    setEditInitialData(null)
    setTournament(null)
    setSubmitStatus(null)
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 w-80">
          <h1 className="text-lg font-bold text-gray-900 mb-2">比赛数据录入</h1>
          <p className="text-sm text-gray-500 mb-6">请输入邀请码以继续</p>
          <input
            type="text"
            value={codeInput}
            onChange={(e) => { setCodeInput(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            placeholder="输入邀请码"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400 mb-3"
          />
          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
          <button
            onClick={handleVerify}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700"
          >
            验证
          </button>
          <a href="/" className="block text-center text-xs text-gray-400 mt-4 hover:text-purple-600">
            ← 返回天梯榜
          </a>
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 leading-relaxed">
              设置邀请码只是为了保证数据不被污染。如果您想添加或修改比赛数据，请在 QQ 上联系我获取邀请码即可！
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">比赛数据管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">添加、编辑或删除比赛数据，提交后自动更新网站</p>
          </div>
          <a href="/" className="text-sm text-purple-600 hover:text-purple-800">
            ← 返回天梯榜
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => { setTab('create'); handleNewTournament() }}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'create' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            {editingId ? '编辑比赛' : '添加比赛'}
          </button>
          <button
            onClick={() => { setTab('manage'); fetchList() }}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'manage' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            管理已有比赛 ({existingList.length})
          </button>
          <button
            onClick={() => setTab('references')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'references' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            参考点管理
          </button>
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
              <p className="text-xs text-gray-400 mt-0.5">点击编辑加载到表单，或直接删除</p>
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
                      <button
                        onClick={() => handleDelete(item.id, item.sha)}
                        className="px-3 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'references' && (
          <ReferencesEditor />
        )}

        {submitStatus && (
          <div className={`mt-4 p-3 rounded-md text-sm ${submitStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {submitStatus.message}
          </div>
        )}
      </main>
    </div>
  )
}
