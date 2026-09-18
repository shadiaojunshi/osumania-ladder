// 写入 GitHub 的 JSON 的运行时结构校验 —— 所有写路径共用的最后一道闸。
//
// 为什么需要:TypeScript 的 `as` 只是编译期断言,运行时什么都拦不住。
// 模拟已复现 create 端点接受 `../outside`(规范化后写到 data/outside.json,
// 跑到 tournaments 目录之外)、batch 接受 `rounds` 为字符串、ref-ladder 静默
// 丢弃非法项并截断到 500 项。这些坏数据一旦进仓库,下次静态构建就会读到。
//
// 边界怎么定的:不是凭直觉,而是先扫描 data/ 下全部真实数据(50 场比赛 / 345 轮 /
// 4429 个槽位)再定。**刻意放宽**的地方都有数据依据:
//   - tournament/round 的 name、abbreviation 只校验类型与长度,允许空串 ——
//     admin 表单新建轮次时默认就是 name:'' / abbreviation:''(TournamentForm.addRound),
//     要求非空会把「先建轮次再填名字」这个正常流程挡在门外。
//   - slot 允许 / & ( ) 等字符 —— 现有数据里确有 'ACC/HR1'、'FS/TB'、'GM(FL&EZ)'。
//   - tournament 的 sheetUrl / forumUrl / wikiUrl 不做 http(s) 协议限制 ——
//     现有 129 条里就有 5 条是纯文本标题(如 'Tourney Method - 4 Digit ...')。
//   - map.name 可以缺省也可以是空串 —— 现有 4429 个槽位里 2 个没有该字段、
//     114 个是空串;这是「还没填曲名」的正常状态,不能硬补假值。
//   - 数值只要求有限,不对普通难度做非负截断(LN 与手填负值都出现过讨论)。
//   - schema 里没列出的字段一律原样保留(自定义键型、后续扩展)。
//
// 校验失败一律返回结构化 400,不抛异常、不写任何外部存储。

// 显式带扩展名:raw.ts 等入口也用这种写法,顺便让 node --test 能直接加载这条链。
import { isValidTournamentId } from './tournamentId.ts'

export interface ValidationFailure {
  ok: false
  error: string
}

export interface ValidationSuccess<T> {
  ok: true
  value: T
}

export type Validation<T> = ValidationSuccess<T> | ValidationFailure

// 上限:全部按现有数据的实测最大值留出充裕余量,只在「明显异常」时才拒绝。
export const LIMITS = {
  maxIdLength: 128,
  maxRoundIdLength: 64,
  maxNameLength: 300,
  maxAbbreviationLength: 60,
  maxUrlLength: 500,
  maxTagCount: 50,
  maxTagLength: 60,
  maxRoundCount: 200,
  maxMapsPerRound: 200,
  maxTotalMaps: 5000,
  maxSlotLength: 40,
  maxTypeLength: 40,
  maxTypeDifficultyKeys: 60,
  maxCustomTypeCount: 60,
  // 难度上限。与 src/lib/difficultyLimits.ts 的 DIFFICULTY_MAX 必须一致
  // (前后端不能互相 import,scripts/difficulty-limits.test.mjs 会断言相等)。
  // 现有全库最大难度 17 / difficultyLn 17.2,上限 25 不会误伤真实数据。
  maxDifficulty: 25,
  maxReferenceCount: 500,
  maxLadderEntries: 1000,
  maxPackCount: 500,
  maxBatchItems: 200,
  maxSummaryLength: 200,
  maxJsonBodyBytes: 16 * 1024 * 1024,
  maxReportedErrors: 10,
} as const

// 轮次 id 会进 R2 对象键 maps/{tid}/{rid}/{slot}.osz,所以限定为安全的单段标识。
// 比 tournament id 多允许下划线:JSON 导入的轮次 id 可能写成 'QF_1' 这种。
const ROUND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

interface Ctx {
  errors: string[]
  count: number
}

function fail(ctx: Ctx, message: string): void {
  ctx.count += 1
  if (ctx.errors.length < LIMITS.maxReportedErrors) ctx.errors.push(message)
}

