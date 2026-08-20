'use client'

import { useState } from 'react'
import type { Tournament } from '@/lib/types'
import { useT } from '@/lib/i18n'

interface Props {
  tournament: Tournament | null
  onSubmit?: () => void
  onStage?: () => void
  onSubmitStaged?: () => void
  onClearStaged?: () => void
  submitting?: boolean
  batchSubmitting?: boolean
  submitStatus?: { type: 'success' | 'error' | 'local'; message: string } | null
  isEditing?: boolean
  stagedCount?: number
  currentStaged?: boolean
}

export function JsonPreview({
  tournament,
  onSubmit,
  onStage,
  onSubmitStaged,
  onClearStaged,
  submitting,
  batchSubmitting,
  submitStatus,
  isEditing,
  stagedCount = 0,
  currentStaged = false,
}: Props) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  if (!tournament) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-6 sticky top-6 space-y-5">
        <div className="text-center text-gray-400 dark:text-neutral-500 text-sm py-4">
          <p className="mb-2">{t('json.empty.line1')}</p>
          <p className="text-xs">{t('json.empty.line2')}</p>
        </div>
        <StagedActions
          count={stagedCount}
          submitting={batchSubmitting}
          disabled={submitting || batchSubmitting}
          onSubmit={onSubmitStaged}
          onClear={onClearStaged}
        />
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
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm flex flex-col max-h-[calc(100vh-180px)] sticky top-6">
      <div className="border-b border-gray-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{t('json.title')}</h3>
            {currentStaged && (
              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-[10px] text-blue-700 dark:text-blue-200">
                {t('json.stagedCurrent')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{filename}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 rounded hover:bg-gray-200 dark:hover:bg-neutral-700"
          >
            {copied ? t('json.copied') : t('json.copy')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs font-mono text-gray-700 dark:text-neutral-300 whitespace-pre-wrap break-all">
          {json}
        </pre>
      </div>

      <div className="border-t border-gray-200 dark:border-neutral-800 px-4 py-3 shrink-0 space-y-2">
        {submitStatus && (
          <div className={`p-2.5 rounded-md text-sm text-center ${
            submitStatus.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800'
              : submitStatus.type === 'local'
                ? 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800'
                : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800'
          }`}>
            {submitStatus.message}
          </div>
        )}
        <button
          onClick={onSubmit}
          disabled={submitting || batchSubmitting}
          className={`w-full px-4 bg-purple-600 text-white rounded-md font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed ${
            isEditing ? 'py-2.5 text-sm' : 'py-3.5 text-base'
          }`}
        >
          {submitting ? t('json.submitting') : isEditing ? t('json.update') : t('json.create')}
        </button>
        <button
          onClick={onStage}
          disabled={submitting || batchSubmitting}
          className="w-full px-4 py-2.5 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-200 rounded-md text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {currentStaged ? t('json.stageUpdate') : t('json.stage')}
        </button>
        {!isEditing && (
          <p className="text-xs text-purple-700 dark:text-purple-300 text-center">
            {t('json.createRecommendation')}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-neutral-500 text-center">
          {t('json.note')}
        </p>
        <StagedActions
          count={stagedCount}
          submitting={batchSubmitting}
          disabled={submitting || batchSubmitting}
          onSubmit={onSubmitStaged}
          onClear={onClearStaged}
        />
      </div>
    </div>
  )
}

function StagedActions({
  count,
  submitting,
  disabled,
  onSubmit,
  onClear,
}: {
  count: number
  submitting?: boolean
  disabled?: boolean
  onSubmit?: () => void
  onClear?: () => void
}) {
  const t = useT()
  if (count <= 0) return null

  return (
    <div className="border-t border-gray-200 dark:border-neutral-800 pt-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs font-medium text-gray-700 dark:text-neutral-200">
          {t('json.stagedCount', { n: count })}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-[11px] text-gray-400 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-50"
        >
          {t('json.stagedClear')}
        </button>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? t('json.stagedSubmitting') : t('json.stagedSubmit', { n: count })}
      </button>
      <p className="mt-1.5 text-[11px] text-gray-400 dark:text-neutral-500 text-center">
        {t('json.stagedNote')}
      </p>
    </div>
  )
}
