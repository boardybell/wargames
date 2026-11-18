// The art slot registry: every id mapped to a graded placeholder at ship, with
// reserved aspect ratio, load priority, and accessible-text declaration. The
// media split swaps sources through swapArtSource only; nothing else changes.
// Image URLs always resolve through urlFor so a subpath deploy cannot break.
import { urlFor } from '../urlFor'
import { HERO_CROPS } from '../hero/heroCrop'
import { PLACEHOLDERS } from './placeholders'
import type {
  ArtPriority,
  ArtSlotEntry,
  ArtSlotId,
  ArtSource,
  HeroCrop,
} from './types'

/** Build an image source with a base-prefixed URL. The media split uses this. */
export function imageSource(path: string): ArtSource {
  return { kind: 'image', url: urlFor(path) }
}

function placeholder(id: ArtSlotId): ArtSource {
  return { kind: 'placeholder', render: PLACEHOLDERS[id] }
}

// One source of truth for the hero calibration: derive the registry crop from
// hero/heroCrop.ts (which the calibration tool refines) rather than copying the
// numbers, so the two can never drift.
function heroCropFor(id: 'hero-desktop' | 'hero-portrait'): HeroCrop {
  const c = HERO_CROPS[id]
  return { srcKey: id, glass: c.glass, greetingAnchor: c.greetingAnchor }
}
const HERO_DESKTOP_CROP: HeroCrop = heroCropFor('hero-desktop')
const HERO_PORTRAIT_CROP: HeroCrop = heroCropFor('hero-portrait')

function seed(): Record<ArtSlotId, ArtSlotEntry> {
  const decorative = { kind: 'decorative' } as const
  const info = (description: string) =>
    ({ kind: 'informative', description }) as const
  return {
    'hero-desktop': {
      id: 'hero-desktop',
      source: placeholder('hero-desktop'),
      aspectRatio: 16 / 9,
      priority: 'eager',
      text: decorative,
      heroCrop: HERO_DESKTOP_CROP,
    },
    'hero-portrait': {
      id: 'hero-portrait',
      source: placeholder('hero-portrait'),
      aspectRatio: 9 / 16,
      priority: 'eager',
      text: decorative,
      heroCrop: HERO_PORTRAIT_CROP,
    },
    'hero-return': {
      id: 'hero-return',
      source: placeholder('hero-return'),
      aspectRatio: 16 / 9,
      priority: 'eager',
      text: decorative,
    },
    'menu-rack': {
      id: 'menu-rack',
      source: placeholder('menu-rack'),
      aspectRatio: 4 / 1,
      priority: 'deferred',
      text: decorative,
    },
    'bezel-texture': {
      id: 'bezel-texture',
      source: placeholder('bezel-texture'),
      aspectRatio: 1,
      priority: 'deferred',
      text: decorative,
    },
    'countdown-insert': {
      id: 'countdown-insert',
      source: placeholder('countdown-insert'),
      aspectRatio: 3 / 1,
      priority: 'deferred',
      text: decorative,
    },
    'briefing-outlook': {
      id: 'briefing-outlook',
      source: placeholder('briefing-outlook'),
      aspectRatio: 4 / 3,
      priority: 'on-mission-select',
      text: info('A chart of how the mission is expected to unfold.'),
    },
    'briefing-flights': {
      id: 'briefing-flights',
      source: placeholder('briefing-flights'),
      aspectRatio: 4 / 3,
      priority: 'on-mission-select',
      text: info('The flight board for the mission under review.'),
    },
    'briefing-bank': {
      id: 'briefing-bank',
      source: placeholder('briefing-bank'),
      aspectRatio: 4 / 3,
      priority: 'on-mission-select',
      text: info('The ledger of balances tied to the mission.'),
    },
    'failsafe-wall': {
      id: 'failsafe-wall',
      source: placeholder('failsafe-wall'),
      aspectRatio: 21 / 9,
      priority: 'deferred',
      text: info('The hidden global failsafe panel behind the terminal.'),
    },
    'ending-recovery': {
      id: 'ending-recovery',
      source: placeholder('ending-recovery'),
      aspectRatio: 16 / 9,
      priority: 'deferred',
      text: info('The recovery ending: the machine learns and stands down.'),
    },
    'ending-containment': {
      id: 'ending-containment',
      source: placeholder('ending-containment'),
      aspectRatio: 16 / 9,
      priority: 'deferred',
      text: info('The containment ending: the crisis is held, at a cost.'),
    },
    'ending-failure': {
      id: 'ending-failure',
      source: placeholder('ending-failure'),
      aspectRatio: 16 / 9,
      priority: 'deferred',
      text: info('The failure ending: the only winning move was not to play.'),
    },
  }
}

let registry: Record<ArtSlotId, ArtSlotEntry> = seed()

export function getArtSlot(id: ArtSlotId): ArtSlotEntry {
  const entry = registry[id]
  if (!entry) throw new Error(`art: no slot registered for id "${id}"`)
  return entry
}

export function allArtSlots(): readonly ArtSlotEntry[] {
  return Object.values(registry)
}

export function slotsByPriority(priority: ArtPriority): ArtSlotEntry[] {
  return Object.values(registry).filter((e) => e.priority === priority)
}

/** Replace one slot's source, leaving aspect ratio, priority, text, and crop
 *  intact. The whole interface the media split relies on. */
export function swapArtSource(id: ArtSlotId, source: ArtSource): void {
  const next = { ...getArtSlot(id), source }
  if (import.meta.env.DEV) validateEntries([next])
  registry[id] = next
}

/** Throws on an informative entry with a missing or empty description. Pure
 *  over its input so the throw branch is directly testable. */
export function validateEntries(entries: readonly ArtSlotEntry[]): void {
  for (const entry of entries) {
    if (entry.text.kind === 'informative' && !entry.text.description.trim()) {
      throw new Error(`art: informative slot "${entry.id}" has no description`)
    }
  }
}

/** Throws in dev when the shipped registry has an informative entry with no
 *  description. */
export function validateArtRegistry(): void {
  validateEntries(Object.values(registry))
}

/** Test-only: restore the shipped placeholder registry. */
export function __resetArtRegistry(): void {
  registry = seed()
}

if (import.meta.env.DEV) validateArtRegistry()
