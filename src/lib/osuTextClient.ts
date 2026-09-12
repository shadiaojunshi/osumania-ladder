'use client'

// 取 .osu 文本 + 构建可视化模型。
//
// 数据来源与难度估算完全一致:`GET /api/osu/raw`
//   - 带 tournamentId/roundId/slot → 读 R2 里的比赛上传版本(需要 contributor)
//   - 只带 id                      → 回退 osu.ppy.sh / 代理的线上版本
// 普通访客在公开页读不到 R2 私有版本,这里会自动降级到线上版本并如实标记来源。
//
// 三级缓存(网络层统一按 ETag 失效):
//   1. 30 秒内重复打开直接命中,完全不发请求(换图后最多滞后 30 秒)
//   2. 超时后走 ETag 再校验,没变就只花一次 HEAD
//   3. 解析 + 分页布局结果按 text 引用缓存,重复打开零计算

import { buildManiaChart, parseManiaBeatmap, type ManiaChartModel } from './maniaChart'

export type ChartSource = 'r2' | 'proxy' | 'osu' | null

export interface ManiaChartTarget {
  beatmapId?: number
  tournamentId?: string
  roundId?: string
  slot?: string
}

export interface ManiaChartPayload {
  model: ManiaChartModel
  /** r2 = 比赛上传版本;proxy/osu = 线上版本;null = 上游未标注 */
  source: ChartSource
  /** true = 没走网络(命中本地缓存) */
  cached: boolean
}

export class OsuTextError extends Error {
  status: number
  constructor(status: number, message?: string) {
    super(message || `beatmap fetch HTTP ${status}`)
    this.status = status
  }
}

interface TextEntry {
  text: string
  etag: string | null
  source: ChartSource
  fetchedAt: number
}

const TRUST_TTL_MS = 30_000
const MAX_TEXT_CACHE = 12
const MAX_MODEL_CACHE = 16
const REQUEST_TIMEOUT_MS = 25_000
const MIN_REQUEST_GAP_MS = 120
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 800
const MAX_RETRY_DELAY_MS = 8_000

const textCache = new Map<string, TextEntry>()
const modelCache = new Map<string, ManiaChartPayload>()
const inFlight = new Map<string, Promise<ManiaChartPayload>>()
let lastRequestAt = 0
let unavailableUntil = 0

function put<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) map.delete(map.keys().next().value as K)
}

function buildQueries(target: ManiaChartTarget): { primary: string; fallback: string | null } {
  const hasId = Number.isSafeInteger(target.beatmapId) && (target.beatmapId as number) > 0
  const hasSlot = Boolean(target.tournamentId && target.roundId && target.slot)

  if (hasSlot) {
    const params = new URLSearchParams()
    params.set('tournamentId', target.tournamentId as string)
    params.set('roundId', target.roundId as string)
    params.set('slot', target.slot as string)
    // 带上 BID 让服务端在多难度 .osz 里挑对那一个。
    if (hasId) params.set('id', String(target.beatmapId))
    return {
      primary: params.toString(),
      fallback: hasId ? new URLSearchParams({ id: String(target.beatmapId) }).toString() : null,
    }
  }
  if (hasId) return { primary: new URLSearchParams({ id: String(target.beatmapId) }).toString(), fallback: null }
  throw new OsuTextError(400, 'invalid beatmap location')
}

function parseRetryAfter(response: Response | null, attempt: number): number {
  const header = response?.headers.get('Retry-After')?.trim()
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1000))
    const stamp = Date.parse(header)
    if (Number.isFinite(stamp)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, stamp - Date.now()))
  }
  return Math.min(MAX_RETRY_DELAY_MS, RETRY_BACKOFF_MS * 2 ** attempt)
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

async function pace() {
  const delay = Math.max(unavailableUntil - Date.now(), lastRequestAt + MIN_REQUEST_GAP_MS - Date.now(), 0)
  if (delay > 0) await wait(delay)
  lastRequestAt = Date.now()
}

function readSource(response: Response): ChartSource {
  const header = response.headers.get('X-Beatmap-Source')
  return header === 'r2' || header === 'proxy' || header === 'osu' ? header : null
}

