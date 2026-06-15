'use client'

import { useState, useEffect, useCallback } from 'react'
import { useT, type MessageKey } from '@/lib/i18n'

type Role = 'readonly' | 'contributor' | 'admin' | 'owner'

interface AdminItem {
  uid: string
  role: Role
  username: string
  addedBy?: string
  addedAt?: string
  bootstrap?: boolean
}

const ROLE_LABEL_KEYS: Record<Role, MessageKey> = {
  readonly: 'admin.role.readonly',
  contributor: 'admin.role.contributor',
  admin: 'admin.role.admin',
  owner: 'admin.role.owner',
}

const ROLE_DESC_KEYS: Record<Role, MessageKey> = {
  readonly: 'admin.role.desc.readonly',
  contributor: 'admin.role.desc.contributor',
  admin: 'admin.role.desc.admin',
  owner: 'admin.role.desc.owner',
}

const ROLE_BADGE: Record<Role, string> = {
  readonly: 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300',
  contributor: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200',
  admin: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200',
  owner: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200',
}

export function AdminsManager() {
  const t = useT()
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
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setAdmins(data.admins || [])
      setSelf(data.self || null)
    } catch {
      setStatus({ type: 'error', message: t('admins.loadFailed') })
    } finally {
      setLoading(false)
    }
  }, [t])

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
      if (!res.ok) throw new Error(data.error || t('admins.opFailed'))
      setStatus({ type: 'success', message: t('admins.roleSet', { name: username || uid, role: t(ROLE_LABEL_KEYS[role]) }) })
      fetchAdmins()
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const removeAdmin = async (uid: string, username: string) => {
    if (!confirm(t('admins.removeConfirm', { name: username || uid }))) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('admins.removeFailed'))
      setStatus({ type: 'success', message: t('admins.removed', { name: username || uid }) })
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
      setStatus({ type: 'error', message: t('admins.uidNotNumeric') })
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
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('admins.title')}</h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
          {isOwner ? t('admins.subtitle.owner') : t('admins.subtitle.admin')}
        </p>
      </div>

      {status && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs ${status.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200'}`}>
          {status.message}
        </div>
      )}

      {/* 新增管理员 */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/50">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-1">{t('admins.uid')}</label>
            <input
              type="text"
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
              placeholder={t('admins.uid.placeholder')}
              className="w-32 px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-1">{t('admins.username')}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('admins.username.placeholder')}
              className="w-32 px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-400 mb-1">{t('admins.role')}</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Exclude<Role, 'readonly' | 'owner'>)}
              className="px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
            >
              <option value="contributor">{t('admin.role.contributor')}</option>
              {isOwner && <option value="admin">{t('admin.role.admin')}</option>}
            </select>
          </div>
          <button
            onClick={addAdmin}
            disabled={busy}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {t('admins.add')}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mt-2">
          {t('admins.uidHintPrefix')}<strong>1234567</strong>
        </p>
      </div>

      {loading && <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admin.loading')}</div>}

      {!loading && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {admins.map((item) => (
            <div key={item.uid} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/40">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[item.role]}`}>
                  {t(ROLE_LABEL_KEYS[item.role])}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 dark:text-neutral-100 truncate">
                    {item.username}
                    <span className="text-gray-400 dark:text-neutral-500 font-mono ml-2">#{item.uid}</span>
                    {item.bootstrap && <span className="ml-2 text-xs text-purple-500 dark:text-purple-300">{t('admins.bootstrap')}</span>}
                    {self && item.uid === self.uid && <span className="ml-2 text-xs text-gray-400 dark:text-neutral-500">{t('admins.you')}</span>}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-neutral-500">{t(ROLE_DESC_KEYS[item.role])}</div>
                </div>
              </div>

              {canManageTarget(item) && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={item.role}
                    onChange={(e) => setRole(item.uid, item.username, e.target.value as Role)}
                    disabled={busy}
                    className="px-2 py-1 border border-gray-300 dark:border-neutral-700 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
                  >
                    {/* 当前角色始终可见 */}
                    {!assignableRoles.includes(item.role) && (
                      <option value={item.role}>{t(ROLE_LABEL_KEYS[item.role])}</option>
                    )}
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeAdmin(item.uid, item.username)}
                    disabled={busy}
                    className="px-2.5 py-1 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50"
                  >
                    {t('admins.remove')}
                  </button>
                </div>
              )}
            </div>
          ))}
          {admins.length === 0 && (
            <div className="p-8 text-center text-gray-400 dark:text-neutral-500 text-sm">{t('admins.empty')}</div>
          )}
        </div>
      )}
    </div>
  )
}
