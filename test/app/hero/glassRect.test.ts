import { describe, expect, it } from 'vitest'
import {
  CENTER,
  computeGlassRect,
  coverScale,
  type HeroCropFractions,
} from '@app/hero/glassRect'

// A glass centered in the image, occupying the middle half, greeting at 30% in.
const crop: HeroCropFractions = {
  glass: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  greetingAnchor: { x: 0.3, y: 0.3 },
}

describe('coverScale', () => {
  it('picks the larger box/natural ratio so the image covers', () => {
    // Wider box than the image aspect: width ratio dominates.
    expect(coverScale({ w: 1000, h: 500 }, { w: 1000, h: 1000 })).toBe(1)
    // Taller box: height ratio dominates.
    expect(coverScale({ w: 500, h: 1000 }, { w: 1000, h: 1000 })).toBe(1)
    expect(coverScale({ w: 2000, h: 1000 }, { w: 1000, h: 1000 })).toBe(2)
  })
})

describe('computeGlassRect cover cases', () => {
  it('landscape image in a wider box: width fills, height overflows and centers', () => {
    const box = { w: 1600, h: 400 }
    const natural = { w: 1600, h: 900 }
    const g = computeGlassRect(box, natural, CENTER, crop)
    // scale = max(1600/1600, 400/900)=1; renderedH=900; overflowY=400-900=-500.
    // offsetY = -500*0.5 = -250.
    expect(g.glass.x).toBeCloseTo(0.25 * 1600)
    expect(g.glass.w).toBeCloseTo(0.5 * 1600)
    expect(g.glass.y).toBeCloseTo(-250 + 0.25 * 900)
    expect(g.glass.h).toBeCloseTo(0.5 * 900)
  })

  it('landscape image in a taller box: height fills, width overflows', () => {
    const box = { w: 400, h: 900 }
    const natural = { w: 1600, h: 900 }
    const g = computeGlassRect(box, natural, CENTER, crop)
    // scale = max(400/1600, 900/900)=1; renderedW=1600; overflowX=400-1600=-1200.
    // offsetX = -600.
    expect(g.glass.x).toBeCloseTo(-600 + 0.25 * 1600)
    expect(g.glass.y).toBeCloseTo(0.25 * 900)
  })

  it('portrait image in a wide box and a tall box', () => {
    const natural = { w: 900, h: 1600 }
    const wide = computeGlassRect({ w: 1800, h: 600 }, natural, CENTER, crop)
    // scale=max(1800/900,600/1600)=2; renderedW=1800,renderedH=3200; offsetY=(600-3200)/2=-1300
    expect(wide.glass.x).toBeCloseTo(0.25 * 1800)
    expect(wide.glass.y).toBeCloseTo(-1300 + 0.25 * 3200)
    const tall = computeGlassRect({ w: 450, h: 1600 }, natural, CENTER, crop)
    // scale=max(450/900,1600/1600)=1; renderedW=900; offsetX=(450-900)/2=-225
    expect(tall.glass.x).toBeCloseTo(-225 + 0.25 * 900)
  })

  it('square image and square box map one to one', () => {
    const g = computeGlassRect(
      { w: 1000, h: 1000 },
      { w: 1000, h: 1000 },
      CENTER,
      crop,
    )
    expect(g.glass).toEqual({ x: 250, y: 250, w: 500, h: 500 })
    expect(g.greeting).toEqual({ x: 300, y: 300 })
  })
})

describe('object-position variants', () => {
  const box = { w: 400, h: 900 }
  const natural = { w: 1600, h: 900 }
  it('top-left pins the left edge (offset 0)', () => {
    const g = computeGlassRect(box, natural, { x: 0, y: 0 }, crop)
    expect(g.glass.x).toBeCloseTo(0.25 * 1600)
  })
  it('right pins the right edge (full negative overflow)', () => {
    const g = computeGlassRect(box, natural, { x: 1, y: 0 }, crop)
    // overflowX=-1200; offsetX=-1200.
    expect(g.glass.x).toBeCloseTo(-1200 + 0.25 * 1600)
  })
})

describe('purity and frozen-input safety', () => {
  it('does not throw or mutate on frozen inputs and is deterministic', () => {
    const box = Object.freeze({ w: 800, h: 600 })
    const natural = Object.freeze({ w: 1600, h: 900 })
    const position = Object.freeze({ x: 0.5, y: 0.5 })
    const frozenCrop = Object.freeze({
      glass: Object.freeze({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 }),
      greetingAnchor: Object.freeze({ x: 0.3, y: 0.25 }),
    })
    const a = computeGlassRect(box, natural, position, frozenCrop)
    const b = computeGlassRect(box, natural, position, frozenCrop)
    expect(a).toEqual(b)
    expect(box).toEqual({ w: 800, h: 600 })
  })
})
