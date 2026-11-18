import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allArtSlots,
  getArtSlot,
  slotsByPriority,
  swapArtSource,
  imageSource,
  validateArtRegistry,
  validateEntries,
  __resetArtRegistry,
  type ArtLoader,
  type ArtSlotId,
  type ArtSlotEntry,
} from '@app/art'
import { preloadEagerArt, preloadForMission } from '@app/art/preload'

const ALL_IDS: readonly ArtSlotId[] = [
  'hero-desktop',
  'hero-portrait',
  'menu-rack',
  'bezel-texture',
  'briefing-outlook',
  'briefing-flights',
  'briefing-bank',
  'failsafe-wall',
  'countdown-insert',
  'hero-return',
  'ending-recovery',
  'ending-containment',
  'ending-failure',
]

beforeEach(() => {
  __resetArtRegistry()
})
afterEach(() => {
  __resetArtRegistry()
})

describe('art registry', () => {
  it('every ArtSlotId resolves to an entry with a placeholder and an aspect ratio', () => {
    for (const id of ALL_IDS) {
      const entry = getArtSlot(id)
      expect(entry.id).toBe(id)
      expect(entry.source.kind).toBe('placeholder')
      expect(entry.aspectRatio).toBeGreaterThan(0)
    }
    expect(allArtSlots()).toHaveLength(ALL_IDS.length)
  })

  it('the shipped registry validates (every informative entry has a description)', () => {
    expect(() => validateArtRegistry()).not.toThrow()
    for (const entry of allArtSlots()) {
      if (entry.text.kind === 'informative') {
        expect(entry.text.description.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('validation throws for an informative entry with an empty description', () => {
    const bad: ArtSlotEntry = {
      ...getArtSlot('briefing-outlook'),
      text: { kind: 'informative', description: '   ' },
    }
    expect(() => validateEntries([bad])).toThrow()
    // The shipped entries do not trip it.
    expect(() => validateEntries(allArtSlots())).not.toThrow()
  })

  it('hero slots are eager; briefing slots are on-mission-select; the rest deferred', () => {
    const eager = slotsByPriority('eager').map((e) => e.id)
    expect(eager).toContain('hero-desktop')
    expect(eager).toContain('hero-portrait')
    const onSelect = slotsByPriority('on-mission-select').map((e) => e.id)
    expect(onSelect.sort()).toEqual([
      'briefing-bank',
      'briefing-flights',
      'briefing-outlook',
    ])
  })

  it('preload fires eager at boot and briefing only on mission select', () => {
    const loaded: string[] = []
    const spy: ArtLoader = (entry) => loaded.push(entry.id)

    preloadEagerArt(spy)
    expect(loaded).toContain('hero-desktop')
    expect(loaded).not.toContain('briefing-outlook')

    loaded.length = 0
    preloadForMission('alpha', spy)
    expect(loaded.sort()).toEqual([
      'briefing-bank',
      'briefing-flights',
      'briefing-outlook',
    ])
  })

  it('the default loader only fetch-aheads image sources (placeholders no-op)', () => {
    const ImageSpy = vi.fn()
    vi.stubGlobal(
      'Image',
      class {
        set src(_v: string) {
          ImageSpy()
        }
      },
    )
    // All slots ship as placeholders: the default loader must not construct any
    // Image for them.
    preloadEagerArt()
    expect(ImageSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('swapping a source to an image routes the URL through urlFor and keeps everything else', () => {
    const before = getArtSlot('menu-rack')
    swapArtSource('menu-rack', imageSource('art/menu-rack.avif'))
    const after = getArtSlot('menu-rack')
    expect(after.source.kind).toBe('image')
    if (after.source.kind === 'image') {
      // urlFor prefixes BASE_URL; in test that is '/', so the path is preserved.
      expect(after.source.url).toContain('art/menu-rack.avif')
    }
    expect(after.aspectRatio).toBe(before.aspectRatio)
    expect(after.priority).toBe(before.priority)
    expect(after.text).toEqual(before.text)
  })

  it('a hero source swap preserves the heroCrop metadata', () => {
    const before = getArtSlot('hero-desktop')
    expect(before.heroCrop).toBeDefined()
    swapArtSource('hero-desktop', imageSource('art/hero-desktop.avif'))
    const after = getArtSlot('hero-desktop')
    expect(after.heroCrop).toEqual(before.heroCrop)
    expect(after.text).toEqual(before.text)
  })
})
