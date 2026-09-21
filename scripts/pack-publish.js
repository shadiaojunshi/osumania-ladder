'use strict'

/**
 * 合包发布决策（纯函数，不做任何 IO）。
 *
 * 为什么单独抽出来：以前"本次生成到底成不成功"只体现在 console.warn 里，而发布动作
 * （写 manifest / 清孤儿）无条件执行。于是一张谱面损坏、一个包上传失败，都会变成
 * 「新统计配旧对象链接」——线上 manifest 指向的项目数与实际下载到的包不一致，甚至
 * 半新半旧（见 PROJECT-REVIEW-2026-09-12.md 的 R10）。
 *
 * 这里的三个状态：
 *   ok      本次成功产出，可以写进 manifest、可以清理它的旧孤儿
 *   failed  本次**应当成功但没有**（读取/解压/解析失败、上传失败、空包）→ 整次发布取消
 *   skipped 本次数据里该类型一个槽位都没有（类型被删 / 图全没了）→ 保留旧包与旧条目
 *
 * 注意 skipped 与 failed 必须分开：skipped 是"数据里确实没有"，failed 是"有但没拿到"。
 * 把后者当 skipped 处理，就是过去把线上包删掉的那条路。
 */

// 本次应当成功但没有
const STATUS_FAILED = 'failed'
// 本次数据里没有该类型（保留旧包与旧条目）
const STATUS_SKIPPED = 'skipped'
// 本次成功产出
const STATUS_OK = 'ok'

const REASON_LABEL = {
  'r2-upload': 'R2 上传失败',
  'empty-pack': '整包一张都没进来（只剩占位图）',
  'missing-entries': '有谱面没能读进来（下载/解压/解析失败）',
  'slot-count-mismatch': '包内槽位数与计划不符',
  'no-available-files': '该类型有槽位但一张可读的文件都没有（疑似未上传或数据滞后）',
  'no-packs': '该类型计划出包但一个包都没产出',
  'audio-missing': '有谱面没有音频（原包没有、借主图也失败）—— 这种图在游戏里没声音',
  'slots-lost': '本次比上一版少图（疑似 R2 里的文件丢失；确认是数据正常收缩就用 --allow-content-gaps）',
}

function labelOf(reason) {
  return REASON_LABEL[reason] || reason
}

/**
 * 判定单个包是否可以发布。
 *
 * plannedEntries / plannedSlots 是"计划"（chunk 长度与其非 NSV 数），
 * processed* 是"实际 append 的"。两者不等就说明有谱面被跳过 —— 这正是过去静默降级的入口。
 */
function evaluatePack({
  plannedEntries = 0,
  processedEntries = 0,
  plannedSlots = 0,
  processedSlots = 0,
  // 最终没有音频的谱面数（原包没有、借主图也失败）—— 这类图在游戏里没声音。
  audioMissing = 0,
  uploadOk = true,
} = {}) {
  if (!uploadOk) return { status: STATUS_FAILED, reason: 'r2-upload' }
  // 计划里本来就没有条目（不该发生，防呆）：不产出包，但也不算失败。
  if (plannedEntries === 0) return { status: STATUS_OK, reason: 'empty-plan' }
  if (processedSlots === 0 || processedEntries === 0) {
    return { status: STATUS_FAILED, reason: 'empty-pack' }
  }
  if (processedEntries !== plannedEntries) {
    return {
      status: STATUS_FAILED,
      reason: 'missing-entries',
      detail: `计划 ${plannedEntries} 张，实际 ${processedEntries} 张（缺 ${plannedEntries - processedEntries}）`,
    }
  }
  if (processedSlots !== plannedSlots) {
    return {
      status: STATUS_FAILED,
      reason: 'slot-count-mismatch',
      detail: `槽位计划 ${plannedSlots}，实际 ${processedSlots}`,
    }
  }
  // 张数、槽位都对，但有谱面没有音频。过去只 warn 就照发（另一条线的审查 P2）——
  // 与"少了一张"同一档：那张图在包里是坏的，所以这个包不发布。
  if (audioMissing > 0) {
    return {
      status: STATUS_FAILED,
      reason: 'audio-missing',
      detail: `${audioMissing} 张没有音频（原包没有、借主图也失败）`,
    }
  }
  return { status: STATUS_OK, reason: 'ok' }
}