/** 拉一次原始文本;429/5xx 按 Retry-After 退避重试。返回 null 表示 304(沿用旧条目)。 */
async function fetchText(query: string, cached: TextEntry | undefined): Promise<TextEntry | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await pace()
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`/api/osu/raw?${query}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
      })
    } catch {
      window.clearTimeout(timer)
      if (attempt >= MAX_RETRIES) throw new OsuTextError(0, 'network')
      unavailableUntil = Math.max(unavailableUntil, Date.now() + parseRetryAfter(null, attempt))
      continue
    }
    try {
      if (response.status === 304) return null
      if (response.ok) {
        // 超时计时器要守到响应体读完。
        const text = await response.text()
        return { text, etag: response.headers.get('ETag'), source: readSource(response), fetchedAt: Date.now() }
      }
      if (response.status === 429 || response.status >= 500) {
        unavailableUntil = Math.max(unavailableUntil, Date.now() + parseRetryAfter(response, attempt))
        if (attempt < MAX_RETRIES) continue
      }
      const detail = await response.text().catch(() => '')
      throw new OsuTextError(response.status, detail.trim() || undefined)
    } finally {
      window.clearTimeout(timer)
    }
  }
  throw new OsuTextError(0, 'beatmap fetch failed')
}

/** 取文本:先吃 30 秒信任窗口,过期才走 ETag 再校验。 */
async function resolveText(query: string, forceRefresh: boolean): Promise<{ entry: TextEntry; cached: boolean }> {
  const cached = textCache.get(query)
  if (cached && !forceRefresh && Date.now() - cached.fetchedAt < TRUST_TTL_MS) {
    return { entry: cached, cached: true }
  }
  const fresh = await fetchText(query, cached)
  if (fresh === null && cached) {
    // 304:内容没变,但把信任窗口续上,避免每次打开都打一次 HEAD。
    const renewed: TextEntry = { ...cached, fetchedAt: Date.now() }
    put(textCache, query, renewed, MAX_TEXT_CACHE)
    return { entry: renewed, cached: true }
  }
  const entry = fresh as TextEntry
  put(textCache, query, entry, MAX_TEXT_CACHE)
  return { entry, cached: false }
}

function toPayload(entry: TextEntry, cached: boolean): ManiaChartPayload {
  // text 是同一份字符串引用时可以直接复用上次的模型。
  const key = `${entry.etag ?? entry.text.slice(0, 64)}|${entry.text.length}`
  const hit = modelCache.get(key)
  if (hit) return { ...hit, cached }
  const payload: ManiaChartPayload = {
    model: buildManiaChart(parseManiaBeatmap(entry.text)),
    source: entry.source,
    cached,
  }
  put(modelCache, key, payload, MAX_MODEL_CACHE)
  return payload
}

/** 取谱面并构建可渲染模型。`retry` 为 true 时跳过全部缓存强制重取。 */
export function loadManiaChart(target: ManiaChartTarget, retry = false): Promise<ManiaChartPayload> {
  const { primary, fallback } = buildQueries(target)
  if (retry) unavailableUntil = 0

  const flightKey = `${primary}|${retry ? 'force' : 'normal'}`
  const pending = inFlight.get(flightKey)
  if (pending) return pending

  const request = (async () => {
    try {
      const { entry, cached } = await resolveText(primary, retry)
      return toPayload(entry, cached)
    } catch (error) {
      // 公开页访客读不到 R2:401/403 且有 BID 时降级到线上版本。
      if (fallback && error instanceof OsuTextError && (error.status === 401 || error.status === 403)) {
        const { entry, cached } = await resolveText(fallback, retry)
        return toPayload(entry, cached)
      }
      throw error
    }
  })().finally(() => inFlight.delete(flightKey))

  inFlight.set(flightKey, request)
  return request
}

/** 供弹窗显示用的错误文案键;与难度估算的错误分类保持一致。 */
export function chartErrorKind(error: unknown): 'noFile' | 'sessionExpired' | 'rateLimited' | 'unavailable' {
  const status = error instanceof OsuTextError ? error.status : 0
  if (status === 404) return 'noFile'
  if (status === 401) return 'sessionExpired'
  if (status === 429) return 'rateLimited'
  return 'unavailable'
}
