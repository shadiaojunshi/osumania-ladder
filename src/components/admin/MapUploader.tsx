'use client'

import { useState, useEffect, useCallback } from 'react'
import JSZip from 'jszip'

interface UploadableMap {
  slot: string
  roundId: string
  uploaded: boolean
}

interface TournamentRounds {
  id: string
  rounds: { id: string; abbreviation: string; maps: { slot: string }[] }[]
}

export function MapUploader() {
  const [tournaments, setTournaments] = useState<{ id: string }[]>([])
  const [selectedTournament, setSelectedTournament] = useState<string>('')
  const [tournamentData, setTournamentData] = useState<TournamentRounds | null>(null)
  const [uploadedSlots, setUploadedSlots] = useState<Set<string>>(new Set())
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
        const { uploaded } = await statusRes.json()
        setUploadedSlots(new Set(uploaded as string[]))
      }
    } catch {
      setTournamentData(null)
    } finally {
      setLoading(false)
    }
  }

  const uploadFile = useCallback(async (roundId: string, slot: string, file: File) => {
    const key = `${roundId}/${slot}`
    setUploading(prev => ({ ...prev, [key]: true }))
    setStatus(prev => { const n = { ...prev }; delete n[key]; return n })

    try {
      let oszFile = file

      if (!file.name.endsWith('.osz')) {
        return
      }

      if (file.size > 25 * 1024 * 1024) {
        setStatus(prev => ({ ...prev, [key]: 'error' }))
        alert('文件超过 25MB 限制')
        return
      }

      const formData = new FormData()
      formData.append('tournamentId', selectedTournament)
      formData.append('roundId', roundId)
      formData.append('slot', slot)
      formData.append('file', oszFile)

      const res = await fetch('/api/maps/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()

      setStatus(prev => ({ ...prev, [key]: 'success' }))
      setUploadedSlots(prev => new Set([...prev, key]))
    } catch {
      setStatus(prev => ({ ...prev, [key]: 'error' }))
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }))
    }
  }, [selectedTournament])

  const uploadThreeFiles = useCallback(async (roundId: string, slot: string, osuFile: File, audioFile: File, bgFile: File) => {
    const key = `${roundId}/${slot}`
    setUploading(prev => ({ ...prev, [key]: true }))
    setStatus(prev => { const n = { ...prev }; delete n[key]; return n })

    try {
      const totalSize = osuFile.size + audioFile.size + bgFile.size
      if (totalSize > 25 * 1024 * 1024) {
        setStatus(prev => ({ ...prev, [key]: 'error' }))
        alert('文件总大小超过 25MB 限制')
        return
      }

      const zip = new JSZip()
      zip.file(osuFile.name, osuFile)
      zip.file(audioFile.name, audioFile)
      zip.file(bgFile.name, bgFile)
      const blob = await zip.generateAsync({ type: 'blob' })
      const oszFile = new File([blob], `${slot}.osz`, { type: 'application/octet-stream' })

      const formData = new FormData()
      formData.append('tournamentId', selectedTournament)
      formData.append('roundId', roundId)
      formData.append('slot', slot)
      formData.append('file', oszFile)

      const res = await fetch('/api/maps/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()

      setStatus(prev => ({ ...prev, [key]: 'success' }))
      setUploadedSlots(prev => new Set([...prev, key]))
    } catch {
      setStatus(prev => ({ ...prev, [key]: 'error' }))
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }))
    }
  }, [selectedTournament])

  const deleteFile = useCallback(async (roundId: string, slot: string) => {
    const key = `${roundId}/${slot}`
    if (!confirm(`确定删除 ${slot} 的谱面文件？`)) return
    try {
      const res = await fetch('/api/maps/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selectedTournament, roundId, slot }),
      })
      if (!res.ok) throw new Error()
      setUploadedSlots(prev => { const n = new Set(prev); n.delete(key); return n })
      setStatus(prev => { const n = { ...prev }; delete n[key]; return n })
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
        <p className="text-xs text-gray-400 mb-4">选择比赛后，为每张图上传 .osz 文件（或 .osu + 音频 + 曲绘）</p>

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
  uploading,
  status,
  onUploadOsz,
  onUploadThree,
  onDelete,
}: {
  round: { id: string; abbreviation: string; maps: { slot: string }[] }
  uploadedSlots: Set<string>
  uploading: Record<string, boolean>
  status: Record<string, 'success' | 'error'>
  onUploadOsz: (roundId: string, slot: string, file: File) => void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File) => void
  onDelete: (roundId: string, slot: string) => void
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
              roundId={round.id}
              isUploaded={uploadedSlots.has(`${round.id}/${map.slot}`)}
              isUploading={uploading[`${round.id}/${map.slot}`] || false}
              uploadStatus={status[`${round.id}/${map.slot}`]}
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
  roundId,
  isUploaded,
  isUploading,
  uploadStatus,
  onUploadOsz,
  onUploadThree,
  onDelete,
}: {
  slot: string
  roundId: string
  isUploaded: boolean
  isUploading: boolean
  uploadStatus?: 'success' | 'error'
  onUploadOsz: (roundId: string, slot: string, file: File) => void
  onUploadThree: (roundId: string, slot: string, osu: File, audio: File, bg: File) => void
  onDelete: (roundId: string, slot: string) => void
}) {
  const [mode, setMode] = useState<'osz' | 'three'>('osz')
  const [osuFile, setOsuFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [pendingZip, setPendingZip] = useState<JSZip | null>(null)
  const [availableDiffs, setAvailableDiffs] = useState<OsuDiffInfo[]>([])
  const [selectedDiff, setSelectedDiff] = useState<number>(0)

  const handleOszFile = async (file: File) => {
    if (!file.name.endsWith('.osz')) return
    if (file.size > 25 * 1024 * 1024) {
      alert('文件超过 25MB 限制')
      return
    }

    const zip = await JSZip.loadAsync(file)
    const osuFiles = Object.keys(zip.files).filter(f => f.endsWith('.osu'))

    if (osuFiles.length === 0) {
      alert('该 .osz 中没有 .osu 文件')
      return
    }

    if (osuFiles.length === 1) {
      onUploadOsz(roundId, slot, file)
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
    const oszFile = new File([blob], `${slot}.osz`, { type: 'application/octet-stream' })
    onUploadOsz(roundId, slot, oszFile)
    setPendingZip(null)
    setAvailableDiffs([])
  }

  const cancelDiffSelect = () => {
    setPendingZip(null)
    setAvailableDiffs([])
  }

  const handleThreeUpload = () => {
    if (osuFile && audioFile && bgFile) {
      onUploadThree(roundId, slot, osuFile, audioFile, bgFile)
    }
  }

  if (availableDiffs.length > 0) {
    return (
      <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono text-gray-600">{slot}</span>
          <span className="text-xs text-yellow-700">检测到 {availableDiffs.length} 个难度，请选择：</span>
        </div>
        <div className="space-y-1 mb-2">
          {availableDiffs.map((diff, i) => (
            <label key={diff.fileName} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`diff-${roundId}-${slot}`}
                checked={selectedDiff === i}
                onChange={() => setSelectedDiff(i)}
                className="text-purple-600"
              />
              <span className="text-xs text-gray-700">[{diff.version}]</span>
              {diff.artist && diff.title && (
                <span className="text-xs text-gray-400">{diff.artist} - {diff.title}</span>
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
    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-100">
      <span className="text-xs font-mono w-10 text-gray-600 shrink-0">{slot}</span>

      {isUploaded && !isUploading && uploadStatus !== 'error' && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          已上传
          <button
            onClick={() => onDelete(roundId, slot)}
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

      {!isUploading && (
        <div className="flex-1 flex items-center gap-2">
          <div className="flex gap-1">
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
              className="flex-1 border border-dashed border-gray-300 rounded px-2 py-1 text-xs text-gray-400 text-center cursor-pointer hover:border-purple-400 hover:text-purple-500"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleOszDrop}
              onClick={() => document.getElementById(`osz-${roundId}-${slot}`)?.click()}
            >
              拖入或点击选择 .osz
              <input
                id={`osz-${roundId}-${slot}`}
                type="file"
                accept=".osz"
                className="hidden"
                onChange={handleOszSelect}
              />
            </div>
          )}

          {mode === 'three' && (
            <div className="flex-1 flex items-center gap-1">
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