// 有错就返回失败对象;错误过多时只列前若干条并标注总数。
function finish(ctx: Ctx): ValidationFailure | null {
  if (ctx.count === 0) return null
  const omitted = ctx.count - ctx.errors.length
  const suffix = omitted > 0 ? `（另有 ${omitted} 处未列出）` : ''
  return { ok: false, error: `数据校验未通过：${ctx.errors.join('；')}${suffix}` }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

interface StringRule {
  required?: boolean
  nonEmpty?: boolean
  maxLength?: number
  noControlChar?: boolean
}

function checkString(ctx: Ctx, value: unknown, path: string, rule: StringRule = {}): string | undefined {
  if (value === undefined || value === null) {
    if (rule.required) fail(ctx, `${path} 缺失`)
    return undefined
  }
  if (typeof value !== 'string') {
    fail(ctx, `${path} 必须是字符串（收到 ${typeName(value)}）`)
    return undefined
  }
  if (rule.nonEmpty && value.trim() === '') fail(ctx, `${path} 不能为空`)
  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    fail(ctx, `${path} 超过 ${rule.maxLength} 字符（当前 ${value.length}）`)
  }
  if (rule.noControlChar && hasControlChar(value)) fail(ctx, `${path} 含控制字符`)
  return value
}

interface NumberRule {
  required?: boolean
  integer?: boolean
  min?: number
  max?: number
}

function checkNumber(ctx: Ctx, value: unknown, path: string, rule: NumberRule = {}): number | undefined {
  if (value === undefined || value === null) {
    if (rule.required) fail(ctx, `${path} 缺失`)
    return undefined
  }
  if (!isFiniteNumber(value)) {
    fail(ctx, `${path} 必须是有限数字（收到 ${typeName(value)}）`)
    return undefined
  }
  if (rule.integer && !Number.isInteger(value)) fail(ctx, `${path} 必须是整数（收到 ${value}）`)
  if (rule.min !== undefined && value < rule.min) fail(ctx, `${path} 不能小于 ${rule.min}（收到 ${value}）`)
  if (rule.max !== undefined && value > rule.max) fail(ctx, `${path} 不能大于 ${rule.max}（收到 ${value}）`)
  return value
}

// ── 比赛 JSON ────────────────────────────────────────────────────────────────

export function validateTournament(value: unknown): Validation<Record<string, unknown>> {
  const ctx: Ctx = { errors: [], count: 0 }
  if (!isPlainObject(value)) {
    return { ok: false, error: `比赛数据必须是 JSON 对象（收到 ${typeName(value)}）` }
  }

  const id = checkString(ctx, value.id, 'id', {
    required: true,
    nonEmpty: true,
    maxLength: LIMITS.maxIdLength,
    noControlChar: true,
  })
  if (typeof id === 'string' && id.trim() !== '' && !isValidTournamentId(id)) {
    fail(ctx, `id 只能包含字母、数字和连字符,且不能以连字符开头: ${id}`)
  }

  // 表单第一步的「下一步」按钮就以 name/abbreviation 非空为条件,所以这里要求非空
  // 不会挡住任何正常流程(TournamentForm.canProceed)。
  checkString(ctx, value.name, 'name', { required: true, nonEmpty: true, maxLength: LIMITS.maxNameLength })
  checkString(ctx, value.abbreviation, 'abbreviation', {
    required: true,
    nonEmpty: true,
    maxLength: LIMITS.maxAbbreviationLength,
  })
  checkNumber(ctx, value.keyCount, 'keyCount', { required: true, integer: true, min: 1, max: 20 })
  checkNumber(ctx, value.year, 'year', { required: true, integer: true, min: 1990, max: 2100 })
  checkNumber(ctx, value.priority, 'priority')
  // 刻意不校验协议:现有 5 条是纯文本标题。
  checkString(ctx, value.sheetUrl, 'sheetUrl', { maxLength: LIMITS.maxUrlLength })
  checkString(ctx, value.forumUrl, 'forumUrl', { maxLength: LIMITS.maxUrlLength })
  checkString(ctx, value.wikiUrl, 'wikiUrl', { maxLength: LIMITS.maxUrlLength })

  if (value.tags !== undefined && value.tags !== null) {
    if (!Array.isArray(value.tags)) {
      fail(ctx, `tags 必须是数组（收到 ${typeName(value.tags)}）`)
    } else {
      if (value.tags.length > LIMITS.maxTagCount) fail(ctx, `tags 最多 ${LIMITS.maxTagCount} 项`)
      value.tags.forEach((tag, i) => {
        checkString(ctx, tag, `tags[${i}]`, { nonEmpty: true, maxLength: LIMITS.maxTagLength })
      })
    }
  }

  if (value.customTypes !== undefined && value.customTypes !== null) {
    if (!Array.isArray(value.customTypes)) {
      fail(ctx, `customTypes 必须是数组（收到 ${typeName(value.customTypes)}）`)
    } else {
      if (value.customTypes.length > LIMITS.maxCustomTypeCount) {
        fail(ctx, `customTypes 最多 ${LIMITS.maxCustomTypeCount} 项`)
      }
      value.customTypes.forEach((raw, i) => {
        const path = `customTypes[${i}]`
        if (!isPlainObject(raw)) {
          fail(ctx, `${path} 必须是对象`)
          return
        }
        checkString(ctx, raw.id, `${path}.id`, {
          required: true,
          nonEmpty: true,
          maxLength: LIMITS.maxIdLength,
          noControlChar: true,
        })
        checkString(ctx, raw.name, `${path}.name`, { required: true, maxLength: LIMITS.maxNameLength })
        checkString(ctx, raw.parentType, `${path}.parentType`, {
          maxLength: LIMITS.maxTypeLength,
          noControlChar: true,
        })
        checkString(ctx, raw.color, `${path}.color`, { maxLength: 64, noControlChar: true })
      })
    }
  }

  if (!Array.isArray(value.rounds)) {
    fail(ctx, `rounds 必须是数组（收到 ${typeName(value.rounds)}）`)
  } else if (value.rounds.length > LIMITS.maxRoundCount) {
    fail(ctx, `rounds 最多 ${LIMITS.maxRoundCount} 项（当前 ${value.rounds.length}）`)
  } else {
    validateRounds(ctx, value.rounds)
  }

  return finish(ctx) ?? { ok: true, value }
}

