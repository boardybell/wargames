// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  clicksToFractions,
  overlayPixels,
} from '../../media/tools/calibrate-core'
import { computeGlassRect } from '../../src/app/hero/glassRect'

// A synthetic hero at a fixed natural size. Clicking known corners must emit
// exact HeroCrop fractions, and the overlay must land where computeGlassRect
// (the shell's math) places it, for both a desktop and a portrait box.
const natural = { w: 2000, h: 1000 }

describe('calibrate-core: clicks to fractions', () => {
  it('two glass corners plus a greeting click yield exact fractions', () => {
    const crop = clicksToFractions(
      {
        glassCornerA: { x: 500, y: 300 }, // 0.25, 0.30
        glassCornerB: { x: 1500, y: 700 }, // 0.75, 0.70
        greeting: { x: 800, y: 400 }, // 0.40, 0.40
      },
      natural,
    )
    expect(crop.glass).toEqual({ x: 0.25, y: 0.3, w: 0.5, h: 0.4 })
    expect(crop.greetingAnchor).toEqual({ x: 0.4, y: 0.4 })
  })

  it('normalizes corner order (B above-left of A)', () => {
    const crop = clicksToFractions(
      {
        glassCornerA: { x: 1500, y: 700 },
        glassCornerB: { x: 500, y: 300 },
        greeting: { x: 1000, y: 500 },
      },
      natural,
    )
    expect(crop.glass).toEqual({ x: 0.25, y: 0.3, w: 0.5, h: 0.4 })
  })

  it('throws on a nonpositive natural size', () => {
    expect(() =>
      clicksToFractions(
        {
          glassCornerA: { x: 0, y: 0 },
          glassCornerB: { x: 1, y: 1 },
          greeting: { x: 0, y: 0 },
        },
        { w: 0, h: 100 },
      ),
    ).toThrow()
  })
})

describe('calibrate-core: overlay delegates to computeGlassRect (pure, no DOM)', () => {
  const crop = clicksToFractions(
    {
      glassCornerA: { x: 500, y: 300 },
      glassCornerB: { x: 1500, y: 700 },
      greeting: { x: 800, y: 400 },
    },
    natural,
  )

  it('places the rect at the shell pixels for a desktop box', () => {
    const box = { w: 1280, h: 720 }
    const pos = { x: 0.5, y: 0.5 }
    const got = overlayPixels(crop, box, natural, pos)
    const want = computeGlassRect(box, natural, pos, crop)
    expect(got).toEqual(want)
  })

  it('places the rect at the shell pixels for a portrait box', () => {
    const box = { w: 540, h: 960 }
    const pos = { x: 0.5, y: 0.5 }
    const got = overlayPixels(crop, box, natural, pos)
    const want = computeGlassRect(box, natural, pos, crop)
    expect(got).toEqual(want)
  })

  it('the desktop overlay math is exact (cover scale and offset)', () => {
    // natural 2000x1000, box 1280x720: cover scale = max(1280/2000, 720/1000)
    // = max(0.64, 0.72) = 0.72. rendered = 1440x720. offsetX = (1280-1440)*0.5
    // = -80. glass.x = -80 + 0.25*1440 = 280. glass.w = 0.5*1440 = 720.
    const geo = overlayPixels(crop, { w: 1280, h: 720 }, natural, { x: 0.5, y: 0.5 })
    expect(geo.glass.x).toBeCloseTo(280, 6)
    expect(geo.glass.w).toBeCloseTo(720, 6)
    expect(geo.glass.y).toBeCloseTo(216, 6) // offsetY 0 + 0.3*720
    expect(geo.glass.h).toBeCloseTo(288, 6) // 0.4*720
  })
})
