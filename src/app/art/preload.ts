// Priority-driven preload. A loader port (so tests can spy) plus three entry
// points: an eager pass the app runs at boot, a per-mission warm for the three
// briefing slots, and a deferred trigger for a slot's first stable view. The
// default loader fetch-aheads an image; a placeholder source is a no-op. All
// failures are silent to gameplay.
import { allArtSlots, slotsByPriority, getArtSlot } from './registry'
import type { ArtSlotEntry, ArtSlotId } from './types'

export type ArtLoader = (entry: ArtSlotEntry) => void

// Retain in-flight prefetch Images so they are not garbage-collected before the
// fetch completes; drop each when it settles.
const inFlight = new Set<HTMLImageElement>()

const defaultLoader: ArtLoader = (entry) => {
  if (entry.source.kind !== 'image') return // placeholders need no load
  try {
    const img = new Image()
    const done = (): void => {
      inFlight.delete(img)
    }
    img.onload = done
    img.onerror = done
    inFlight.add(img)
    img.src = entry.source.url
  } catch {
    // A failed preload never breaks gameplay.
  }
}

const BRIEFING_SLOTS: readonly ArtSlotId[] = [
  'briefing-outlook',
  'briefing-flights',
  'briefing-bank',
]

/** Boot pass: warm every eager slot. */
export function preloadEagerArt(loader: ArtLoader = defaultLoader): void {
  for (const entry of slotsByPriority('eager')) loader(entry)
}

/** Warm the briefing slots when a mission is selected. */
export function preloadForMission(
  _missionId: string,
  loader: ArtLoader = defaultLoader,
): void {
  for (const id of BRIEFING_SLOTS) loader(getArtSlot(id))
}

/** A deferred slot's first stable view warms it. */
export function preloadSlot(
  id: ArtSlotId,
  loader: ArtLoader = defaultLoader,
): void {
  loader(getArtSlot(id))
}

/** For completeness: the full set, used by a prefetch-everything smoke pass. */
export function preloadAllArt(loader: ArtLoader = defaultLoader): void {
  for (const entry of allArtSlots()) loader(entry)
}