function validateRounds(ctx: Ctx, rounds: unknown[]): void {
  const seenRoundIds = new Set<string>()
  let totalMaps = 0

  rounds.forEach((raw, ri) => {
    const path = `rounds[${ri}]`
    if (!isPlainObject(raw)) {
      fail(ctx, `${path} 必须是对象（收到 ${typeName(raw)}）`)
      return
    }

    const rid = checkString(ctx, raw.id, `${path}.id`, {
      required: true,
      nonEmpty: true,
      maxLength: LIMITS.maxRoundIdLength,
      noControlChar: true,
    })
    if (typeof rid === 'string' && rid.trim() !== '') {
      if (!ROUND_ID_PATTERN.test(rid)) {
        fail(ctx, `${path}.id 只能包含字母、数字、下划线和连字符: ${rid}`)
      } else if (seenRoundIds.has(rid)) {
        // 与 handlers 里 findDuplicateRoundIds 的文案保持一致,便于前端/测试匹配。
        fail(ctx, `${path}.id 重复的 round id: ${rid}（R2 对象键会互相覆盖）`)
      } else {
        seenRoundIds.add(rid)
      }
    }

    checkString(ctx, raw.name, `${path}.name`, { required: true, maxLength: LIMITS.maxNameLength })
    checkString(ctx, raw.abbreviation, `${path}.abbreviation`, {
      required: true,
      maxLength: LIMITS.maxAbbreviationLength,
    })
    checkNumber(ctx, raw.order, `${path}.order`, { required: true, integer: true, min: 0, max: 1000 })

    if (raw.isQualifier !== undefined && raw.isQualifier !== null && typeof raw.isQualifier !== 'boolean') {
      fail(ctx, `${path}.isQualifier 必须是布尔值（收到 ${typeName(raw.isQualifier)}）`)
    }
    checkNumber(ctx, raw.bestOf, `${path}.bestOf`, { integer: true, min: 1, max: 99 })

    if (raw.difficulty !== undefined && raw.difficulty !== null) {
      if (!isPlainObject(raw.difficulty)) {
        fail(ctx, `${path}.difficulty 必须是对象（收到 ${typeName(raw.difficulty)}）`)
      } else {
        checkNumber(ctx, raw.difficulty.min, `${path}.difficulty.min`, { max: LIMITS.maxDifficulty })
        checkNumber(ctx, raw.difficulty.max, `${path}.difficulty.max`, { max: LIMITS.maxDifficulty })
        checkNumber(ctx, raw.difficulty.average, `${path}.difficulty.average`, { max: LIMITS.maxDifficulty })
      }
    }

    if (raw.typeDifficulties !== undefined && raw.typeDifficulties !== null) {
      if (!isPlainObject(raw.typeDifficulties)) {
        fail(ctx, `${path}.typeDifficulties 必须是对象（收到 ${typeName(raw.typeDifficulties)}）`)
      } else {
        const keys = Object.keys(raw.typeDifficulties)
        if (keys.length > LIMITS.maxTypeDifficultyKeys) {
          fail(ctx, `${path}.typeDifficulties 类别过多（${keys.length}）`)
        }
        // 键不做枚举限制:自定义键型也要能存。
        for (const key of keys) {
          const dims = raw.typeDifficulties[key]
          if (!isPlainObject(dims)) {
            fail(ctx, `${path}.typeDifficulties.${key} 必须是对象（收到 ${typeName(dims)}）`)
            continue
          }
          for (const dim of Object.keys(dims)) {
            checkNumber(ctx, dims[dim], `${path}.typeDifficulties.${key}.${dim}`, { max: LIMITS.maxDifficulty })
          }
        }
      }
    }

    if (!Array.isArray(raw.maps)) {
      fail(ctx, `${path}.maps 必须是数组（收到 ${typeName(raw.maps)}）`)
      return
    }
    if (raw.maps.length > LIMITS.maxMapsPerRound) {
      fail(ctx, `${path}.maps 最多 ${LIMITS.maxMapsPerRound} 项（当前 ${raw.maps.length}）`)
    }
    totalMaps += raw.maps.length
    validateMaps(ctx, raw.maps, path)
  })

  if (totalMaps > LIMITS.maxTotalMaps) fail(ctx, `谱面总数超过 ${LIMITS.maxTotalMaps}（${totalMaps}）`)
}

