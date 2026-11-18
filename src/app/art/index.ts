// Minimal art slot registry. Section 10 builds the full 13-slot registry with
// a source-swap function and preload priorities; this provides the hero slots
// the push-in needs, resolving every URL through urlFor so a subpath deploy
// cannot break. A graded CSS placeholder renders behind the image, so a
// missing asset degrades to the placeholder rather than a broken image.
import { urlFor } from '../urlFor'
import type { ArtSlotId } from '../hero/heroCrop'

export type { ArtSlotId }

export interface ArtSources {
  readonly avif: string
  readonly jpg: string
}

export interface Size {
  readonly w: number
  readonly h: number
}

const NATURAL: Readonly<Record<ArtSlotId, Size>> = {
  'hero-desktop': { w: 1600, h: 900 },
  'hero-portrait': { w: 1080, h: 1920 },
}

export function artSources(slot: ArtSlotId): ArtSources {
  return { avif: urlFor(`art/${slot}.avif`), jpg: urlFor(`art/${slot}.jpg`) }
}

export function artNatural(slot: ArtSlotId): Size {
  return NATURAL[slot]
}

/** Hero slots preload eagerly; below-fold and ending slots (section 10) lazy. */
export const HERO_PRELOAD = 'eager' as const