/**
 * 汇总一次全量运行，给出"能不能发布"的结论。
 *
 * typeResults 的每一项形如：
 *   { realType, plannedSlots, packs: [{ key, status, reason, detail }] }
 * 其中 plannedSlots 是该类型在 JSON 里引用的槽位数（不是 R2 里存在的数量）——
 * 用来识别"有槽位但一张都没拿到"这种情况。
 */
function summarizeRun(typeResults = []) {
  const failures = []
  const updatedTypes = []
  const skippedTypes = []

  for (const t of typeResults) {
    if (!t) continue
    if (t.status === STATUS_SKIPPED) {
      skippedTypes.push(t.realType)
      continue
    }
    const packFailures = (t.packs || []).filter((p) => p && p.status === STATUS_FAILED)
    if (packFailures.length > 0) {
      for (const p of packFailures) {
        failures.push({
          realType: t.realType,
          packKey: p.key || null,
          reason: p.reason,
          detail: p.detail || '',
          label: `${t.realType}${p.key ? ' ' + p.key : ''}: ${labelOf(p.reason)}`,
        })
      }
      continue
    }
    if (t.status === STATUS_FAILED) {
      failures.push({
        realType: t.realType,
        packKey: null,
        reason: t.reason,
        detail: t.detail || '',
        label: `${t.realType}: ${labelOf(t.reason)}`,
      })
      continue
    }
    // 有槽位却一个包都没有 → 不能当成"该类型没图了"（那会把线上包清掉）。
    if ((t.packs || []).length === 0 && (t.plannedSlots || 0) > 0) {
      failures.push({
        realType: t.realType,
        packKey: null,
        reason: 'no-packs',
        detail: `JSON 里有 ${t.plannedSlots} 个槽位，但没有产出任何包`,
        label: `${t.realType}: ${labelOf('no-packs')}`,
      })
      continue
    }
    updatedTypes.push(t.realType)
  }

  return {
    publishable: failures.length === 0,
    failures,
    updatedTypes,
    skippedTypes,
  }
}

/**
 * 合并链接：以旧链接为底，用本次新产生的覆盖同名键。
 *
 * 为什么不能直接 `result.links`：本次只产出 r2 链接（googleDrive 是之后
 * upload-to-gdrive.js 写的），整体替换会把人工维护的镜像链接整片抹掉（R10 第 4 条）。
 */
function mergeLinks(previousLinks, currentLinks) {
  const out = {}
  for (const src of [previousLinks, currentLinks]) {
    if (!src || typeof src !== 'object') continue
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v
    }
  }
  return out
}

/**
 * 判断这次是否需要提示"镜像尚未同步"。
 *
 * 包内容变了（本次重新上传了 r2）时，旧 manifest 里的镜像链接指向的还是**旧内容**。
 * 链接要保留（不能丢人工维护的镜像），但必须显式标记出来，免得被当成"镜像已更新"。
 */
function needsMirrorSync(previousEntry, currentLinks, currentObjectKey) {
  if (!previousEntry) return false
  const prevMirrors = Object.keys(previousEntry.links || {}).filter((k) => k !== 'r2')
  // 没有人工镜像链接 → 没什么可同步的。
  if (prevMirrors.length === 0) return false
  // 本次没产出新的 r2 链接 = 这个包根本没被重新生成。
  if (typeof currentLinks?.r2 !== 'string' || currentLinks.r2.length === 0) return false
  // "重新生成过"不等于"内容变了"：对象键是**内容寻址**的，键相同就是同一份字节。
  // 少了这一句，每次全量跑都会给所有包重新打上"镜像未同步"——而它们其实一模一样。
  // Drive 侧有一道 `gdriveObjectKey === objectKey → 跳过上传` 兜着，所以不会重复传输，
  // 但下载页会照着这份标记误报。上一版没记 `gdriveObjectKey` 的历史条目会落到"要同步"，
  // 方向是保守的（宁可让 Drive 那边核对一次）。
  if (currentObjectKey && previousEntry.gdriveObjectKey === currentObjectKey) return false
  return true
}

