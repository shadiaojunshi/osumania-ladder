'use client'

import { useState } from 'react'
import { TournamentForm } from '@/components/admin/TournamentForm'
import { JsonPreview } from '@/components/admin/JsonPreview'
import type { Tournament } from '@/lib/types'
import inviteData from '@data/invite-codes.json'

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [error, setError] = useState('')
  const [tournament, setTournament] = useState<Tournament | null>(null)

  const handleVerify = () => {
    if (inviteData.codes.includes(codeInput.trim())) {
      setAuthenticated(true)
      setError('')
    } else {
      setError('邀请码无效')
    }
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
            <h1 className="text-xl font-bold text-gray-900">比赛数据录入</h1>
            <p className="text-sm text-gray-500 mt-0.5">填写比赛信息，生成 JSON 数据文件</p>
          </div>
          <a href="/" className="text-sm text-purple-600 hover:text-purple-800">
            ← 返回天梯榜
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TournamentForm onUpdate={setTournament} />
          <JsonPreview tournament={tournament} />
        </div>
      </main>
    </div>
  )
}
