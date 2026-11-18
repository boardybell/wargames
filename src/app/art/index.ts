// The art package surface. Two layers share this folder: the hero image-source
// helpers the push-in uses (artSources/artNatural, keyed to the two hero
// slots), and the full section-10 slot registry (13 slots, graded placeholders,
// source swap, preload). Final art arrives by swapping sources in the registry;
// no consumer changes.
import { urlFor } from '../urlFor'
import type { ArtSlotId as HeroArtSlotId } from '../hero/heroCrop'

export interface ArtSources {
  readonly avif: string
  readonly jpg: string
}

export interface Size {
  readonly w: number
  readonly h: number
}

const NATURAL: Readonly<Record<HeroArtSlotId, Size>> = {
  'hero-desktop': { w: 1600, h: 900 },
  'hero-portrait': { w: 1080, h: 1920 },
}

export function artSources(slot: HeroArtSlotId): ArtSources {
  return { avif: urlFor(`art/${slot}.avif`), jpg: urlFor(`art/${slot}.jpg`) }
}

export function artNatural(slot: HeroArtSlotId): Size {
  return NATURAL[slot]
}

/** Hero slots preload eagerly; below-fold and ending slots lazy. */
export const HERO_PRELOAD = 'eager' as const

// The section-10 registry surface.
export type {
  ArtSlotId,
  ArtSlotEntry,
  ArtSource,
  ArtPriority,
  ArtText,
  HeroCrop,
  PlaceholderRenderer,
} from './types'
export {
  getArtSlot,
  allArtSlots,
  slotsByPriority,
  swapArtSource,
  imageSource,
  validateArtRegistry,
  validateEntries,
  __resetArtRegistry,
} from './registry'
export { ArtSlot, type ArtSlotProps } from './ArtSlot'
export { PLACEHOLDERS } from './placeholders'
export {
  preloadEagerArt,
  preloadForMission,
  preloadSlot,
  preloadAllArt,
  type ArtLoader,
} from './preload'
