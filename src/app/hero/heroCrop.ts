// HeroCrop metadata per art asset. Authored here for the placeholder and the
// first generated hero; final art ships its own calibrated values through the
// same interface (the click-calibration tool is section 10), so nothing here
// is throwaway. Glass and greeting are fractions of the natural image size.
import type { HeroCropFractions } from './glassRect'

export type ArtSlotId = 'hero-desktop' | 'hero-portrait'

export interface HeroCrop extends HeroCropFractions {
  readonly srcKey: ArtSlotId
  /** Scene id: the portrait companion is a reframe of the same scene, so both
   *  crops declare the same scene id. */
  readonly scene: string
}

// The CRT screen sits in the central third of the generated hero; the greeting
// anchors near the screen's upper-left text origin. Values are eyeballed
// against the first hero; the calibration tool refines them later.
export const HERO_CROPS: Readonly<Record<ArtSlotId, HeroCrop>> = {
  'hero-desktop': {
    srcKey: 'hero-desktop',
    scene: 'wopr-command-room',
    glass: { x: 0.34, y: 0.3, w: 0.32, h: 0.4 },
    greetingAnchor: { x: 0.4, y: 0.38 },
  },
  'hero-portrait': {
    srcKey: 'hero-portrait',
    scene: 'wopr-command-room',
    glass: { x: 0.22, y: 0.34, w: 0.56, h: 0.3 },
    greetingAnchor: { x: 0.3, y: 0.4 },
  },
}