/**
 * 组装新的 packs 数组。
 *
 * - ok 的类型：整段替换（part 数量变化时，消失的 part 不会残留）
 * - skipped 的类型：原样保留旧条目（数据里没有 ≠ 废弃，很可能是本地数据滞后，
 *   直接丢掉会连带把线上包当孤儿清掉）
 *
 * 前提：只在 publishable 时调用（有 failed 时整次不发布，不该走到这里）。
 */
/**
 * 上一版清单里某个类型一共打过多少张（只数主图，与 mapIdentity 的 slotTotalOf 同口径）。
 * 返回 0 = **没有可用的基准**，不做收缩判定。
 *
 * ⚠️ 只有**这条发布链**产出过的条目才算数：判据是条目带内容寻址的 `objectKey`。
 * 历史覆盖式键时代的清单不能用 —— 那时与现在的键型分类、去重口径都可能不同。
 * 实测（2026-09-21）：仓库里的清单停在 2026-08-13、55 个条目**一个 objectKey 都没有**，
 * 其中 CJ 记着 222 张，而现在数据里 CJ 只有 179 张 —— 差额是 FCJ 重新分类带走的 218 张。
 * 拿它当基准，会把一次完全正常的发布误判成"文件丢了"并整次拦下。
 */
function previousManifestSlotTotal(manifest, realType) {
  const packs = (manifest && manifest.packs) || []
  let total = 0
  for (const p of packs) {
    if (!p || p.realType !== realType) continue
    if (!p.objectKey) continue
    total += Number(p.mapCount) || 0
  }
  return total
}

/**
 * 现有清单能不能当收缩基准？有条目但**一个 objectKey 都没有** = 来自旧的覆盖式键时代。
 * 这种一律不用，只提示一句 —— 从这次发布起才会开始有可比的基准。
 */
function hasComparableBaseline(manifest) {
  const packs = (manifest && manifest.packs) || []
  if (packs.length === 0) return false
  return packs.some((p) => p && p.objectKey)
}

/**
 * 「本次比上一版少了几张」的判定（R10 第 1 条：把"本来未上传"与"上一版有、现在丢了"分开）。
 *
 * 为什么需要基准：数据引用的槽位在 R2 里找不到文件、身份又挂靠不到别的副本时，那个槽位
 * 不会进任何包 —— 过去只 warn，于是"上一版 100 张、这次 99 张"会安静地发出去。
 * 但"本来就没上传"是常态（数据先行），所以只有**比上一版少**才拦。
 *
 * previousSlots = 0 → 没有基准（首次发布 / 历史条目不记张数）→ 不拦。
 * allowContentGaps 是显式放行（确认是数据侧正常收缩）。
 */
function evaluateSlotLoss({ previousSlots = 0, currentSlots = 0, allowContentGaps = false } = {}) {
  const lost = (Number(previousSlots) || 0) - (Number(currentSlots) || 0)
  if (!(lost > 0)) return { lost: 0, blocked: false }
  return { lost, blocked: !allowContentGaps }
}

/**
 * 「这个类型本次一个槽位都没有」时该怎么办（2026-09-21，packAs 引入）。
 *
 * 两种截然不同的原因**必须分开**：
 *   ① 这个键型的图真的没了 / 被删了      → 保留旧包（SKIPPED）。数据滞后也走这条。
 *   ② 图还在，只是**全被临时归类挪走了** → 保留旧包就错了：那些图此刻已经在别的包里，
 *      旧包也还在线上 ⇒ 同一张图同时出现在两个包里，下载页两个包都列它。
 *      返回 OK + 空 packs，走 buildManifestPacks 的"整段替换"分支：旧条目被移除，
 *      包从清单下线，剩下的 R2 对象由 gc-pack-objects 按保留期清理（与"该类型改名/
 *      合并"的既有处理一致）。
 *
 * 为什么不新造第三种 status：SKIPPED 的语义就是"保留旧条目"，而这里要的恰恰是不保留。
 * 复用 SKIPPED 会让 buildManifestPacks 把旧条目留下 —— 那正是 bug ② 本身。
 */
function classifyEmptyType({ movedOutSlots = 0 } = {}) {
  if (movedOutSlots > 0) return { status: STATUS_OK, reason: 'moved-out' }
  return { status: STATUS_SKIPPED, reason: 'no-slots' }
}

