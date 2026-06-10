/**
 * 难度刻度颜色的主题适配。
 *
 * reform-dan 的最高几档（η/ζ/ε）原色接近纯黑，
 * 在暗色背景（neutral-950 几乎也是黑）上糊成一片看不见；
 * 最低档（intro1-）几乎纯白，在亮色上同样糊。
 *
 * 思路：色相不变（语义色），只在 HSL 上夹紧亮度 L。
 *   - dark 主题：L < DARK_FLOOR 时拉到 DARK_FLOOR；
 *   - light 主题：L > LIGHT_CEIL 时压到 LIGHT_CEIL。
 *
 * 仅用于显示。原始 hex（reform-dan.json）不动。
 */

export type Theme = 'light' | 'dark'

const DARK_FLOOR = 62 // 暗色最低亮度（%）：保证在 #0a0a0a 上可读
const LIGHT_CEIL = 88 // 亮色最高亮度（%）：保证 intro 系列不糊在白底上

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [r, g, b]
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// 标准 RGB <-> HSL（输入 0..255，HSL 都是 0..1，外部按需 * 100）
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
      case gn: h = (bn - rn) / d + 2; break
      case bn: h = (rn - gn) / d + 4; break
    }
    h /= 6
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return [hk(h + 1 / 3) * 255, hk(h) * 255, hk(h - 1 / 3) * 255]
}

/**
 * 根据当前主题把刻度颜色夹到可读区间。
 * 输入支持 "#rrggbb"，其它格式（短 hex 等）原样返回。
 */
export function adjustScaleColorForTheme(hex: string, theme: Theme): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const [r, g, b] = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const lp = l * 100
  let target = lp
  if (theme === 'dark' && lp < DARK_FLOOR) target = DARK_FLOOR
  else if (theme === 'light' && lp > LIGHT_CEIL) target = LIGHT_CEIL
  if (target === lp) return hex
  // 亮度被显著抬高 / 压低后，纯色（s≈0）会显得灰；保留原始 s 即可，
  // 但灰度色（s=0）拉亮还是灰，η+(#000) 在暗色就会变成中灰——这是预期，
  // 它本来就该和 η/η- 一起从黑→灰渐变，只是要可读。
  const [r2, g2, b2] = hslToRgb(h, s, target / 100)
  return rgbToHex(r2, g2, b2)
}
