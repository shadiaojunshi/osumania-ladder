// R2 谱面键规则的唯一来源(上传 / 删除 / 状态 / 元数据都用这里,避免各处拼串漂移)。
//
// 键形如: maps/{tournamentId}/{roundId}/{slot}[.nsv].osz
//   主图  slot=X        → maps/t/r/X.osz
//   NSV   slot=X,nsv=1  → maps/t/r/X.nsv.osz
// 由此:主图的 slot 若以 `.nsv` 结尾,键会和「基础 slot 的 NSV」完全相同 → 必须拒绝。
// 全库实测(2026-09-14):4526 个槽位中 0 个以 .nsv 结尾、0 个重复、0 个键碰撞,
// 所以这条规则启用不会挡住现有数据。
//
// 键段允许出现 '/'、'&'、'()' 等字符:现有数据确实有 `FS/TB`、`GM(HR/SD)`、`GM(FL&EZ)`
// 这类槽位,收紧会把真实槽位挡在门外(与 R03 的放宽清单一致)。只拒绝真正会破坏
// 键结构的东西:空串、超长、'.' / '..'、反斜杠、控制字符、空路径段。

import { LIMITS, type Validation } from './validation.ts'

export const MAPS_PREFIX = 'maps/'
export const OSZ_SUFFIX = '.osz'
export const NSV_SUFFIX = '.nsv.osz'

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

// .osz 的有限成本检查上限:只为挡住"明显不是谱包 / zip 炸弹",不做全量解压。
export const ARCHIVE_LIMITS = {
  maxEntries: 2000,
  maxDeclaredUncompressedBytes: 512 * 1024 * 1024,
  tailBytes: 66 * 1024,
}

export function mapObjectKey(tournamentId: string, roundId: string, slot: string, nsv: boolean): string {
  return `${MAPS_PREFIX}${tournamentId}/${roundId}/${slot}${nsv ? NSV_SUFFIX : OSZ_SUFFIX}`
}

export function mapObjectPrefix(tournamentId: string): string {
  return `${MAPS_PREFIX}${tournamentId}/`
}

// 反向解析:去掉 maps/{tid}/ 前缀与后缀,剩下的是 roundId/slot(两者都可能含 '/')。
export function parseMapObjectKey(tournamentId: string, key: unknown): { relative: string; nsv: boolean } | null {
  if (typeof key !== 'string') return null
  const prefix = mapObjectPrefix(tournamentId)
  if (!key.startsWith(prefix)) return null
  const rest = key.slice(prefix.length)
  if (rest.endsWith(NSV_SUFFIX)) return { relative: rest.slice(0, -NSV_SUFFIX.length), nsv: true }
  if (rest.endsWith(OSZ_SUFFIX)) return { relative: rest.slice(0, -OSZ_SUFFIX.length), nsv: false }
  return null
}

// 主图 slot 以 .nsv 结尾 → 与「基础 slot 的 NSV」撞键。
export function hasNsvSuffixAmbiguity(slot: string, nsv: boolean): boolean {
  return !nsv && slot.endsWith('.nsv')
}

// 键段校验。不做 trim:键按原样存储,悄悄改值会让两边不一致。
export function validateKeySegment(
  value: unknown,
  { field, maxLength }: { field: string; maxLength: number },
): Validation<string> {
  if (typeof value !== 'string') return { ok: false, error: `${field} 必须是字符串` }
  if (value === '') return { ok: false, error: `${field} 不能为空` }
  if (value.length > maxLength) return { ok: false, error: `${field} 超过 ${maxLength} 字符上限` }
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: `${field} 含控制字符` }
  if (value.includes('\\')) return { ok: false, error: `${field} 不能含反斜杠` }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return { ok: false, error: `${field} 含空路径段或 . / ..（会让 R2 键产生歧义）` }
  }
  return { ok: true, value }
}

export function validateRoundId(value: unknown): Validation<string> {
  return validateKeySegment(value, { field: 'roundId', maxLength: LIMITS.maxRoundIdLength })
}

export function validateSlot(value: unknown): Validation<string> {
  return validateKeySegment(value, { field: 'slot', maxLength: LIMITS.maxSlotLength })
}

