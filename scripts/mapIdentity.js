'use strict'

/**
 * 谱面身份判定（纯函数，不做任何 IO）。
 *
 * 背景（PROJECT-REVIEW-2026-09-12.md 的 R11）：合包去重过去只看
 * `Artist|Title|Creator|Version` 这个元数据指纹 —— 同一个转换器批量产出的图、或者
 * 同一首歌的不同谱面，元数据完全相同而音符完全不同，于是**两张不同的图被判成同一张、
 * 只打包一张**，另一个槽位的玩家下到的是别的曲子。元数据全空时更糟：全库的空元数据
 * 谱面会得到同一个指纹串（`|||`），一律合并。
 *
 * 这里的规则：
 *   1. 元数据只用来**收窄候选**（同作者同曲名才值得比对），不作为等价性依据；
 *      元数据四项全空 → 不参与候选分组（各自独立）。
 *   2. 等价性由**内容摘要**决定：只取玩法相关的内容（Mode / [Difficulty] /
 *      [TimingPoints] / [HitObjects]），忽略 Metadata、Events（背景视频）、Colours、
 *      Editor、Storyboard —— 合包会改写 Metadata 与音频/背景文件名，那些不算身份。
 *   3. 读不到内容的引用一律**不合并**（签名退化成自己的路径），绝不能因为"都读不到"
 *      而合并到一起。
 *   4. 同一个 beatmapId 下内容不同 → 保留为两个条目并报冲突（BID 不是绝对权威：
 *      改版、倍速版、陈旧 JSON 都可能共用 BID）。
 */

const crypto = require('crypto')

// 参与身份的内容段：玩法相关的全部数据
const CONTENT_SECTIONS = new Set(['Difficulty', 'TimingPoints', 'HitObjects'])
// [General] 里只有 Mode 参与身份（AudioFilename / PreviewTime 等是资源引用，不算玩法）
const GENERAL_KEEP = new Set(['Mode'])

/**
 * 把 .osu 文本规范化成"只含玩法内容"的字符串。
 * 段名 + 行内容都保留，避免不同段里同样的行互相抵消。
 */
function canonicalContent(osuText) {
  const text = String(osuText == null ? '' : osuText).replace(/\r\n?/g, '\n')
  let section = ''
  const out = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    // 空行与注释行不影响身份（Events 段那种 `//Background...` 很常见，段内也可能有）
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim()
      continue
    }
    if (CONTENT_SECTIONS.has(section)) {
      out.push(section + '\t' + line)
      continue
    }
    if (section === 'General') {
      const m = /^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/.exec(line)
      if (m && GENERAL_KEEP.has(m[1])) out.push('General\t' + m[1] + ':' + m[2].trim())
    }
  }
  return out.join('\n')
}

/**
 * 内容摘要。返回 null 表示"没有可比的玩法内容"（空谱 / 只有元数据），
 * 调用方必须把它当成"不可合并"，不能当成"都相同"。
 */
function contentSignature(osuText) {
  const canonical = canonicalContent(osuText)
  if (!canonical) return null
  return crypto.createHash('sha1').update(canonical, 'utf8').digest('hex').slice(0, 16)
}

/**
 * 元数据候选键（只用于分组，不做等价判定）。
 * 四项全空 → null（不参与候选）。
 */
function metadataCandidateKey(meta) {
  const m = meta || {}
  const parts = [m.artist, m.title, m.creator, m.version]
    .map((v) => String(v == null ? '' : v).trim().toLowerCase())
  if (parts.every((p) => p === '')) return null
  return parts.join('|')
}

/**
 * 单个引用的候选键：有 BID 用 BID（osu! 的权威身份），否则用元数据候选键，
 * 都没有 → 只认自己（`solo:`），保证绝不被合并。
 */
function candidateKeyOf({ beatmapId, metadataKey, r2Key }) {
  if (beatmapId) return 'bid:' + beatmapId
  if (metadataKey) return 'meta:' + metadataKey
  return 'solo:' + r2Key
}

/**
 * 合并键 = 候选键 + NSV 标志 + 内容摘要。
 * 内容摘要缺失时退化成自己的路径（不合并）。
 */
function clusterKeyOf({ candidateKey, isNsv, contentKey, r2Key }) {
  const sig = contentKey || 'raw:' + r2Key
  return candidateKey + '|nsv:' + (isNsv ? 1 : 0) + '|c:' + sig
}

/**
 * 找出"需要读内容核对"的物理路径。
 *
 * 只有同一个 BID 出现在多个路径上才有歧义 —— 单一路径的 BID 本身就是身份。
 * 另外用 R2 对象的**大小**先筛一道：同一个 BID 的两个副本如果大小不同，内容必然
 * 不同（.osz 是确定的字节序列），直接判为"不合并 + 报冲突"，不必各下载一次。
 * 只有大小相同的才值得下载比对内容。size 缺失时保守处理（当作需要核对）。
 */
