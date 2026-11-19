// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import sharp from 'sharp'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

// The ArtSlotId union is the real source of truth: parse it out of the shell's
// types.ts so a slot added or removed there flows straight into this check.
function readArtSlotIds(): string[] {
  const src = readFileSync(join(repoRoot, 'src/app/art/types.ts'), 'utf8')
  const m = /export type ArtSlotId\s*=([\s\S]*?)\n\n/.exec(src)
  if (!m || !m[1]) throw new Error('could not locate the ArtSlotId union in types.ts')
  return [...m[1].matchAll(/'([a-z-]+)'/g)]
    .map((x) => x[1])
    .filter((x): x is string => Boolean(x))
}

const SLOT_IDS = readArtSlotIds()
const dims = JSON.parse(
  readFileSync(join(repoRoot, 'media/slot-dimensions.json'), 'utf8'),
)
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)
const placeholderSlots: string[] = discovery.exceptions.placeholderSlots

const HERO_SLOTS = new Set(['hero-desktop', 'hero-portrait', 'hero-return'])
const HERO_BYTE_CEIL = 300 * 1024
const OTHER_BYTE_CEIL = 160 * 1024
const TOTAL_AVIF_CEIL = 2.4 * 1024 * 1024

describe('slot-dimensions table (live now)', () => {
  it('every ArtSlotId has exactly one dimensions entry, no strays', () => {
    const tableIds = Object.keys(dims.slots)
    expect(tableIds.slice().sort()).toEqual(SLOT_IDS.slice().sort())
    expect(SLOT_IDS.length).toBe(13)
  })

  it('every entry carries a 2x pixel target, tolerance, and a derivation comment', () => {
    for (const [id, d] of Object.entries<Record<string, unknown>>(dims.slots)) {
      expect(typeof d.targetW, id).toBe('number')
      expect(typeof d.targetH, id).toBe('number')
      expect(typeof d.tolerancePx, id).toBe('number')
      expect(typeof d.derivation, id).toBe('string')
      expect((d.derivation as string).length, id).toBeGreaterThan(0)
    }
  })
})

describe('shipped AVIF assets (gated by the placeholder exception list)', () => {
  const shipped = SLOT_IDS.filter((id) => !placeholderSlots.includes(id))

  it('gating: a slot neither shipped nor excepted fails; excepted slots skip', () => {
    for (const id of SLOT_IDS) {
      const isExcepted = placeholderSlots.includes(id)
      const avif = join(repoRoot, 'public/art', `${id}.avif`)
      const present = existsSync(avif)
      // The gate: every slot is either shipped (present) or excepted. Neither
      // means CI bites.
      expect(present || isExcepted, `${id}: neither shipped nor excepted`).toBe(true)
    }
  })

  it('every non-excepted slot ships a conforming AVIF under its byte ceiling', async () => {
    let totalAvif = 0
    for (const id of shipped) {
      const avif = join(repoRoot, 'public/art', `${id}.avif`)
      expect(existsSync(avif), `${id}: AVIF missing`).toBe(true)
      const meta = await sharp(avif).metadata()
      const d = dims.slots[id]
      expect(Math.abs((meta.width || 0) - d.targetW), `${id} width`).toBeLessThanOrEqual(
        d.tolerancePx,
      )
      expect(Math.abs((meta.height || 0) - d.targetH), `${id} height`).toBeLessThanOrEqual(
        d.tolerancePx,
      )
      const bytes = statSync(avif).size
      const ceil = HERO_SLOTS.has(id) ? HERO_BYTE_CEIL : OTHER_BYTE_CEIL
      expect(bytes, `${id} byte ceiling`).toBeLessThanOrEqual(ceil)
      totalAvif += bytes
    }
    // JPEG fallbacks are excluded from the count by construction (only AVIF
    // bytes are summed).
    expect(totalAvif).toBeLessThanOrEqual(TOTAL_AVIF_CEIL)
  })
})