// nsv 字段只认明确的真/假,含糊的值宁可报错也不猜(猜错会写到错误的键上)。
export function validateNsvFlag(value: unknown): Validation<boolean> {
  if (value === null || value === undefined) return { ok: true, value: false }
  if (typeof value === 'boolean') return { ok: true, value }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return { ok: true, value: false }
    if (normalized === '1' || normalized === 'true') return { ok: true, value: true }
    if (normalized === '0' || normalized === 'false') return { ok: true, value: false }
  }
  return { ok: false, error: 'nsv 只接受 1/true（NSV 谱面）或 0/false（普通谱面）' }
}

export interface ArchiveInfo {
  entries: number
  declaredUncompressedBytes: number
  /** 中央目录是否完整读了(读不全时只做了条目数/边界检查) */
  centralDirectoryScanned: boolean
}

// 只读文件尾部的一小段(默认 66KB)做有限成本检查:
// 找不到中央目录结尾标记 / 条目数超限 / 中央目录越界 / 声明解压体积超限 → 拒绝。
// 不解压任何内容;中央目录落在窗口内时顺便统计声明解压体积。
export function inspectOszTail(tail: Uint8Array, fileSize: number): Validation<ArchiveInfo> {
  if (fileSize < 22 || tail.length < 22) {
    return { ok: false, error: '文件太小,不是有效的 .osz' }
  }

  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return { ok: false, error: '不是有效的 zip/.osz（找不到中央目录结尾标记）' }

  const view = new DataView(tail.buffer, tail.byteOffset + eocd, tail.length - eocd)
  // 偏移 8 是「本盘条目数」，10 才是「总条目数」；单盘归档两者通常相等，取权威的那个。
  const entries = view.getUint16(10, true)
  const cdSize = view.getUint32(12, true)
  const cdOffset = view.getUint32(16, true)

  if (entries === 0) return { ok: false, error: '压缩包里没有任何条目' }
  if (entries > ARCHIVE_LIMITS.maxEntries) {
    return { ok: false, error: `压缩包条目数 ${entries} 超过 ${ARCHIVE_LIMITS.maxEntries} 上限` }
  }
  if (cdOffset + cdSize > fileSize) {
    return { ok: false, error: '压缩包中央目录越界（文件可能被截断）' }
  }

  // 中央目录完整落在窗口内 → 逐条读声明解压体积(条目数已被上限约束,不会无界扫描)。
  const windowStart = fileSize - tail.length
  if (cdOffset >= windowStart) {
    const cdStart = cdOffset - windowStart
    let offset = cdStart
    let totalUncompressed = 0
    for (let i = 0; i < entries; i++) {
      if (offset + 46 > tail.length) return { ok: false, error: '压缩包中央目录不完整' }
      const isCentral = tail[offset] === 0x50 && tail[offset + 1] === 0x4b
        && tail[offset + 2] === 0x01 && tail[offset + 3] === 0x02
      if (!isCentral) return { ok: false, error: '压缩包中央目录条目损坏' }
      const entryView = new DataView(tail.buffer, tail.byteOffset + offset, 46)
      totalUncompressed += entryView.getUint32(24, true)
      const nameLen = entryView.getUint16(28, true)
      const extraLen = entryView.getUint16(30, true)
      const commentLen = entryView.getUint16(32, true)
      offset += 46 + nameLen + extraLen + commentLen
      if (totalUncompressed > ARCHIVE_LIMITS.maxDeclaredUncompressedBytes) {
        return { ok: false, error: `压缩包声明解压体积超过 ${Math.round(ARCHIVE_LIMITS.maxDeclaredUncompressedBytes / 1024 / 1024)}MB 上限` }
      }
    }
    return { ok: true, value: { entries, declaredUncompressedBytes: totalUncompressed, centralDirectoryScanned: true } }
  }

  return { ok: true, value: { entries, declaredUncompressedBytes: 0, centralDirectoryScanned: false } }
}

// ---------- 软删除的操作 id(R07) ----------

/**
 * 操作 id:由「对象 key + 版本签名」决定,因此**同一对象的同一版本重试得到同一个 id**。
 * 副本键与回收站记录都由它派生,重试是覆盖而不是新增一条记录 / 一份副本。
 * 软删除(R07)与覆盖前的版本归档(R06)共用这一个派生方式。
 * 用 FNV 风格的小哈希(不引 crypto,Workers 与 Node 都能跑),只用于生成幂等键、不做安全用途。
 */
