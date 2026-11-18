// The one palette module. These constants feed both the CSS custom
// properties (theme.css) and the automated contrast tests, so a palette edit
// that breaks AA fails CI rather than shipping. The look is an electric blue
// dot-matrix terminal on navy-black glass (see planning/reference/crt-reference.jpg).

/** Glass background: navy-black. */
export const COLOR_GLASS = '#050A14'
/** Glyph core: electric blue. AA against the glass at the vignette's darkest. */
export const COLOR_GLYPH = '#6CB6FF'
/** Dim secondary text, still AA at the same worst case. */
export const COLOR_DIM = '#7FB0E0'
/** Focus ring. */
export const COLOR_FOCUS = '#9FD8FF'

// Amber and red are reserved for cabinet chrome (section 08) only. They live
// here so there is one palette module; nothing in theme/ or crt/ uses them.
// House rule: a status color always pairs with text, never color alone.
export const COLOR_AMBER = '#FFB84D'
export const COLOR_RED = '#FF5C5C'

/** The vignette is a radial dark overlay ABOVE the text layer, so at its
 *  darkest overlap it dims both glyph and background. Contrast is measured
 *  there; this constant is constrained by the AA check, not the reverse.
 *  At 0.25, glyph/dim/focus clear 4.5:1 with headroom. */
export const VIGNETTE_MAX_DARKEN = 0.25

type RGB = readonly [number, number, number]

function parseHex(hex: string): RGB {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of an sRGB hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

/** Darken a color toward black by fraction d (the vignette overlap). */
export function darken(hex: string, d: number): string {
  const [r, g, b] = parseHex(hex)
  const to2 = (c: number): string =>
    Math.round(c * (1 - d))
      .toString(16)
      .padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

/** WCAG contrast ratio between two sRGB hex colors (>= 1). */
export function contrastRatio(fg: string, bg: string): number {
  const lf = relativeLuminance(fg)
  const lb = relativeLuminance(bg)
  const hi = Math.max(lf, lb) + 0.05
  const lo = Math.min(lf, lb) + 0.05
  return hi / lo
}

/** Contrast of a foreground over the glass at the vignette's darkest overlap:
 *  both colors are dimmed by VIGNETTE_MAX_DARKEN, which is the real worst case
 *  for light-on-dark text (the additive WCAG offset means dimming both lowers
 *  the ratio). Scanline darkening over the same pixels is intentionally NOT
 *  composited here (the plan scopes the automated guard to the vignette); the
 *  deploy Playwright pass verifies the full composite against the reference. */
export function contrastAtVignette(fg: string): number {
  return contrastRatio(
    darken(fg, VIGNETTE_MAX_DARKEN),
    darken(COLOR_GLASS, VIGNETTE_MAX_DARKEN),
  )
}
