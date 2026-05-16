'use client'

import { useState } from 'react'
import type { Tournament } from '@/lib/types'

interface Props {
  tournament: Tournament | null
  onSubmit?: () => void
  submitting?: boolean
  submitStatus?: { type: 'success' | 'error'; message: string } | null
  isEditing?: boolean
}

export function JsonPreview({ tournament, onSubmit, submitting, submitStatus, isEditing }: Props) {
  const [copied, setCopied] = useState(false)

  if (!tournament) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sticky top-6">
        <div className="text-center text-gray-400 text-sm">
          <p className="mb-2">填写左侧表单后，JSON 预览将显示在这里</p>
          <p className="text-xs">完成后点击提交，数据将自动更新到网站</p>
        </div>
      </div>
    )
  }

  const json = JSON.stringify(tournament, null, 2)
  const filename = `${tournament.id}.json`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col max-h-[calc(100vh-180px)] sticky top-6">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-medium text-gray-900">JSON 预览</h3>
          <p className="text-xs text-gray-400 mt-0.5">{filename}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">
          {json}
        </pre>
      </div>

      <div className="border-t border-gray-200 px-4 py-3 shrink-0 space-y-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? '提交中...' : isEditing ? '更新比赛数据' : '提交新比赛'}
        </button>
        <p className="text-xs text-gray-400 text-center">
          提交后会自动 commit 到 GitHub 并触发网站重建
        </p>
      </div>
    </div>
  )
}