function pathsNeedingContentCheck(entries, sizes) {
  const byBid = new Map()
  for (const e of entries) {
    if (!e.beatmapId || !e.exists) continue
    if (!byBid.has(e.beatmapId)) byBid.set(e.beatmapId, [])
    byBid.get(e.beatmapId).push(e)
  }
  const out = new Set()
  for (const list of byBid.values()) {
    if (new Set(list.map((e) => e.r2Key)).size < 2) continue
    const bySize = new Map()
    for (const e of list) {
      const size = sizes && typeof sizes.get === 'function' ? sizes.get(e.r2Key) : undefined
      if (size == null) { out.add(e.r2Key); continue } // 不知道大小 → 只能读
      if (!bySize.has(size)) bySize.set(size, [])
      bySize.get(size).push(e)
    }
    for (const group of bySize.values()) {
      if (group.length > 1) for (const e of group) out.add(e.r2Key)
    }
  }
  return out
}

/**
 * 把已收集的引用聚成"可打包条目"。
 *
 * 输入项：{ r2Key, beatmapId, isNsv, source, exists, metadataKey, contentKey }
 * 返回 { clusters, conflicts, unresolved }
 *   clusters   —— 每个可打包条目（含 alternatePaths 与 sources）
 *   conflicts  —— 同一 BID/同一元数据下内容不同的组（人工核对项）
 *   unresolved —— 文件缺失且身份无法确认的引用（标签不能乱挂）
 */
function clusterEntries(entries = []) {
  const present = entries.filter((e) => e && e.exists)
  const missing = entries.filter((e) => e && !e.exists)

  const clusters = new Map()
  for (const e of present) {
    const candidateKey = candidateKeyOf(e)
    const key = clusterKeyOf({ candidateKey, isNsv: e.isNsv, contentKey: e.contentKey, r2Key: e.r2Key })
    const existing = clusters.get(key)
    if (existing) {
      existing.sources.push(e.source)
      if (!existing.alternatePaths.includes(e.r2Key)) existing.alternatePaths.push(e.r2Key)
      existing.memberKeys.push(e.r2Key)
    } else {
      clusters.set(key, {
        key,
        candidateKey,
        isNsv: !!e.isNsv,
        beatmapId: e.beatmapId || null,
        // 代表值（取第一个成员）——打包时用它，除非首选路径读不出来
        ...e,
        source: undefined,
        sources: [e.source],
        memberKeys: [e.r2Key],
        alternatePaths: [e.r2Key],
      })
    }
  }

  // 同一候选键下出现多个簇 = 元数据/BID 相同但内容不同 → 报出来
  const byCandidate = new Map()
  for (const c of clusters.values()) {
    if (!byCandidate.has(c.candidateKey)) byCandidate.set(c.candidateKey, [])
    byCandidate.get(c.candidateKey).push(c)
  }
  const conflicts = []
  for (const [candidateKey, group] of byCandidate) {
    const kinds = new Set(group.map((c) => c.isNsv ? 1 : 0))
    for (const kind of kinds) {
      const same = group.filter((c) => (c.isNsv ? 1 : 0) === kind)
      if (same.length < 2) continue
      conflicts.push({
        candidateKey,
        isNsv: !!kind,
        reason: candidateKey.startsWith('bid:') ? 'same-bid-different-content' : 'same-metadata-different-content',
        members: same.map((c) => ({
          beatmapId: c.beatmapId,
          paths: c.alternatePaths.slice(),
          sources: c.sources.slice(),
          contentKey: c.contentKey || null,
        })),
      })
    }
  }

  // 缺文件的引用：只有身份能唯一确认时才把标签挂到那个副本上
  const unresolved = []
  for (const e of missing) {
    let target = null
    if (e.beatmapId) {
      const matching = [...clusters.values()].filter((c) => c.beatmapId === e.beatmapId && !!c.isNsv === !!e.isNsv)
      if (matching.length === 1) target = matching[0]
    }
    if (target) {
      target.sources.push(e.source)
      target.missingPaths = (target.missingPaths || []).concat(e.r2Key)
    } else {
      unresolved.push({
        r2Key: e.r2Key,
        beatmapId: e.beatmapId || null,
        isNsv: !!e.isNsv,
        source: e.source,
        reason: e.beatmapId ? 'ambiguous-bid' : 'no-bid',
      })
    }
  }

  return { clusters: [...clusters.values()], conflicts, unresolved }
}

