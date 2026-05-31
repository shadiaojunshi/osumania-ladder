'use client'

import { useState, useEffect, useCallback } from 'react'
import JSZip from 'jszip'

interface TournamentRounds {
  id: string
  rounds: { id: string; abbreviation: string; maps: { slot: string; type: string }[] }[]
}

const NSV_ELIGIBLE_EXCLUDED = new Set(['RC', 'LN', 'HB', 'TB'])
function isNsvEligible(type: string): boolean {
  return !NSV_ELIGIBLE_EXCLUDED.has(type)
}

const MAX_SIZE = 100 * 1024 * 1024

export function MapUploader() {
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
        alert(`文件超过 ${MAX_SIZE / 1024 / 1024}MB 限制`)
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
      alert(`文件总大小超过 ${MAX_SIZE / 1024 / 1024}MB 限制`)
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
    if (!confirm(`确定删除 ${slot}${isNsv ? ' (NSV)' : ''} 的谱面文件？`)) return
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
      alert('删除失败')
    }
  }, [selectedTournament])

  const totalMaps = tournamentData?.rounds.reduce((s, r) => s + r.maps.length, 0) || 0
  const uploadedCount = uploadedSlots.size

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">谱面文件上传</h3>
        <p className="text-xs text-gray-400 mb-4">选择比赛后，为每张图上传 .osz 文件（或 .osu + 音频 + 曲绘）。SV 和特殊类型的谱面可额外上传可选的 NSV 文件。单文件最大 {MAX_SIZE / 1024 / 1024}MB。</p>

        <select
          value={selectedTournament}
          onChange={(e) => loadTournament(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-purple-400"
        >
          <option value="">选择比赛...</option>
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.id}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center text-gray-400 text-sm py-8">加载中...</div>}

      {tournamentData && !loading && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">{tournamentData.id}</h3>
            <span className="text-xs text-gray-500">
              {uploadedCount}/{totalMaps} 张已上传
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
  round: { id: string; abbreviation: string; maps: { slot: string; type: string }[] }
  uploadedSlots: Set<string>
  uploadedNsvSlots: Set<string>
  uploading: Record<string, boolean>
  status: Record<string, 'success' | 'error'>
  onUploadOsz: (roundId: string, slot: string, file: File, isNsv: boolean) => void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File, isNsv: boolean) => void
  onDelete: (roundId: string, slot: string, isNsv: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const uploadedInRound = round.maps.filter(m => uploadedSlots.has(`${round.id}/${m.slot}`)).length

  return (
    <div className="border border-gray-100 rounded-md">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-700">{round.abbreviation}</span>
        <span className="text-xs text-gray-400">
          {uploadedInRound}/{round.maps.length} 张
          {uploadedInRound === round.maps.length && ' ✓'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {round.maps.map(map => (
            <MapUploadRow
              key={map.slot}
              slot={map.slot}
              type={map.type}
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

function MapUploadRow({
  slot,
  type,
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

  return (
    <div className="flex items-stretch gap-2 p-2 bg-gray-50 rounded border border-gray-100">
      <span className="text-xs font-mono w-10 text-gray-600 shrink-0 self-center">{slot}</span>

      <div className={showNsv ? 'flex-1 grid grid-cols-2 gap-2' : 'flex-1'}>
        <MapUploadCell
          slot={slot}
          roundId={roundId}
          isNsv={false}
          isUploaded={isUploaded}
          isUploading={uploading[`${roundId}/${slot}`] || false}
          uploadStatus={status[`${roundId}/${slot}`]}
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
  onUploadOsz: (roundId: string, slot: string, file: File, isNsv: boolean) => void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File, isNsv: boolean) => void
  onDelete: (roundId: string, slot: string, isNsv: boolean) => void
}) {
  const [mode, setMode] = useState<'osz' | 'three'>('osz')
  const [osuFile, setOsuFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [pendingZip, setPendingZip] = useState<JSZip | null>(null)
  const [availableDiffs, setAvailableDiffs] = useState<OsuDiffInfo[]>([])
  const [selectedDiff, setSelectedDiff] = useState<number>(0)

  const inputId = `osz-${roundId}-${slot}-${isNsv ? 'nsv' : 'main'}`
  const radioName = `diff-${roundId}-${slot}-${isNsv ? 'nsv' : 'main'}`
  const placeholderText = isNsv ? '可选 NSV: 拖入或点击选择 .osz' : '拖入或点击选择 .osz'

  const handleOszFile = async (file: File) => {
    if (!file.name.endsWith('.osz')) return
    if (file.size > MAX_SIZE) {
      alert(`文件超过 ${MAX_SIZE / 1024 / 1024}MB 限制`)
      return
    }

    const zip = await JSZip.loadAsync(file)
    const osuFiles = Object.keys(zip.files).filter(f => f.endsWith('.osu'))

    if (osuFiles.length === 0) {
      alert('该 .osz 中没有 .osu 文件')
      return
    }

    if (osuFiles.length === 1) {
      onUploadOsz(roundId, slot, file, isNsv)
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

    const newZip = new JSZip()
    const osuContent = await pendingZip.files[diff.fileName].async('uint8array')
    newZip.file(diff.fileName, osuContent)

    if (diff.audioFilename && pendingZip.files[diff.audioFilename]) {
      const audio = await pendingZip.files[diff.audioFilename].async('uint8array')
      newZip.file(diff.audioFilename, audio)
    }
    if (diff.bgFile && pendingZip.files[diff.bgFile]) {
      const bg = await pendingZip.files[diff.bgFile].async('uint8array')
      newZip.file(diff.bgFile, bg)
    }

    const blob = await newZip.generateAsync({ type: 'blob' })
    const oszFile = new File([blob], `${slot}${isNsv ? '.nsv' : ''}.osz`, { type: 'application/octet-stream' })
    onUploadOsz(roundId, slot, oszFile, isNsv)
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

  if (availableDiffs.length > 0) {
    return (
      <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-yellow-700">{isNsv ? 'NSV: ' : ''}检测到 {availableDiffs.length} 个难度，请选择：</span>
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
              <span className="text-xs text-gray-700">[{diff.version}]</span>
              {diff.artist && diff.title && (
                <span className="text-xs text-gray-400 truncate">{diff.artist} - {diff.title}</span>
              )}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={confirmDiffUpload}
            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            确认上传
          </button>
          <button
            onClick={cancelDiffSelect}
            className="px-3 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-100"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {isUploaded && !isUploading && uploadStatus !== 'error' && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {isNsv ? 'NSV 已上传' : '已上传'}
          <button
            onClick={() => onDelete(roundId, slot, isNsv)}
            className="ml-1 text-red-400 hover:text-red-600"
            title="删除文件"
          >
            ✕
          </button>
        </span>
      )}

      {isUploading && (
        <span className="text-xs text-blue-600">上传中...</span>
      )}

      {uploadStatus === 'error' && (
        <span className="text-xs text-red-600">上传失败</span>
      )}

      {!isUploading && !isUploaded && (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setMode('osz')}
              className={`px-2 py-0.5 text-xs rounded ${mode === 'osz' ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              .osz
            </button>
            <button
              onClick={() => setMode('three')}
              className={`px-2 py-0.5 text-xs rounded ${mode === 'three' ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              3文件
            </button>
          </div>

          {mode === 'osz' && (
            <div
              className={`flex-1 min-w-0 border border-dashed rounded px-2 py-1 text-xs text-center cursor-pointer hover:border-purple-400 hover:text-purple-500 ${isNsv ? 'border-amber-300 text-amber-600' : 'border-gray-300 text-gray-400'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleOszDrop}
              onClick={() => document.getElementById(inputId)?.click()}
            >
              {placeholderText}
              <input
                id={inputId}
                type="file"
                accept=".osz"
                className="hidden"
                onChange={handleOszSelect}
              />
            </div>
          )}

          {mode === 'three' && (
            <div className="flex-1 flex items-center gap-1 min-w-0">
              <label className="text-xs text-gray-500 cursor-pointer hover:text-purple-600">
                .osu{osuFile && ' ✓'}
                <input type="file" accept=".osu" className="hidden" onChange={e => setOsuFile(e.target.files?.[0] || null)} />
              </label>
              <label className="text-xs text-gray-500 cursor-pointer hover:text-purple-600">
                音频{audioFile && ' ✓'}
                <input type="file" accept=".mp3,.ogg,.wav" className="hidden" onChange={e => setAudioFile(e.target.files?.[0] || null)} />
              </label>
              <label className="text-xs text-gray-500 cursor-pointer hover:text-purple-600">
                曲绘{bgFile && ' ✓'}
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={e => setBgFile(e.target.files?.[0] || null)} />
              </label>
              {osuFile && audioFile && bgFile && (
                <button
                  onClick={handleThreeUpload}
                  className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                >
                  上传
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
