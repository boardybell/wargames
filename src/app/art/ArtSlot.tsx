// The consumer component. Reserves aspect-ratio space from the entry so layout
// never shifts, then renders either the graded placeholder or an img with the
// entry's base-prefixed URL and the correct alt text (empty for decorative, the
// description for informative). Consumers never branch on source kind: swapping
// the source in the registry is the whole media-split interface.
import { useEffect } from 'react'
import { getArtSlot } from './registry'
import { preloadSlot, type ArtLoader } from './preload'
import type { ArtSlotId } from './types'
import './art.css'

export interface ArtSlotProps {
  readonly id: ArtSlotId
  readonly className?: string
  /** Override the preload loader (tests inject a spy). */
  readonly loader?: ArtLoader
}

export function ArtSlot({ id, className, loader }: ArtSlotProps) {
  const entry = getArtSlot(id)

  // A deferred slot warms on its first stable view. Eager slots are warmed at
  // boot and on-mission-select slots by preloadForMission, so neither
  // self-triggers here (that would defeat their priority).
  useEffect(() => {
    if (entry.priority === 'deferred') preloadSlot(id, loader)
    // Re-warm only when the slot id changes; loader/entry are stable per id.
  }, [id])
  const alt = entry.text.kind === 'informative' ? entry.text.description : ''
  const cls = className ? `art-slot ${className}` : 'art-slot'
  return (
    <div
      className={cls}
      data-testid={`art-slot-${id}`}
      data-slot={id}
      style={{ aspectRatio: String(entry.aspectRatio) }}
    >
      {entry.source.kind === 'image' ? (
        <img className="art-slot-media" src={entry.source.url} alt={alt} />
      ) : (
        entry.source.render()
      )}
    </div>
  )
}
