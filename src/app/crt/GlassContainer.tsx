// The glass frame: wraps real DOM text and layers the static CRT overlays as
// aria-hidden siblings of the text (never parents). Reduce-glow is a single
// class on the container plus dropping the breathing layer from the DOM.
import type { ReactNode } from 'react'
import './crt.css'

export interface GlassContainerProps {
  readonly reduceGlow: boolean
  readonly children: ReactNode
}

export function GlassContainer({ reduceGlow, children }: GlassContainerProps) {
  const className = reduceGlow ? 'crt-glass crt-reduce-glow' : 'crt-glass'
  return (
    <div className={className} data-testid="crt-glass">
      <div className="crt-text" data-testid="crt-text">
        {children}
      </div>
      <div
        className="crt-scanlines"
        data-testid="crt-scanlines"
        aria-hidden="true"
      />
      {!reduceGlow && (
        <div
          className="crt-breathe"
          data-testid="crt-breathe"
          aria-hidden="true"
        />
      )}
      <div
        className="crt-vignette"
        data-testid="crt-vignette"
        aria-hidden="true"
      />
    </div>
  )
}
