'use strict'

/**
 * `packAs`（临时归类到别的键型包）的判读 —— **合包侧**（CommonJS）的镜像。
 *
 * 为什么要有一份重复的：`scripts/generate-pack.js` 是 CommonJS，而
 * `src/lib/packAs.ts` 是 TS + ESM —— 合包脚本加载不了它（且合包跑在 Node 直跑、
 * 不经过 Next 打包）。仓库里已有同样的先例：`scripts/source-label.js` 对
 * `src/lib` 的同名逻辑、`scripts/mapIdentity.js` 对 `src/lib` 的身份判定。
 *
 * 两份靠 `scripts/pack-as.test.mjs` 的"前后端两份实现必须一致"锁住 ——
 * **改这里必须同时改 `src/lib/packAs.ts`**，否则界面上的"临时归类"和合包的实际
 * 归类会漂开（界面显示归 A、合包却进了 B，或反过来）。
 *
 * 语义与铁律见 `src/lib/packAs.ts` 的文件头，这里只说合包这一侧的关键点：
 *   · 唯一被 `packAs` 影响的是"这张图进哪个键型的包"；
 *     `realType` 仍然是身份、报告、冲突检测的依据，一个字不改。
 *   · 空串/纯空白/非字符串 = 没填（不能归进一个叫空字符串的包）。
 */

/** 这个值能不能当 `packAs` 用。空串、纯空白、非字符串一律当"没填"。 */
function isValidPackAs(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/** 这张图**合包时**该进哪个键型的包。没填 packAs 就是它自己的 realType。 */
function packRealTypeFor(map) {
  const m = map || {}
  return isValidPackAs(m.packAs) ? m.packAs : String(m.realType == null ? '' : m.realType)
}

/** 这张图是不是被临时归类了（= 合包的包 ≠ 它真实的键型）。 */
function isPackAsOverridden(map) {
  const m = map || {}
  return isValidPackAs(m.packAs) && m.packAs !== m.realType
}

/**
 * 键型的**展示名** —— 包内标签 `[Inverse]` 里用的那一个。
 * 镜像 `src/lib/packAs.ts` 的 `realTypeDisplayName`，两处靠测试逐键型比对。
 *
 * 口径：取界面目录（`src/lib/realTypeCatalog.ts`）的 `name` 去掉末尾的 ` (id)`，
 * **不是** `generate-pack.js` 里那份 `REAL_TYPE_NAMES`（两者实测有 49 处不同 ——
 * 例如 SS 那份叫 `Single/Minijack Stream/Consistency`、WTC 叫 `Wild/Ultra Burst tech`）。
 * 用界面名是因为站长在下拉里看到的就是它。
 *
 * 目录里没有的键型（自定义 `customTypes`，如 `HB&SV`）原样返回 id。
 */
const REAL_TYPE_DISPLAY_NAMES = {
  SS: 'Stream',
  JS: 'Jumpstream',
  SA: 'Stamina',
  CJ: 'Chordjack',
  SJ: 'Jackspeed',
  FCJ: 'Finger Control Jack',
  MX: 'Rcmix',
  DP: 'Dump',
  ADP: 'Accurate dump',
  STC: 'Streamtech',
  MTC: 'Minijacktech',
  SATC: 'Stamina tech',
  JTC: 'Jackmained tech',
  WTC: 'Wild tech',
  TC: 'Tech',
  ORC: 'Otherrice',
  PDRC: 'Pending RC',
  HB1: 'Speed/Generic',
  HB2: 'Mid-tempo/Jack/Shield',
  HB3: 'Technical',
  HB4: 'Wildcard',
  HB5: 'Old-school',
  RCmainHB: 'RC-main Hybrid',
  LNmainHB: 'LN-main Hybrid',
  MXHB: 'Mixed HB',
  MNTB: 'Mini Tiebreaker',
  OHB: 'OtherHybrid',
  PDHB: 'Pending HB',
  RE: 'Release',
  CO: 'Coordination',
  TE: 'Timinghell',
  DE: 'Density',
  JW: 'Jacky Wildcard LN',
  SW: 'Speedy Wildcard LN',
  LNMX: 'LN Mixed',
  LNWC: 'LN Wildcard',
  LNTC: 'Technical LN',
  IN: 'Inverse',
  LNWL: 'LNwall',
  OLN: 'Other LN',
  PDLN: 'Pending LN',
  SV1: 'Pattern',
  SV2: 'Rhythm',
  SI: 'Sightread',
  ME: 'Memorization',
  SVMX: 'SVMix',
  GM: 'Gimmick',
  PDSV: 'Pending SV',
  TB: 'Tiebreaker',
  PDEX: 'Pending Special',
}

function realTypeDisplayName(realType) {
  const id = String(realType == null ? '' : realType)
  return REAL_TYPE_DISPLAY_NAMES[id] || id
}

module.exports = {
  isValidPackAs,
  packRealTypeFor,
  isPackAsOverridden,
  realTypeDisplayName,
  REAL_TYPE_DISPLAY_NAMES,
}
