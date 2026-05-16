'use client'

import { useState } from 'react'
import type { Tournament } from '@/lib/types'

interface Props {
  tournament: Tournament | null
}

export function JsonPreview({ tournament }: Props) {
  const [copied, setCopied] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!tournament) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sticky top-6">
        <div className="text-center text-gray-400 text-sm">
          <p className="mb-2">填写左侧表单后，JSON 预览将显示在这里</p>
          <p className="text-xs">生成的 JSON 可以直接提交到 GitHub 仓库</p>
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

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSubmit = () => {
    handleDownload()
    setSubmitted(true)
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

      <div className="border-t border-gray-200 px-4 py-3 shrink-0 space-y-3">
        <button
          onClick={handleSubmit}
          className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700"
        >
          下载并提交
        </button>

        {submitted && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3 text-xs text-green-800 space-y-1">
            <p className="font-medium">JSON 文件已下载，接下来：</p>
            <ol className="list-decimal list-inside space-y-0.5 text-green-700">
              <li>将文件放到仓库的 <code className="bg-green-100 px-1 rounded">data/tournaments/</code> 目录</li>
              <li>在 <code className="bg-green-100 px-1 rounded">LadderView.tsx</code> 中 import 并添加到 tournaments 数组</li>
              <li>提交 PR 或直接 push（如果你有权限）</li>
            </ol>
          </div>
        )}

        {!submitted && (
          <p className="text-xs text-gray-400 text-center">
            点击提交后会下载 JSON 文件，按提示操作即可更新网站
          </p>
        )}
      </div>
    </div>
  )
}
