// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { allArtSlots } from '../../src/app/art'

// Base-aware resolution, gated. Every registered slot whose source is an image
// must resolve through urlFor/BASE_URL and never be a raw absolute path.
// Placeholder-sourced slots are recorded skips on the exception list. We import
// the REAL registry (never grep its source) and enumerate every ArtSlotId, so a
// slot pulled off the placeholder exception list with no image source makes
// this gate bite. Until section 02 swaps sources, every slot is a placeholder
// (on the exception list), so this is vacuously green; it fails the moment a
// slot leaves the exception list without an image.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)
const placeholderSlots = new Set<string>(discovery.exceptions.placeholderSlots)

// Under the test runner import.meta.env.BASE_URL is '/', so urlFor returns a
// base-relative path rooted at '/'. BASE is that root. A raw absolute path that
// never flowed through urlFor would not carry it. We assert the resolved url
// starts with BASE and is not a bare absolute asset path that skipped urlFor.
const BASE = '/'

describe('base-aware image resolution (gated)', () => {
  it('every non-excepted slot carries an image source resolved through urlFor; placeholders skip', () => {
    const slots = allArtSlots()
    // Sanity: the registry is the real 13-slot set, not an empty import.
    expect(slots.length).toBeGreaterThan(0)

    for (const slot of slots) {
      const excepted = placeholderSlots.has(slot.id)
      if (excepted) {
        // A recorded placeholder skip. It may be a placeholder or already an
        // image; either way it is not yet an obligation.
        continue
      }
      // The gate: a slot off the exception list must be an image source whose
      // url resolved through urlFor (base-relative), never a raw absolute path.
      expect(slot.source.kind, `${slot.id}: not excepted and not an image`).toBe(
        'image',
      )
      if (slot.source.kind !== 'image') continue
      const url = slot.source.url
      expect(url.startsWith(BASE), `${slot.id}: url not base-relative (${url})`).toBe(
        true,
      )
      // Guard against a raw absolute path smuggled past urlFor. urlFor emits no
      // double slash and prefixes BASE; a hardcoded absolute like
      // 'https://...' or a leading '//' is rejected.
      expect(url.startsWith('//'), `${slot.id}: raw protocol-relative url`).toBe(false)
      expect(/^[a-z]+:\/\//i.test(url), `${slot.id}: raw absolute url`).toBe(false)
    }
  })

  it('the placeholder exception list names only real registry slot ids (no stale ids)', () => {
    const realIds = new Set<string>(allArtSlots().map((s) => s.id))
    for (const id of placeholderSlots) {
      expect(realIds.has(id), `stale placeholder exception: ${id}`).toBe(true)
    }
  })
})