function validateMaps(ctx: Ctx, maps: unknown[], roundPath: string): void {
  const seenSlots = new Set<string>()

  maps.forEach((raw, mi) => {
    const path = `${roundPath}.maps[${mi}]`
    if (!isPlainObject(raw)) {
      fail(ctx, `${path} 必须是对象（收到 ${typeName(raw)}）`)
      return
    }

    // slot 会和 round id 一起拼进 R2 对象键,要求非空且轮内唯一。
    const slot = checkString(ctx, raw.slot, `${path}.slot`, {
      required: true,
      nonEmpty: true,
      maxLength: LIMITS.maxSlotLength,
      noControlChar: true,
    })
    if (typeof slot === 'string' && slot.trim() !== '') {
      if (seenSlots.has(slot)) fail(ctx, `${path}.slot 与本轮其它谱面重复: ${slot}`)
      else seenSlots.add(slot)
    }

    checkString(ctx, raw.type, `${path}.type`, {
      required: true,
      maxLength: LIMITS.maxTypeLength,
      noControlChar: true,
    })
    checkString(ctx, raw.realType, `${path}.realType`, {
      required: true,
      maxLength: LIMITS.maxTypeLength,
      noControlChar: true,
    })
    checkNumber(ctx, raw.difficulty, `${path}.difficulty`, { required: true, max: LIMITS.maxDifficulty })
    checkNumber(ctx, raw.difficultyLn, `${path}.difficultyLn`, { max: LIMITS.maxDifficulty })
    checkString(ctx, raw.name, `${path}.name`, { maxLength: LIMITS.maxNameLength })
    checkString(ctx, raw.oszUrl, `${path}.oszUrl`, { maxLength: LIMITS.maxUrlLength })

    for (const key of ['beatmapId', 'beatmapsetId'] as const) {
      const bid = raw[key]
      if (bid === undefined || bid === null) continue
      checkNumber(ctx, bid, `${path}.${key}`, { integer: true, min: 0 })
    }
  })
}

// ── references.json ─────────────────────────────────────────────────────────
// 结构:{ points: [{ label, difficulty, type? }] }