/**
 * 收缩护栏（R10）拦下发布时，针对**临时归类（packAs）**的补充说明行。
 *
 * 护栏列的是"R2 里找不到文件的主图槽位"，而临时归类让包变小的时候**一个槽位都列不出来**
 * —— 站长看到的是「少了 3 张（无可列出的槽位）」，下一步就是死胡同。两个方向都要说，
 * 但**不说两家话**：下面②只是"最可能的解释"，不假装能精确归因。
 *
 *   ① 本键型的图被挪走（realType === targetType 但 packAs 指向别处）→ 能直接数出来
 *   ② 之前借进来的图回家了（**撤销** packAs）→ 事后从数据里看不出来：那些图现在的
 *      realType 是别的键型、packAs 也已清空，与本类型再无关联。只能在"确实没有真丢文件"
 *      的前提下作为最可能的解释给出来。
 */
function slotLossHintLines({ movedOutSlots = 0, missingMainSlotCount = 0, lost = 0 } = {}) {
  const lines = []
  if (movedOutSlots > 0) {
    lines.push(`  ⚠ 其中 ${movedOutSlots} 张是**被临时归类（packAs）挪去别的包**的：这不是文件丢失。`)
    lines.push('    确认这是有意的 → 加 --allow-content-gaps 重新发布；旧包（含那些图）会被本次的新包替换。')
  }
  // `movedOutSlots < lost`：全都缺文件时别再把"撤销"当主因，那会盖过真正的原因。
  if (missingMainSlotCount === 0 && movedOutSlots < lost) {
    lines.push('  ⚠ 没有任何槽位真的缺文件 —— 说明这次"变少"不是 R2 掉文件。')
    lines.push('    最可能是**撤销了临时归类**：之前借进本包的图已经回到它们自己的键型包，')
    lines.push('    本包因此缩小（这是正常的，不是故障）。')
    lines.push('    确认如此 → 加 --allow-content-gaps 重新发布。')
  }
  return lines
}

function buildManifestPacks({ typeResults = [], oldManifest = {}, today, preserveOtherTypes = false } = {}) {
  const oldPacks = oldManifest.packs || []
  const byKey = new Map(oldPacks.map((p) => [`${p.realType}#${p.part || 1}`, p]))
  const packs = []
  // pendingMirrors **只增不减**：上一轮遗留的标记必须带上（那些包的镜像此刻仍指向旧内容），
  // 只有 Drive 那一步真的同步成功后才由它清账。过去每轮从空 Set 重建，等于直接宣称
  // "镜像已同步"（另一条线的审查 P2，已确认）。
  const pendingMirrors = new Set(
    (oldManifest.pendingMirrors || []).filter((k) => typeof k === 'string' && k.length > 0),
  )

  const dateOf = today || new Date().toISOString().split('T')[0]

  for (const t of typeResults) {
    if (!t || t.status === STATUS_SKIPPED) continue
    for (const r of t.packs || []) {
      if (r.status === STATUS_FAILED) continue
      const part = r.part || 1
      const key = `${r.realType}#${part}`
      const previous = byKey.get(key)
      const links = mergeLinks(previous?.links, r.links)
      packs.push({
        realType: r.realType,
        name: r.name,
        part,
        // 内容寻址的对象键。本次没产出新键（例如从旧清单原样保留）时沿用旧的。
        objectKey: r.objectKey || previous?.objectKey,
        mapCount: r.mapCount,
        totalMaps: r.totalMaps,
        lastUpdated: dateOf,
        links,
        // 文件 id 要继承：Drive 侧靠它 update 同一个文件，否则每次都会新建一个副本。
        gdriveFileId: previous?.gdriveFileId,
        // Drive 上那个文件对应的是哪个内容键。与本次 objectKey 相同才算"已经是这一版"，
        // 不同就要新建（版本化上传，见 upload-to-gdrive.js 的 syncOnePack）。
        gdriveObjectKey: previous?.gdriveObjectKey,
        sizeMB: r.sizeMB,
      })
      if (needsMirrorSync(previous, r.links, r.objectKey)) pendingMirrors.add(`${r.realType}_${part}.osz`)
    }
  }

  // 保留旧条目的类型：skipped（本次数据里没有该类型）+ —— 单类型模式下 —— 本次根本没
  // 涉及的类型。单类型发布必须开 preserveOtherTypes，否则重建出来的清单只剩一个类型，
  // 等于把其他类型的包全变成孤儿（R12 第 3 条：不能留下旧计数/旧 part 列表）。
  const preserve = new Set(
    typeResults.filter((t) => t && t.status === STATUS_SKIPPED).map((t) => t.realType),
  )
  if (preserveOtherTypes) {
    const touched = new Set(typeResults.filter(Boolean).map((t) => t.realType))
    for (const p of oldPacks) if (!touched.has(p.realType)) preserve.add(p.realType)
  }
  for (const realType of preserve) {
    for (const p of oldPacks.filter((p) => p.realType === realType)) packs.push(p)
  }

  packs.sort((a, b) => (a.realType === b.realType ? (a.part || 1) - (b.part || 1) : a.realType.localeCompare(b.realType)))
  // 只保留"清单里仍存在的条目"的标记：包都下线了，镜像标记也没意义了。
  const present = new Set(packs.map((p) => `${p.realType}_${p.part || 1}.osz`))
  return { packs, pendingMirrors: [...pendingMirrors].filter((k) => present.has(k)).sort() }
}

