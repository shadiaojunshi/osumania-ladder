'use client'

import { useState, useEffect, useCallback } from 'react'
import JSZip from 'jszip'
import { useT } from '@/lib/i18n'

interface MapInfo {
  slot: string
  type: string
  name?: string
  beatmapsetId?: number
}

interface TournamentRounds {
  id: string
  rounds: { id: string; abbreviation: string; maps: MapInfo[] }[]
}

const NSV_ELIGIBLE_EXCLUDED = new Set(['RC', 'LN', 'HB', 'TB'])
function isNsvEligible(type: string): boolean {
  return !NSV_ELIGIBLE_EXCLUDED.has(type)
}

const MAX_SIZE = 100 * 1024 * 1024

export function MapUploader() {
  const t = useT()
  const [tournaments, setTournaments] = useState<{ id: string }[]>([])
  const [selectedTournament, setSelectedTournament] = useState<string>('')
  const [tournamentData, setTournamentData] = useState<TournamentRounds | null>(null)
  const [uploadedSlots, setUploadedSlots] = useState<Set<string>>(new Set())
  const [uploadedNsvSlots, setUploadedNsvSlots] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<Record<string, 'success' | 'error'>>({})

  useEffect(() => {
    fetch('/api/tournaments').then(r => r.json()).then(setTournaments).catch(() => {})
  }, [])

  const loadTournament = async (id: string) => {
    setSelectedTournament(id)
    if (!id) { setTournamentData(null); return }
    setLoading(true)
    try {
      const [tourRes, statusRes] = await Promise.all([
        fetch(`/api/tournaments/${id}`),
        fetch(`/api/maps/status?tournamentId=${id}`),
      ])
      if (!tourRes.ok) throw new Error()
      const { tournament } = await tourRes.json()
      setTournamentData(tournament)
      if (statusRes.ok) {
        const { uploaded, uploadedNsv } = await statusRes.json()
        setUploadedSlots(new Set((uploaded as string[]) || []))
        setUploadedNsvSlots(new Set((uploadedNsv as string[]) || []))
      }
    } catch {
      setTournamentData(null)
    } finally {
      setLoading(false)
    }
  }

  const cellKey = (roundId: string, slot: string, isNsv: boolean) =>
    `${roundId}/${slot}${isNsv ? '#nsv' : ''}`

  const uploadFile = useCallback(async (roundId: string, slot: string, file: File, isNsv: boolean) => {
    const key = cellKey(roundId, slot, isNsv)
    setUploading(prev => ({ ...prev, [key]: true }))
    setStatus(prev => { const n = { ...prev }; delete n[key]; return n })

    try {
      if (!file.name.endsWith('.osz')) return

      if (file.size > MAX_SIZE) {
        setStatus(prev => ({ ...prev, [key]: 'error' }))
        alert(t('mapUpload.alert.fileTooBig', { n: MAX_SIZE / 1024 / 1024 }))
        return
      }

      const formData = new FormData()
      formData.append('tournamentId', selectedTournament)
      formData.append('roundId', roundId)
      formData.append('slot', slot)
      formData.append('file', file)
      if (isNsv) formData.append('nsv', '1')

      const res = await fetch('/api/maps/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()

      setStatus(prev => ({ ...prev, [key]: 'success' }))
      const setKey = `${roundId}/${slot}`
      if (isNsv) setUploadedNsvSlots(prev => new Set([...prev, setKey]))
      else setUploadedSlots(prev => new Set([...prev, setKey]))
    } catch {
      setStatus(prev => ({ ...prev, [key]: 'error' }))
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }))
    }
  }, [selectedTournament])

  const uploadThreeFiles = useCallback(async (roundId: string, slot: string, osuFile: File, audioFile: File, bgFile: File, isNsv: boolean) => {
    const totalSize = osuFile.size + audioFile.size + bgFile.size
    if (totalSize > MAX_SIZE) {
      alert(t('mapUpload.alert.totalTooBig', { n: MAX_SIZE / 1024 / 1024 }))
      return
    }
    const zip = new JSZip()
    zip.file(osuFile.name, osuFile)
    zip.file(audioFile.name, audioFile)
    zip.file(bgFile.name, bgFile)
    const blob = await zip.generateAsync({ type: 'blob' })
    const oszFile = new File([blob], `${slot}${isNsv ? '.nsv' : ''}.osz`, { type: 'application/octet-stream' })
    await uploadFile(roundId, slot, oszFile, isNsv)
  }, [uploadFile])

  const deleteFile = useCallback(async (roundId: string, slot: string, isNsv: boolean) => {
    const setKey = `${roundId}/${slot}`
    const cKey = cellKey(roundId, slot, isNsv)
    if (!confirm(t('mapUpload.confirm.delete', { slot, nsvSuffix: isNsv ? ' (NSV)' : '' }))) return
    try {
      const res = await fetch('/api/maps/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selectedTournament, roundId, slot, nsv: isNsv }),
      })
      if (!res.ok) throw new Error()
      if (isNsv) setUploadedNsvSlots(prev => { const n = new Set(prev); n.delete(setKey); return n })
      else setUploadedSlots(prev => { const n = new Set(prev); n.delete(setKey); return n })
      setStatus(prev => { const n = { ...prev }; delete n[cKey]; return n })
    } catch {
      alert(t('mapUpload.alert.deleteFailed'))
    }
  }, [selectedTournament])

  const totalMaps = tournamentData?.rounds.reduce((s, r) => s + r.maps.length, 0) || 0
  const uploadedCount = uploadedSlots.size

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100 mb-3">{t('mapUpload.title')}</h3>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mb-4">{t('mapUpload.subtitle', { n: MAX_SIZE / 1024 / 1024 })}</p>

        <select
          value={selectedTournament}
          onChange={(e) => loadTournament(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-purple-400"
        >
          <option value="">{t('mapUpload.selectTournament')}</option>
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.id}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center text-gray-400 dark:text-neutral-500 text-sm py-8">{t('mapUpload.loading')}</div>}

      {tournamentData && !loading && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">{tournamentData.id}</h3>
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              {t('mapUpload.uploadedSummary', { ok: uploadedCount, total: totalMaps })}
            </span>
          </div>

          <div className="space-y-4">
            {tournamentData.rounds.map(round => (
              <RoundUploadSection
                key={round.id}
                round={round}
                uploadedSlots={uploadedSlots}
                uploadedNsvSlots={uploadedNsvSlots}
                uploading={uploading}
                status={status}
                onUploadOsz={uploadFile}
                onUploadThree={uploadThreeFiles}
                onDelete={deleteFile}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RoundUploadSection({
  round,
  uploadedSlots,
  uploadedNsvSlots,
  uploading,
  status,
  onUploadOsz,
  onUploadThree,
  onDelete,
}: {
  round: { id: string; abbreviation: string; maps: MapInfo[] }
  uploadedSlots: Set<string>
  uploadedNsvSlots: Set<string>
  uploading: Record<string, boolean>
  status: Record<string, 'success' | 'error'>
  onUploadOsz: (roundId: string, slot: string, file: File, isNsv: boolean) => Promise<void> | void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File, isNsv: boolean) => void
  onDelete: (roundId: string, slot: string, isNsv: boolean) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const [bulkErrors, setBulkErrors] = useState<{ slot: string; msg: string }[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const uploadedInRound = round.maps.filter(m => uploadedSlots.has(`${round.id}/${m.slot}`)).length

  const eligibleForBulk = round.maps.filter(
    m => m.beatmapsetId && !uploadedSlots.has(`${round.id}/${m.slot}`)
  )

  // "贴 BID 补传"在本轮有任何图时都允许打开 — 可以补漏,也可以覆盖已传的图。
  // 显示数字优先用"待补",没待补就用"全部"提示可走覆盖路径。
  const unuploadedInRound = round.maps.filter(
    m => !uploadedSlots.has(`${round.id}/${m.slot}`)
  )
  const pasteBadge =
    unuploadedInRound.length > 0 ? `${unuploadedInRound.length}` : t('mapUpload.round.allOverride', { n: round.maps.length })

  const startBulkAuto = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (bulkRunning || eligibleForBulk.length === 0) return
    setBulkRunning(true)
    setBulkProgress({ done: 0, total: eligibleForBulk.length })
    const errors: { slot: string; msg: string }[] = []
    for (let i = 0; i < eligibleForBulk.length; i++) {
      const m = eligibleForBulk[i]
      try {
        const expectedVersion = extractVersionFromName(m.name)
        const result = await autoDownloadAndTrim(m.beatmapsetId!, expectedVersion, m.slot, false, t)
        if (result.needsManualSelect) {
          errors.push({ slot: m.slot, msg: t('mapUpload.bulk.multiDiff') })
        } else {
          await onUploadOsz(round.id, m.slot, result.file, false)
        }
      } catch (err) {
        errors.push({ slot: m.slot, msg: err instanceof Error ? err.message : String(err) })
      }
      setBulkProgress({ done: i + 1, total: eligibleForBulk.length })
      await new Promise(r => setTimeout(r, 200))
    }
    setBulkErrors(errors)
    setBulkRunning(false)
  }

  return (
    <div className="border border-gray-100 dark:border-neutral-800 rounded-md">
      <div className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/40">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">{round.abbreviation}</span>
          <span className="text-xs text-gray-400 dark:text-neutral-500">
            {t('mapUpload.round.count', { ok: uploadedInRound, total: round.maps.length })}
            {uploadedInRound === round.maps.length && ' ✓'}
          </span>
        </button>
        {round.maps.length > 0 && !bulkRunning && (
          <button
            onClick={(e) => { e.stopPropagation(); setPasteOpen(true) }}
            className="ml-3 px-2 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 shrink-0"
            title={t('mapUpload.paste.title')}
          >
            {t('mapUpload.paste.button', { badge: pasteBadge })}
          </button>
        )}
        {eligibleForBulk.length > 0 && (
          <button
            onClick={startBulkAuto}
            disabled={bulkRunning}
            className="ml-2 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 disabled:opacity-50 shrink-0"
            title={t('mapUpload.auto.title', { n: eligibleForBulk.length })}
          >
            {bulkRunning ? t('mapUpload.auto.running', { done: bulkProgress.done, total: bulkProgress.total }) : t('mapUpload.auto.button', { n: eligibleForBulk.length })}
          </button>
        )}
      </div>

      {bulkErrors.length > 0 && !bulkRunning && (
        <div className="px-3 py-1.5 text-xs text-yellow-700 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900/30 border-t border-yellow-200 dark:border-yellow-800">
          {t('mapUpload.auto.failedSummary', { n: bulkErrors.length, errors: bulkErrors.map(e => `${e.slot}(${e.msg})`).join('，') })}
        </div>
      )}

      {pasteOpen && (
        <PasteBidPanel
          roundId={round.id}
          roundMaps={round.maps}
          uploadedSlots={uploadedSlots}
          onClose={() => setPasteOpen(false)}
          onUploadOsz={onUploadOsz}
        />
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {round.maps.map(map => (
            <MapUploadRow
              key={map.slot}
              slot={map.slot}
              type={map.type}
              name={map.name}
              beatmapsetId={map.beatmapsetId}
              roundId={round.id}
              isUploaded={uploadedSlots.has(`${round.id}/${map.slot}`)}
              isNsvUploaded={uploadedNsvSlots.has(`${round.id}/${map.slot}`)}
              uploading={uploading}
              status={status}
              onUploadOsz={onUploadOsz}
              onUploadThree={onUploadThree}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// "贴 BID 补传":两阶段流程 — 解析 → review(可改 slot 指派 / 选择是否覆盖已上传) → 跑。
// TB1↔TB 等价(normTbSlot);未匹配 slot 给 select 让用户手动指派到本轮某个未补 slot,
// 或选"跳过"。"包含已上传(覆盖)"勾上后允许已上传 slot 也被分配,R2 直接覆盖原文件。
function normTbSlot(s: string): string {
  const up = s.toUpperCase().trim()
  return up === 'TB1' ? 'TB' : up
}

function PasteBidPanel({
  roundId,
  roundMaps,
  uploadedSlots,
  onClose,
  onUploadOsz,
}: {
  roundId: string
  roundMaps: MapInfo[]
  uploadedSlots: Set<string>
  onClose: () => void
  onUploadOsz: (roundId: string, slot: string, file: File, isNsv: boolean) => Promise<void> | void
}) {
  type RowState = 'pending' | 'fetching' | 'downloading' | 'uploading' | 'ok' | 'error' | 'skip'
  interface Row {
    rawSlot: string
    rawMapId: string
    assignedSlot: string // '' = 跳过
    state: RowState
    msg?: string
  }
  type Phase = 'input' | 'review' | 'run'

  const t = useT()
  const [phase, setPhase] = useState<Phase>('input')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [includeUploaded, setIncludeUploaded] = useState(false)
  const [running, setRunning] = useState(false)

  // 本轮全部 slot 的 normalize 映射:贴进来的 slot 用 normTbSlot 之后跟它比对,
  // 找到原始 slot(可能是 TB1)。
  const slotByNorm = new Map<string, string>()
  for (const m of roundMaps) slotByNorm.set(normTbSlot(m.slot), m.slot)
  const allRoundSlots = roundMaps.map((m) => m.slot)
  const unuploadedSlots = roundMaps
    .filter((m) => !uploadedSlots.has(`${roundId}/${m.slot}`))
    .map((m) => m.slot)

  const parse = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 200) {
      alert(t('mapUpload.paste.alertTooMany'))
      return
    }
    const parsed: Row[] = []
    const usedAssigned = new Set<string>()
    for (const line of lines) {
      const parts = line.split(/\s*\t\s*|\s{2,}|\s+/).filter(Boolean)
      if (parts.length < 2) {
        parsed.push({ rawSlot: parts[0] || line, rawMapId: '', assignedSlot: '', state: 'error', msg: t('mapUpload.paste.errMissing') })
        continue
      }
      const rawSlot = parts[0]
      const idRaw = parts.slice(1).join(' ')
      let mapId: string | null = null
      if (/^\d+$/.test(idRaw.trim())) mapId = idRaw.trim()
      else {
        const b = idRaw.match(/osu\.ppy\.sh\/b\/(\d+)/i)
        const s = idRaw.match(/osu\.ppy\.sh\/beatmapsets\/\d+#\w+\/(\d+)/i)
        const last = idRaw.match(/(\d+)(?!.*\d)/)
        mapId = (b?.[1] || s?.[1] || last?.[1]) ?? null
      }
      if (!mapId) {
        parsed.push({ rawSlot, rawMapId: '', assignedSlot: '', state: 'error', msg: t('mapUpload.paste.errNoMapId') })
        continue
      }
      const norm = normTbSlot(rawSlot)
      const matched = slotByNorm.get(norm)
      let assigned = ''
      if (matched && !usedAssigned.has(matched)) {
        // 默认匹配上的 slot,但如果是已上传的 + 用户没勾"包含已上传",此时也保留指派,
        // 在 run 阶段会按 includeUploaded 过滤。这里给个默认值即可,review 阶段用户能改。
        assigned = matched
        usedAssigned.add(matched)
      }
      parsed.push({ rawSlot, rawMapId: mapId, assignedSlot: assigned, state: 'pending' })
    }
    setRows(parsed)
    setPhase('review')
  }

  // review 阶段每行 select 的可选项:本轮所有 slot,但已被本批次别的行选走的禁用,
  // 已上传的 slot 在没勾 includeUploaded 时也禁用。
  const optionsForRow = (rowIdx: number): { slot: string; disabled: boolean; reason?: string }[] => {
    const usedByOthers = new Set(
      rows
        .map((r, i) => (i !== rowIdx && r.assignedSlot ? r.assignedSlot : null))
        .filter((s): s is string => s !== null)
    )
    return allRoundSlots.map((slot) => {
      if (usedByOthers.has(slot)) return { slot, disabled: true, reason: t('mapUpload.paste.reasonUsed') }
      const isUploaded = uploadedSlots.has(`${roundId}/${slot}`)
      if (isUploaded && !includeUploaded) return { slot, disabled: true, reason: t('mapUpload.paste.reasonUploaded') }
      return { slot, disabled: false }
    })
  }

  const updateAssign = (rowIdx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === rowIdx ? { ...r, assignedSlot: value } : r)))
  }

  const toggleIncludeUploaded = (next: boolean) => {
    setIncludeUploaded(next)
    // 关掉时,把那些指派到"已上传 slot"的行清空,避免误传。
    if (!next) {
      setRows((prev) =>
        prev.map((r) =>
          r.assignedSlot && uploadedSlots.has(`${roundId}/${r.assignedSlot}`)
            ? { ...r, assignedSlot: '' }
            : r
        )
      )
    }
  }

  const startRun = async () => {
    setPhase('run')
    setRunning(true)
    const next = [...rows]
    for (let i = 0; i < next.length; i++) {
      if (next[i].state === 'error') continue
      if (!next[i].assignedSlot) {
        next[i] = { ...next[i], state: 'skip', msg: t('mapUpload.paste.skipMsg') }
        setRows([...next])
        continue
      }
      const targetSlot = next[i].assignedSlot
      const wasUploaded = uploadedSlots.has(`${roundId}/${targetSlot}`)
      const r = next[i]
      try {
        next[i] = { ...r, state: 'fetching' }
        setRows([...next])
        const metaRes = await fetch(`/api/osu/beatmap?id=${r.rawMapId}`)
        if (!metaRes.ok) {
          const body = await metaRes.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error || `HTTP ${metaRes.status}`)
        }
        const meta = (await metaRes.json()) as { beatmapsetId: string; version: string }
        next[i] = { ...next[i], state: 'downloading' }
        setRows([...next])
        const result = await autoDownloadAndTrim(Number(meta.beatmapsetId), meta.version, targetSlot, false, t)
        if (result.needsManualSelect) {
          next[i] = { ...next[i], state: 'error', msg: t('mapUpload.paste.errMultiDiff') }
        } else {
          next[i] = { ...next[i], state: 'uploading' }
          setRows([...next])
          await onUploadOsz(roundId, targetSlot, result.file, false)
          next[i] = { ...next[i], state: 'ok', msg: wasUploaded ? t('mapUpload.paste.overrideMsg') : undefined }
        }
      } catch (err) {
        next[i] = { ...next[i], state: 'error', msg: err instanceof Error ? err.message : String(err) }
      }
      setRows([...next])
      await new Promise((res) => setTimeout(res, 300))
    }
    setRunning(false)
  }

  const okCount = rows.filter((r) => r.state === 'ok').length
  const errCount = rows.filter((r) => r.state === 'error').length
  const skipCount = rows.filter((r) => r.state === 'skip').length
  const assignableCount = rows.filter((r) => r.assignedSlot && r.state !== 'error').length

  const reset = () => {
    setRows([])
    setText('')
    setPhase('input')
  }

  return (
    <div className="px-3 py-2 border-t border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-amber-800 dark:text-amber-200 font-medium">
          {t('mapUpload.paste.heading')}
          {phase === 'input' && t('mapUpload.paste.step1')}
          {phase === 'review' && t('mapUpload.paste.step2')}
          {phase === 'run' && t('mapUpload.paste.step3')}
        </span>
        <button onClick={onClose} className="text-xs text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300" disabled={running}>
          {t('mapUpload.paste.close')}
        </button>
      </div>

      {phase === 'input' && (
        <>
          <div className="text-[11px] text-gray-500 dark:text-neutral-400 leading-relaxed">
            {t('mapUpload.paste.formatPrefix')}<code>{t('mapUpload.paste.formatSlot')}</code>{t('mapUpload.paste.formatJoiner')}<code>{t('mapUpload.paste.formatMapId')}</code>{t('mapUpload.paste.formatSuffix')}<br />
            {t('mapUpload.paste.unuploadedLabel')}<span className="font-mono">{unuploadedSlots.join(', ') || t('mapUpload.paste.allUploaded')}</span><br />
            <span className="text-gray-400 dark:text-neutral-500">{t('mapUpload.paste.tbHint')}</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'RC1\t5318853\nRC2\thttps://osu.ppy.sh/b/5318764\nTB\t5318924\n...'}
            rows={6}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded text-xs font-mono bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
          />
          <div className="flex justify-end">
            <button
              onClick={parse}
              disabled={!text.trim()}
              className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40"
            >
              {t('mapUpload.paste.parse')}
            </button>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={includeUploaded}
              onChange={(e) => toggleIncludeUploaded(e.target.checked)}
              className="accent-amber-600"
            />
            {t('mapUpload.paste.includeUploaded')}
          </label>
          <div className="border border-amber-200 dark:border-amber-800 rounded bg-white dark:bg-neutral-900 text-[11px] max-h-72 overflow-y-auto">
            <div className="grid grid-cols-[80px_70px_120px_1fr] gap-2 px-2 py-1 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800 font-medium text-gray-500 dark:text-neutral-400 sticky top-0">
              <span>{t('mapUpload.paste.colSlot')}</span>
              <span>{t('mapUpload.paste.colMapId')}</span>
              <span>{t('mapUpload.paste.colAssign')}</span>
              <span>{t('mapUpload.paste.colNote')}</span>
            </div>
            {rows.map((r, i) => {
              const opts = optionsForRow(i)
              const matched = slotByNorm.get(normTbSlot(r.rawSlot))
              const isMismatch = !matched && r.state !== 'error'
              return (
                <div
                  key={i}
                  className={`grid grid-cols-[80px_70px_120px_1fr] gap-2 px-2 py-1 border-b border-gray-100 dark:border-neutral-800 items-center ${
                    r.state === 'error' ? 'bg-red-50 dark:bg-red-900/30' : isMismatch ? 'bg-yellow-50 dark:bg-yellow-900/30' : ''
                  }`}
                >
                  <span className="font-mono text-gray-700 dark:text-neutral-200">{r.rawSlot}</span>
                  <span className="font-mono text-gray-500 dark:text-neutral-400">{r.rawMapId || '—'}</span>
                  {r.state === 'error' ? (
                    <span className="text-gray-400 dark:text-neutral-500 text-[10px]">—</span>
                  ) : (
                    <select
                      value={r.assignedSlot}
                      onChange={(e) => updateAssign(i, e.target.value)}
                      className="px-1 py-0.5 border border-gray-200 dark:border-neutral-700 rounded text-[11px] bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-amber-400 font-mono"
                    >
                      <option value="">{t('mapUpload.paste.skip')}</option>
                      {opts.map((o) => {
                        const isUploaded = uploadedSlots.has(`${roundId}/${o.slot}`)
                        return (
                          <option key={o.slot} value={o.slot} disabled={o.disabled}>
                            {o.slot}
                            {isUploaded ? t('mapUpload.paste.uploadedSuffix') : ''}
                            {o.disabled && o.reason ? ` — ${o.reason}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  )}
                  <span className="text-gray-500 dark:text-neutral-400">
                    {r.state === 'error' && <span className="text-red-700 dark:text-red-300">{r.msg}</span>}
                    {r.state !== 'error' && isMismatch && (
                      <span className="text-yellow-700 dark:text-yellow-300">{t('mapUpload.paste.warnNoSlot', { slot: r.rawSlot })}</span>
                    )}
                    {r.state !== 'error' && !isMismatch && r.assignedSlot && r.assignedSlot !== matched && (
                      <span className="text-amber-700 dark:text-amber-300">{t('mapUpload.paste.warnReassigned', { slot: r.assignedSlot })}</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-neutral-400">
            <span>
              {t('mapUpload.paste.summaryProcess', { n: assignableCount })}
              {errCount > 0 && <span className="text-red-700 dark:text-red-300 ml-2">{t('mapUpload.paste.summaryErrs', { n: errCount })}</span>}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPhase('input')}
                className="px-3 py-1 text-xs text-gray-600 dark:text-neutral-300 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-50 dark:hover:bg-neutral-800/40"
              >
                {t('mapUpload.paste.back')}
              </button>
              <button
                onClick={startRun}
                disabled={assignableCount === 0}
                className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40"
              >
                {t('mapUpload.paste.start')}
              </button>
            </div>
          </div>
        </>
      )}

      {phase === 'run' && (
        <>
          <div className="text-[11px] text-gray-600 dark:text-neutral-300">
            {t('mapUpload.paste.progress', { done: okCount, total: assignableCount })}
            {errCount > 0 && <span className="text-yellow-700 dark:text-yellow-300 ml-2">{t('mapUpload.paste.progressErrs', { n: errCount })}</span>}
            {skipCount > 0 && <span className="text-gray-400 dark:text-neutral-500 ml-2">{t('mapUpload.paste.progressSkip', { n: skipCount })}</span>}
            {!running && <span className="ml-2 text-green-700 dark:text-green-300">{t('mapUpload.paste.done')}</span>}
          </div>
          <div className="border border-amber-200 dark:border-amber-800 rounded bg-white dark:bg-neutral-900 max-h-72 overflow-y-auto text-[11px]">
            <div className="grid grid-cols-[80px_70px_80px_1fr] gap-2 px-2 py-1 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800 font-medium text-gray-500 dark:text-neutral-400 sticky top-0">
              <span>{t('mapUpload.paste.colSlot')}</span>
              <span>{t('mapUpload.paste.colMapId')}</span>
              <span>{t('mapUpload.paste.colTargetSlot')}</span>
              <span>{t('mapUpload.paste.colState')}</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[80px_70px_80px_1fr] gap-2 px-2 py-1 border-b border-gray-100 dark:border-neutral-800">
                <span className="font-mono text-gray-700 dark:text-neutral-200">{r.rawSlot}</span>
                <span className="font-mono text-gray-500 dark:text-neutral-400">{r.rawMapId || '—'}</span>
                <span className="font-mono text-gray-600 dark:text-neutral-300">{r.assignedSlot || '—'}</span>
                <span>
                  {r.state === 'pending' && <span className="text-gray-400 dark:text-neutral-500">{t('mapUpload.paste.statePending')}</span>}
                  {r.state === 'fetching' && <span className="text-blue-600 dark:text-blue-300">{t('mapUpload.paste.stateFetching')}</span>}
                  {r.state === 'downloading' && <span className="text-blue-600 dark:text-blue-300">{t('mapUpload.paste.stateDownloading')}</span>}
                  {r.state === 'uploading' && <span className="text-blue-600 dark:text-blue-300">{t('mapUpload.paste.stateUploading')}</span>}
                  {r.state === 'ok' && <span className="text-green-700 dark:text-green-300">{t('mapUpload.paste.stateOk', { msg: r.msg || t('mapUpload.paste.stateOkDefault') })}</span>}
                  {r.state === 'error' && <span className="text-yellow-700 dark:text-yellow-300">{r.msg}</span>}
                  {r.state === 'skip' && <span className="text-gray-400 dark:text-neutral-500">{r.msg}</span>}
                </span>
              </div>
            ))}
          </div>
          {!running && (
            <div className="flex justify-end gap-2">
              <button
                onClick={reset}
                className="px-3 py-1 text-xs text-gray-600 dark:text-neutral-300 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-50 dark:hover:bg-neutral-800/40"
              >
                {t('mapUpload.paste.again')}
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
              >
                {t('mapUpload.paste.finish')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface OsuDiffInfo {
  fileName: string
  version: string
  artist: string
  title: string
  audioFilename: string
  bgFile: string
}

function parseOsuMeta(content: string): OsuDiffInfo {
  let version = '', audioFilename = '', bgFile = '', artist = '', title = ''
  let section = ''
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (t.startsWith('[') && t.endsWith(']')) { section = t.slice(1, -1); continue }
    if (section === 'Metadata') {
      if (t.startsWith('Version:')) version = t.slice(8).trim()
      if (t.startsWith('Artist:')) artist = t.slice(7).trim()
      if (t.startsWith('Title:')) title = t.slice(6).trim()
    }
    if (section === 'General' && t.startsWith('AudioFilename:'))
      audioFilename = t.slice(14).trim()
    if (section === 'Events' && !bgFile) {
      const m = t.match(/"([^"]+\.(jpg|jpeg|png))"/i)
      if (m) bgFile = m[1]
    }
  }
  return { fileName: '', version, audioFilename, bgFile, artist, title }
}

// 我们只保留 .osu + 音频 + 曲绘，丢掉 .osb 和所有 storyboard 精灵图。
// 但 .osu 的 [Events] 段仍引用那些被丢掉的图/视频，osu 加载时找不到文件
// 就弹红色报错；若 storyboard 在 Background 层放了精灵图，还会盖住真正的
// 曲绘导致"没有曲绘"。所以把 [Events] 裁到只剩背景行和休息段（break），
// 其余（Video / Sprite / Animation / Sample / storyboard 命令行）全部删掉。
function cleanOsuEvents(content: string): string {
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let inEvents = false
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('[') && t.endsWith(']')) {
      inEvents = t === '[Events]'
      out.push(line)
      continue
    }
    if (!inEvents) {
      out.push(line)
      continue
    }
    // [Events] 段内：保留注释、空行、背景行、break 段；其余丢弃。
    if (t === '' || t.startsWith('//')) {
      out.push(line)
      continue
    }
    const isBackground = /^(0|Background)\s*,/.test(t)
    const isBreak = /^(2|Break)\s*,/.test(t)
    if (isBackground || isBreak) out.push(line)
    // Video(1/Video) / Sprite / Animation / Sample(5) / 缩进的 storyboard 命令行 → 丢弃
  }
  return out.join('\n')
}

async function buildTrimmedOsz(sourceZip: JSZip, diff: OsuDiffInfo, slot: string, isNsv: boolean): Promise<File> {
  const newZip = new JSZip()
  const added = new Set<string>()
  const rawOsu = await sourceZip.files[diff.fileName].async('string')
  newZip.file(diff.fileName, cleanOsuEvents(rawOsu))
  added.add(diff.fileName)

  if (diff.audioFilename && sourceZip.files[diff.audioFilename]) {
    const audio = await sourceZip.files[diff.audioFilename].async('uint8array')
    newZip.file(diff.audioFilename, audio)
    added.add(diff.audioFilename)
  }
  if (diff.bgFile && sourceZip.files[diff.bgFile]) {
    const bg = await sourceZip.files[diff.bgFile].async('uint8array')
    newZip.file(diff.bgFile, bg)
    added.add(diff.bgFile)
  }

  // 保留所有打击音效 / keysound（.wav/.ogg/.mp3，含子目录路径）。.osu 的
  // [HitObjects]/[TimingPoints] 会按文件名引用它们，缺失就会在游玩时弹红色报错。
  // storyboard 的音效样本也是这些格式，一并保留无害（其事件行已被裁掉，不会触发）。
  for (const name of Object.keys(sourceZip.files)) {
    if (added.has(name)) continue
    const f = sourceZip.files[name]
    if (f.dir) continue
    if (/\.(wav|ogg|mp3)$/i.test(name)) {
      newZip.file(name, await f.async('uint8array'))
      added.add(name)
    }
  }

  const blob = await newZip.generateAsync({ type: 'blob' })
  return new File([blob], `${slot}${isNsv ? '.nsv' : ''}.osz`, { type: 'application/octet-stream' })
}

function extractVersionFromName(name: string | undefined): string | null {
  if (!name) return null
  const match = name.match(/\[([^\]]+)\]\s*$/)
  return match ? match[1] : null
}

async function autoDownloadAndTrim(
  setId: number,
  expectedVersion: string | null,
  slot: string,
  isNsv: boolean,
  t: ReturnType<typeof useT>,
): Promise<{ file: File; needsManualSelect: false } | { zip: JSZip; diffs: OsuDiffInfo[]; needsManualSelect: true }> {
  const res = await fetch(`/api/osu/download?setId=${setId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || t('mapUpload.err.downloadFailed', { status: res.status }))
  }
  const blob = await res.blob()
  if (blob.size > MAX_SIZE) {
    throw new Error(t('mapUpload.err.setTooBig', { n: MAX_SIZE / 1024 / 1024 }))
  }
  const zip = await JSZip.loadAsync(blob)
  const osuFiles = Object.keys(zip.files).filter(f => f.endsWith('.osu'))
  if (osuFiles.length === 0) throw new Error(t('mapUpload.err.noOsuInOsz'))

  const diffs: OsuDiffInfo[] = []
  for (const f of osuFiles) {
    const content = await zip.files[f].async('string')
    const meta = parseOsuMeta(content)
    meta.fileName = f
    diffs.push(meta)
  }

  if (expectedVersion) {
    const matched = diffs.find(d => d.version === expectedVersion)
    if (matched) {
      const file = await buildTrimmedOsz(zip, matched, slot, isNsv)
      return { file, needsManualSelect: false }
    }
  }

  if (diffs.length === 1) {
    const file = await buildTrimmedOsz(zip, diffs[0], slot, isNsv)
    return { file, needsManualSelect: false }
  }

  return { zip, diffs, needsManualSelect: true }
}

function MapUploadRow({
  slot,
  type,
  name,
  beatmapsetId,
  roundId,
  isUploaded,
  isNsvUploaded,
  uploading,
  status,
  onUploadOsz,
  onUploadThree,
  onDelete,
}: {
  slot: string
  type: string
  name?: string
  beatmapsetId?: number
  roundId: string
  isUploaded: boolean
  isNsvUploaded: boolean
  uploading: Record<string, boolean>
  status: Record<string, 'success' | 'error'>
  onUploadOsz: (roundId: string, slot: string, file: File, isNsv: boolean) => void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File, isNsv: boolean) => void
  onDelete: (roundId: string, slot: string, isNsv: boolean) => void
}) {
  const showNsv = isNsvEligible(type)
  const expectedVersion = extractVersionFromName(name)

  return (
    <div className="flex items-stretch gap-2 p-2 bg-gray-50 dark:bg-neutral-900/50 rounded border border-gray-100 dark:border-neutral-800">
      <div className="flex flex-col w-32 shrink-0 self-center">
        <span className="text-xs font-mono text-gray-600 dark:text-neutral-300">{slot}</span>
        {name && <span className="text-[10px] text-gray-400 dark:text-neutral-500 truncate" title={name}>{name}</span>}
      </div>

      <div className={showNsv ? 'flex-1 grid grid-cols-2 gap-2' : 'flex-1'}>
        <MapUploadCell
          slot={slot}
          roundId={roundId}
          isNsv={false}
          isUploaded={isUploaded}
          isUploading={uploading[`${roundId}/${slot}`] || false}
          uploadStatus={status[`${roundId}/${slot}`]}
          beatmapsetId={beatmapsetId}
          expectedVersion={expectedVersion}
          mapName={name}
          onUploadOsz={onUploadOsz}
          onUploadThree={onUploadThree}
          onDelete={onDelete}
        />
        {showNsv && (
          <MapUploadCell
            slot={slot}
            roundId={roundId}
            isNsv={true}
            isUploaded={isNsvUploaded}
            isUploading={uploading[`${roundId}/${slot}#nsv`] || false}
            uploadStatus={status[`${roundId}/${slot}#nsv`]}
            beatmapsetId={beatmapsetId}
            expectedVersion={expectedVersion}
            mapName={name}
            onUploadOsz={onUploadOsz}
            onUploadThree={onUploadThree}
            onDelete={onDelete}
          />
        )}
      </div>
    </div>
  )
}

function MapUploadCell({
  slot,
  roundId,
  isNsv,
  isUploaded,
  isUploading,
  uploadStatus,
  beatmapsetId,
  expectedVersion,
  mapName,
  onUploadOsz,
  onUploadThree,
  onDelete,
}: {
  slot: string
  roundId: string
  isNsv: boolean
  isUploaded: boolean
  isUploading: boolean
  uploadStatus?: 'success' | 'error'
  beatmapsetId?: number
  expectedVersion: string | null
  mapName?: string
  onUploadOsz: (roundId: string, slot: string, file: File, isNsv: boolean) => void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File, isNsv: boolean) => void
  onDelete: (roundId: string, slot: string, isNsv: boolean) => void
}) {
  const t = useT()
  const [mode, setMode] = useState<'osz' | 'three'>('osz')
  const [osuFile, setOsuFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [pendingZip, setPendingZip] = useState<JSZip | null>(null)
  const [availableDiffs, setAvailableDiffs] = useState<OsuDiffInfo[]>([])
  const [selectedDiff, setSelectedDiff] = useState<number>(0)
  const [autoDownloading, setAutoDownloading] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)
  const [reuploading, setReuploading] = useState(false)

  // 重传完成后(uploadStatus 变 success 且不再 uploading)自动收回到 ✓ 状态。
  useEffect(() => {
    if (reuploading && uploadStatus === 'success' && !isUploading) {
      setReuploading(false)
    }
  }, [reuploading, uploadStatus, isUploading])

  const inputId = `osz-${roundId}-${slot}-${isNsv ? 'nsv' : 'main'}`
  const radioName = `diff-${roundId}-${slot}-${isNsv ? 'nsv' : 'main'}`
  const placeholderText = isNsv ? t('mapUpload.row.placeholderNsv') : t('mapUpload.row.placeholder')

  const handleOszFile = async (file: File) => {
    if (!file.name.endsWith('.osz')) return
    if (file.size > MAX_SIZE) {
      alert(t('mapUpload.alert.fileTooBig', { n: MAX_SIZE / 1024 / 1024 }))
      return
    }

    const zip = await JSZip.loadAsync(file)
    const osuFiles = Object.keys(zip.files).filter(f => f.endsWith('.osu'))

    if (osuFiles.length === 0) {
      alert(t('mapUpload.row.alertNoOsu'))
      return
    }

    if (osuFiles.length === 1) {
      const content = await zip.files[osuFiles[0]].async('string')
      const meta = parseOsuMeta(content)
      meta.fileName = osuFiles[0]
      const trimmed = await buildTrimmedOsz(zip, meta, slot, isNsv)
      onUploadOsz(roundId, slot, trimmed, isNsv)
      return
    }

    const diffs: OsuDiffInfo[] = []
    for (const f of osuFiles) {
      const content = await zip.files[f].async('string')
      const meta = parseOsuMeta(content)
      meta.fileName = f
      diffs.push(meta)
    }
    setPendingZip(zip)
    setAvailableDiffs(diffs)
    setSelectedDiff(0)
  }

  const handleOszDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleOszFile(file)
  }

  const handleOszSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleOszFile(file)
  }

  const confirmDiffUpload = async () => {
    if (!pendingZip || availableDiffs.length === 0) return
    const diff = availableDiffs[selectedDiff]
    const trimmed = await buildTrimmedOsz(pendingZip, diff, slot, isNsv)
    onUploadOsz(roundId, slot, trimmed, isNsv)
    setPendingZip(null)
    setAvailableDiffs([])
  }

  const cancelDiffSelect = () => {
    setPendingZip(null)
    setAvailableDiffs([])
  }

  const handleThreeUpload = () => {
    if (osuFile && audioFile && bgFile) {
      onUploadThree(roundId, slot, osuFile, audioFile, bgFile, isNsv)
    }
  }

  const handleAutoDownload = async () => {
    if (!beatmapsetId) return
    setAutoDownloading(true)
    setAutoError(null)
    try {
      const result = await autoDownloadAndTrim(beatmapsetId, expectedVersion, slot, isNsv, t)
      if (result.needsManualSelect) {
        setPendingZip(result.zip)
        setAvailableDiffs(result.diffs)
        setSelectedDiff(0)
      } else {
        onUploadOsz(roundId, slot, result.file, isNsv)
      }
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : String(err))
    } finally {
      setAutoDownloading(false)
    }
  }

  if (availableDiffs.length > 0) {
    return (
      <div className="p-2 bg-yellow-50 dark:bg-yellow-900/30 rounded border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-yellow-700 dark:text-yellow-200">{isNsv ? t('mapUpload.row.diffSelectPrefix') : ''}{t('mapUpload.row.diffSelectMsg', { n: availableDiffs.length })}</span>
        </div>
        <div className="space-y-1 mb-2">
          {availableDiffs.map((diff, i) => (
            <label key={diff.fileName} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={radioName}
                checked={selectedDiff === i}
                onChange={() => setSelectedDiff(i)}
                className="text-purple-600"
              />
              <span className="text-xs text-gray-700 dark:text-neutral-200">[{diff.version}]</span>
              {diff.artist && diff.title && (
                <span className="text-xs text-gray-400 dark:text-neutral-500 truncate">{diff.artist} - {diff.title}</span>
              )}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={confirmDiffUpload}
            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            {t('mapUpload.row.confirm')}
          </button>
          <button
            onClick={cancelDiffSelect}
            className="px-3 py-1 text-xs text-gray-500 dark:text-neutral-400 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-100 dark:hover:bg-neutral-800"
          >
            {t('mapUpload.row.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2" title={mapName}>
      {isUploaded && !isUploading && uploadStatus !== 'error' && !reuploading && (
        <span className="text-xs text-green-600 dark:text-green-300 flex items-center gap-1" title={mapName}>
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {isNsv ? t('mapUpload.row.uploadedNsv') : t('mapUpload.row.uploaded')}
          <button
            onClick={() => setReuploading(true)}
            className="ml-1 text-blue-400 dark:text-blue-300 hover:text-blue-600 dark:hover:text-blue-200"
            title={t('mapUpload.row.reuploadTitle')}
          >
            ⟳
          </button>
          <button
            onClick={() => onDelete(roundId, slot, isNsv)}
            className="text-red-400 dark:text-red-300 hover:text-red-600 dark:hover:text-red-200"
            title={t('mapUpload.row.deleteTitle')}
          >
            ✕
          </button>
        </span>
      )}

      {isUploading && (
        <span className="text-xs text-blue-600 dark:text-blue-300">{t('mapUpload.row.uploading')}</span>
      )}

      {uploadStatus === 'error' && (
        <span className="text-xs text-red-600 dark:text-red-300">{t('mapUpload.row.uploadFailed')}</span>
      )}

      {!isUploading && (!isUploaded || reuploading) && (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {reuploading && (
            <button
              onClick={() => { setReuploading(false); setAutoError(null) }}
              className="text-xs text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 shrink-0"
              title={t('mapUpload.row.cancelReupload')}
            >
              ←
            </button>
          )}
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setMode('osz')}
              className={`px-2 py-0.5 text-xs rounded ${mode === 'osz' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200' : 'text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300'}`}
            >
              .osz
            </button>
            <button
              onClick={() => setMode('three')}
              className={`px-2 py-0.5 text-xs rounded ${mode === 'three' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200' : 'text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300'}`}
            >
              {t('mapUpload.row.threeFiles')}
            </button>
          </div>

          {mode === 'osz' && (
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <div
                className={`flex-1 min-w-0 border border-dashed rounded px-2 py-1 text-xs text-center cursor-pointer hover:border-purple-400 hover:text-purple-500 ${isNsv ? 'border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-300' : 'border-gray-300 dark:border-neutral-700 text-gray-400 dark:text-neutral-500'}`}
                title={mapName || placeholderText}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleOszDrop}
                onClick={() => document.getElementById(inputId)?.click()}
              >
                {autoDownloading ? t('mapUpload.row.autoDownloading') : autoError ? t('mapUpload.row.failedPrefix', { msg: autoError }) : placeholderText}
                <input
                  id={inputId}
                  type="file"
                  accept=".osz"
                  className="hidden"
                  onChange={handleOszSelect}
                />
              </div>
              {beatmapsetId && !isNsv && !autoDownloading && (
                <button
                  onClick={handleAutoDownload}
                  className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 shrink-0"
                  title={t('mapUpload.row.autoBtnTitle', {
                    setId: beatmapsetId,
                    verSuffix: expectedVersion ? t('mapUpload.row.autoBtnTitleVer', { ver: expectedVersion }) : '',
                    nameSuffix: mapName ? `\n${mapName}` : '',
                  })}
                >
                  {t('mapUpload.row.auto')}
                </button>
              )}
            </div>
          )}

          {mode === 'three' && (
            <div className="flex-1 flex items-center gap-1 min-w-0">
              <label className="text-xs text-gray-500 dark:text-neutral-400 cursor-pointer hover:text-purple-600">
                .osu{osuFile && ' ✓'}
                <input type="file" accept=".osu" className="hidden" onChange={e => setOsuFile(e.target.files?.[0] || null)} />
              </label>
              <label className="text-xs text-gray-500 dark:text-neutral-400 cursor-pointer hover:text-purple-600">
                {t('mapUpload.row.audio')}{audioFile && ' ✓'}
                <input type="file" accept=".mp3,.ogg,.wav" className="hidden" onChange={e => setAudioFile(e.target.files?.[0] || null)} />
              </label>
              <label className="text-xs text-gray-500 dark:text-neutral-400 cursor-pointer hover:text-purple-600">
                {t('mapUpload.row.bg')}{bgFile && ' ✓'}
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={e => setBgFile(e.target.files?.[0] || null)} />
              </label>
              {osuFile && audioFile && bgFile && (
                <button
                  onClick={handleThreeUpload}
                  className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {t('mapUpload.row.upload')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
