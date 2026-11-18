// Graded CSS placeholder scenes, one per slot. Gradients and panel textures
// built from the theme tokens: navy-black fields, electric blue accents, a
// hammered gray-olive feel for rack and cabinet-adjacent slots, amber lamp dots
// where the final art will show hardware. No images, no canvas, no animation.
// Each renderer fills its container; the container (ArtSlot) owns the
// aspect-ratio reservation.
import type { CSSProperties, ReactNode } from 'react'
import type { ArtSlotId, PlaceholderRenderer } from './types'
import './art.css'

type Variant = 'glass' | 'panel' | 'lamps' | 'ledger' | 'wall' | 'ending'

const VARIANT_STYLE: Readonly<Record<Variant, CSSProperties>> = {
  glass: {
    background:
      'radial-gradient(120% 90% at 50% 40%, #0d1a2e 0%, #050a14 70%), linear-gradient(180deg, #0a1322, #050a14)',
    boxShadow: 'inset 0 0 60px rgba(108,182,255,0.18)',
  },
  panel: {
    background:
      'repeating-linear-gradient(135deg, #22241d 0 6px, #1b1d17 6px 12px)',
  },
  lamps: {
    background:
      'radial-gradient(circle at 12px 12px, #ffb84d 0 2px, transparent 3px) 0 0 / 20px 20px, #22241d',
  },
  ledger: {
    background: 'linear-gradient(180deg, #081120, #050a14)',
    boxShadow: 'inset 0 0 40px rgba(108,182,255,0.1)',
  },
  wall: {
    background:
      'repeating-linear-gradient(0deg, #0a1322 0 3px, #070e1a 3px 6px)',
  },
  ending: {
    background: 'radial-gradient(90% 90% at 50% 50%, #0d1a2e, #050a14)',
  },
}

function makePlaceholder(variant: Variant, label: string): PlaceholderRenderer {
  const Placeholder = (): ReactNode => (
    <div
      className="art-placeholder"
      data-testid="art-placeholder"
      data-variant={variant}
      style={VARIANT_STYLE[variant]}
      aria-hidden="true"
    >
      <span className="art-placeholder-label">{label}</span>
    </div>
  )
  return Placeholder
}

export const PLACEHOLDERS: Readonly<Record<ArtSlotId, PlaceholderRenderer>> = {
  'hero-desktop': makePlaceholder('glass', 'WOPR'),
  'hero-portrait': makePlaceholder('glass', 'WOPR'),
  'hero-return': makePlaceholder('glass', 'WOPR'),
  'menu-rack': makePlaceholder('lamps', 'RACK'),
  'bezel-texture': makePlaceholder('panel', ''),
  'countdown-insert': makePlaceholder('panel', ''),
  'briefing-outlook': makePlaceholder('ledger', 'OUTLOOK'),
  'briefing-flights': makePlaceholder('ledger', 'FLIGHTS'),
  'briefing-bank': makePlaceholder('ledger', 'BANK'),
  'failsafe-wall': makePlaceholder('wall', 'FAILSAFE'),
  'ending-recovery': makePlaceholder('ending', 'RECOVERY'),
  'ending-containment': makePlaceholder('ending', 'CONTAINMENT'),
  'ending-failure': makePlaceholder('ending', 'FAILURE'),
}