/**
 * 内容寻址的对象键（R10 第 3 条 / R12 第 6 条）。
 *
 * 过去键是 `realType_part.osz` 的**覆盖式**写入：新包传到一半就失败、或者传完了而
 * manifest 的 git push 失败，"同一个键"的内容已经变了 —— 线上于是出现一半新一半旧，
 * 而清单还指向那个键。现在键里带内容哈希：新内容 = 新键，旧对象原地不动，
 * manifest 一次性切过去（切过去之前，旧键仍是被引用的那一个）。
 * 内容没变时哈希相同 → 复用同一个对象，不产生垃圾。
 */
function objectKeyFor(realType, part, hash) {
  return `${realType}_${part || 1}.${hash}.osz`
}

/** 旧命名（无哈希）。历史 manifest 条目与过渡期仍要用它。 */
function legacyObjectKeyFor(realType, part) {
  return `${realType}_${part || 1}.osz`
}

/**
 * 清单里所有**仍被引用**的对象键。
 * 没有 `objectKey` 的历史条目按旧命名算被引用 —— 否则升级后第一次清理会把它们全删掉。
 */
function referencedObjectKeys(packs = []) {
  const out = new Set()
  for (const p of packs) {
    if (!p) continue
    if (typeof p.objectKey === 'string' && p.objectKey) out.add(p.objectKey)
    else out.add(legacyObjectKeyFor(p.realType, p.part))
  }
  return out
}

/**
 * 桶里的孤儿包 = 有 .osz 对象、但新 manifest 里没有任何条目引用它。
 * 只负责**算**，删不删由调用方决定（且默认只报告，见 R10 第 5 条）。
 */
function findOrphanKeys({ bucketKeys = [], packs = [] } = {}) {
  const referenced = referencedObjectKeys(packs)
  return bucketKeys
    .filter((k) => typeof k === 'string' && k.endsWith('.osz') && !referenced.has(k))
    .sort()
}

/**
 * 带**保留期**的孤儿挑选（给独立的 GC 命令用）。
 *
 * 为什么必须有保留期：刚生成、刚上传、而清单还没提交/还没部署的那批对象，此刻正是
 * "桶里有、清单没引用"的状态。立刻删就是删掉即将上线的东西 —— 这也是为什么 GC 不能
 * 挂在生成流程末尾（另一条线的审查 P1）。
 * 拿不到时间戳的对象**一律不删**（保守）。
 */
function findOrphanObjects({ objects = [], packs = [], minAgeHours = 24, now = Date.now() } = {}) {
  const referenced = referencedObjectKeys(packs)
  const cutoff = now - minAgeHours * 3600 * 1000
  const orphans = []
  const kept = []
  for (const o of objects) {
    const key = typeof o === 'string' ? o : o && o.key
    if (typeof key !== 'string' || !key.endsWith('.osz') || referenced.has(key)) continue
    const t = o && typeof o === 'object' && o.lastModified ? new Date(o.lastModified).getTime() : NaN
    if (!Number.isFinite(t) || t > cutoff) kept.push(key)
    else orphans.push(key)
  }
  return { orphans: orphans.sort(), kept: kept.sort() }
}