export function deleteOperationId(key: string, signature: string): string {
  const input = `${key}|${signature}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0
    h2 = (Math.imul(h2 + code, 2246822519) ^ (h1 >>> 13)) >>> 0
  }
  return `${h1.toString(36)}${h2.toString(36)}`
}

export function trashObjectKey(originalKey: string, opId: string): string {
  return `trash/${originalKey}.${opId}`
}

// ---------- 版本归档与条件写(R06) ----------

// 普通重传在覆盖旧对象之前,把旧对象连同 metadata 存进这个前缀。
// 与 trash/ 分开:trash 是"删除后的恢复副本",versions 是"被覆盖的历史版本"。
//
// 每个槽位只留最近一版(2026-09-14 用户拍板):归档键不带版本后缀,重传就是覆盖同一份,
// 所以 versions/ 的体量上限 = 槽位数,不随重传次数增长。代价是找不回"更早的版本" ——
// 旧包绝大多数能从 osu! 重下,只有人工上传且线上没有的图例外。
// 每日清理 Action 只清 trash/,不碰 versions/(它已经是有界的,不需要清理)。
export const VERSIONS_PREFIX = 'versions/'

export function versionObjectKey(originalKey: string): string {
  return `${VERSIONS_PREFIX}${originalKey}`
}

// 条件写:只在目标**不存在**时写入。R2 在条件不满足时 put 返回 null 且不存对象,
// 所以"不覆盖"由存储层保证,不是靠 HEAD 与 write 之间的运气。
export function onlyIfAbsent(): Headers {
  return new Headers({ 'If-None-Match': '*' })
}

// 条件写:只在目标仍是这个版本时写入(compare-and-swap)。
export function onlyIfEtagMatches(etag: string): { etagMatches: string } {
  return { etagMatches: etag }
}

// 版本签名:优先 etag/version,都没有时退化成 size + 上传时间。
// 取不到任何信息时用空串(同一 key 的所有重试仍然落在同一个 opId 上)。
export function objectVersionSignature(obj: {
  etag?: unknown
  httpEtag?: unknown
  version?: unknown
  size?: unknown
  uploaded?: unknown
} | null | undefined): string {
  if (!obj) return ''
  for (const candidate of [obj.etag, obj.httpEtag, obj.version]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  const size = typeof obj.size === 'number' ? obj.size : ''
  const uploaded = obj.uploaded instanceof Date ? obj.uploaded.getTime() : ''
  return `${size}-${uploaded}`
}

// ---------- 与权威比赛数据对齐 ----------

// 从权威 JSON 里确认 roundId + slot 存在且唯一。
// 不复用数组下标:重复 id/slot 时下标会指向错误的项,必须报错让人先修数据。
export function locateMapSlot(tournament: unknown, roundId: string, slot: string): Validation<string> {
  if (!tournament || typeof tournament !== 'object' || Array.isArray(tournament)) {
    return { ok: false, error: '比赛数据不可读' }
  }
  const rounds = (tournament as { rounds?: unknown }).rounds
  if (!Array.isArray(rounds)) return { ok: false, error: '比赛数据缺少 rounds 数组' }

  const matchedRounds = rounds.filter(
    (round) => !!round && typeof round === 'object' && (round as { id?: unknown }).id === roundId,
  )
  if (matchedRounds.length === 0) return { ok: false, error: `比赛数据里没有轮次 ${roundId}` }
  if (matchedRounds.length > 1) {
    return { ok: false, error: `比赛数据里轮次 id「${roundId}」重复（${matchedRounds.length} 个），先修数据再上传` }
  }

  const maps = (matchedRounds[0] as { maps?: unknown }).maps
  if (!Array.isArray(maps)) return { ok: false, error: `轮次 ${roundId} 缺少 maps 数组` }

  const matchedMaps = maps.filter(
    (map) => !!map && typeof map === 'object' && (map as { slot?: unknown }).slot === slot,
  )
  if (matchedMaps.length === 0) return { ok: false, error: `轮次 ${roundId} 里没有槽位「${slot}」` }
  if (matchedMaps.length > 1) {
    return { ok: false, error: `轮次 ${roundId} 里槽位「${slot}」重复（${matchedMaps.length} 个），先修数据再上传` }
  }

  return { ok: true, value: `${roundId}/${slot}` }
}
