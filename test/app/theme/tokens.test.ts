import { describe, expect, it } from 'vitest'
import {
  COLOR_DIM,
  COLOR_FOCUS,
  COLOR_GLASS,
  COLOR_GLYPH,
  VIGNETTE_MAX_DARKEN,
  contrastAtVignette,
  contrastRatio,
  darken,
} from '@app/theme'

// Contrast is measured INCLUDING the vignette's darkest overlap (both glyph
// and background are dimmed by VIGNETTE_MAX_DARKEN). These assertions import
// the live palette and vignette constants, so deepening the vignette or
// dulling a color past AA fails this test.
describe('palette contrast at the vignette worst case', () => {
  it('glyph core clears WCAG AA 4.5:1', () => {
    expect(contrastAtVignette(COLOR_GLYPH)).toBeGreaterThanOrEqual(4.5)
  })

  it('dim secondary text clears AA', () => {
    expect(contrastAtVignette(COLOR_DIM)).toBeGreaterThanOrEqual(4.5)
  })

  it('focus ring clears AA', () => {
    expect(contrastAtVignette(COLOR_FOCUS)).toBeGreaterThanOrEqual(4.5)
  })

  it('the vignette strength is the binding constraint', () => {
    // Tied to the LIVE constant, not a magic number: the glyph clears AA at
    // VIGNETTE_MAX_DARKEN, but pushing the vignette 0.2 darker drops it below
    // AA, so the constant genuinely sits against the contrast boundary.
    expect(contrastAtVignette(COLOR_GLYPH)).toBeGreaterThanOrEqual(4.5)
    const deeper = VIGNETTE_MAX_DARKEN + 0.2
    const tooStrong = contrastRatio(
      darken(COLOR_GLYPH, deeper),
      darken(COLOR_GLASS, deeper),
    )
    expect(tooStrong).toBeLessThan(4.5)
  })
})