/**
 * 把 `--type=` 的输入解析成**规范键**。
 *
 * 大小写不敏感（`ss` → `SS`），但返回的一定是 `knownTypes` 里的那个原样键 ——
 * 不能直接 `toUpperCase()`，否则 `RCmainHB` / `LNmainHB` / `MXHB` 这些混合大小写的
 * 类型会被改写成不存在的键（R12 第 2 条）。
 */
function resolveRealType(input, knownTypes = []) {
  const raw = String(input == null ? '' : input).trim()
  if (!raw) return { type: null }
  if (knownTypes.includes(raw)) return { type: raw }
  const hits = knownTypes.filter((k) => k.toLowerCase() === raw.toLowerCase())
  if (hits.length === 1) return { type: hits[0] }
  if (hits.length > 1) return { error: 'ambiguous-type', candidates: hits }
  return { error: 'unknown-type' }
}

const CLI_USAGE = [
  '用法:node scripts/generate-pack.js [选项]',
  '',
  '  （无选项）                 全量发布:生成 + 上传 R2 + 重建 manifest',
  '  --type=<realType>         只处理该类型。默认**仅离线预览**:生成到 output/,',
  '                            不上传 R2、不动 manifest（不留下旧计数/旧 part 列表）',
  '  --publish                 与 --type 合用:完整更新该类型（上传 R2 + 只替换该类型的',
  '                            manifest 条目,其他类型与人工链接原样保留）',
  '  --offline                 显式声明离线预览（必须与 --type 合用，与 --publish 互斥）',
  '  --identity-report         **只读身份体检**:只读 R2 算身份并写报告,不打包、不上传、',
  '                            不改 manifest、不写 output/。可单独用（=全部类型）或与',
  '                            --type 合用。与 --publish / --offline 互斥。',
  '  --allow-content-gaps      发布时**允许内容缺口**继续：比上一版少图（参考的 .osz 不在 R2）',
  '                            或有谱面没有音频时，默认会**拒绝发布**；加了它才继续，缺口仍会写',
  '                            进日志与身份报告。只在确认是数据侧正常收缩时用。',
  '  --help                    显示本说明',
  '',
  '孤儿清理不在这里:node scripts/gc-pack-objects.mjs（基于**已提交**的清单，默认只报告）。',
].join('\n')

/**
 * 解析命令行。纯函数：不读环境、不碰文件，便于单测（R12 第 2 条）。
 * 返回 { ok, mode, targetType, cleanOrphans, errors, warnings }
 *   mode: 'full' | 'single-preview' | 'single-publish' | 'help'
 *
 * ⚠️ 两条"必须报错、不能静默降级"的边界（另一条线的审查指出，已实测确认）：
 *   · `--type=` 后面是空/空白 → 过去会被当成"没指定类型"→ 静默走**全量发布**
 *   · 只给 `--offline` 不给 `--type` → mode 仍是 full，用户以为在预览、实际会全量上传
 * 两者都改成硬错误：宁可让人重打一遍命令，也不能让人以为在预览。
 */