export function validateReferences(value: unknown): Validation<Record<string, unknown>> {
  const ctx: Ctx = { errors: [], count: 0 }
  if (!isPlainObject(value)) {
    return { ok: false, error: `references 必须是 JSON 对象（收到 ${typeName(value)}）` }
  }
  if (!Array.isArray(value.points)) {
    fail(ctx, `points 必须是数组（收到 ${typeName(value.points)}）`)
    return finish(ctx)!
  }
  if (value.points.length > LIMITS.maxReferenceCount) {
    fail(ctx, `points 最多 ${LIMITS.maxReferenceCount} 项（当前 ${value.points.length}）`)
  }
  value.points.forEach((raw, i) => {
    const path = `points[${i}]`
    if (!isPlainObject(raw)) {
      fail(ctx, `${path} 必须是对象（收到 ${typeName(raw)}）`)
      return
    }
    checkString(ctx, raw.label, `${path}.label`, { required: true, nonEmpty: true, maxLength: 120 })
    checkNumber(ctx, raw.difficulty, `${path}.difficulty`, { required: true })
    if (raw.type !== undefined && raw.type !== null && !['rice', 'ln', 'both'].includes(String(raw.type))) {
      fail(ctx, `${path}.type 只能是 rice / ln / both（收到 ${JSON.stringify(raw.type)}）`)
    }
  })
  return finish(ctx) ?? { ok: true, value }
}

// ── packs-manifest.json ─────────────────────────────────────────────────────
// 结构:{ packs: [{ realType, name, part?, mapCount, totalMaps, lastUpdated,
//                links: { [镜像名]: url }, gdriveFileId?, sizeMB? }], lastGenerated }

export function validatePacksManifest(value: unknown): Validation<Record<string, unknown>> {
  const ctx: Ctx = { errors: [], count: 0 }
  if (!isPlainObject(value)) {
    return { ok: false, error: `manifest 必须是 JSON 对象（收到 ${typeName(value)}）` }
  }
  checkString(ctx, value.lastGenerated, 'lastGenerated', { required: true, maxLength: 40 })

  if (!Array.isArray(value.packs)) {
    fail(ctx, `packs 必须是数组（收到 ${typeName(value.packs)}）`)
    return finish(ctx)!
  }
  if (value.packs.length > LIMITS.maxPackCount) {
    fail(ctx, `packs 最多 ${LIMITS.maxPackCount} 项（当前 ${value.packs.length}）`)
  }

  value.packs.forEach((raw, i) => {
    const path = `packs[${i}]`
    if (!isPlainObject(raw)) {
      fail(ctx, `${path} 必须是对象（收到 ${typeName(raw)}）`)
      return
    }
    checkString(ctx, raw.realType, `${path}.realType`, {
      required: true,
      nonEmpty: true,
      maxLength: LIMITS.maxTypeLength,
      noControlChar: true,
    })
    checkString(ctx, raw.name, `${path}.name`, { required: true, maxLength: LIMITS.maxNameLength })
    checkNumber(ctx, raw.part, `${path}.part`, { integer: true, min: 1, max: 999 })
    checkNumber(ctx, raw.mapCount, `${path}.mapCount`, { required: true, integer: true, min: 0 })
    checkNumber(ctx, raw.totalMaps, `${path}.totalMaps`, { required: true, integer: true, min: 0 })
    checkString(ctx, raw.lastUpdated, `${path}.lastUpdated`, { required: true, maxLength: 40 })
    checkString(ctx, raw.gdriveFileId, `${path}.gdriveFileId`, { maxLength: 200, noControlChar: true })
    checkNumber(ctx, raw.sizeMB, `${path}.sizeMB`)

    if (!isPlainObject(raw.links)) {
      fail(ctx, `${path}.links 必须是对象（收到 ${typeName(raw.links)}）`)
      return
    }
    // 下载链接必须是 http(s):这两个链接会直接显示给玩家点击。
    for (const key of Object.keys(raw.links)) {
      const url = raw.links[key]
      const checked = checkString(ctx, url, `${path}.links.${key}`, {
        required: true,
        nonEmpty: true,
        maxLength: LIMITS.maxUrlLength,
        noControlChar: true,
      })
      if (typeof checked === 'string' && checked.trim() !== '' && !isHttpUrl(checked)) {
        fail(ctx, `${path}.links.${key} 必须是 http(s) 链接: ${checked}`)
      }
    }
  })

  return finish(ctx) ?? { ok: true, value }
}

// ── ref-ladder.json ─────────────────────────────────────────────────────────
// 结构:{ entries: [{ tournamentId, roundId, step? }] } —— 一条易→难的有序链。
// 与旧实现的区别:旧代码会把非法项丢掉、把超过 500 项的尾部截断然后照样返回成功;
// 那样用户以为保存成功了,实际数据被悄悄裁剪。现在改为明确 400 并指出第几项。

