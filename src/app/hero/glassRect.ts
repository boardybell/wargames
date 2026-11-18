// Pure object-fit cover geometry. Given where the hero photo actually paints
// (a cover-fit image overflows its box), map a glass rect and a greeting
// anchor authored as fractions of the natural image size into on-screen
// pixels, so the live greeting text sits exactly over the photo's screen
// glass. No DOM reads: callers feed measurements in, which keeps this
// exhaustively testable and frozen-input safe.

export interface Size {
  readonly w: number
  readonly h: number
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

/** object-position as fractions in [0,1] (0.5,0.5 is center). */
export interface ObjectPosition {
  readonly x: number
  readonly y: number
}

export interface HeroCropFractions {
  /** Glass rect as fractions of the natural image size. */
  readonly glass: Rect
  /** Greeting anchor as a fraction point of the natural image size. */
  readonly greetingAnchor: Point
}

export interface GlassGeometry {
  readonly glass: Rect
  readonly greeting: Point
}

/** cover scale: the image is scaled to fully cover the box, so the larger of
 *  the two box/natural ratios wins. */
export function coverScale(box: Size, natural: Size): number {
  return Math.max(box.w / natural.w, box.h / natural.h)
}

export function computeGlassRect(
  box: Size,
  natural: Size,
  position: ObjectPosition,
  crop: HeroCropFractions,
): GlassGeometry {
  const scale = coverScale(box, natural)
  const renderedW = natural.w * scale
  const renderedH = natural.h * scale
  // The overflow (box minus rendered, <= 0 for cover) is distributed by
  // object-position: 0 pins the left/top edge, 1 pins right/bottom, 0.5 centers.
  const offsetX = (box.w - renderedW) * position.x
  const offsetY = (box.h - renderedH) * position.y
  return {
    glass: {
      x: offsetX + crop.glass.x * renderedW,
      y: offsetY + crop.glass.y * renderedH,
      w: crop.glass.w * renderedW,
      h: crop.glass.h * renderedH,
    },
    greeting: {
      x: offsetX + crop.greetingAnchor.x * renderedW,
      y: offsetY + crop.greetingAnchor.y * renderedH,
    },
  }
}

export const CENTER: ObjectPosition = { x: 0.5, y: 0.5 }