function parsePackCli(argv = [], { knownTypes = [], excludedTypes = [] } = {}) {
  const opts = {
    mode: 'full',
    targetType: null,
    publish: false,
    // 显式放行内容缺口（比上一版少图 / 有谱面无音频）。默认 false = 缺口一律拒绝发布。
    allowContentGaps: false,
    errors: [],
    warnings: [],
    knownTypes,
    excludedTypes,
  }
  let offline = false
  let help = false
  let identityReport = false
  let sawTypeFlag = false

  for (const arg of argv) {
    const a = String(arg)
    if (a === '--help' || a === '-h') { help = true; continue }
    if (a === '--publish') { opts.publish = true; continue }
    if (a === '--offline') { offline = true; continue }
    if (a === '--identity-report') { identityReport = true; continue }
    if (a === '--allow-content-gaps') { opts.allowContentGaps = true; continue }
    if (a === '--clean-orphans') {
      // 孤儿清理已拆到独立命令：它必须基于**已提交/已部署**的清单来判，
      // 放在生成流程里会因为"重跑一次 hash 变了"而删掉线上正在引用的对象。
      opts.errors.push({ arg: a, error: 'clean-orphans-moved' })
      continue
    }
    if (a.startsWith('--type=')) {
      sawTypeFlag = true
      const raw = a.slice('--type='.length)
      if (raw.trim() === '') {
        opts.errors.push({ arg: a, error: 'empty-type' })
        continue
      }
      const r = resolveRealType(raw, knownTypes)
      if (r.error === 'unknown-type') opts.errors.push({ arg: a, error: 'unknown-type' })
      else if (r.error === 'ambiguous-type') opts.errors.push({ arg: a, error: 'ambiguous-type', candidates: r.candidates })
      else if (r.type) {
        if (opts.targetType && opts.targetType !== r.type) {
          opts.errors.push({ arg: a, error: 'duplicate-type', previous: opts.targetType })
        } else {
          opts.targetType = r.type
        }
      }
      continue
    }
    // 关键:任何没被识别的参数都当错误 —— 过去是静默忽略,打错类型名会变成"全量发布"。
    opts.errors.push({ arg: a, error: 'unknown-option' })
  }

  if (help) return { ok: true, ...opts, mode: 'help' }

  // 只读身份体检：与打包/发布完全独立的模式。**必须先于下面各分支返回**，
  // 否则「没给 --type」会被当成全量发布（那就真的要推 R2 了）。
  if (identityReport) {
    opts.identityReport = true
    if (opts.publish) opts.errors.push({ arg: '--publish', error: 'identity-report-conflict' })
    if (offline) opts.errors.push({ arg: '--offline', error: 'identity-report-conflict' })
    // 参数循环里还不知道是不是本模式（`--identity-report` 可能写在 `--type=` 之后），
    // 所以在这里把已经记下的 empty-type 改成**本模式的说法**：本模式下省略 --type 是
    // "体检全部类型"，沿用 single 模式的"默认是全量发布"会误导人。
    for (const e of opts.errors) if (e.error === 'empty-type') e.error = 'identity-report-empty-type'
    const hasTypeError = opts.errors.some((e) =>
      e.error === 'identity-report-empty-type' || e.error === 'unknown-type' || e.error === 'ambiguous-type')
    if (sawTypeFlag && !opts.targetType && !hasTypeError) {
      opts.errors.push({ arg: '--type=', error: 'identity-report-empty-type' })
    }
    if (opts.targetType && (opts.excludedTypes || []).includes(opts.targetType)) {
      opts.warnings.push({ code: 'excluded-type', type: opts.targetType })
    }
    return { ok: opts.errors.length === 0, ...opts, mode: 'identity-report' }
  }

  if (opts.publish && offline) {
    opts.errors.push({ arg: '--publish/--offline', error: 'conflicting-flags' })
  }

  if (opts.targetType) {
    opts.mode = opts.publish ? 'single-publish' : 'single-preview'
    if (excludedTypes.includes(opts.targetType)) {
      // 合法类型,只是不产下载包（Pending 族）—— 提示,不算参数错误。
      opts.warnings.push({ code: 'excluded-type', type: opts.targetType })
    }
  } else {
    if (opts.publish) opts.errors.push({ arg: '--publish', error: 'requires-type' })
    if (offline) opts.errors.push({ arg: '--offline', error: 'offline-requires-type' })
    if (sawTypeFlag) opts.errors.push({ arg: '--type=', error: 'empty-type' })
  }

  return { ok: opts.errors.length === 0, ...opts }
}

/**
 * 判断手上的清单有没有资格当孤儿清理的基准（另一条线的审查 P1：清理脚本直接相信本地清单）。
 *
 * 判据来自 git —— 本地唯一那份"线上到底是什么"的记录。三个事实都是**三态**：
 * true / false / null（null = 无法判断）。只有**明确为 false** 才算危险证据：
 * 否则在"不是 git 仓库 / 游离 HEAD"的环境里永远跑不动，而那种环境并不会更危险。
 *   · tracked          文件被版本控制跟踪（未跟踪的文件用 `git diff` 看是"干净"的，会骗过检查）
 *   · matchesHead      内容与 HEAD 一致（有未提交改动 ⇒ 线上还不是这一版）
 *   · pushedToUpstream 这次提交已在 upstream 上（本地领先 ⇒ 线上更不可能是这一版）
 *
 * 默认值取 fail-closed（tracked/matchesHead = false）—— 调用方忘了传事实时是拒绝，不是放行。
 * `allowUncommitted` 强行放行时返回 `forced: true`，由调用方把警告打出去。
 */
