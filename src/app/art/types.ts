// Art slot types. The id union is fixed; the full registry (registry.ts) maps
// every id to a graded placeholder now and an image URL later, swapped in one
// place so no consumer code changes when final art lands.
import type { ReactNode } from 'react'

export type ArtSlotId =
  | 'hero-desktop'
  | 'hero-portrait'
  | 'menu-rack'
  | 'bezel-texture'
  | 'briefing-outlook'
  | 'briefing-flights'
  | 'briefing-bank'
  | 'failsafe-wall'
  | 'countdown-insert'
  | 'hero-return'
  | 'ending-recovery'
  | 'ending-containment'
  | 'ending-failure'

export type PlaceholderRenderer = () => ReactNode

// HeroCrop rides with the hero slot entries (placeholder and final alike);
// section 05 authors its own calibrated values in hero/heroCrop.ts and consumes
// them there. This is the registry-level shape the media split fills in.
export interface HeroCrop {
  readonly srcKey: ArtSlotId
  readonly glass: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly greetingAnchor: { readonly x: number; readonly y: number }
}

export type ArtSource =
  | { readonly kind: 'placeholder'; readonly render: PlaceholderRenderer }
  | { readonly kind: 'image'; readonly url: string }

export type ArtPriority = 'eager' | 'deferred' | 'on-mission-select'

export type ArtText =
  | { readonly kind: 'decorative' }
  | { readonly kind: 'informative'; readonly description: string }

export interface ArtSlotEntry {
  readonly id: ArtSlotId
  readonly source: ArtSource
  /** Reserved layout space, so nothing shifts before a source loads. */
  readonly aspectRatio: number
  readonly priority: ArtPriority
  readonly text: ArtText
  readonly heroCrop?: HeroCrop
}
