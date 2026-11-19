// Pure calibration math for the HeroCrop click-calibration tool. No DOM, no
// browser globals: pixel clicks plus a natural image size go in, HeroCrop
// fractions come out; fractions plus an on-screen box go in, overlay pixels
// come out. The browser page (calibrate.html) is a thin event layer over
// these two functions, and the node tests cover them without a browser.
//
// The overlay math does NOT reimplement cover geometry: it delegates to
// computeGlassRect from the shell so the tool and the live hero can never
// drift. Integer-free fraction space in, exact pixel space out.
import {
  computeGlassRect,
  type GlassGeometry,
  type HeroCropFractions,
  type ObjectPosition,
  type Point,
  type Size,
} from '../../src/app/hero/glassRect'

/** A click in displayed-image pixel space. The page scales the natural image
 *  to fit the screen; clicks are reported back in natural pixels (the page
 *  divides by its display scale before calling this), so these are already in
 *  the natural coordinate system. */
export interface PixelPoint {
  readonly x: number
  readonly y: number
}

/** The two corner clicks for the glass rect plus the one greeting-anchor
 *  click, all in natural-image pixels. */
export interface CalibrationClicks {
  readonly glassCornerA: PixelPoint
  readonly glassCornerB: PixelPoint
  readonly greeting: PixelPoint
}

/** Convert raw pixel clicks on an image of a known natural size into HeroCrop
 *  fractions. The two glass corners may be clicked in any order; the rect is
 *  normalized to a non-negative width and height. Fractions are exact ratios,
 *  never rounded, so a round-trip through overlayPixels reproduces the clicks.
 */
export function clicksToFractions(
  clicks: CalibrationClicks,
  natural: Size,
): HeroCropFractions {
  if (natural.w <= 0 || natural.h <= 0) {
    throw new Error('calibrate: natural size must be positive')
  }
  const x0 = Math.min(clicks.glassCornerA.x, clicks.glassCornerB.x)
  const y0 = Math.min(clicks.glassCornerA.y, clicks.glassCornerB.y)
  const x1 = Math.max(clicks.glassCornerA.x, clicks.glassCornerB.x)
  const y1 = Math.max(clicks.glassCornerA.y, clicks.glassCornerB.y)
  return {
    glass: {
      x: x0 / natural.w,
      y: y0 / natural.h,
      w: (x1 - x0) / natural.w,
      h: (y1 - y0) / natural.h,
    },
    greetingAnchor: {
      x: clicks.greeting.x / natural.w,
      y: clicks.greeting.y / natural.h,
    },
  }
}

/** Place the computed crop back over the image at a given on-screen box, using
 *  the same object-fit cover geometry the live hero uses. Pure delegation to
 *  computeGlassRect so the overlay the calibrator sees is exactly the overlay
 *  the shell will render. */
export function overlayPixels(
  crop: HeroCropFractions,
  box: Size,
  natural: Size,
  position: ObjectPosition,
): GlassGeometry {
  return computeGlassRect(box, natural, position, crop)
}

/** Format a HeroCrop fractions object as the JSON block that pastes into the
 *  registry entry. Deterministic key order and fixed precision so a copy from
 *  the page matches a copy from a test. */
export function fractionsToRegistryJson(
  srcKey: string,
  crop: HeroCropFractions,
  greetingAnchor: Point = crop.greetingAnchor,
): string {
  const round = (n: number) => Number(n.toFixed(4))
  const out = {
    srcKey,
    glass: {
      x: round(crop.glass.x),
      y: round(crop.glass.y),
      w: round(crop.glass.w),
      h: round(crop.glass.h),
    },
    greetingAnchor: { x: round(greetingAnchor.x), y: round(greetingAnchor.y) },
  }
  return JSON.stringify(out, null, 2)
}