function evaluateManifestLiveness({
  tracked = false,
  matchesHead = false,
  pushedToUpstream = null,
  allowUncommitted = false,
} = {}) {
  const problems = []
  const unknowns = []
  if (tracked === false) {
    problems.push('清单文件没有被 git 跟踪（未跟踪的文件用 diff 看是"干净"的，不能当依据）')
  } else if (tracked === null) {
    unknowns.push('无法确认清单是否被 git 跟踪')
  } else if (matchesHead === false) {
    problems.push('清单有未提交的改动（线上还是旧的那一版）')
  } else if (matchesHead === null) {
    unknowns.push('无法确认清单是否与 HEAD 一致')
  }
  if (pushedToUpstream === false) {
    problems.push('清单所在的提交还没推到 upstream（线上不可能已经是这一版）')
  } else if (pushedToUpstream === null) {
    unknowns.push('无法确认清单是否已推送')
  }

  const warning = unknowns.length ? `${unknowns.join('；')} —— 请自己确认线上已是这一版` : ''
  if (problems.length === 0) return { ok: true, code: 'ok', detail: '', forced: false, warning }
  const detail = problems.join('；')
  if (allowUncommitted) return { ok: true, code: 'forced', detail, forced: true, warning }
  return { ok: false, code: 'not-live', detail, forced: false, warning }
}

function describeCliError(err) {
  switch (err.error) {
    case 'unknown-option':
      return `未知选项 ${err.arg}`
    case 'unknown-type':
      return `${err.arg} —— 未知的 realType（大小写不敏感匹配仍然找不到）`
    case 'ambiguous-type':
      return `${err.arg} —— 大小写不敏感匹配到多个候选:${(err.candidates || []).join(', ')}`
    case 'empty-type':
      return `${err.arg} —— --type= 后面是空的。要么填类型名，要么别带这个参数（不带的默认行为是**全量发布**）`
    case 'duplicate-type':
      return `${err.arg} —— 重复指定了不同的类型（已经指定过 ${err.previous}）`
    case 'conflicting-flags':
      return `${err.arg} —— 只能选一个:--publish（发布）或 --offline（离线预览）`
    case 'requires-type':
      return `${err.arg} —— --publish 必须与 --type=<realType> 合用（全量模式本来就是发布）`
    case 'offline-requires-type':
      return `${err.arg} —— --offline 必须与 --type=<realType> 合用。全量离线模式尚未实现，单用会被误当成全量发布，所以这里直接拒绝。`
    case 'clean-orphans-moved':
      return `${err.arg} —— 孤儿清理已拆成独立命令，请用 node scripts/gc-pack-objects.mjs（默认只报告）。生成流程里不再真删任何对象。`
    case 'identity-report-conflict':
      return `${err.arg} —— --identity-report 是只读体检，不能与发布/预览开关合用（它本来就不打包、不上传、不改 manifest）`
    case 'identity-report-empty-type':
      return `${err.arg} —— --identity-report 下 --type= 不能为空；想体检全部类型就直接省略 --type 参数（那是只读的，不会发布任何东西）`
    default:
      return `${err.arg} —— ${err.error}`
  }
}

module.exports = {
  STATUS_OK,
  STATUS_FAILED,
  STATUS_SKIPPED,
  REASON_LABEL,
  labelOf,
  evaluatePack,
  summarizeRun,
  mergeLinks,
  needsMirrorSync,
  buildManifestPacks,
  findOrphanKeys,
  findOrphanObjects,
  objectKeyFor,
  legacyObjectKeyFor,
  referencedObjectKeys,
  resolveRealType,
  parsePackCli,
  evaluateManifestLiveness,
  evaluateSlotLoss,
  previousManifestSlotTotal,
  hasComparableBaseline,
  classifyEmptyType,
  slotLossHintLines,
  describeCliError,
  CLI_USAGE,
}
