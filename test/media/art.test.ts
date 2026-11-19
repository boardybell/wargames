// @vitest-environment node
// Art validation gates not covered by dimensions/base-url/dark-readout/reviews:
// portrait-is-reframe (desktop and portrait hero declare the same scene id),
// every shipped slot carries a JPEG fallback beside its AVIF, and HeroCrop
// fractions stay in [0,1]. Gated by the discovery placeholder exception list so
// the checks bite exactly for slots that have shipped.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { HERO_CROPS } from '../../src/app/hero/heroCrop'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

function readArtSlotIds(): string[] {
  const src = readFileSync(join(repoRoot, 'src/app/art/types.ts'), 'utf8')
  const m = /export type ArtSlotId\s*=([\s\S]*?)\n\n/.exec(src)
  if (!m || !m[1]) throw new Error('could not locate the ArtSlotId union in types.ts')
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]!).filter(Boolean)
}

const SLOT_IDS = readArtSlotIds()
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)
const placeholderSlots: string[] = discovery.exceptions.placeholderSlots
const shipped = SLOT_IDS.filter((id) => !placeholderSlots.includes(id))

describe('hero crop metadata', () => {
  it('portrait-is-reframe: desktop and portrait hero declare the same scene id', () => {
    expect(HERO_CROPS['hero-desktop'].scene).toBe(HERO_CROPS['hero-portrait'].scene)
  })

  it('HeroCrop fractions are all in [0,1]', () => {
    for (const id of ['hero-desktop', 'hero-portrait'] as const) {
      const c = HERO_CROPS[id]
      for (const [k, v] of Object.entries({
        gx: c.glass.x,
        gy: c.glass.y,
        gw: c.glass.w,
        gh: c.glass.h,
        ax: c.greetingAnchor.x,
        ay: c.greetingAnchor.y,
      })) {
        expect(v, `${id}.${k}`).toBeGreaterThanOrEqual(0)
        expect(v, `${id}.${k}`).toBeLessThanOrEqual(1)
      }
      // The glass rect stays inside the frame.
      expect(c.glass.x + c.glass.w, `${id} right edge`).toBeLessThanOrEqual(1)
      expect(c.glass.y + c.glass.h, `${id} bottom edge`).toBeLessThanOrEqual(1)
    }
  })
})

describe('shipped art fallbacks', () => {
  it('every non-excepted slot ships a JPEG fallback alongside its AVIF', () => {
    for (const id of shipped) {
      const jpg = join(repoRoot, 'public/art', `${id}.jpg`)
      expect(existsSync(jpg), `${id}: JPEG fallback missing`).toBe(true)
    }
  })
})
