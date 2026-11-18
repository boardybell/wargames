// Font faces are injected from TS through urlFor so the woff2 under
// public/fonts/ (placed by section 01) is referenced base-correctly at
// /wargames/ and at /. A raw absolute font path in CSS would both break the
// subpath deploy and trip the no-raw-paths gate, so this is the sanctioned
// route. Both faces are self-hosted; zero external font requests.
import { urlFor } from '../urlFor'

interface FontFace {
  readonly family: string
  readonly file: string
}

const FACES: readonly FontFace[] = [
  { family: 'Glass TTY VT220', file: 'fonts/glass-tty-vt220.woff2' },
  { family: 'VT323', file: 'fonts/vt323.woff2' },
]

let injected = false

export function injectFontFaces(doc: Document = document): void {
  if (injected) return
  const css = FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';` +
      `src:url(${urlFor(f.file)}) format('woff2');` +
      `font-display:swap;}`,
  ).join('\n')
  const style = doc.createElement('style')
  style.setAttribute('data-crt-fonts', '')
  style.textContent = css
  doc.head.appendChild(style)
  injected = true
}

/** Test-only. */
export function __resetFonts(): void {
  injected = false
}
