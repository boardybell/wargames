// HeroCrop metadata per art asset. Final shipped art (section 02) carries
// calibrated values authored through the committed click-calibration tool
// (media/tools/calibrate-core.ts), not eyeballed in an editor: the glass
// corners were detected on the shipped heroes and run through clicksToFractions,
// then confirmed via the tool's overlayPixels render at both crops. Glass and
// greeting are fractions of the natural image size. The portrait is a reframe
// of the same scene as the desktop hero, so both declare the same scene id.
import type { HeroCropFractions } from './glassRect'

export type ArtSlotId = 'hero-desktop' | 'hero-portrait'

export interface HeroCrop extends HeroCropFractions {
  readonly srcKey: ArtSlotId
  /** Scene id: the portrait companion is a reframe of the same scene, so both
   *  crops declare the same scene id. */
  readonly scene: string
}

// Calibrated against the shipped command-room heroes. The CRT glass rect and
// the greeting anchor (the screen's upper-left text origin) come from the
// calibration tool: desktop natural 2560x1440, portrait natural 1080x1920.
export const HERO_CROPS: Readonly<Record<ArtSlotId, HeroCrop>> = {
  'hero-desktop': {
    srcKey: 'hero-desktop',
    scene: 'wopr-command-room',
    glass: { x: 0.2734, y: 0.0799, w: 0.448, h: 0.6708 },
    greetingAnchor: { x: 0.3203, y: 0.2222 },
  },
  'hero-portrait': {
    srcKey: 'hero-portrait',
    scene: 'wopr-command-room',
    glass: { x: 0.2324, y: 0.3052, w: 0.5324, h: 0.2167 },
    greetingAnchor: { x: 0.2963, y: 0.3438 },
  },
}