/**
 * 找出「内容摘要相同、但身份来源（候选键）不同」的组。
 *
 * 这是当前实现**既不会合并、也不会报冲突**的一类重复：候选键三选一互斥
 * （有 BID → `bid:N`；否则元数据 → `meta:…`；都没有 → `solo:路径`），而合并键 =
 * 候选键 + NSV + 内容摘要 —— 于是两张内容逐字节相同、但一张带 BID 一张不带的图，
 * 会各自成簇、在包里静默地各占一个条目（包内 Version 只差来源标签前缀）。
 *
 * **只用于出报告，不参与任何合并决策。** 想改成"同内容就合并"之前，先用它看清全库
 * 到底有多少这种重复（改动会动到包内条目数与 manifest.mapCount，不能拍脑袋做）。
 *
 * 读不到内容（`contentKey` 为空）的引用**不参与** —— 不能因为"都读不到"就说它们相等。
 *
 * 输入项：{ r2Key, beatmapId, metadataKey, isNsv, contentKey, sources? }
 * 输出：[{ contentKey, isNsv, groups: [{ candidateKey, members: [{ r2Key, sources }] }] }]
 */
function findSameContentDifferentIdentity(entries = []) {
  const bySignature = new Map()
  for (const e of entries) {
    if (!e || !e.contentKey) continue
    const key = e.contentKey + '|nsv:' + (e.isNsv ? 1 : 0)
    if (!bySignature.has(key)) bySignature.set(key, [])
    bySignature.get(key).push(e)
  }

  const out = []
  for (const [, list] of bySignature) {
    const byCandidate = new Map()
    for (const e of list) {
      const candidateKey = candidateKeyOf(e)
      if (!byCandidate.has(candidateKey)) byCandidate.set(candidateKey, [])
      byCandidate.get(candidateKey).push(e)
    }
    // 只有一个候选键 → 走的是正常合并路径（已经合成一条），不算"跨身份来源的重复"。
    if (byCandidate.size < 2) continue
    out.push({
      contentKey: list[0].contentKey,
      isNsv: !!list[0].isNsv,
      groups: [...byCandidate.entries()].map(([candidateKey, members]) => ({
        candidateKey,
        members: members.map((e) => ({
          r2Key: e.r2Key,
          // 两种输入形状都接受：`sources`（数组）或 `source`（单条，clusterEntries 用的形状）
          sources: (e.sources || (e.source ? [e.source] : [])).slice(),
        })),
      })),
    })
  }

  // 稳定顺序：先主图后 NSV，再按摘要、再按首个候选键。
  return out.sort(
    (a, b) =>
      (a.isNsv ? 1 : 0) - (b.isNsv ? 1 : 0) ||
      a.contentKey.localeCompare(b.contentKey) ||
      a.groups[0].candidateKey.localeCompare(b.groups[0].candidateKey),
  )
}

/**
 * 计数口径：只数**主图**簇（NSV 变体是同一槽位的附加难度，不算新槽位）。
 * 必须与 manifest.mapCount（包内非 NSV 条目数）同口径，否则下载页进度条
 * 分子永远追不上分母（R11 第 5 条）。
 */
function slotTotalOf(clusters = []) {
  return clusters.filter((c) => c && !c.isNsv).length
}

/**
 * 从候选路径里挑第一个"R2 里确实存在"的作为首选。
 * 读不出来的情况由预取阶段按 alternatePaths 依次兜底（R11 第 3 条）。
 */
function pickExistingPath(alternatePaths, r2Keys) {
  if (!r2Keys || typeof r2Keys.has !== 'function') return null
  for (const p of alternatePaths || []) if (r2Keys.has(p)) return p
  return null
}

/**
 * 按顺序尝试候选路径，返回第一个成功的结果。
 *
 * `attempt(path, index)` 由调用方注入（真实实现是"下载 + 解析 + 校验内容摘要"），
 * 所以这段"首选坏了就换备选"的逻辑可以脱网单测（R11 第 3 条）。
 * 返回 { ok:true, ...结果, usedPath, attempts } 或 { ok:false, attempts, last }。
 */
async function tryPathsInOrder(paths, attempt) {
  const list = (paths && paths.length) ? paths : []
  let last = null
  for (let i = 0; i < list.length; i++) {
    const res = await attempt(list[i], i)
    if (res && res.ok) return { ...res, usedPath: list[i], attempts: i + 1 }
    last = res
  }
  return { ok: false, attempts: list.length, last }
}

/**
 * 预取时校验备选内容是否与簇一致。备选摘要不同 = 拿别的图冒充，必须拒绝。
 */
function isEquivalent(entry, signature) {
  if (!entry || !entry.contentKey) return true // 没有基准（如 BID 单路径）就不额外拦
  return entry.contentKey === signature
}

module.exports = {
  CONTENT_SECTIONS,
  canonicalContent,
  contentSignature,
  metadataCandidateKey,
  candidateKeyOf,
  clusterKeyOf,
  pathsNeedingContentCheck,
  clusterEntries,
  findSameContentDifferentIdentity,
  slotTotalOf,
  pickExistingPath,
  tryPathsInOrder,
  isEquivalent,
}
