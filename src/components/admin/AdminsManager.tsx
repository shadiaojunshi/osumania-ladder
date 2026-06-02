'use client'

import { useState, useEffect, useCallback } from 'react'

type Role = 'readonly' | 'contributor' | 'admin' | 'owner'

interface AdminItem {
  uid: string
  role: Role
  username: string
  addedBy?: string
  addedAt?: string
  bootstrap?: boolean
}

const ROLE_LABELS: Record<Role, string> = {
  readonly: '普通用户',
  contributor: '普通管理员',
  admin: '管理员',
  owner: '站长',
}

const ROLE_DESC: Record<Role, string> = {
  readonly: '仅浏览',
  contributor: '可新增/编辑比赛、上传谱面，不能删除',
  admin: '可删除、管理回收站、管理普通管理员',
  owner: '最高权限，可管理所有人',
}

const ROLE_BADGE: Record<Role, string> = {
  readonly: 'bg-gray-100 text-gray-600',
  contributor: 'bg-green-50 text-green-700',
  admin: 'bg-blue-50 text-blue-700',
  owner: 'bg-purple-100 text-purple-700',
}

export function AdminsManager() {
  const [admins, setAdmins] = useState<AdminItem[]>([])
  const [self, setSelf] = useState<{ uid: string; role: Role } | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // 新增表单
  const [newUid, setNewUid] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<Exclude<Role, 'readonly' | 'owner'>>('contributor')

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admins')
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setAdmins(data.admins || [])
      setSelf(data.self || null)
    } catch {
      setStatus({ type: 'error', message: '加载管理员名单失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  // 当前用户是否能把别人提升为 admin/owner
  const isOwner = self?.role === 'owner'

  const setRole = async (uid: string, username: string, role: Role) => {
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, username, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '操作失败')
      setStatus({ type: 'success', message: `已将 ${username || uid} 设为 ${ROLE_LABELS[role]}` })
      fetchAdmins()
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const removeAdmin = async (uid: string, username: string) => {
    if (!confirm(`确定移除 ${username || uid} 的管理权限吗？（降为普通用户）`)) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '移除失败')
      setStatus({ type: 'success', message: `已移除 ${username || uid}` })
      fetchAdmins()
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const addAdmin = async () => {
    const uid = newUid.trim()
    if (!/^\d+$/.test(uid)) {
      setStatus({ type: 'error', message: 'osu 用户 ID 必须是数字' })
      return
    }
    await setRole(uid, newName.trim(), newRole)
    setNewUid('')
    setNewName('')
    setNewRole('contributor')
  }

  // caller 能否管理某个目标行
  const canManageTarget = (item: AdminItem): boolean => {
    if (item.bootstrap) return false
    if (self && item.uid === self.uid) return false
    const involvesAdminTier = item.role === 'owner' || item.role === 'admin'
    if (involvesAdminTier) return isOwner
    return true // readonly/contributor 目标，admin 即可管理
  }

  // 当前用户可以授予的角色选项
  const assignableRoles: Role[] = isOwner
    ? ['contributor', 'admin', 'owner']
    : ['contributor']

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900">管理员管理</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          通过 osu 用户 ID 授权。{isOwner ? '你是站长，可管理所有角色。' : '你是管理员，可管理普通管理员。'}
        </p>
      </div>

      {status && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {status.message}
        </div>
      )}

      {/* 新增管理员 */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">osu 用户 ID</label>
            <input
              type="text"
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
              placeholder="例如 1234567"
              className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">用户名（可选）</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="备注名"
              className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">角色</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Exclude<Role, 'readonly' | 'owner'>)}
              className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-400"
            >
              <option value="contributor">普通管理员</option>
              {isOwner && <option value="admin">管理员</option>}
            </select>
          </div>
          <button
            onClick={addAdmin}
            disabled={busy}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            添加
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          osu 用户 ID 在个人主页 URL 里：osu.ppy.sh/users/<strong>1234567</strong>
        </p>
      </div>

      {loading && <div className="p-8 text-center text-gray-400 text-sm">加载中...</div>}

      {!loading && (
        <div className="divide-y divide-gray-100">
          {admins.map((item) => (
            <div key={item.uid} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[item.role]}`}>
                  {ROLE_LABELS[item.role]}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 truncate">
                    {item.username}
                    <span className="text-gray-400 font-mono ml-2">#{item.uid}</span>
                    {item.bootstrap && <span className="ml-2 text-xs text-purple-500">（站长本人）</span>}
                    {self && item.uid === self.uid && <span className="ml-2 text-xs text-gray-400">（你）</span>}
                  </div>
                  <div className="text-xs text-gray-400">{ROLE_DESC[item.role]}</div>
                </div>
              </div>

              {canManageTarget(item) && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={item.role}
                    onChange={(e) => setRole(item.uid, item.username, e.target.value as Role)}
                    disabled={busy}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-purple-400"
                  >
                    {/* 当前角色始终可见 */}
                    {!assignableRoles.includes(item.role) && (
                      <option value={item.role}>{ROLE_LABELS[item.role]}</option>
                    )}
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeAdmin(item.uid, item.username)}
                    disabled={busy}
                    className="px-2.5 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                  >
                    移除
                  </button>
                </div>
              )}
            </div>
          ))}
          {admins.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">暂无管理员</div>
          )}
        </div>
      )}
    </div>
  )
}