export interface LadderEntry {
  tournamentId: string
  roundId: string
  step?: number
}

export function validateRefLadderEntries(value: unknown): Validation<LadderEntry[]> {
  const ctx: Ctx = { errors: [], count: 0 }
  if (!Array.isArray(value)) {
    return { ok: false, error: `entries 必须是数组（收到 ${typeName(value)}）` }
  }
  if (value.length > LIMITS.maxLadderEntries) {
    fail(ctx, `entries 最多 ${LIMITS.maxLadderEntries} 项（当前 ${value.length}）`)
  }

  const entries: LadderEntry[] = []
  value.forEach((raw, i) => {
    const path = `entries[${i}]`
    if (!isPlainObject(raw)) {
      fail(ctx, `${path} 必须是对象（收到 ${typeName(raw)}）`)
      return
    }
    const tournamentId = checkString(ctx, raw.tournamentId, `${path}.tournamentId`, {
      required: true,
      nonEmpty: true,
      maxLength: LIMITS.maxIdLength,
      noControlChar: true,
    })
    if (typeof tournamentId === 'string' && tournamentId.trim() !== '' && !isValidTournamentId(tournamentId)) {
      fail(ctx, `${path}.tournamentId 只能包含字母、数字和连字符: ${tournamentId}`)
    }
    const roundId = checkString(ctx, raw.roundId, `${path}.roundId`, {
      required: true,
      nonEmpty: true,
      maxLength: LIMITS.maxRoundIdLength,
      noControlChar: true,
    })
    const entry: LadderEntry = {
      tournamentId: typeof tournamentId === 'string' ? tournamentId : '',
      roundId: typeof roundId === 'string' ? roundId : '',
    }
    if (raw.step !== undefined && raw.step !== null) {
      const step = checkNumber(ctx, raw.step, `${path}.step`, { min: 0.1, max: 10 })
      if (typeof step === 'number') entry.step = step
    }
    entries.push(entry)
  })

  return finish(ctx) ?? { ok: true, value: entries }
}

// ── 通用 ────────────────────────────────────────────────────────────────────

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// 校验 URL 路径里的 id。路径穿越(../、含 / 或 %)在这里就被挡住,
// 不依赖后续的 URI 编码。
export function validatePathId(value: unknown): Validation<string> {
  if (typeof value !== 'string' || value === '') {
    return { ok: false, error: '缺少比赛 ID' }
  }
  if (!isValidTournamentId(value)) {
    return { ok: false, error: `非法比赛 ID: ${value}（只允许字母、数字和连字符）` }
  }
  return { ok: true, value }
}

// 读 JSON 请求体。坏 JSON 必须变成结构化 400,不能冒泡成 TypeError → 500。
// 参数类型故意放松:测试里的 stub 只需要实现 json()/headers.get()。
export interface JsonBodyRequest {
  json: () => Promise<unknown>
  body?: ReadableStream<Uint8Array> | null
  headers?: { get: (name: string) => string | null | undefined }
}

export async function readJsonBody(
  request: JsonBodyRequest,
  maxBytes: number = LIMITS.maxJsonBodyBytes,
): Promise<Validation<unknown>> {
  const declared = Number(request.headers?.get?.('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, error: `请求体超过 ${maxBytes} 字节上限` }
  }
  try {
    // Content-Length 只是快速拒绝；实际流必须计数，否则分块传输可绕过上限。
    // 无 body 的轻量测试 stub 保持兼容；真实 Request 始终提供 body 属性。
    if (request.body) {
      const reader = request.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let size = 0
      let text = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) {
            await reader.cancel().catch(() => {})
            return { ok: false, error: `请求体超过 ${maxBytes} 字节上限` }
          }
          text += decoder.decode(value, { stream: true })
        }
        text += decoder.decode()
        return { ok: true, value: JSON.parse(text) }
      } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
      } finally {
        reader.releaseLock()
      }
    }
    return { ok: true, value: await request.json() }
  } catch {
    return { ok: false, error: '请求体不是合法 JSON' }
  }
}

// 从 URL 路径参数里取 id 并校验。
export function tournamentPathId(params: Record<string, unknown>): Validation<string> {
  return validatePathId(params.id)
}
