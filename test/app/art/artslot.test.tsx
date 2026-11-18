import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  ArtSlot,
  swapArtSource,
  imageSource,
  __resetArtRegistry,
  type ArtLoader,
  type ArtSlotId,
} from '@app/art'

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
  cleanup()
  __resetArtRegistry()
})

describe('ArtSlot', () => {
  it('reserves aspect-ratio space for every slot before any source loads', () => {
    for (const id of ALL_IDS) {
      const { unmount } = render(<ArtSlot id={id} />)
      const el = screen.getByTestId(`art-slot-${id}`)
      expect(el.style.aspectRatio).not.toBe('')
      unmount()
    }
  })

  it('renders the graded placeholder for a placeholder source', () => {
    render(<ArtSlot id="hero-desktop" />)
    expect(screen.getByTestId('art-placeholder')).toBeInTheDocument()
  })

  it('a deferred slot warms its loader on first stable view', () => {
    const loaded: string[] = []
    const spy: ArtLoader = (entry) => loaded.push(entry.id)
    render(<ArtSlot id="menu-rack" loader={spy} />) // menu-rack is deferred
    expect(loaded).toEqual(['menu-rack'])
  })

  it('an eager slot does not self-trigger the deferred loader', () => {
    const loaded: string[] = []
    const spy: ArtLoader = (entry) => loaded.push(entry.id)
    render(<ArtSlot id="hero-desktop" loader={spy} />) // hero is eager
    expect(loaded).toEqual([])
  })

  it('an on-mission-select slot does not self-trigger on view', () => {
    const loaded: string[] = []
    const spy: ArtLoader = (entry) => loaded.push(entry.id)
    render(<ArtSlot id="briefing-outlook" loader={spy} />)
    expect(loaded).toEqual([])
  })

  it('a decorative slot has an empty alt once swapped to an image', () => {
    swapArtSource('hero-desktop', imageSource('art/hero-desktop.avif'))
    render(<ArtSlot id="hero-desktop" />)
    const img = screen
      .getByTestId('art-slot-hero-desktop')
      .querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('alt', '')
  })

  it('an informative slot carries its description as alt once swapped to an image', () => {
    swapArtSource('briefing-outlook', imageSource('art/briefing-outlook.avif'))
    render(<ArtSlot id="briefing-outlook" />)
    const img = screen
      .getByTestId('art-slot-briefing-outlook')
      .querySelector('img')
    expect(img?.getAttribute('alt')?.length).toBeGreaterThan(0)
    expect(img).toHaveAttribute('src')
  })

  it('the same consumer renders an image after a source swap (media-split contract)', () => {
    render(<ArtSlot id="menu-rack" />)
    expect(screen.getByTestId('art-placeholder')).toBeInTheDocument()
    cleanup()
    swapArtSource('menu-rack', imageSource('art/menu-rack.avif'))
    render(<ArtSlot id="menu-rack" />)
    expect(screen.queryByTestId('art-placeholder')).toBeNull()
    const img = screen.getByTestId('art-slot-menu-rack').querySelector('img')
    expect(img).toHaveAttribute('src')
  })
})
