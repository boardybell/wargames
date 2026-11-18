diff --git a/src/app/a11y/motion.ts b/src/app/a11y/motion.ts
new file mode 100644
index 0000000..8e555ed
--- /dev/null
+++ b/src/app/a11y/motion.ts
@@ -0,0 +1,7 @@
+// Motion-preference stand-in. Section 09 owns the real useMotionPreference
+// hook that composes the media query with an in-app override; this reads the
+// media query so the push-in and type-in can honor reduced motion now.
+export function prefersReducedMotion(): boolean {
+  if (typeof window === 'undefined' || !window.matchMedia) return false
+  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
+}
diff --git a/src/app/hero/HeroScene.tsx b/src/app/hero/HeroScene.tsx
new file mode 100644
index 0000000..5d72b3e
--- /dev/null
+++ b/src/app/hero/HeroScene.tsx
@@ -0,0 +1,138 @@
+// The full-viewport activation scene: one button whose accessible name is the
+// visible ACTIVATE TERMINAL label, a decorative hero photo, the live greeting
+// positioned over the photo's computed glass point, and a small sound control
+// that sits outside the button so toggling it never activates. Activation is
+// single-use across click, pointer tap, Enter, and Space; the AudioContext is
+// resumed synchronously inside every handler (a user gesture is required), and
+// the push-in is handed to the caller exactly once.
+import { useLayoutEffect, useRef, useState } from 'react'
+import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
+import { artNatural, artSources } from '../art'
+import { resumeAudio } from '../audio'
+import { Cursor } from '../crt/Cursor'
+import { CENTER, computeGlassRect } from './glassRect'
+import { HERO_CROPS } from './heroCrop'
+import type { ArtSlotId } from './heroCrop'
+import './hero.css'
+
+export interface HeroPhotoHandle {
+  readonly photoEl: HTMLElement | null
+  readonly glass: { x: number; y: number; w: number; h: number }
+}
+
+export interface HeroSceneProps {
+  readonly slot?: ArtSlotId
+  readonly greeting?: string
+  /** Invoked exactly once, after the synchronous audio resume, to run the
+   *  push-in. The caller owns the terminal layer and the sequence. */
+  readonly onActivate: (handle: HeroPhotoHandle) => void
+}
+
+export function HeroScene({
+  slot = 'hero-desktop',
+  greeting = 'GREETINGS PROFESSOR FALKEN',
+  onActivate,
+}: HeroSceneProps) {
+  const activatedRef = useRef(false)
+  const photoRef = useRef<HTMLDivElement>(null)
+  const imgRef = useRef<HTMLImageElement>(null)
+  const [greetingPos, setGreetingPos] = useState<{ x: number; y: number }>({
+    x: 0,
+    y: 0,
+  })
+  const crop = HERO_CROPS[slot]
+  const sources = artSources(slot)
+
+  useLayoutEffect(() => {
+    const measure = (): void => {
+      const img = imgRef.current
+      if (!img) return
+      const box = img.getBoundingClientRect()
+      const natural = {
+        w: img.naturalWidth || artNatural(slot).w,
+        h: img.naturalHeight || artNatural(slot).h,
+      }
+      const { greeting: point } = computeGlassRect(
+        { w: box.width, h: box.height },
+        natural,
+        CENTER,
+        crop,
+      )
+      setGreetingPos(point)
+    }
+    measure()
+    // Recompute on resize, orientation change, and image-source selection (the
+    // picture element may pick the portrait companion on phones). Activation
+    // unmounts this scene, so no push-in-window suppression is needed here.
+    window.addEventListener('resize', measure)
+    window.addEventListener('orientationchange', measure)
+    const img = imgRef.current
+    img?.addEventListener('load', measure)
+    return () => {
+      window.removeEventListener('resize', measure)
+      window.removeEventListener('orientationchange', measure)
+      img?.removeEventListener('load', measure)
+    }
+  }, [slot, crop])
+
+  const glassOf = (): HeroPhotoHandle['glass'] => {
+    const img = imgRef.current
+    if (!img) return { x: 0, y: 0, w: 0, h: 0 }
+    const box = img.getBoundingClientRect()
+    const natural = {
+      w: img.naturalWidth || artNatural(slot).w,
+      h: img.naturalHeight || artNatural(slot).h,
+    }
+    return computeGlassRect(
+      { w: box.width, h: box.height },
+      natural,
+      CENTER,
+      crop,
+    ).glass
+  }
+
+  const activate = (): void => {
+    // Synchronous resume inside the gesture, before any guard or async work.
+    resumeAudio()
+    if (activatedRef.current) return
+    activatedRef.current = true
+    onActivate({ photoEl: photoRef.current, glass: glassOf() })
+  }
+
+  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
+    if (event.key === 'Enter' || event.key === ' ') {
+      event.preventDefault()
+      activate()
+    }
+  }
+
+  return (
+    <>
+      <button
+        type="button"
+        className="hero-button"
+        data-testid="hero-button"
+        onClick={activate}
+        onPointerUp={activate}
+        onKeyDown={onKeyDown}
+      >
+        <span className="hero-photo" ref={photoRef} data-testid="hero-photo" aria-hidden="true">
+          <picture>
+            <source srcSet={sources.avif} type="image/avif" />
+            <img ref={imgRef} src={sources.jpg} alt="" data-testid="hero-img" />
+          </picture>
+          <span
+            className="hero-greeting"
+            data-testid="hero-greeting"
+            style={{ left: `${greetingPos.x}px`, top: `${greetingPos.y}px` }}
+          >
+            {greeting}
+            <Cursor />
+          </span>
+        </span>
+        <span className="hero-label">ACTIVATE TERMINAL</span>
+      </button>
+      <div className="hero-sound" data-testid="hero-sound-control" />
+    </>
+  )
+}
diff --git a/src/app/hero/HeroStage.tsx b/src/app/hero/HeroStage.tsx
new file mode 100644
index 0000000..ed47a4b
--- /dev/null
+++ b/src/app/hero/HeroStage.tsx
@@ -0,0 +1,81 @@
+// The integration: load routing decides whether the hero shows at all, the
+// HeroScene hands off to the push-in, and the push-in reveals the terminal
+// (ScreenRouter) beneath. A mid-engagement save skips the hero entirely. The
+// wake on arrival that settles an expired session is performed by the store's
+// init (section 02) before this mounts, so the resumed phase already drives
+// the routing decision here.
+import { useRef, useState } from 'react'
+import { useCampaign } from '../state'
+import { hasSoundPreference } from '../audio'
+import { ScreenRouter } from '../screens'
+import { moveFocusTo } from '../a11y/focus'
+import { prefersReducedMotion } from '../a11y/motion'
+import { decideInitialScreen } from './loadRouting'
+import { HeroScene } from './HeroScene'
+import type { HeroPhotoHandle } from './HeroScene'
+import { SoundPrompt } from './soundPrompt'
+import { runPushIn } from './pushIn'
+
+export function HeroStage() {
+  const state = useCampaign()
+  const [activated, setActivated] = useState(
+    () => decideInitialScreen(state) === 'engine',
+  )
+  const [showSoundPrompt, setShowSoundPrompt] = useState(false)
+  const terminalRef = useRef<HTMLDivElement>(null)
+  const freshAtMount = useRef(
+    state.phase === 'menu' && state.settled.length === 0,
+  )
+
+  const onActivate = (handle: HeroPhotoHandle): void => {
+    const terminalEl = terminalRef.current
+    if (!terminalEl) {
+      setActivated(true)
+      return
+    }
+    runPushIn(
+      {
+        photoEl: handle.photoEl ?? terminalEl,
+        terminalEl,
+        glass: handle.glass,
+        viewport: { w: window.innerWidth, h: window.innerHeight },
+      },
+      {
+        reducedMotion: prefersReducedMotion(),
+        onFinish: () => {
+          setActivated(true)
+          moveFocusTo(terminalEl)
+          if (freshAtMount.current && !hasSoundPreference()) {
+            setShowSoundPrompt(true)
+          }
+        },
+      },
+    )
+  }
+
+  if (activated) {
+    return (
+      <>
+        <ScreenRouter />
+        {showSoundPrompt && (
+          <SoundPrompt onAnswered={() => setShowSoundPrompt(false)} />
+        )}
+      </>
+    )
+  }
+
+  return (
+    <>
+      {/* The terminal mounts beneath the photo at opacity 0; the push-in
+          crossfades it up. */}
+      <div
+        ref={terminalRef}
+        data-testid="terminal-beneath"
+        style={{ position: 'absolute', inset: 0, opacity: 0 }}
+      >
+        <ScreenRouter />
+      </div>
+      <HeroScene onActivate={onActivate} />
+    </>
+  )
+}
diff --git a/src/app/hero/glassRect.ts b/src/app/hero/glassRect.ts
new file mode 100644
index 0000000..b199549
--- /dev/null
+++ b/src/app/hero/glassRect.ts
@@ -0,0 +1,76 @@
+// Pure object-fit cover geometry. Given where the hero photo actually paints
+// (a cover-fit image overflows its box), map a glass rect and a greeting
+// anchor authored as fractions of the natural image size into on-screen
+// pixels, so the live greeting text sits exactly over the photo's screen
+// glass. No DOM reads: callers feed measurements in, which keeps this
+// exhaustively testable and frozen-input safe.
+
+export interface Size {
+  readonly w: number
+  readonly h: number
+}
+
+export interface Rect {
+  readonly x: number
+  readonly y: number
+  readonly w: number
+  readonly h: number
+}
+
+export interface Point {
+  readonly x: number
+  readonly y: number
+}
+
+/** object-position as fractions in [0,1] (0.5,0.5 is center). */
+export interface ObjectPosition {
+  readonly x: number
+  readonly y: number
+}
+
+export interface HeroCropFractions {
+  /** Glass rect as fractions of the natural image size. */
+  readonly glass: Rect
+  /** Greeting anchor as a fraction point of the natural image size. */
+  readonly greetingAnchor: Point
+}
+
+export interface GlassGeometry {
+  readonly glass: Rect
+  readonly greeting: Point
+}
+
+/** cover scale: the image is scaled to fully cover the box, so the larger of
+ *  the two box/natural ratios wins. */
+export function coverScale(box: Size, natural: Size): number {
+  return Math.max(box.w / natural.w, box.h / natural.h)
+}
+
+export function computeGlassRect(
+  box: Size,
+  natural: Size,
+  position: ObjectPosition,
+  crop: HeroCropFractions,
+): GlassGeometry {
+  const scale = coverScale(box, natural)
+  const renderedW = natural.w * scale
+  const renderedH = natural.h * scale
+  // The overflow (box minus rendered, <= 0 for cover) is distributed by
+  // object-position: 0 pins the left/top edge, 1 pins right/bottom, 0.5 centers.
+  const offsetX = (box.w - renderedW) * position.x
+  const offsetY = (box.h - renderedH) * position.y
+  return {
+    glass: {
+      x: offsetX + crop.glass.x * renderedW,
+      y: offsetY + crop.glass.y * renderedH,
+      w: crop.glass.w * renderedW,
+      h: crop.glass.h * renderedH,
+    },
+    greeting: {
+      x: offsetX + crop.greetingAnchor.x * renderedW,
+      y: offsetY + crop.greetingAnchor.y * renderedH,
+    },
+  }
+}
+
+export const CENTER: ObjectPosition = { x: 0.5, y: 0.5 }
diff --git a/src/app/hero/hero.css b/src/app/hero/hero.css
new file mode 100644
index 0000000..f5b765b
--- /dev/null
+++ b/src/app/hero/hero.css
@@ -0,0 +1,74 @@
+/* The full-viewport activation scene. The photo covers the viewport; the
+   greeting sits over the computed glass point; the small sound control lives
+   in a corner outside the activation button. Structural only; palette and type
+   come from the CRT theme. */
+.hero-button {
+  position: fixed;
+  inset: 0;
+  width: 100%;
+  height: 100%;
+  padding: 0;
+  border: 0;
+  background: var(--color-glass);
+  color: var(--color-glyph);
+  cursor: pointer;
+  overflow: hidden;
+}
+
+.hero-photo {
+  position: absolute;
+  inset: 0;
+}
+.hero-photo picture,
+.hero-photo img {
+  position: absolute;
+  inset: 0;
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+  object-position: center;
+}
+
+/* Graded placeholder behind the image, so a missing asset degrades to a
+   tinted glass rather than a broken-image icon. */
+.hero-photo {
+  background:
+    radial-gradient(
+      ellipse at center,
+      rgba(108, 182, 255, 0.08),
+      rgba(5, 10, 20, 1) 70%
+    ),
+    var(--color-glass);
+}
+
+.hero-greeting {
+  position: absolute;
+  font-family: var(--font-terminal);
+  color: var(--color-glyph);
+  text-shadow: 0 0 4px rgba(108, 182, 255, 0.5);
+  white-space: nowrap;
+  font-size: clamp(0.8rem, 2.5vw, 1.4rem);
+}
+
+.hero-label {
+  position: absolute;
+  left: 50%;
+  bottom: 8%;
+  transform: translateX(-50%);
+  font-family: var(--font-terminal);
+  letter-spacing: 0.2em;
+  color: var(--color-dim);
+}
+
+.hero-sound {
+  position: fixed;
+  right: 1rem;
+  bottom: 1rem;
+  z-index: 2;
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .hero-greeting {
+    text-shadow: 0 0 1px var(--color-glyph);
+  }
+}
diff --git a/src/app/hero/heroCrop.ts b/src/app/hero/heroCrop.ts
new file mode 100644
index 0000000..999aae9
--- /dev/null
+++ b/src/app/hero/heroCrop.ts
@@ -0,0 +1,32 @@
+// HeroCrop metadata per art asset. Authored here for the placeholder and the
+// first generated hero; final art ships its own calibrated values through the
+// same interface (the click-calibration tool is section 10), so nothing here
+// is throwaway. Glass and greeting are fractions of the natural image size.
+import type { HeroCropFractions } from './glassRect'
+
+export type ArtSlotId = 'hero-desktop' | 'hero-portrait'
+
+export interface HeroCrop extends HeroCropFractions {
+  readonly srcKey: ArtSlotId
+  /** Scene id: the portrait companion is a reframe of the same scene, so both
+   *  crops declare the same scene id. */
+  readonly scene: string
+}
+
+// The CRT screen sits in the central third of the generated hero; the greeting
+// anchors near the screen's upper-left text origin. Values are eyeballed
+// against the first hero; the calibration tool refines them later.
+export const HERO_CROPS: Readonly<Record<ArtSlotId, HeroCrop>> = {
+  'hero-desktop': {
+    srcKey: 'hero-desktop',
+    scene: 'wopr-command-room',
+    glass: { x: 0.34, y: 0.3, w: 0.32, h: 0.4 },
+    greetingAnchor: { x: 0.4, y: 0.38 },
+  },
+  'hero-portrait': {
+    srcKey: 'hero-portrait',
+    scene: 'wopr-command-room',
+    glass: { x: 0.22, y: 0.34, w: 0.56, h: 0.3 },
+    greetingAnchor: { x: 0.3, y: 0.4 },
+  },
+}
diff --git a/src/app/hero/index.ts b/src/app/hero/index.ts
new file mode 100644
index 0000000..2c2f01a
--- /dev/null
+++ b/src/app/hero/index.ts
@@ -0,0 +1,26 @@
+export { HeroScene, type HeroSceneProps, type HeroPhotoHandle } from './HeroScene'
+export { HeroStage } from './HeroStage'
+export { SoundPrompt, type SoundPromptProps } from './soundPrompt'
+export {
+  runPushIn,
+  isPushInInvoked,
+  __resetPushIn,
+  PUSH_IN_MS,
+  CROSSFADE_AT_MS,
+  REDUCED_MS,
+  type PushInHandles,
+  type PushInOptions,
+} from './pushIn'
+export {
+  computeGlassRect,
+  coverScale,
+  CENTER,
+  type Size,
+  type Rect,
+  type Point,
+  type ObjectPosition,
+  type HeroCropFractions,
+  type GlassGeometry,
+} from './glassRect'
+export { HERO_CROPS, type HeroCrop, type ArtSlotId } from './heroCrop'
+export { decideInitialScreen, type InitialScreen } from './loadRouting'
diff --git a/src/app/hero/loadRouting.ts b/src/app/hero/loadRouting.ts
new file mode 100644
index 0000000..ab18cf8
--- /dev/null
+++ b/src/app/hero/loadRouting.ts
@@ -0,0 +1,19 @@
+// The initial-screen decision. The engine load result decides whether the
+// hero appears; the shell never guesses game state. A mid-engagement save
+// (a mission in progress, a debrief pending, the finale running) skips the
+// hero and goes straight to the engine-driven screen, so a returning player is
+// never greeted with the opening scene over an in-progress campaign. A fresh
+// campaign or a menu-phase save shows the hero; activation lands on the menu
+// with all campaign state intact.
+import type { CampaignState } from '@engine'
+
+export type InitialScreen = 'hero' | 'engine'
+
+export function decideInitialScreen(state: CampaignState | null): InitialScreen {
+  if (!state) return 'hero'
+  // Only a fresh or menu-phase save shows the hero. Everything mid or
+  // post engagement (mission, debrief, finale, ended) resumes the
+  // engine-driven screen, so a returning player is never re-greeted with the
+  // opening scene over an existing campaign.
+  return state.phase === 'menu' ? 'hero' : 'engine'
+}
diff --git a/src/app/hero/pushIn.ts b/src/app/hero/pushIn.ts
new file mode 100644
index 0000000..6b47934
--- /dev/null
+++ b/src/app/hero/pushIn.ts
@@ -0,0 +1,119 @@
+// The hand-rolled FLIP push-in (WAAPI, no View Transitions API). Single-use:
+// a guard prevents re-entry whether the second attempt arrives mid-animation
+// or after. The photo layer dollies so the glass fills the viewport while the
+// terminal, mounted beneath at opacity 0, crossfades up near the end. Under
+// reduced motion the dolly collapses to a short crossfade. No filters or
+// shadows animate; will-change is scoped strictly to the push window.
+import type { Rect } from './glassRect'
+
+export const PUSH_IN_MS = 700
+export const CROSSFADE_AT_MS = 450
+export const REDUCED_MS = 250
+const OVERSHOOT = 1.04
+// Camera-dolly easing: accelerate into the screen.
+const DOLLY_EASING = 'cubic-bezier(0.7, 0, 0.84, 0)'
+
+export interface PushInHandles {
+  readonly photoEl: HTMLElement
+  readonly terminalEl: HTMLElement
+  readonly glass: Rect
+  readonly viewport: { readonly w: number; readonly h: number }
+}
+
+export interface PushInOptions {
+  readonly reducedMotion: boolean
+  /** Remove will-change, unmount the photo, move focus to the terminal, play
+   *  the activation cue, start the greeting type-in, then reveal the rows. */
+  onFinish(): void
+}
+
+let invoked = false
+
+export function isPushInInvoked(): boolean {
+  return invoked
+}
+
+export function runPushIn(handles: PushInHandles, options: PushInOptions): void {
+  if (invoked) return // single-use, re-entry safe
+  invoked = true
+
+  let finished = false
+  const finish = (): void => {
+    if (finished) return // idempotent: event, promise, or safety net, whichever first
+    finished = true
+    handles.photoEl.style.willChange = ''
+    options.onFinish()
+  }
+  // Safety net: if the WAAPI finish event is ever missed (a cancelled
+  // animation, a backgrounded tab, an element removed mid-run), the scene must
+  // not hang on the photo forever. This fires once, idempotently.
+  const totalMs = options.reducedMotion ? REDUCED_MS : PUSH_IN_MS
+  setTimeout(finish, totalMs + 150)
+
+  if (options.reducedMotion) {
+    handles.terminalEl.animate(
+      [{ opacity: 0 }, { opacity: 1 }],
+      { duration: REDUCED_MS, fill: 'forwards' },
+    )
+    const fade = handles.photoEl.animate(
+      [{ opacity: 1 }, { opacity: 0 }],
+      { duration: REDUCED_MS, fill: 'forwards' },
+    )
+    attachFinish(fade, finish)
+    return
+  }
+
+  handles.photoEl.style.willChange = 'transform'
+  const k =
+    Math.max(
+      handles.viewport.w / handles.glass.w,
+      handles.viewport.h / handles.glass.h,
+    ) * OVERSHOOT
+  const glassCx = handles.glass.x + handles.glass.w / 2
+  const glassCy = handles.glass.y + handles.glass.h / 2
+  const tx = handles.viewport.w / 2 - glassCx
+  const ty = handles.viewport.h / 2 - glassCy
+
+  const dolly = handles.photoEl.animate(
+    [
+      { transform: 'translate(0px, 0px) scale(1)' },
+      { transform: `translate(${tx}px, ${ty}px) scale(${k})` },
+    ],
+    { duration: PUSH_IN_MS, easing: DOLLY_EASING, fill: 'forwards' },
+  )
+
+  // Crossfade the terminal up near the end; a settle from 1.02 to 1 covers
+  // sub-pixel register residue at the handoff.
+  const crossfadeTimer = setTimeout(() => {
+    handles.terminalEl.animate(
+      [
+        { opacity: 0, transform: 'scale(1.02)' },
+        { opacity: 1, transform: 'scale(1)' },
+      ],
+      { duration: PUSH_IN_MS - CROSSFADE_AT_MS, fill: 'forwards' },
+    )
+    handles.photoEl.animate(
+      [{ opacity: 1 }, { opacity: 0 }],
+      { duration: PUSH_IN_MS - CROSSFADE_AT_MS, fill: 'forwards' },
+    )
+  }, CROSSFADE_AT_MS)
+
+  attachFinish(dolly, () => {
+    clearTimeout(crossfadeTimer)
+    finish()
+  })
+}
+
+function attachFinish(animation: Animation, onFinish: () => void): void {
+  // WAAPI finish event; fall back to the promise where available.
+  if (typeof animation.addEventListener === 'function') {
+    animation.addEventListener('finish', onFinish, { once: true })
+  } else if (animation.finished) {
+    void animation.finished.then(onFinish).catch(() => {})
+  }
+}
+
+/** Test-only: re-arm the single-use guard. */
+export function __resetPushIn(): void {
+  invoked = false
+}
diff --git a/src/app/hero/soundPrompt.tsx b/src/app/hero/soundPrompt.tsx
new file mode 100644
index 0000000..778d7c1
--- /dev/null
+++ b/src/app/hero/soundPrompt.tsx
@@ -0,0 +1,53 @@
+// The diegetic ENABLE SOUND? Y/N line. Renders as a terminal line after
+// activation, only when the campaign is fresh and sound has never been
+// configured. It registers at the active-diegetic-prompt layer of the input
+// precedence stack so Y answers it without completing a type-in or selecting a
+// menu row, and unrelated keys fall through. The answer persists in the single
+// master sound preference that also backs the settings switch (section 07),
+// never a shadow copy, so it never reappears, including across a reload.
+import { useCallback, useEffect, useRef } from 'react'
+import { clearPrompt, setPrompt } from '../screens/inputStack'
+import { resumeAudio, setSoundPreference } from '../audio'
+import { TerminalText } from '../terminal/TerminalText'
+
+export interface SoundPromptProps {
+  readonly onAnswered?: (enabled: boolean) => void
+}
+
+export function SoundPrompt({ onAnswered }: SoundPromptProps) {
+  const answeredRef = useRef(false)
+  const onAnsweredRef = useRef(onAnswered)
+  onAnsweredRef.current = onAnswered
+
+  // One answer path for both the keyboard (via the prompt layer) and the
+  // buttons; a latch guards against answering twice (key then click).
+  const answer = useCallback((enabled: boolean): void => {
+    if (answeredRef.current) return
+    answeredRef.current = true
+    setSoundPreference(enabled ? 'on' : 'off')
+    if (enabled) resumeAudio()
+    clearPrompt()
+    onAnsweredRef.current?.(enabled)
+  }, [])
+
+  useEffect(() => {
+    setPrompt(['Y', 'y', 'N', 'n'], (key) => answer(key === 'Y' || key === 'y'))
+    return () => clearPrompt()
+  }, [answer])
+
+  return (
+    <div className="sound-prompt" data-testid="sound-prompt">
+      <TerminalText>ENABLE SOUND? Y/N</TerminalText>
+      <button
+        type="button"
+        data-testid="sound-yes"
+        onClick={() => answer(true)}
+      >
+        Y
+      </button>
+      <button type="button" data-testid="sound-no" onClick={() => answer(false)}>
+        N
+      </button>
+    </div>
+  )
+}
diff --git a/test/app/hero/glassRect.test.ts b/test/app/hero/glassRect.test.ts
new file mode 100644
index 0000000..1a1c2410
--- /dev/null
+++ b/test/app/hero/glassRect.test.ts
@@ -0,0 +1,99 @@
+import { describe, expect, it } from 'vitest'
+import {
+  CENTER,
+  computeGlassRect,
+  coverScale,
+  type HeroCropFractions,
+} from '@app/hero/glassRect'
+
+// A glass centered in the image, occupying the middle half, greeting at 30% in.
+const crop: HeroCropFractions = {
+  glass: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
+  greetingAnchor: { x: 0.3, y: 0.3 },
+}
+
+describe('coverScale', () => {
+  it('picks the larger box/natural ratio so the image covers', () => {
+    // Wider box than the image aspect: width ratio dominates.
+    expect(coverScale({ w: 1000, h: 500 }, { w: 1000, h: 1000 })).toBe(1)
+    // Taller box: height ratio dominates.
+    expect(coverScale({ w: 500, h: 1000 }, { w: 1000, h: 1000 })).toBe(1)
+    expect(coverScale({ w: 2000, h: 1000 }, { w: 1000, h: 1000 })).toBe(2)
+  })
+})
+
+describe('computeGlassRect cover cases', () => {
+  it('landscape image in a wider box: width fills, height overflows and centers', () => {
+    const box = { w: 1600, h: 400 }
+    const natural = { w: 1600, h: 900 }
+    const g = computeGlassRect(box, natural, CENTER, crop)
+    // scale = max(1600/1600, 400/900)=1; renderedH=900; overflowY=400-900=-500.
+    // offsetY = -500*0.5 = -250.
+    expect(g.glass.x).toBeCloseTo(0.25 * 1600)
+    expect(g.glass.w).toBeCloseTo(0.5 * 1600)
+    expect(g.glass.y).toBeCloseTo(-250 + 0.25 * 900)
+    expect(g.glass.h).toBeCloseTo(0.5 * 900)
+  })
+
+  it('landscape image in a taller box: height fills, width overflows', () => {
+    const box = { w: 400, h: 900 }
+    const natural = { w: 1600, h: 900 }
+    const g = computeGlassRect(box, natural, CENTER, crop)
+    // scale = max(400/1600, 900/900)=1; renderedW=1600; overflowX=400-1600=-1200.
+    // offsetX = -600.
+    expect(g.glass.x).toBeCloseTo(-600 + 0.25 * 1600)
+    expect(g.glass.y).toBeCloseTo(0.25 * 900)
+  })
+
+  it('portrait image in a wide box and a tall box', () => {
+    const natural = { w: 900, h: 1600 }
+    const wide = computeGlassRect({ w: 1800, h: 600 }, natural, CENTER, crop)
+    // scale=max(1800/900,600/1600)=2; renderedW=1800,renderedH=3200; offsetY=(600-3200)/2=-1300
+    expect(wide.glass.x).toBeCloseTo(0.25 * 1800)
+    expect(wide.glass.y).toBeCloseTo(-1300 + 0.25 * 3200)
+    const tall = computeGlassRect({ w: 450, h: 1600 }, natural, CENTER, crop)
+    // scale=max(450/900,1600/1600)=1; renderedW=900; offsetX=(450-900)/2=-225
+    expect(tall.glass.x).toBeCloseTo(-225 + 0.25 * 900)
+  })
+
+  it('square image and square box map one to one', () => {
+    const g = computeGlassRect(
+      { w: 1000, h: 1000 },
+      { w: 1000, h: 1000 },
+      CENTER,
+      crop,
+    )
+    expect(g.glass).toEqual({ x: 250, y: 250, w: 500, h: 500 })
+    expect(g.greeting).toEqual({ x: 300, y: 300 })
+  })
+})
+
+describe('object-position variants', () => {
+  const box = { w: 400, h: 900 }
+  const natural = { w: 1600, h: 900 }
+  it('top-left pins the left edge (offset 0)', () => {
+    const g = computeGlassRect(box, natural, { x: 0, y: 0 }, crop)
+    expect(g.glass.x).toBeCloseTo(0.25 * 1600)
+  })
+  it('right pins the right edge (full negative overflow)', () => {
+    const g = computeGlassRect(box, natural, { x: 1, y: 0 }, crop)
+    // overflowX=-1200; offsetX=-1200.
+    expect(g.glass.x).toBeCloseTo(-1200 + 0.25 * 1600)
+  })
+})
+
+describe('purity and frozen-input safety', () => {
+  it('does not throw or mutate on frozen inputs and is deterministic', () => {
+    const box = Object.freeze({ w: 800, h: 600 })
+    const natural = Object.freeze({ w: 1600, h: 900 })
+    const position = Object.freeze({ x: 0.5, y: 0.5 })
+    const frozenCrop = Object.freeze({
+      glass: Object.freeze({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 }),
+      greetingAnchor: Object.freeze({ x: 0.3, y: 0.25 }),
+    })
+    const a = computeGlassRect(box, natural, position, frozenCrop)
+    const b = computeGlassRect(box, natural, position, frozenCrop)
+    expect(a).toEqual(b)
+    expect(box).toEqual({ w: 800, h: 600 })
+  })
+})
diff --git a/test/app/hero/harness.ts b/test/app/hero/harness.ts
new file mode 100644
index 0000000..8422b9a
--- /dev/null
+++ b/test/app/hero/harness.ts
@@ -0,0 +1,58 @@
+import { vi } from 'vitest'
+import { setAudioPort, __resetAudio } from '@app/audio'
+import { __resetPushIn } from '@app/hero'
+import { __resetInputStack } from '@app/screens/inputStack'
+
+export function spyResume(): ReturnType<typeof vi.fn> {
+  const resume = vi.fn()
+  setAudioPort({ resume })
+  return resume
+}
+
+export function resetHero(): void {
+  __resetAudio()
+  __resetPushIn()
+  __resetInputStack()
+}
+
+interface MockedAnim {
+  el: HTMLElement
+  keyframes: Keyframe[]
+  opts: KeyframeAnimationOptions
+  anim: { addEventListener: (e: string, cb: () => void) => void; finish: () => void }
+}
+
+/** Replace element.animate with a capturing mock; returns the recorded calls
+ *  and a restore function. */
+export function mockAnimate(): { anims: MockedAnim[]; restore: () => void } {
+  const anims: MockedAnim[] = []
+  const original = HTMLElement.prototype.animate
+  HTMLElement.prototype.animate = function (
+    this: HTMLElement,
+    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
+    opts?: number | KeyframeAnimationOptions,
+  ) {
+    const listeners: Record<string, () => void> = {}
+    const anim = {
+      addEventListener: (e: string, cb: () => void) => {
+        listeners[e] = cb
+      },
+      finish: () => listeners['finish']?.(),
+      finished: Promise.resolve(),
+      cancel: () => {},
+    }
+    anims.push({
+      el: this,
+      keyframes: (keyframes ?? []) as Keyframe[],
+      opts: (typeof opts === 'number' ? { duration: opts } : (opts ?? {})),
+      anim,
+    })
+    return anim as unknown as Animation
+  } as typeof HTMLElement.prototype.animate
+  return {
+    anims,
+    restore: () => {
+      HTMLElement.prototype.animate = original
+    },
+  }
+}
diff --git a/test/app/hero/heroScene.test.tsx b/test/app/hero/heroScene.test.tsx
new file mode 100644
index 0000000..51951f6
--- /dev/null
+++ b/test/app/hero/heroScene.test.tsx
@@ -0,0 +1,70 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { HeroScene } from '@app/hero'
+import { resetHero, spyResume } from './harness'
+
+beforeEach(resetHero)
+afterEach(() => {
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('HeroScene activation', () => {
+  it('is single-use across click, pointer, Enter, and Space', () => {
+    const onActivate = vi.fn()
+    render(<HeroScene onActivate={onActivate} />)
+    const button = screen.getByTestId('hero-button')
+    fireEvent.click(button)
+    fireEvent.pointerUp(button)
+    fireEvent.keyDown(button, { key: 'Enter' })
+    fireEvent.keyDown(button, { key: ' ' })
+    expect(onActivate).toHaveBeenCalledTimes(1)
+  })
+
+  it('resumes audio synchronously in every activation handler', () => {
+    const resume = spyResume()
+    render(<HeroScene onActivate={() => {}} />)
+    const button = screen.getByTestId('hero-button')
+    fireEvent.click(button)
+    fireEvent.pointerUp(button)
+    fireEvent.keyDown(button, { key: 'Enter' })
+    fireEvent.keyDown(button, { key: ' ' })
+    // Resume fires on each gesture, before the single-use guard.
+    expect(resume).toHaveBeenCalledTimes(4)
+  })
+
+  it('takes its accessible name from ACTIVATE TERMINAL; the image is decorative', () => {
+    render(<HeroScene onActivate={() => {}} />)
+    expect(
+      screen.getByRole('button', { name: 'ACTIVATE TERMINAL' }),
+    ).toBeInTheDocument()
+    expect(screen.getByTestId('hero-img')).toHaveAttribute('alt', '')
+  })
+
+  it('renders the sound control outside the activation button', () => {
+    render(<HeroScene onActivate={() => {}} />)
+    const control = screen.getByTestId('hero-sound-control')
+    const button = screen.getByTestId('hero-button')
+    expect(button.contains(control)).toBe(false)
+  })
+
+  it('positions the greeting over the computed glass point', () => {
+    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
+      width: 1200,
+      height: 675,
+      x: 0,
+      y: 0,
+      top: 0,
+      left: 0,
+      right: 1200,
+      bottom: 675,
+      toJSON: () => ({}),
+    } as DOMRect)
+    render(<HeroScene onActivate={() => {}} />)
+    // natural falls back to 1600x900; cover scale 0.75; greetingAnchor
+    // (0.4, 0.38) of the 1200x675 rendered image = (480, 256.5).
+    const greeting = screen.getByTestId('hero-greeting')
+    expect(greeting.style.left).toBe('480px')
+    expect(greeting.style.top).toBe('256.5px')
+  })
+})
diff --git a/test/app/hero/heroStage.test.tsx b/test/app/hero/heroStage.test.tsx
new file mode 100644
index 0000000..1401bc6
--- /dev/null
+++ b/test/app/hero/heroStage.test.tsx
@@ -0,0 +1,66 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { HeroStage } from '@app/hero'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll as resetScreens, buildCtx, memoryPort } from '../screens/harness'
+import { mockAnimate, resetHero } from './harness'
+
+let teardown: () => void
+let animCtl: ReturnType<typeof mockAnimate>
+
+beforeEach(() => {
+  resetScreens()
+  resetHero()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  animCtl = mockAnimate()
+  registerDefaultVerbs()
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  animCtl.restore()
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('HeroStage integration', () => {
+  it('a fresh campaign shows the hero with the terminal mounted beneath', () => {
+    render(<HeroStage />)
+    expect(screen.getByTestId('hero-button')).toBeInTheDocument()
+    expect(screen.getByTestId('terminal-beneath')).toBeInTheDocument()
+    // The menu is rendered beneath, ready to be revealed.
+    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
+  })
+
+  it('an active-mission save skips the hero and shows the mission directly', () => {
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    render(<HeroStage />)
+    expect(screen.queryByTestId('hero-button')).toBeNull()
+    expect(screen.getByTestId('mission-frame')).toBeInTheDocument()
+  })
+
+  it('activation runs the push-in and reveals the terminal, then the sound prompt', () => {
+    render(<HeroStage />)
+    act(() => {
+      fireEvent.click(screen.getByTestId('hero-button'))
+    })
+    // Finish the photo dolly to complete the push-in.
+    const dolly = animCtl.anims.find(
+      (a) =>
+        typeof a.keyframes[1]?.transform === 'string' &&
+        (a.keyframes[1].transform as string).includes('scale'),
+    )
+    expect(dolly).toBeTruthy()
+    act(() => {
+      dolly!.anim.finish()
+    })
+    // Hero gone, terminal (menu) shown, and the fresh-campaign sound prompt up.
+    expect(screen.queryByTestId('hero-button')).toBeNull()
+    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
+    expect(screen.getByTestId('sound-prompt')).toBeInTheDocument()
+  })
+})
diff --git a/test/app/hero/loadRouting.test.ts b/test/app/hero/loadRouting.test.ts
new file mode 100644
index 0000000..2046c54
--- /dev/null
+++ b/test/app/hero/loadRouting.test.ts
@@ -0,0 +1,58 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import { decideInitialScreen } from '@app/hero'
+import { buildCtx, resetAll } from '../state/harness'
+
+const T0 = 1_000_000
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+})
+
+afterEach(() => vi.restoreAllMocks())
+
+describe('decideInitialScreen', () => {
+  it('shows the hero for no save', () => {
+    expect(decideInitialScreen(null)).toBe('hero')
+  })
+
+  it('shows the hero for a menu-phase save (campaign state preserved)', () => {
+    const ctx = buildCtx()
+    const state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+    expect(state.phase).toBe('menu')
+    expect(decideInitialScreen(state)).toBe('hero')
+  })
+
+  it('skips the hero for an active mission', () => {
+    const ctx = buildCtx()
+    const state = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    expect(state.phase).toBe('mission')
+    expect(decideInitialScreen(state)).toBe('engine')
+  })
+
+  it('skips the hero for a pending debrief (post-settlement)', () => {
+    const ctx = buildCtx()
+    let state = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    for (let i = 0; i < 3; i++) {
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+        state.lastNow + 1_000,
+      ).state
+    }
+    expect(state.phase).toBe('debrief')
+    expect(decideInitialScreen(state)).toBe('engine')
+  })
+})
diff --git a/test/app/hero/pushIn.test.tsx b/test/app/hero/pushIn.test.tsx
new file mode 100644
index 0000000..f185d28
--- /dev/null
+++ b/test/app/hero/pushIn.test.tsx
@@ -0,0 +1,77 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { runPushIn, PUSH_IN_MS, CROSSFADE_AT_MS, REDUCED_MS } from '@app/hero'
+import { mockAnimate, resetHero } from './harness'
+
+let animCtl: ReturnType<typeof mockAnimate>
+
+beforeEach(() => {
+  resetHero()
+  vi.useFakeTimers()
+  animCtl = mockAnimate()
+})
+
+afterEach(() => {
+  animCtl.restore()
+  vi.useRealTimers()
+})
+
+function handles() {
+  return {
+    photoEl: document.createElement('div'),
+    terminalEl: document.createElement('div'),
+    glass: { x: 100, y: 100, w: 200, h: 150 },
+    viewport: { w: 1000, h: 700 },
+  }
+}
+
+describe('push-in default path', () => {
+  it('dollies the photo with a transform keyframe over 700 ms, crossfades at 450 ms, then finishes', () => {
+    const h = handles()
+    const onFinish = vi.fn()
+    runPushIn(h, { reducedMotion: false, onFinish })
+
+    const dolly = animCtl.anims.find(
+      (a) =>
+        a.el === h.photoEl &&
+        typeof a.keyframes[1]?.transform === 'string' &&
+        (a.keyframes[1].transform as string).includes('scale'),
+    )
+    expect(dolly).toBeTruthy()
+    expect(dolly!.opts.duration).toBe(PUSH_IN_MS)
+    expect(h.photoEl.style.willChange).toBe('transform')
+
+    // The terminal crossfade is scheduled, not immediate.
+    expect(animCtl.anims.filter((a) => a.el === h.terminalEl)).toHaveLength(0)
+    vi.advanceTimersByTime(CROSSFADE_AT_MS - 1)
+    expect(animCtl.anims.filter((a) => a.el === h.terminalEl)).toHaveLength(0)
+    vi.advanceTimersByTime(1)
+    expect(animCtl.anims.filter((a) => a.el === h.terminalEl)).toHaveLength(1)
+
+    dolly!.anim.finish()
+    expect(onFinish).toHaveBeenCalledTimes(1)
+    expect(h.photoEl.style.willChange).toBe('')
+  })
+})
+
+describe('push-in reduced motion', () => {
+  it('replaces the dolly with a short crossfade, no transform will-change', () => {
+    const h = handles()
+    const onFinish = vi.fn()
+    runPushIn(h, { reducedMotion: true, onFinish })
+    const fade = animCtl.anims.find((a) => a.el === h.photoEl)
+    expect(fade!.opts.duration).toBe(REDUCED_MS)
+    expect(h.photoEl.style.willChange).not.toBe('transform')
+    fade!.anim.finish()
+    expect(onFinish).toHaveBeenCalledTimes(1)
+  })
+})
+
+describe('push-in re-entry guard', () => {
+  it('a second invocation is a no-op', () => {
+    const h = handles()
+    runPushIn(h, { reducedMotion: true, onFinish: () => {} })
+    const count = animCtl.anims.length
+    runPushIn(h, { reducedMotion: true, onFinish: () => {} })
+    expect(animCtl.anims.length).toBe(count)
+  })
+})
diff --git a/test/app/hero/soundPrompt.test.tsx b/test/app/hero/soundPrompt.test.tsx
new file mode 100644
index 0000000..2402b53
--- /dev/null
+++ b/test/app/hero/soundPrompt.test.tsx
@@ -0,0 +1,53 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { SoundPrompt } from '@app/hero'
+import { getSoundPreference, hasSoundPreference } from '@app/audio'
+import { handleCapturedKey, setTypeIn } from '@app/screens/inputStack'
+import { resetHero } from './harness'
+
+beforeEach(resetHero)
+afterEach(() => {
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('SoundPrompt', () => {
+  it('Y enables sound and persists the single master preference', () => {
+    const onAnswered = vi.fn()
+    render(<SoundPrompt onAnswered={onAnswered} />)
+    fireEvent.click(screen.getByTestId('sound-yes'))
+    expect(getSoundPreference()).toBe('on')
+    expect(hasSoundPreference()).toBe(true)
+    expect(onAnswered).toHaveBeenCalledWith(true)
+  })
+
+  it('N declines and persists off', () => {
+    render(<SoundPrompt />)
+    fireEvent.click(screen.getByTestId('sound-no'))
+    expect(getSoundPreference()).toBe('off')
+    expect(hasSoundPreference()).toBe(true)
+  })
+
+  it('Y during the prompt answers it and does not complete a running type-in', () => {
+    const typeInComplete = vi.fn()
+    setTypeIn(true, typeInComplete)
+    render(<SoundPrompt />)
+    const result = handleCapturedKey(
+      new KeyboardEvent('keydown', { key: 'Y' }),
+    )
+    expect(result).toBe('consumed')
+    expect(getSoundPreference()).toBe('on')
+    // The prompt layer is above the type-in: Y never reached it.
+    expect(typeInComplete).not.toHaveBeenCalled()
+  })
+
+  it('an unrelated key during the prompt falls through (not consumed by the prompt)', () => {
+    render(<SoundPrompt />)
+    // 'X' is not an answer key; with no type-in it falls to the screen layer.
+    const result = handleCapturedKey(
+      new KeyboardEvent('keydown', { key: 'X' }),
+    )
+    expect(result).toBe('pass')
+    expect(getSoundPreference()).toBeNull()
+  })
+})
