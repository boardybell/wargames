// Theme initialization: publish the palette tokens as CSS custom properties
// on :root (so the stylesheets reference var(--...) and tokens.ts stays the
// single source of truth the contrast test guards) and inject the font
// faces. Called once at App boot.
import {
  COLOR_AMBER,
  COLOR_DIM,
  COLOR_FOCUS,
  COLOR_GLASS,
  COLOR_GLYPH,
  COLOR_RED,
  VIGNETTE_MAX_DARKEN,
} from './tokens'
import { injectFontFaces } from './fonts'

export function initTheme(doc: Document = document): void {
  const root = doc.documentElement
  root.style.setProperty('--color-glass', COLOR_GLASS)
  root.style.setProperty('--color-glyph', COLOR_GLYPH)
  root.style.setProperty('--color-dim', COLOR_DIM)
  root.style.setProperty('--color-focus', COLOR_FOCUS)
  root.style.setProperty('--color-amber', COLOR_AMBER)
  root.style.setProperty('--color-red', COLOR_RED)
  root.style.setProperty('--vignette-darken', String(VIGNETTE_MAX_DARKEN))
  injectFontFaces(doc)
}
