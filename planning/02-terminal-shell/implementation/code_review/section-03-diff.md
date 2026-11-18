diff --git a/src/app/crt/Cursor.tsx b/src/app/crt/Cursor.tsx
new file mode 100644
index 0000000..258b3fc
--- /dev/null
+++ b/src/app/crt/Cursor.tsx
@@ -0,0 +1,15 @@
+// A blinking block cursor. Decorative only: aria-hidden, pointer-events none.
+import './crt.css'
+
+export function Cursor() {
+  return (
+    <span
+      className="crt-cursor"
+      data-testid="crt-cursor"
+      aria-hidden="true"
+      style={{ pointerEvents: 'none' }}
+    >
+      {'█'}
+    </span>
+  )
+}
diff --git a/src/app/crt/GlassContainer.tsx b/src/app/crt/GlassContainer.tsx
new file mode 100644
index 0000000..1111dbb
--- /dev/null
+++ b/src/app/crt/GlassContainer.tsx
@@ -0,0 +1,38 @@
+// The glass frame: wraps real DOM text and layers the static CRT overlays as
+// aria-hidden siblings of the text (never parents). Reduce-glow is a single
+// class on the container plus dropping the breathing layer from the DOM.
+import type { ReactNode } from 'react'
+import './crt.css'
+
+export interface GlassContainerProps {
+  readonly reduceGlow: boolean
+  readonly children: ReactNode
+}
+
+export function GlassContainer({ reduceGlow, children }: GlassContainerProps) {
+  const className = reduceGlow ? 'crt-glass crt-reduce-glow' : 'crt-glass'
+  return (
+    <div className={className} data-testid="crt-glass">
+      <div className="crt-text" data-testid="crt-text">
+        {children}
+      </div>
+      <div
+        className="crt-scanlines"
+        data-testid="crt-scanlines"
+        aria-hidden="true"
+      />
+      {!reduceGlow && (
+        <div
+          className="crt-breathe"
+          data-testid="crt-breathe"
+          aria-hidden="true"
+        />
+      )}
+      <div
+        className="crt-vignette"
+        data-testid="crt-vignette"
+        aria-hidden="true"
+      />
+    </div>
+  )
+}
diff --git a/src/app/crt/crt.css b/src/app/crt/crt.css
new file mode 100644
index 0000000..70a7bfa
--- /dev/null
+++ b/src/app/crt/crt.css
@@ -0,0 +1,120 @@
+/* The CRT layer stack. Bottom to top: text (with layered glyph shadow),
+   scanlines, breathing glow, vignette, plus a luminous border on the glass.
+   Hard constraints: no filter or shadow property is ever animated; no
+   backdrop-filter; overlays are static (only the breathing layer tweens
+   opacity). Overlays are aria-hidden siblings of the text, never its parents. */
+
+.crt-glass {
+  position: relative;
+  overflow: hidden;
+  background: var(--color-glass);
+  /* Thin luminous border. */
+  box-shadow:
+    inset 0 0 0 1px rgba(108, 182, 255, 0.35),
+    0 0 2px var(--color-glyph),
+    0 0 14px rgba(108, 182, 255, 0.22);
+}
+
+.crt-text {
+  position: relative;
+  z-index: 1;
+  color: var(--color-glyph);
+  /* Tight core, mid halo, wide faint halo. */
+  text-shadow:
+    0 0 1px var(--color-glyph),
+    0 0 4px rgba(108, 182, 255, 0.55),
+    0 0 12px rgba(108, 182, 255, 0.3);
+}
+
+.crt-scanlines,
+.crt-vignette,
+.crt-breathe {
+  position: absolute;
+  inset: 0;
+  pointer-events: none;
+}
+
+.crt-scanlines {
+  z-index: 2;
+  background: repeating-linear-gradient(
+    to bottom,
+    rgba(0, 0, 0, 0) 0,
+    rgba(0, 0, 0, 0) 2px,
+    rgba(0, 0, 0, 0.18) 3px,
+    rgba(0, 0, 0, 0) 4px
+  );
+}
+
+.crt-breathe {
+  z-index: 2;
+  /* Base opacity is the dim end of the tween, so when the animation is
+     disabled (reduced motion) the glow lands dim rather than full strength. */
+  opacity: 0.4;
+  background: radial-gradient(
+    ellipse at center,
+    rgba(108, 182, 255, 0.07),
+    rgba(0, 0, 0, 0) 70%
+  );
+  animation: crt-breathe 6s ease-in-out infinite;
+}
+
+/* The vignette sits ABOVE the text, so at its darkest it dims the glyphs too;
+   the contrast test measures AA at exactly that overlap. */
+.crt-vignette {
+  z-index: 3;
+  background: radial-gradient(
+    ellipse at center,
+    rgba(0, 0, 0, 0) 55%,
+    rgba(0, 0, 0, var(--vignette-darken)) 100%
+  );
+}
+
+@keyframes crt-breathe {
+  0%,
+  100% {
+    opacity: 0.4;
+  }
+  50% {
+    opacity: 0.9;
+  }
+}
+
+/* Reduce-glow: drop the outer halos (keep the tight core) and the breathing
+   layer. One class on the glass container. */
+.crt-reduce-glow .crt-text {
+  text-shadow: 0 0 1px var(--color-glyph);
+}
+/* The breathing layer is removed from the DOM under reduce-glow (see
+   GlassContainer), so no display override is needed here. */
+
+.crt-cursor {
+  display: inline-block;
+  color: var(--color-glyph);
+  animation: crt-blink 1s steps(2) infinite;
+}
+
+@keyframes crt-blink {
+  0% {
+    opacity: 1;
+  }
+  50% {
+    opacity: 0;
+  }
+  100% {
+    opacity: 1;
+  }
+}
+
+/* Selected text stays readable. */
+.crt-text ::selection,
+.crt-text::selection {
+  text-shadow: none;
+  background: rgba(108, 182, 255, 0.35);
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .crt-breathe,
+  .crt-cursor {
+    animation: none;
+  }
+}
diff --git a/src/app/crt/index.ts b/src/app/crt/index.ts
new file mode 100644
index 0000000..7a24665
--- /dev/null
+++ b/src/app/crt/index.ts
@@ -0,0 +1,5 @@
+export { GlassContainer } from './GlassContainer'
+export type { GlassContainerProps } from './GlassContainer'
+export { Cursor } from './Cursor'
+export { useTypeIn, CHAR_INTERVAL_MS } from './useTypeIn'
+export type { TypeInOptions, TypeInState } from './useTypeIn'
diff --git a/src/app/crt/useTypeIn.ts b/src/app/crt/useTypeIn.ts
new file mode 100644
index 0000000..640ead7
--- /dev/null
+++ b/src/app/crt/useTypeIn.ts
@@ -0,0 +1,86 @@
+// The type-in effect hook. Reveals authored text character by character at a
+// period-plausible rate, firing a key-tick cue per character; any key, click,
+// or tap completes it instantly via complete(). The full text is the caller's
+// responsibility to keep in the DOM for assistive tech (the hook returns only
+// a visibleCount for visual clipping). Under reduced motion the reveal is
+// instant and onComplete still fires exactly once.
+import { useCallback, useEffect, useRef, useState } from 'react'
+
+/** Per-character reveal interval, in the 20 to 45 ms band. */
+export const CHAR_INTERVAL_MS = 30
+
+export interface TypeInOptions {
+  readonly text: string
+  readonly onTick?: () => void
+  readonly onComplete?: () => void
+  /** Injected; section 09 provides the real useMotionPreference hook. */
+  readonly reducedMotion: boolean
+}
+
+export interface TypeInState {
+  readonly visibleCount: number
+  readonly running: boolean
+  readonly complete: () => void
+}
+
+function prefersReducedMotion(): boolean {
+  if (typeof window === 'undefined' || !window.matchMedia) return false
+  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
+}
+
+export function useTypeIn(options: TypeInOptions): TypeInState {
+  const { text, onTick, onComplete, reducedMotion } = options
+  const full = text.length
+  const instant = reducedMotion || prefersReducedMotion()
+
+  const [visibleCount, setVisibleCount] = useState(instant ? full : 0)
+  const [running, setRunning] = useState(!instant && full > 0)
+  const completedRef = useRef(false)
+  const onCompleteRef = useRef(onComplete)
+  const onTickRef = useRef(onTick)
+  onCompleteRef.current = onComplete
+  onTickRef.current = onTick
+
+  const fireComplete = useCallback(() => {
+    if (!completedRef.current) {
+      completedRef.current = true
+      onCompleteRef.current?.()
+    }
+  }, [])
+
+  const complete = useCallback(() => {
+    setVisibleCount(full)
+    setRunning(false)
+    fireComplete()
+  }, [full, fireComplete])
+
+  useEffect(() => {
+    // A new text (or a motion-preference flip) restarts cleanly: clear the
+    // completion latch and reset the visible count so onComplete fires again
+    // for the new string and a shorter string cannot render a stale tail.
+    completedRef.current = false
+    if (instant || full === 0) {
+      setVisibleCount(full)
+      setRunning(false)
+      fireComplete()
+      return
+    }
+    setVisibleCount(0)
+    setRunning(true)
+    let revealed = 0
+    const id = setInterval(() => {
+      revealed += 1
+      setVisibleCount(revealed)
+      onTickRef.current?.()
+      if (revealed >= full) {
+        clearInterval(id)
+        setRunning(false)
+        fireComplete()
+      }
+    }, CHAR_INTERVAL_MS)
+    return () => clearInterval(id)
+    // Re-run only when the text or the motion decision changes.
+  }, [text, instant, full, fireComplete])
+
+  return { visibleCount, running, complete }
+}
diff --git a/src/app/theme/CALIBRATION.md b/src/app/theme/CALIBRATION.md
new file mode 100644
index 0000000..7f5c76d
--- /dev/null
+++ b/src/app/theme/CALIBRATION.md
@@ -0,0 +1,29 @@
+# Terminal Type Calibration
+
+Reference: `planning/reference/crt-reference.jpg` (electric blue dot-matrix on
+navy-black glass, left-aligned column, thin luminous border).
+
+## Final values (theme.css custom properties)
+
+- Font stack: `'Glass TTY VT220', 'VT323', ui-monospace, monospace`. Glass TTY
+  VT220 carries the DEC raster character; VT323 is the fallback with the same
+  terminal feel; generic monospace is the last resort.
+- `--terminal-line-height: 1.35`. The raster glyphs want air between rows to
+  read as scanned lines rather than a solid block, matching the reference's
+  row rhythm.
+- `--terminal-letter-spacing: 0.04em`. A hair of tracking separates the dot
+  cells so adjacent glyphs do not bleed, again per the reference.
+
+## Palette (tokens.ts, the contrast-guarded source of truth)
+
+- Glass background `#050A14`; glyph `#6CB6FF`; dim `#7FB0E0`; focus `#9FD8FF`.
+- `VIGNETTE_MAX_DARKEN = 0.25`: the strongest vignette darkening that keeps
+  glyph, dim, and focus above WCAG AA 4.5:1 at the vignette's darkest overlap
+  (glyph 5.41:1, dim 5.13:1, focus 7.38:1 at that worst case).
+
+## Manual verification
+
+The actual glow look against the reference is verified in a browser during
+the split-wide manual smoke (section 10) and the deploy Playwright pass; this
+section's automated bar is jsdom-green plus the contrast and stylesheet
+contract tests.
diff --git a/src/app/theme/fonts.ts b/src/app/theme/fonts.ts
new file mode 100644
index 0000000..c1555b8
--- /dev/null
+++ b/src/app/theme/fonts.ts
@@ -0,0 +1,38 @@
+// Font faces are injected from TS through urlFor so the woff2 under
+// public/fonts/ (placed by section 01) is referenced base-correctly at
+// /wargames/ and at /. A raw absolute font path in CSS would both break the
+// subpath deploy and trip the no-raw-paths gate, so this is the sanctioned
+// route. Both faces are self-hosted; zero external font requests.
+import { urlFor } from '../urlFor'
+
+interface FontFace {
+  readonly family: string
+  readonly file: string
+}
+
+const FACES: readonly FontFace[] = [
+  { family: 'Glass TTY VT220', file: 'fonts/glass-tty-vt220.woff2' },
+  { family: 'VT323', file: 'fonts/vt323.woff2' },
+]
+
+let injected = false
+
+export function injectFontFaces(doc: Document = document): void {
+  if (injected) return
+  const css = FACES.map(
+    (f) =>
+      `@font-face{font-family:'${f.family}';` +
+      `src:url(${urlFor(f.file)}) format('woff2');` +
+      `font-display:swap;}`,
+  ).join('\n')
+  const style = doc.createElement('style')
+  style.setAttribute('data-crt-fonts', '')
+  style.textContent = css
+  doc.head.appendChild(style)
+  injected = true
+}
+
+/** Test-only. */
+export function __resetFonts(): void {
+  injected = false
+}
diff --git a/src/app/theme/index.ts b/src/app/theme/index.ts
new file mode 100644
index 0000000..a647ff7
--- /dev/null
+++ b/src/app/theme/index.ts
@@ -0,0 +1,15 @@
+export {
+  COLOR_GLASS,
+  COLOR_GLYPH,
+  COLOR_DIM,
+  COLOR_FOCUS,
+  COLOR_AMBER,
+  COLOR_RED,
+  VIGNETTE_MAX_DARKEN,
+  relativeLuminance,
+  contrastRatio,
+  darken,
+  contrastAtVignette,
+} from './tokens'
+export { initTheme } from './theme'
+export { injectFontFaces } from './fonts'
diff --git a/src/app/theme/theme.css b/src/app/theme/theme.css
new file mode 100644
index 0000000..66dbff2
--- /dev/null
+++ b/src/app/theme/theme.css
@@ -0,0 +1,32 @@
+/* Global terminal tokens and base type. The color custom properties are set
+   from tokens.ts by initTheme(); the values here are fallbacks only, so the
+   contrast test (which imports tokens.ts) remains the single guard. The font
+   stack falls Glass TTY VT220 -> VT323 -> generic monospace. */
+:root {
+  --color-glass: #050a14;
+  --color-glyph: #6cb6ff;
+  --color-dim: #7fb0e0;
+  --color-focus: #9fd8ff;
+  --color-amber: #ffb84d;
+  --color-red: #ff5c5c;
+  --vignette-darken: 0.25;
+  --font-terminal: 'Glass TTY VT220', 'VT323', ui-monospace, monospace;
+  /* Calibrated against planning/reference/crt-reference.jpg; see CALIBRATION.md. */
+  --terminal-line-height: 1.35;
+  --terminal-letter-spacing: 0.04em;
+}
+
+html,
+body {
+  margin: 0;
+  background: var(--color-glass);
+  color: var(--color-glyph);
+  font-family: var(--font-terminal);
+  line-height: var(--terminal-line-height);
+  letter-spacing: var(--terminal-letter-spacing);
+}
+
+:focus-visible {
+  outline: 2px solid var(--color-focus);
+  outline-offset: 2px;
+}
diff --git a/src/app/theme/theme.ts b/src/app/theme/theme.ts
new file mode 100644
index 0000000..7210796
--- /dev/null
+++ b/src/app/theme/theme.ts
@@ -0,0 +1,26 @@
+// Theme initialization: publish the palette tokens as CSS custom properties
+// on :root (so the stylesheets reference var(--...) and tokens.ts stays the
+// single source of truth the contrast test guards) and inject the font
+// faces. Called once at App boot.
+import {
+  COLOR_AMBER,
+  COLOR_DIM,
+  COLOR_FOCUS,
+  COLOR_GLASS,
+  COLOR_GLYPH,
+  COLOR_RED,
+  VIGNETTE_MAX_DARKEN,
+} from './tokens'
+import { injectFontFaces } from './fonts'
+
+export function initTheme(doc: Document = document): void {
+  const root = doc.documentElement
+  root.style.setProperty('--color-glass', COLOR_GLASS)
+  root.style.setProperty('--color-glyph', COLOR_GLYPH)
+  root.style.setProperty('--color-dim', COLOR_DIM)
+  root.style.setProperty('--color-focus', COLOR_FOCUS)
+  root.style.setProperty('--color-amber', COLOR_AMBER)
+  root.style.setProperty('--color-red', COLOR_RED)
+  root.style.setProperty('--vignette-darken', String(VIGNETTE_MAX_DARKEN))
+  injectFontFaces(doc)
+}
diff --git a/src/app/theme/tokens.ts b/src/app/theme/tokens.ts
new file mode 100644
index 0000000..d5ad94e
--- /dev/null
+++ b/src/app/theme/tokens.ts
@@ -0,0 +1,83 @@
+// The one palette module. These constants feed both the CSS custom
+// properties (theme.css) and the automated contrast tests, so a palette edit
+// that breaks AA fails CI rather than shipping. The look is an electric blue
+// dot-matrix terminal on navy-black glass (see planning/reference/crt-reference.jpg).
+
+/** Glass background: navy-black. */
+export const COLOR_GLASS = '#050A14'
+/** Glyph core: electric blue. AA against the glass at the vignette's darkest. */
+export const COLOR_GLYPH = '#6CB6FF'
+/** Dim secondary text, still AA at the same worst case. */
+export const COLOR_DIM = '#7FB0E0'
+/** Focus ring. */
+export const COLOR_FOCUS = '#9FD8FF'
+
+// Amber and red are reserved for cabinet chrome (section 08) only. They live
+// here so there is one palette module; nothing in theme/ or crt/ uses them.
+// House rule: a status color always pairs with text, never color alone.
+export const COLOR_AMBER = '#FFB84D'
+export const COLOR_RED = '#FF5C5C'
+
+/** The vignette is a radial dark overlay ABOVE the text layer, so at its
+ *  darkest overlap it dims both glyph and background. Contrast is measured
+ *  there; this constant is constrained by the AA check, not the reverse.
+ *  At 0.25, glyph/dim/focus clear 4.5:1 with headroom. */
+export const VIGNETTE_MAX_DARKEN = 0.25
+
+type RGB = readonly [number, number, number]
+
+function parseHex(hex: string): RGB {
+  const h = hex.replace('#', '')
+  return [
+    parseInt(h.slice(0, 2), 16),
+    parseInt(h.slice(2, 4), 16),
+    parseInt(h.slice(4, 6), 16),
+  ]
+}
+
+function channelLuminance(c: number): number {
+  const s = c / 255
+  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
+}
+
+/** WCAG relative luminance of an sRGB hex color. */
+export function relativeLuminance(hex: string): number {
+  const [r, g, b] = parseHex(hex)
+  return (
+    0.2126 * channelLuminance(r) +
+    0.7152 * channelLuminance(g) +
+    0.0722 * channelLuminance(b)
+  )
+}
+
+/** Darken a color toward black by fraction d (the vignette overlap). */
+export function darken(hex: string, d: number): string {
+  const [r, g, b] = parseHex(hex)
+  const to2 = (c: number): string =>
+    Math.round(c * (1 - d))
+      .toString(16)
+      .padStart(2, '0')
+  return `#${to2(r)}${to2(g)}${to2(b)}`
+}
+
+/** WCAG contrast ratio between two sRGB hex colors (>= 1). */
+export function contrastRatio(fg: string, bg: string): number {
+  const lf = relativeLuminance(fg)
+  const lb = relativeLuminance(bg)
+  const hi = Math.max(lf, lb) + 0.05
+  const lo = Math.min(lf, lb) + 0.05
+  return hi / lo
+}
+
+/** Contrast of a foreground over the glass at the vignette's darkest overlap:
+ *  both colors are dimmed by VIGNETTE_MAX_DARKEN, which is the real worst case
+ *  for light-on-dark text (the additive WCAG offset means dimming both lowers
+ *  the ratio). Scanline darkening over the same pixels is intentionally NOT
+ *  composited here (the plan scopes the automated guard to the vignette); the
+ *  deploy Playwright pass verifies the full composite against the reference. */
+export function contrastAtVignette(fg: string): number {
+  return contrastRatio(
+    darken(fg, VIGNETTE_MAX_DARKEN),
+    darken(COLOR_GLASS, VIGNETTE_MAX_DARKEN),
+  )
+}
diff --git a/test/app/crt/layers.test.tsx b/test/app/crt/layers.test.tsx
new file mode 100644
index 0000000..8d53896
--- /dev/null
+++ b/test/app/crt/layers.test.tsx
@@ -0,0 +1,56 @@
+import { afterEach, describe, expect, it } from 'vitest'
+import { cleanup, render, screen } from '@testing-library/react'
+import { GlassContainer } from '@app/crt'
+import { Cursor } from '@app/crt'
+
+afterEach(cleanup)
+
+describe('GlassContainer layer stack', () => {
+  it('renders the text layer with aria-hidden overlay siblings', () => {
+    render(
+      <GlassContainer reduceGlow={false}>
+        <span>GREETINGS PROFESSOR FALKEN</span>
+      </GlassContainer>,
+    )
+    const text = screen.getByTestId('crt-text')
+    expect(text).toHaveTextContent('GREETINGS PROFESSOR FALKEN')
+    for (const id of ['crt-scanlines', 'crt-vignette']) {
+      const overlay = screen.getByTestId(id)
+      expect(overlay).toHaveAttribute('aria-hidden', 'true')
+      // Overlays are siblings of the text, never parents of it.
+      expect(overlay.contains(text)).toBe(false)
+    }
+  })
+
+  it('reduce-glow toggles the class and drops the breathing layer', () => {
+    const { rerender } = render(
+      <GlassContainer reduceGlow={false}>
+        <span>x</span>
+      </GlassContainer>,
+    )
+    expect(screen.getByTestId('crt-glass').className).not.toContain(
+      'crt-reduce-glow',
+    )
+    expect(screen.queryByTestId('crt-breathe')).not.toBeNull()
+
+    rerender(
+      <GlassContainer reduceGlow={true}>
+        <span>x</span>
+      </GlassContainer>,
+    )
+    expect(screen.getByTestId('crt-glass').className).toContain(
+      'crt-reduce-glow',
+    )
+    // The breathing layer is absent when reduce-glow is active.
+    expect(screen.queryByTestId('crt-breathe')).toBeNull()
+  })
+})
+
+describe('Cursor', () => {
+  it('is decorative: aria-hidden and pointer-events none', () => {
+    render(<Cursor />)
+    const cursor = screen.getByTestId('crt-cursor')
+    expect(cursor).toHaveAttribute('aria-hidden', 'true')
+    expect(cursor.style.pointerEvents).toBe('none')
+  })
+})
diff --git a/test/app/crt/type-in.test.tsx b/test/app/crt/type-in.test.tsx
new file mode 100644
index 0000000..ebb329e
--- /dev/null
+++ b/test/app/crt/type-in.test.tsx
@@ -0,0 +1,135 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { useTypeIn, CHAR_INTERVAL_MS } from '@app/crt'
+
+function setReducedMotion(matches: boolean): void {
+  window.matchMedia = vi.fn().mockReturnValue({
+    matches,
+    media: '',
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  }) as unknown as typeof window.matchMedia
+}
+
+function TypeInView(props: {
+  text: string
+  reducedMotion?: boolean
+  onTick?: () => void
+  onComplete?: () => void
+}) {
+  const { visibleCount, running, complete } = useTypeIn({
+    text: props.text,
+    reducedMotion: props.reducedMotion ?? false,
+    onTick: props.onTick,
+    onComplete: props.onComplete,
+  })
+  return (
+    <button data-testid="view" data-running={running} onClick={complete}>
+      <span data-testid="visible">{props.text.slice(0, visibleCount)}</span>
+      {/* Full text is always in the DOM for assistive tech. */}
+      <span data-testid="full">{props.text}</span>
+    </button>
+  )
+}
+
+beforeEach(() => {
+  vi.useFakeTimers()
+  setReducedMotion(false)
+})
+
+afterEach(() => {
+  vi.useRealTimers()
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('useTypeIn reveal', () => {
+  it('reveals text progressively over time', () => {
+    render(<TypeInView text="HELLO" />)
+    expect(screen.getByTestId('visible').textContent).toBe('')
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
+    expect(screen.getByTestId('visible').textContent).toBe('H')
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 2))
+    expect(screen.getByTestId('visible').textContent).toBe('HEL')
+  })
+
+  it('fires a key-tick cue per revealed character', () => {
+    const onTick = vi.fn()
+    render(<TypeInView text="ABCD" onTick={onTick} />)
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 4))
+    expect(onTick).toHaveBeenCalledTimes(4)
+  })
+
+  it('keeps the full text in the DOM while the visible portion is partial', () => {
+    render(<TypeInView text="SHALL WE PLAY" />)
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 2))
+    expect(screen.getByTestId('full').textContent).toBe('SHALL WE PLAY')
+    expect(screen.getByTestId('visible').textContent).toBe('SH')
+  })
+
+  it('a click completes the reveal instantly', () => {
+    render(<TypeInView text="GREETINGS" />)
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
+    fireEvent.click(screen.getByTestId('view'))
+    expect(screen.getByTestId('visible').textContent).toBe('GREETINGS')
+    expect(screen.getByTestId('view').getAttribute('data-running')).toBe('false')
+  })
+
+  it('onComplete fires exactly once when the reveal runs to the end', () => {
+    const onComplete = vi.fn()
+    render(<TypeInView text="HI" onComplete={onComplete} />)
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 5))
+    expect(onComplete).toHaveBeenCalledTimes(1)
+  })
+
+  it('restarts cleanly when the text prop changes', () => {
+    const onComplete = vi.fn()
+    const { rerender } = render(
+      <TypeInView text="FIRST" onComplete={onComplete} />,
+    )
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 5))
+    expect(screen.getByTestId('visible').textContent).toBe('FIRST')
+    expect(onComplete).toHaveBeenCalledTimes(1)
+    // New text: the reveal must reset to empty and fire onComplete again.
+    rerender(<TypeInView text="NEXT" onComplete={onComplete} />)
+    expect(screen.getByTestId('visible').textContent).toBe('')
+    expect(screen.getByTestId('full').textContent).toBe('NEXT')
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 4))
+    expect(screen.getByTestId('visible').textContent).toBe('NEXT')
+    expect(onComplete).toHaveBeenCalledTimes(2)
+  })
+
+  it('onComplete fires exactly once when skipped', () => {
+    const onComplete = vi.fn()
+    render(<TypeInView text="HELLO" onComplete={onComplete} />)
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
+    fireEvent.click(screen.getByTestId('view'))
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 10))
+    expect(onComplete).toHaveBeenCalledTimes(1)
+  })
+})
+
+describe('useTypeIn instant completion', () => {
+  it('completes instantly under prefers-reduced-motion', () => {
+    setReducedMotion(true)
+    const onComplete = vi.fn()
+    render(<TypeInView text="INSTANT" onComplete={onComplete} />)
+    expect(screen.getByTestId('visible').textContent).toBe('INSTANT')
+    expect(screen.getByTestId('view').getAttribute('data-running')).toBe('false')
+    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
+    expect(onComplete).toHaveBeenCalledTimes(1)
+  })
+
+  it('completes instantly under the injected motion override', () => {
+    const onComplete = vi.fn()
+    render(
+      <TypeInView text="OVERRIDE" reducedMotion={true} onComplete={onComplete} />,
+    )
+    expect(screen.getByTestId('visible').textContent).toBe('OVERRIDE')
+    expect(onComplete).toHaveBeenCalledTimes(1)
+  })
+})
diff --git a/test/app/theme/tokens.test.ts b/test/app/theme/tokens.test.ts
new file mode 100644
index 0000000..97050da
--- /dev/null
+++ b/test/app/theme/tokens.test.ts
@@ -0,0 +1,42 @@
+import { describe, expect, it } from 'vitest'
+import {
+  COLOR_DIM,
+  COLOR_FOCUS,
+  COLOR_GLASS,
+  COLOR_GLYPH,
+  VIGNETTE_MAX_DARKEN,
+  contrastAtVignette,
+  contrastRatio,
+  darken,
+} from '@app/theme'
+
+// Contrast is measured INCLUDING the vignette's darkest overlap (both glyph
+// and background are dimmed by VIGNETTE_MAX_DARKEN). These assertions import
+// the live palette and vignette constants, so deepening the vignette or
+// dulling a color past AA fails this test.
+describe('palette contrast at the vignette worst case', () => {
+  it('glyph core clears WCAG AA 4.5:1', () => {
+    expect(contrastAtVignette(COLOR_GLYPH)).toBeGreaterThanOrEqual(4.5)
+  })
+
+  it('dim secondary text clears AA', () => {
+    expect(contrastAtVignette(COLOR_DIM)).toBeGreaterThanOrEqual(4.5)
+  })
+
+  it('focus ring clears AA', () => {
+    expect(contrastAtVignette(COLOR_FOCUS)).toBeGreaterThanOrEqual(4.5)
+  })
+
+  it('the vignette strength is the binding constraint', () => {
+    // Tied to the LIVE constant, not a magic number: the glyph clears AA at
+    // VIGNETTE_MAX_DARKEN, but pushing the vignette 0.2 darker drops it below
+    // AA, so the constant genuinely sits against the contrast boundary.
+    expect(contrastAtVignette(COLOR_GLYPH)).toBeGreaterThanOrEqual(4.5)
+    const deeper = VIGNETTE_MAX_DARKEN + 0.2
+    const tooStrong = contrastRatio(
+      darken(COLOR_GLYPH, deeper),
+      darken(COLOR_GLASS, deeper),
+    )
+    expect(tooStrong).toBeLessThan(4.5)
+  })
+})
