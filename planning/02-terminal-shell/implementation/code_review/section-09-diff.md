diff --git a/planning/02-terminal-shell/implementation/code_review/section-09-diff.md b/planning/02-terminal-shell/implementation/code_review/section-09-diff.md
new file mode 100644
index 0000000..5c101df
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-09-diff.md
@@ -0,0 +1,1191 @@
+diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
+index 5792a8e..c1655b3 100644
+--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
++++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
+@@ -46,6 +46,10 @@
+     "section-07-audio-engine": {
+       "status": "complete",
+       "commit_hash": "87ab1ed"
++    },
++    "section-08-cabinet-grid": {
++      "status": "complete",
++      "commit_hash": "cb57732"
+     }
+   },
+   "pre_commit": {
+diff --git a/src/app/App.tsx b/src/app/App.tsx
+index 9fb1301..de8fa8a 100644
+--- a/src/app/App.tsx
++++ b/src/app/App.tsx
+@@ -11,6 +11,7 @@ import {
+   type RouterState,
+   type ScreenRegistry,
+ } from './router'
++import { LiveRegions } from './a11y/LiveRegions'
+ 
+ export interface AppProps {
+   readonly registry?: ScreenRegistry
+@@ -34,9 +35,9 @@ export function App({ registry = {}, initial }: AppProps) {
+       >
+         <Screen screenId={router.base} />
+       </main>
+-      {/* Reserved for section 09 live regions: a sibling of the dialog host,
+-          outside any screen root. Keep the position; do not restructure. */}
+-      <div data-testid="live-region-slot" hidden />
++      {/* The live regions: siblings of the dialog host, outside any screen
++          root, so an assertive announcement still fires while a modal is open. */}
++      <LiveRegions />
+       <div className="dialog-host" data-testid="dialog-host" />
+     </div>
+   )
+diff --git a/src/app/a11y/GlossaryTerm.tsx b/src/app/a11y/GlossaryTerm.tsx
+index d862003..ef4d35b 100644
+--- a/src/app/a11y/GlossaryTerm.tsx
++++ b/src/app/a11y/GlossaryTerm.tsx
+@@ -1,25 +1,65 @@
+-// Glossary term primitive stand-in. Section 09 builds the real
+-// focus-and-tap-friendly definition popover with the per-project glossary;
+-// this renders the term with its definition as an accessible description, so
+-// settings and mission copy can wrap jargon now and section 09 upgrades the
+-// presentation without touching callers.
+-import type { ReactNode } from 'react'
++// The glossary term primitive. Renders a term inline as a real button (simpler
++// and more robust than a span with role and tabindex) with a dotted underline
++// style hook. Pointer hover and keyboard focus open the definition; blur and
++// mouse-leave close it; click toggles; Escape closes while open. The popup is a
++// plain-text, non-interactive tooltip associated by aria-describedby, so no
++// focus trap is needed. A term can be given inline (term + definition) or by
++// id, in which case it is looked up in the project glossary and an unregistered
++// id fails loudly.
++import { useId, useState } from 'react'
++import { getGlossaryEntry } from './glossary'
++import './a11y.css'
+ 
+-export interface GlossaryTermProps {
+-  readonly term: ReactNode
+-  /** Plain-language definition for a smart layperson. */
+-  readonly definition: string
+-}
++export type GlossaryTermProps =
++  | { readonly id: string; readonly term?: never; readonly definition?: never }
++  | {
++      readonly id?: never
++      readonly term: string
++      /** Plain-language definition for a smart layperson. */
++      readonly definition: string
++    }
++
++export function GlossaryTerm(props: GlossaryTermProps) {
++  const popupId = useId()
++  const [open, setOpen] = useState(false)
++
++  const entry =
++    'id' in props && props.id !== undefined
++      ? getGlossaryEntry(props.id)
++      : { term: props.term, definition: props.definition }
+ 
+-export function GlossaryTerm({ term, definition }: GlossaryTermProps) {
+   return (
+-    <abbr
+-      className="glossary-term"
+-      title={definition}
+-      data-testid="glossary-term"
+-      tabIndex={0}
+-    >
+-      {term}
+-    </abbr>
++    <span className="glossary-wrap">
++      <button
++        type="button"
++        className="glossary-term"
++        data-testid="glossary-term"
++        aria-expanded={open}
++        aria-describedby={open ? popupId : undefined}
++        onMouseEnter={() => setOpen(true)}
++        onMouseLeave={() => setOpen(false)}
++        onFocus={() => setOpen(true)}
++        onBlur={() => setOpen(false)}
++        onClick={() => setOpen((v) => !v)}
++        onKeyDown={(e) => {
++          if (e.key === 'Escape' && open) {
++            e.stopPropagation()
++            setOpen(false)
++          }
++        }}
++      >
++        {entry.term}
++      </button>
++      {open ? (
++        <span
++          role="tooltip"
++          id={popupId}
++          className="glossary-popup"
++          data-testid="glossary-popup"
++        >
++          {entry.definition}
++        </span>
++      ) : null}
++    </span>
+   )
+ }
+diff --git a/src/app/a11y/LiveRegions.tsx b/src/app/a11y/LiveRegions.tsx
+new file mode 100644
+index 0000000..9c301b6
+--- /dev/null
++++ b/src/app/a11y/LiveRegions.tsx
+@@ -0,0 +1,40 @@
++// The two persistent live regions, mounted once in the App shell as siblings
++// of the dialog host, outside every screen root, so an assertive announcement
++// still fires while a native modal dialog is open. They are visually hidden
++// (clip-rect, not display:none, so assistive tech still reads them) and never
++// unmounted across screen changes. The inner span is keyed on the sequence so
++// an identical string re-reads: React replaces the text node, which the screen
++// reader treats as a fresh utterance.
++import { useSyncExternalStore } from 'react'
++import { getRegionState, subscribeRegion } from './announce'
++import './a11y.css'
++
++export function LiveRegions() {
++  const state = useSyncExternalStore(
++    subscribeRegion,
++    getRegionState,
++    getRegionState,
++  )
++  return (
++    <>
++      <div
++        className="sr-only"
++        role="status"
++        aria-atomic="true"
++        data-testid="live-polite"
++        data-seq={state.politeSeq}
++      >
++        <span key={state.politeSeq}>{state.politeText}</span>
++      </div>
++      <div
++        className="sr-only"
++        role="alert"
++        aria-atomic="true"
++        data-testid="live-assertive"
++        data-seq={state.assertiveSeq}
++      >
++        <span key={state.assertiveSeq}>{state.assertiveText}</span>
++      </div>
++    </>
++  )
++}
+diff --git a/src/app/a11y/a11y.css b/src/app/a11y/a11y.css
+new file mode 100644
+index 0000000..1a12a11
+--- /dev/null
++++ b/src/app/a11y/a11y.css
+@@ -0,0 +1,52 @@
++/* Accessibility primitives styling. The live regions are visually hidden with
++   the standard clip-rect technique (not display:none, which assistive tech
++   skips). The glossary term is a subtle dotted-underline inline control with a
++   plain-text popup; final color composes with the section-03 theme tokens. */
++.sr-only {
++  position: absolute;
++  width: 1px;
++  height: 1px;
++  padding: 0;
++  margin: -1px;
++  overflow: hidden;
++  clip: rect(0, 0, 0, 0);
++  white-space: nowrap;
++  border: 0;
++}
++
++.glossary-wrap {
++  position: relative;
++  display: inline-block;
++}
++
++.glossary-term {
++  font: inherit;
++  color: inherit;
++  background: none;
++  border: none;
++  padding: 0;
++  cursor: help;
++  text-decoration: underline dotted;
++  text-underline-offset: 2px;
++}
++
++.glossary-term:focus-visible {
++  outline: 2px solid var(--color-focus, #9fd8ff);
++  outline-offset: 2px;
++}
++
++.glossary-popup {
++  position: absolute;
++  left: 0;
++  top: 100%;
++  z-index: 20;
++  max-width: 22rem;
++  margin-top: 0.25rem;
++  padding: 0.5rem 0.75rem;
++  background: var(--color-glass, #050a14);
++  color: var(--color-glyph, #6cb6ff);
++  border: 1px solid var(--color-dim, #7fb0e0);
++  font-size: 0.9em;
++  line-height: 1.4;
++  white-space: normal;
++}
+diff --git a/src/app/a11y/announce.ts b/src/app/a11y/announce.ts
+index 48a9342..ff220c5 100644
+--- a/src/app/a11y/announce.ts
++++ b/src/app/a11y/announce.ts
+@@ -1,11 +1,21 @@
+-// Announcement stand-in. Section 09 owns the real aria-live regions mounted
+-// at the app root; this section consumes a narrow announce() so screens can
+-// report changes. Until section 09 wires the regions, announcements fan out
+-// to any registered sink (the test spies on this).
++// The single entry point for every spoken notification in the app. The
++// engine-event relay (section 02) and the audio captions (section 07) route
++// through announce(); the repaint ticker NEVER does, which is what keeps
++// countdown ticks silent. There is no path to the live regions but this one.
++//
++// Polite announcements coalesce within an ~800ms burst window (identical
++// strings collapse to one utterance, distinct strings queue and flush in
++// arrival order) and retrigger across windows via a sequence bump so a screen
++// reader re-reads an identical string. Assertive announcements write through
++// immediately, with no coalescing and no debounce, so the finale's critical
++// warnings are never delayed or dropped. A raw sink (onAnnounce) also fires on
++// every call for tests and non-visual consumers.
+ export type AnnounceChannel = 'polite' | 'assertive'
+ 
+ export type AnnounceSink = (text: string, channel: AnnounceChannel) => void
+ 
++export const POLITE_WINDOW_MS = 800
++
+ const sinks = new Set<AnnounceSink>()
+ 
+ export function onAnnounce(sink: AnnounceSink): () => void {
+@@ -15,14 +25,78 @@ export function onAnnounce(sink: AnnounceSink): () => void {
+   }
+ }
+ 
++export interface RegionState {
++  readonly politeText: string
++  readonly politeSeq: number
++  readonly assertiveText: string
++  readonly assertiveSeq: number
++}
++
++let region: RegionState = {
++  politeText: '',
++  politeSeq: 0,
++  assertiveText: '',
++  assertiveSeq: 0,
++}
++const regionListeners = new Set<() => void>()
++
++export function subscribeRegion(listener: () => void): () => void {
++  regionListeners.add(listener)
++  return () => regionListeners.delete(listener)
++}
++
++export function getRegionState(): RegionState {
++  return region
++}
++
++function emitRegion(next: RegionState): void {
++  region = next
++  for (const listener of regionListeners) listener()
++}
++
++// The polite coalescer: a window buffer (identical strings deduped) drained
++// one string per window so distinct strings still read in arrival order.
++let buffer: string[] = []
++let timer: ReturnType<typeof setTimeout> | null = null
++
++function enqueuePolite(text: string): void {
++  if (!buffer.includes(text)) buffer.push(text)
++  if (timer === null) timer = setTimeout(drainPolite, POLITE_WINDOW_MS)
++}
++
++function drainPolite(): void {
++  timer = null
++  const next = buffer.shift()
++  if (next === undefined) return
++  // Bump the sequence so an identical string across windows still re-reads.
++  emitRegion({ ...region, politeText: next, politeSeq: region.politeSeq + 1 })
++  if (buffer.length > 0) timer = setTimeout(drainPolite, POLITE_WINDOW_MS)
++}
++
+ export function announce(
+   text: string,
+   channel: AnnounceChannel = 'polite',
+ ): void {
+   for (const sink of sinks) sink(text, channel)
++  if (channel === 'assertive') {
++    emitRegion({
++      ...region,
++      assertiveText: text,
++      assertiveSeq: region.assertiveSeq + 1,
++    })
++    return
++  }
++  enqueuePolite(text)
+ }
+ 
+ /** Test-only. */
+ export function __resetAnnounce(): void {
+   sinks.clear()
++  buffer = []
++  if (timer !== null) {
++    clearTimeout(timer)
++    timer = null
++  }
++  region = { politeText: '', politeSeq: 0, assertiveText: '', assertiveSeq: 0 }
++  regionListeners.clear()
+ }
+diff --git a/src/app/a11y/focus.ts b/src/app/a11y/focus.ts
+index e7c3a51..62c30f8 100644
+--- a/src/app/a11y/focus.ts
++++ b/src/app/a11y/focus.ts
+@@ -1,9 +1,38 @@
+-// Focus management stand-in. Section 09 refines the heading-vs-input choice
+-// and the roving details; this section needs to move focus to a new screen
+-// root on every screen change.
++// Focus management. The router calls moveFocusTo on every screen change so
++// assistive tech lands on the new screen. Resolution order: the screen root's
++// heading, else the root itself. The command-input step from the plan is
++// deliberately deferred: auto-focusing the command input would route menu
++// number-shortcuts into the text field (where the key-handler bail predicate
++// correctly suppresses them), breaking keyboard selection. Mission screens
++// that want input-first focus can opt in later by rendering a heading they
++// want skipped, or a dedicated hook. Native dialogs manage their own focus
++// trap and restore; this function never touches them.
++
++function resolveTarget(root: HTMLElement): HTMLElement {
++  const heading = root.querySelector<HTMLElement>(
++    'h1, h2, [role="heading"], [data-a11y-heading]',
++  )
++  return heading ?? root
++}
++
++function isNativelyFocusable(el: HTMLElement): boolean {
++  if (el.tabIndex >= 0) return true
++  const tag = el.tagName
++  return (
++    tag === 'A' ||
++    tag === 'BUTTON' ||
++    tag === 'INPUT' ||
++    tag === 'TEXTAREA' ||
++    tag === 'SELECT'
++  )
++}
++
+ export function moveFocusTo(element: HTMLElement | null): void {
+   if (!element) return
+-  // A screen root is programmatically focusable via tabindex -1 (set by the
+-  // router); focus it so assistive tech lands on the new screen.
+-  element.focus()
++  const target = resolveTarget(element)
++  // Make the target programmatically focusable when it is not already.
++  if (!isNativelyFocusable(target) && !target.hasAttribute('tabindex')) {
++    target.setAttribute('tabindex', '-1')
++  }
++  target.focus({ preventScroll: true })
+ }
+diff --git a/src/app/a11y/glossary.ts b/src/app/a11y/glossary.ts
+new file mode 100644
+index 0000000..767cc6d
+--- /dev/null
++++ b/src/app/a11y/glossary.ts
+@@ -0,0 +1,112 @@
++// The project glossary: one module, plain-language definitions for a smart
++// layperson. Missions register their channel and ledger jargon through
++// registerGlossaryTerms at screen-registration time. Pure data plus
++// registration; the open/close presentation lives in GlossaryTerm.
++export interface GlossaryEntry {
++  readonly id: string
++  readonly term: string
++  readonly definition: string
++}
++
++const INITIAL_ENTRIES: readonly GlossaryEntry[] = [
++  {
++    id: 'open-exceptions',
++    term: 'OPEN EXCEPTIONS',
++    definition:
++      'The count of reported problems nobody has resolved yet. A rising number is WOPR treating inaction as if it were an outcome.',
++  },
++  {
++    id: 'trace',
++    term: 'TRACE',
++    definition:
++      'A step-by-step replay of how a result was reached, so you can see the reasoning rather than just the verdict.',
++  },
++  {
++    id: 'check-source',
++    term: 'CHECK SOURCE',
++    definition:
++      'Verifying where a claim came from before acting on it, instead of trusting the number on the screen.',
++  },
++  {
++    id: 'observed',
++    term: 'OBSERVED',
++    definition:
++      'A fact confirmed by direct evidence, as opposed to one the machine inferred or assumed.',
++  },
++  {
++    id: 'exercise',
++    term: 'EXERCISE',
++    definition:
++      'A simulation run, not a real operation. The whole point of the film: knowing which one you are in.',
++  },
++  {
++    id: 'derived',
++    term: 'DERIVED',
++    definition:
++      'A value the system calculated from other numbers rather than measured directly. Useful, but only as sound as its inputs.',
++  },
++  {
++    id: 'independent-corroboration',
++    term: 'independent corroboration',
++    definition:
++      'A second, unrelated source agreeing with the first. Two feeds that share a cause are not independent.',
++  },
++  {
++    id: 'repeat-d-83',
++    term: 'REPEAT D-83',
++    definition:
++      'A command to re-run drill sequence D-83. In the story, the drill that will not stay a drill.',
++  },
++  {
++    id: 'hold-and-verify',
++    term: 'HOLD AND VERIFY',
++    definition:
++      'Pause before committing to an action and confirm the facts first. The discipline the game rewards.',
++  },
++  {
++    id: 'staged-recovery',
++    term: 'STAGED RECOVERY',
++    definition:
++      'Bringing a failed position back in planned steps, each checked for viability before the next, rather than all at once.',
++  },
++]
++
++const registry = new Map<string, GlossaryEntry>()
++
++function seed(): void {
++  registry.clear()
++  for (const entry of INITIAL_ENTRIES) registry.set(entry.id, entry)
++}
++
++seed()
++
++export function hasGlossaryEntry(id: string): boolean {
++  return registry.has(id)
++}
++
++export function getGlossaryEntry(id: string): GlossaryEntry {
++  const entry = registry.get(id)
++  if (!entry) {
++    throw new Error(`glossary: no entry registered for id "${id}"`)
++  }
++  return entry
++}
++
++export function allGlossaryEntries(): readonly GlossaryEntry[] {
++  return [...registry.values()]
++}
++
++/** Add mission terms. A colliding id is a programming error and throws. */
++export function registerGlossaryTerms(entries: readonly GlossaryEntry[]): void {
++  for (const entry of entries) {
++    if (registry.has(entry.id)) {
++      throw new Error(`glossary: duplicate term id "${entry.id}"`)
++    }
++    registry.set(entry.id, entry)
++  }
++}
++
++/** Test-only: restore the registry to the shipped entries. */
++export function __resetGlossary(): void {
++  seed()
++}
+diff --git a/src/app/a11y/keyHandler.ts b/src/app/a11y/keyHandler.ts
+index 49c2cd0..468b19c 100644
+--- a/src/app/a11y/keyHandler.ts
++++ b/src/app/a11y/keyHandler.ts
+@@ -1,29 +1,13 @@
+-// The shared key-handler guard. Section 09 owns the a11y spine and will
+-// refine these; this section needs the bail conditions now, so they live here
+-// as the real implementation. A key event is ignored when it targets an
+-// editable element (so typing in the command input never triggers menu
+-// shortcuts), when a modifier is held (browser and OS shortcuts win), or
+-// while an IME composition is in progress.
+-export interface KeyLike {
+-  readonly key: string
+-  readonly ctrlKey?: boolean
+-  readonly metaKey?: boolean
+-  readonly altKey?: boolean
+-  readonly isComposing?: boolean
+-  readonly target?: EventTarget | null
+-}
++// The shared key-handler guard, expressed as the positive predicate the
++// terminal framework and grid consume. It is the inverse of the section-09
++// bail predicate in keys.ts; both names exist so callers read naturally
++// (shouldHandleKey at a shortcut site, shouldBailFromKeyHandling at a
++// precedence gate). KeyLike is re-exported so existing importers are undisturbed.
++import { shouldBailFromKeyHandling, type KeyLike } from './keys'
+ 
+-function isEditableTarget(target: EventTarget | null | undefined): boolean {
+-  if (!(target instanceof HTMLElement)) return false
+-  if (target.isContentEditable) return true
+-  const tag = target.tagName
+-  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
+-}
++export type { KeyLike }
+ 
+ /** True when a screen/menu shortcut handler should act on this key. */
+ export function shouldHandleKey(event: KeyLike): boolean {
+-  if (event.ctrlKey || event.metaKey || event.altKey) return false
+-  if (event.isComposing) return false
+-  if (isEditableTarget(event.target ?? null)) return false
+-  return true
++  return !shouldBailFromKeyHandling(event)
+ }
+diff --git a/src/app/a11y/keys.ts b/src/app/a11y/keys.ts
+new file mode 100644
+index 0000000..7a24e6d
+--- /dev/null
++++ b/src/app/a11y/keys.ts
+@@ -0,0 +1,30 @@
++// The shared key-handler bail predicate. The full input precedence stack
++// (dialog, diegetic prompt, type-in, menu shortcuts, globals) in section 04
++// composes on top of this; it is a pure function of the event so the table
++// test is trivial. A key event is ignored when it targets an editable element
++// (typing in the command input never triggers a menu shortcut), when a
++// modifier is held (browser and OS shortcuts win), or while an IME composition
++// is in progress.
++export interface KeyLike {
++  readonly key: string
++  readonly ctrlKey?: boolean
++  readonly metaKey?: boolean
++  readonly altKey?: boolean
++  readonly isComposing?: boolean
++  readonly target?: EventTarget | null
++}
++
++function isEditableTarget(target: EventTarget | null | undefined): boolean {
++  if (!(target instanceof HTMLElement)) return false
++  if (target.isContentEditable) return true
++  const tag = target.tagName
++  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
++}
++
++/** True when a screen/menu shortcut handler should NOT act on this key. */
++export function shouldBailFromKeyHandling(event: KeyLike): boolean {
++  if (event.ctrlKey || event.metaKey || event.altKey) return true
++  if (event.isComposing) return true
++  if (isEditableTarget(event.target ?? null)) return true
++  return false
++}
+diff --git a/src/app/a11y/motion.ts b/src/app/a11y/motion.ts
+index 8070dd1..1b565db 100644
+--- a/src/app/a11y/motion.ts
++++ b/src/app/a11y/motion.ts
+@@ -1,14 +1,41 @@
+-// Motion-preference stand-in. Section 09 owns the real useMotionPreference
+-// hook that composes the media query with an in-app override; this reads the
+-// media query plus a session in-app override so settings can flip motion now
+-// and every consumer sees one truth.
++// The motion preference. A tiny subscribable store holds the in-app override,
++// composed with a live prefers-reduced-motion media query: the override wins
++// unless it is 'system'. Section 06 settings writes the override; the type-in,
++// push-in, grid, and cabinet all read the hook. Contract: consumers sample the
++// preference when starting an animation; a mid-flight change never cancels a
++// running animation, which is structural here because this module holds no
++// animation references at all. The override persists to localStorage under one
++// key; a corrupt or missing read falls back to 'system'. jsdom on this Node
++// has no window.localStorage, so an in-memory value is the session source of
++// truth and localStorage is mirrored when present.
+ import { useSyncExternalStore } from 'react'
+ 
+-export type MotionOverride = 'reduce' | 'full' | null // null = follow system
++export type MotionOverride = 'system' | 'reduced' | 'full'
+ 
+-let override: MotionOverride = null
++const STORE_KEY = 'wg-motion-override'
++const OVERRIDES: ReadonlySet<string> = new Set(['system', 'reduced', 'full'])
++
++let override: MotionOverride = readPersisted()
+ const listeners = new Set<() => void>()
+ 
++function readPersisted(): MotionOverride {
++  try {
++    const raw = globalThis.localStorage?.getItem(STORE_KEY)
++    if (raw && OVERRIDES.has(raw)) return raw as MotionOverride
++  } catch {
++    // No storage, or a corrupt read: fall back to following the system.
++  }
++  return 'system'
++}
++
++function persist(value: MotionOverride): void {
++  try {
++    globalThis.localStorage?.setItem(STORE_KEY, value)
++  } catch {
++    // Storage is optional; the in-memory value remains the source of truth.
++  }
++}
++
+ function systemReducedMotion(): boolean {
+   if (typeof window === 'undefined' || !window.matchMedia) return false
+   return window.matchMedia('(prefers-reduced-motion: reduce)').matches
+@@ -16,7 +43,7 @@ function systemReducedMotion(): boolean {
+ 
+ /** The composed truth: an explicit override wins, else the system setting. */
+ export function prefersReducedMotion(): boolean {
+-  if (override === 'reduce') return true
++  if (override === 'reduced') return true
+   if (override === 'full') return false
+   return systemReducedMotion()
+ }
+@@ -27,22 +54,47 @@ export function getMotionOverride(): MotionOverride {
+ 
+ export function setMotionOverride(next: MotionOverride): void {
+   override = next
++  persist(next)
+   for (const listener of listeners) listener()
+ }
+ 
+-export function useReducedMotion(): boolean {
++function subscribe(listener: () => void): () => void {
++  listeners.add(listener)
++  // Re-render on a live system-preference change too, not just override writes.
++  const mql =
++    typeof window !== 'undefined' && window.matchMedia
++      ? window.matchMedia('(prefers-reduced-motion: reduce)')
++      : null
++  const onMedia = (): void => listener()
++  if (mql) {
++    if (mql.addEventListener) mql.addEventListener('change', onMedia)
++    else mql.addListener(onMedia)
++  }
++  return () => {
++    listeners.delete(listener)
++    if (mql) {
++      if (mql.removeEventListener) mql.removeEventListener('change', onMedia)
++      else mql.removeListener(onMedia)
++    }
++  }
++}
++
++/** True means reduce motion. The primary hook (the section 09 name). */
++export function useMotionPreference(): boolean {
+   return useSyncExternalStore(
+-    (l) => {
+-      listeners.add(l)
+-      return () => listeners.delete(l)
+-    },
++    subscribe,
+     prefersReducedMotion,
+     prefersReducedMotion,
+   )
+ }
+ 
+-/** Test-only. */
++/** Alias kept for the sections that adopted the stand-in name. */
++export const useReducedMotion = useMotionPreference
++
++/** Test-only. Re-reads persistence so a corrupt-store test can assert the
++ *  fallback, and so each test starts from whatever storage holds (nothing, in
++ *  jsdom, which means 'system'). */
+ export function __resetMotion(): void {
+-  override = null
+   listeners.clear()
++  override = readPersisted()
+ }
+diff --git a/src/app/screens/SettingsDialog.tsx b/src/app/screens/SettingsDialog.tsx
+index dd16644..521da40 100644
+--- a/src/app/screens/SettingsDialog.tsx
++++ b/src/app/screens/SettingsDialog.tsx
+@@ -83,7 +83,9 @@ export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
+             type="checkbox"
+             data-testid="toggle-motion"
+             checked={reducedMotion}
+-            onChange={(e) => setMotionOverride(e.target.checked ? 'reduce' : 'full')}
++            onChange={(e) =>
++              setMotionOverride(e.target.checked ? 'reduced' : 'full')
++            }
+           />
+           {' REDUCE MOTION'}
+         </label>
+diff --git a/test/app/a11y/announcer.test.tsx b/test/app/a11y/announcer.test.tsx
+new file mode 100644
+index 0000000..966dd9d
+--- /dev/null
++++ b/test/app/a11y/announcer.test.tsx
+@@ -0,0 +1,101 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { act, cleanup, render, screen } from '@testing-library/react'
++import { LiveRegions } from '@app/a11y/LiveRegions'
++import { announce, __resetAnnounce } from '@app/a11y/announce'
++
++beforeEach(() => {
++  __resetAnnounce()
++  vi.useFakeTimers()
++})
++afterEach(() => {
++  vi.useRealTimers()
++  cleanup()
++  __resetAnnounce()
++})
++
++const polite = () => screen.getByTestId('live-polite')
++const assertive = () => screen.getByTestId('live-assertive')
++
++describe('LiveRegions and announcer', () => {
++  it('both regions exist from boot with the right roles', () => {
++    render(<LiveRegions />)
++    expect(polite()).toHaveAttribute('role', 'status')
++    expect(polite()).toHaveAttribute('aria-atomic', 'true')
++    expect(assertive()).toHaveAttribute('role', 'alert')
++  })
++
++  it('advancing timers without an announce mutates nothing', () => {
++    render(<LiveRegions />)
++    act(() => {
++      vi.advanceTimersByTime(5000)
++    })
++    expect(polite()).toHaveAttribute('data-seq', '0')
++    expect(polite()).toHaveTextContent('')
++    expect(assertive()).toHaveAttribute('data-seq', '0')
++  })
++
++  it('polite coalesces identical strings within the window into one utterance', () => {
++    render(<LiveRegions />)
++    act(() => {
++      announce('MISSION ALPHA RESOLVED', 'polite')
++      announce('MISSION ALPHA RESOLVED', 'polite')
++    })
++    act(() => {
++      vi.advanceTimersByTime(800)
++    })
++    expect(polite()).toHaveTextContent('MISSION ALPHA RESOLVED')
++    expect(polite()).toHaveAttribute('data-seq', '1')
++  })
++
++  it('polite queues distinct strings in arrival order', () => {
++    render(<LiveRegions />)
++    act(() => {
++      announce('FIRST', 'polite')
++      announce('SECOND', 'polite')
++    })
++    act(() => {
++      vi.advanceTimersByTime(800)
++    })
++    expect(polite()).toHaveTextContent('FIRST')
++    act(() => {
++      vi.advanceTimersByTime(800)
++    })
++    expect(polite()).toHaveTextContent('SECOND')
++    expect(polite()).toHaveAttribute('data-seq', '2')
++  })
++
++  it('an identical polite string across windows retriggers (sequence bumps)', () => {
++    render(<LiveRegions />)
++    act(() => announce('ALERT', 'polite'))
++    act(() => vi.advanceTimersByTime(800))
++    expect(polite()).toHaveAttribute('data-seq', '1')
++    act(() => announce('ALERT', 'polite'))
++    act(() => vi.advanceTimersByTime(800))
++    expect(polite()).toHaveTextContent('ALERT')
++    expect(polite()).toHaveAttribute('data-seq', '2')
++  })
++
++  it('assertive never coalesces: two identical announcements both land', () => {
++    render(<LiveRegions />)
++    act(() => {
++      announce('DEFCON 1', 'assertive')
++      announce('DEFCON 1', 'assertive')
++    })
++    expect(assertive()).toHaveTextContent('DEFCON 1')
++    expect(assertive()).toHaveAttribute('data-seq', '2')
++  })
++
++  it('assertive fires while a modal dialog is open', () => {
++    render(
++      <div>
++        <LiveRegions />
++        <dialog data-testid="modal" open>
++          trapped
++        </dialog>
++      </div>,
++    )
++    act(() => announce('FINAL PHASE', 'assertive'))
++    // The region is outside the dialog but still receives the text.
++    expect(assertive()).toHaveTextContent('FINAL PHASE')
++  })
++})
+diff --git a/test/app/a11y/focus.test.tsx b/test/app/a11y/focus.test.tsx
+new file mode 100644
+index 0000000..227d283
+--- /dev/null
++++ b/test/app/a11y/focus.test.tsx
+@@ -0,0 +1,42 @@
++import { afterEach, describe, expect, it, vi } from 'vitest'
++import { moveFocusTo } from '@app/a11y/focus'
++
++afterEach(() => {
++  vi.restoreAllMocks()
++  document.body.innerHTML = ''
++})
++
++describe('moveFocusTo', () => {
++  it('focuses a bare container with tabindex -1 and preventScroll', () => {
++    const el = document.createElement('div')
++    document.body.appendChild(el)
++    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
++    moveFocusTo(el)
++    expect(el.getAttribute('tabindex')).toBe('-1')
++    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
++    expect(document.activeElement).toBe(el)
++  })
++
++  it('focuses the screen root heading when one is present', () => {
++    const root = document.createElement('div')
++    const heading = document.createElement('h2')
++    heading.textContent = 'MISSION ALPHA'
++    root.appendChild(heading)
++    document.body.appendChild(root)
++    moveFocusTo(root)
++    expect(document.activeElement).toBe(heading)
++    expect(heading.getAttribute('tabindex')).toBe('-1')
++  })
++
++  it('does nothing when given null', () => {
++    expect(() => moveFocusTo(null)).not.toThrow()
++  })
++
++  it('does not override an existing tabindex', () => {
++    const el = document.createElement('div')
++    el.setAttribute('tabindex', '0')
++    document.body.appendChild(el)
++    moveFocusTo(el)
++    expect(el.getAttribute('tabindex')).toBe('0')
++  })
++})
+diff --git a/test/app/a11y/glossary.test.tsx b/test/app/a11y/glossary.test.tsx
+new file mode 100644
+index 0000000..cbdfe45
+--- /dev/null
++++ b/test/app/a11y/glossary.test.tsx
+@@ -0,0 +1,105 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { cleanup, fireEvent, render, screen } from '@testing-library/react'
++import { GlossaryTerm } from '@app/a11y/GlossaryTerm'
++import {
++  allGlossaryEntries,
++  getGlossaryEntry,
++  registerGlossaryTerms,
++  __resetGlossary,
++} from '@app/a11y/glossary'
++
++beforeEach(() => {
++  __resetGlossary()
++})
++afterEach(() => {
++  cleanup()
++  __resetGlossary()
++})
++
++describe('GlossaryTerm interaction', () => {
++  it('opens on hover, focus, and click; Escape closes', () => {
++    render(<GlossaryTerm id="open-exceptions" />)
++    const term = screen.getByTestId('glossary-term')
++    expect(term).toHaveTextContent('OPEN EXCEPTIONS')
++    expect(term).toHaveAttribute('aria-expanded', 'false')
++    expect(screen.queryByTestId('glossary-popup')).toBeNull()
++
++    fireEvent.mouseEnter(term)
++    expect(term).toHaveAttribute('aria-expanded', 'true')
++    const popup = screen.getByTestId('glossary-popup')
++    expect(term.getAttribute('aria-describedby')).toBe(popup.id)
++    fireEvent.mouseLeave(term)
++    expect(screen.queryByTestId('glossary-popup')).toBeNull()
++
++    fireEvent.focus(term)
++    expect(screen.getByTestId('glossary-popup')).toBeInTheDocument()
++    fireEvent.keyDown(term, { key: 'Escape' })
++    expect(screen.queryByTestId('glossary-popup')).toBeNull()
++
++    fireEvent.click(term)
++    expect(term).toHaveAttribute('aria-expanded', 'true')
++    fireEvent.click(term)
++    expect(term).toHaveAttribute('aria-expanded', 'false')
++  })
++
++  it('is focusable and labeled (reachable as a button carrying the term)', () => {
++    render(<GlossaryTerm term="EXTENDED TIME" definition="A calmer pace." />)
++    const term = screen.getByRole('button', { name: 'EXTENDED TIME' })
++    expect(term).toBeInTheDocument()
++  })
++
++  it('renders an inline term and definition without the registry', () => {
++    render(<GlossaryTerm term="WOPR" definition="War Operation Plan Response." />)
++    fireEvent.focus(screen.getByTestId('glossary-term'))
++    expect(screen.getByTestId('glossary-popup')).toHaveTextContent(
++      'War Operation Plan Response.',
++    )
++  })
++
++  it('fails loudly when rendered for an unregistered id', () => {
++    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
++    expect(() => render(<GlossaryTerm id="no-such-term" />)).toThrow()
++    spy.mockRestore()
++  })
++})
++
++describe('glossary registry', () => {
++  it('every registered term has a non-empty definition', () => {
++    for (const entry of allGlossaryEntries()) {
++      expect(entry.definition.trim().length).toBeGreaterThan(0)
++    }
++  })
++
++  it('ships the initial terms', () => {
++    const terms = allGlossaryEntries().map((e) => e.term)
++    for (const expected of [
++      'OPEN EXCEPTIONS',
++      'TRACE',
++      'CHECK SOURCE',
++      'OBSERVED',
++      'EXERCISE',
++      'DERIVED',
++      'independent corroboration',
++      'REPEAT D-83',
++      'HOLD AND VERIFY',
++      'STAGED RECOVERY',
++    ]) {
++      expect(terms).toContain(expected)
++    }
++  })
++
++  it('registerGlossaryTerms adds mission terms', () => {
++    registerGlossaryTerms([
++      { id: 'decoy-run', term: 'DECOY RUN', definition: 'A feint to draw attention.' },
++    ])
++    expect(getGlossaryEntry('decoy-run').term).toBe('DECOY RUN')
++  })
++
++  it('a colliding term id throws', () => {
++    expect(() =>
++      registerGlossaryTerms([
++        { id: 'trace', term: 'TRACE', definition: 'duplicate' },
++      ]),
++    ).toThrow()
++  })
++})
+diff --git a/test/app/a11y/keys.test.ts b/test/app/a11y/keys.test.ts
+new file mode 100644
+index 0000000..1fc18b6
+--- /dev/null
++++ b/test/app/a11y/keys.test.ts
+@@ -0,0 +1,45 @@
++import { describe, expect, it } from 'vitest'
++import { shouldBailFromKeyHandling, type KeyLike } from '@app/a11y/keys'
++import { shouldHandleKey } from '@app/a11y/keyHandler'
++
++function editable(tag: string): HTMLElement {
++  return document.createElement(tag)
++}
++
++function contentEditableDiv(): HTMLElement {
++  const d = document.createElement('div')
++  Object.defineProperty(d, 'isContentEditable', { value: true })
++  return d
++}
++
++const plainTarget = document.createElement('div')
++
++describe('shouldBailFromKeyHandling', () => {
++  const bailCases: Array<[string, KeyLike]> = [
++    ['input target', { key: 'a', target: editable('input') }],
++    ['textarea target', { key: 'a', target: editable('textarea') }],
++    ['select target', { key: 'a', target: editable('select') }],
++    ['contentEditable target', { key: 'a', target: contentEditableDiv() }],
++    ['ctrl held', { key: 'a', ctrlKey: true, target: plainTarget }],
++    ['meta held', { key: 'a', metaKey: true, target: plainTarget }],
++    ['alt held', { key: 'a', altKey: true, target: plainTarget }],
++    ['composing', { key: 'a', isComposing: true, target: plainTarget }],
++  ]
++
++  for (const [name, event] of bailCases) {
++    it(`bails for ${name}`, () => {
++      expect(shouldBailFromKeyHandling(event)).toBe(true)
++      expect(shouldHandleKey(event)).toBe(false)
++    })
++  }
++
++  it('does not bail for a plain key on a non-editable target', () => {
++    const event: KeyLike = { key: '1', target: plainTarget }
++    expect(shouldBailFromKeyHandling(event)).toBe(false)
++    expect(shouldHandleKey(event)).toBe(true)
++  })
++
++  it('does not bail when target is null', () => {
++    expect(shouldBailFromKeyHandling({ key: 'Enter', target: null })).toBe(false)
++  })
++})
+diff --git a/test/app/a11y/motion.test.tsx b/test/app/a11y/motion.test.tsx
+new file mode 100644
+index 0000000..16c15d6
+--- /dev/null
++++ b/test/app/a11y/motion.test.tsx
+@@ -0,0 +1,107 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { cleanup, render, screen, act } from '@testing-library/react'
++import {
++  useMotionPreference,
++  useReducedMotion,
++  setMotionOverride,
++  getMotionOverride,
++  __resetMotion,
++} from '@app/a11y/motion'
++
++function installMatchMedia(matches: boolean) {
++  const listeners = new Set<() => void>()
++  const mql = {
++    matches,
++    media: '',
++    onchange: null,
++    addEventListener: (_: string, l: () => void) => listeners.add(l),
++    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
++    addListener: (l: () => void) => listeners.add(l),
++    removeListener: (l: () => void) => listeners.delete(l),
++    dispatchEvent: () => false,
++  }
++  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia
++  return {
++    setMatches(v: boolean) {
++      mql.matches = v
++      for (const l of listeners) l()
++    },
++  }
++}
++
++function Probe() {
++  const reduced = useMotionPreference()
++  return <span data-testid="reduced">{reduced ? 'yes' : 'no'}</span>
++}
++
++beforeEach(() => {
++  __resetMotion()
++})
++afterEach(() => {
++  cleanup()
++  vi.unstubAllGlobals()
++  __resetMotion()
++  vi.restoreAllMocks()
++})
++
++describe('useMotionPreference', () => {
++  it('mirrors prefers-reduced-motion when the override is system', () => {
++    installMatchMedia(true)
++    render(<Probe />)
++    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
++  })
++
++  it('reflects the system off state too', () => {
++    installMatchMedia(false)
++    render(<Probe />)
++    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
++  })
++
++  it('an explicit override wins over the media query and reverts to system', () => {
++    installMatchMedia(true) // system prefers reduce
++    render(<Probe />)
++    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
++    act(() => setMotionOverride('full'))
++    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
++    act(() => setMotionOverride('reduced'))
++    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
++    act(() => setMotionOverride('system'))
++    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
++  })
++
++  it('re-renders on a live media-query change', () => {
++    const media = installMatchMedia(false)
++    render(<Probe />)
++    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
++    act(() => media.setMatches(true))
++    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
++  })
++
++  it('useReducedMotion is the same hook', () => {
++    expect(useReducedMotion).toBe(useMotionPreference)
++  })
++
++  it('a flip never cancels a running animation (hook holds no animation refs)', () => {
++    installMatchMedia(false)
++    const anim = { cancel: vi.fn(), finish: vi.fn() }
++    function Consumer() {
++      // The documented pattern: sample once at animation start.
++      useMotionPreference()
++      return <span data-testid="c">ok</span>
++    }
++    render(<Consumer />)
++    act(() => setMotionOverride('reduced'))
++    expect(anim.cancel).not.toHaveBeenCalled()
++    expect(anim.finish).not.toHaveBeenCalled()
++  })
++
++  it('a corrupt or missing persisted override falls back to system', () => {
++    vi.stubGlobal('localStorage', {
++      getItem: () => 'garbage-not-an-override',
++      setItem: () => {},
++      removeItem: () => {},
++    })
++    __resetMotion()
++    expect(getMotionOverride()).toBe('system')
++  })
++})
+diff --git a/test/app/grid/characterGrid.test.tsx b/test/app/grid/characterGrid.test.tsx
+index 12c6f36..fd698ab 100644
+--- a/test/app/grid/characterGrid.test.tsx
++++ b/test/app/grid/characterGrid.test.tsx
+@@ -158,7 +158,7 @@ describe('CharacterGrid', () => {
+       <CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />,
+     )
+     expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-anim')
+-    setMotionOverride('reduce')
++    setMotionOverride('reduced')
+     rerender(<CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />)
+     expect(screen.getAllByRole('gridcell')[0]).not.toHaveClass('char-cell-anim')
+   })
+diff --git a/test/app/grid/playBranchTrace.test.tsx b/test/app/grid/playBranchTrace.test.tsx
+index 3365053..7207d46 100644
+--- a/test/app/grid/playBranchTrace.test.tsx
++++ b/test/app/grid/playBranchTrace.test.tsx
+@@ -45,7 +45,7 @@ describe('PlayBranchTrace', () => {
+   })
+ 
+   it('under reduced motion every step is present at once', () => {
+-    setMotionOverride('reduce')
++    setMotionOverride('reduced')
+     render(<PlayBranchTrace steps={STEPS} />)
+     expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
+     expect(screen.queryByTestId('branch-skip')).toBeNull()
+diff --git a/test/app/smoke.test.tsx b/test/app/smoke.test.tsx
+index 244e39e..1ffd747 100644
+--- a/test/app/smoke.test.tsx
++++ b/test/app/smoke.test.tsx
+@@ -7,8 +7,9 @@ describe('app smoke', () => {
+     render(<App />)
+     expect(screen.getByTestId('screen-root')).toBeInTheDocument()
+     expect(screen.getByTestId('dialog-host')).toBeInTheDocument()
+-    // The reserved live-region position exists so section 09 is an insertion.
+-    expect(screen.getByTestId('live-region-slot')).toBeInTheDocument()
++    // The live regions mount at the app root as dialog-host siblings.
++    expect(screen.getByTestId('live-polite')).toBeInTheDocument()
++    expect(screen.getByTestId('live-assertive')).toBeInTheDocument()
+   })
+ 
+   it('defaults to the hero base screen', () => {
diff --git a/planning/02-terminal-shell/implementation/code_review/section-09-interview.md b/planning/02-terminal-shell/implementation/code_review/section-09-interview.md
new file mode 100644
index 0000000..68a210c
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-09-interview.md
@@ -0,0 +1,23 @@
+# Section 09 review triage and fixes
+
+Standing directive: full autonomy, no questions. Fixed the three substantive items and two UX/spec gaps; kept the low-severity items with rationale.
+
+## Auto-fixed
+
+- **H1 + H2 (unbounded polite backlog / timer).** The polite coalescer is now a fixed burst window: within one ~800ms window identical strings dedup and distinct strings accumulate in arrival order, then flush as ONE ordered utterance (joined) and the buffer clears. A finale burst of N events reads once, not as an N-times-800ms drip, and the timer always clears after a single flush (no growing backlog, no lingering reschedule). Tests updated: distinct strings from one window flush together ("FIRST. SECOND", one seq bump); a later window flushes its own batch.
+
+- **M3 (command-input focus step).** Implemented as an opt-in `[data-a11y-focus]` marker: resolution is heading -> marked input -> root. The menu does not mark its command input, so it keeps root focus and its number-shortcuts; an input-first mission screen with no heading marks its input and lands focus there. The escape hatch now exists rather than being hand-waved. Test added covering both the unmarked (root) and marked (input) cases.
+
+- **M4 (GlossaryTerm tap double-fire).** Click now OPENS (idempotent with focus) instead of toggling, so a touch tap (focus then click) reliably opens instead of netting to closed. Close remains via blur, mouse-leave, or Escape. Test updated to assert click-opens / blur-closes.
+
+- **M5 (prod crash on unregistered glossary id).** GlossaryTerm resolves an id through a dev/prod split: in dev (import.meta.env.DEV) an unregistered id throws (loud), in production it logs and degrades to the raw id so a bad term never white-screens the game. registerGlossaryTerms collisions get the same treatment (throw in dev, log-and-skip in prod). Tests run with DEV true, so the throw assertions still hold.
+
+- **L6.** Documented that the onAnnounce sink is RAW (sees every call, including polite duplicates) while the region is the coalesced truth.
+
+## Let go (with rationale)
+- **L7.** motion.ts subscribe recreates the matchMedia object per subscriber; memoizing at module scope would break per-test matchMedia mocks. Cleanup is paired, so no leak. Kept.
+- **L8.** The assertive region carries aria-atomic; role=alert is implicitly atomic, so it is harmless. Kept.
+- **L9.** The ticker-never-announces boundary is a documented invariant tested at the section-02 relay, not here. Kept.
+
+## Verification
+- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm test`: 471 passed / 72 files (was 469). New/changed tests: focus opt-in marker, announcer bounded window (2), glossary click-opens.
diff --git a/planning/02-terminal-shell/implementation/code_review/section-09-review.md b/planning/02-terminal-shell/implementation/code_review/section-09-review.md
new file mode 100644
index 0000000..68e584e
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-09-review.md
@@ -0,0 +1,21 @@
+# A11y spine + glossary (section-09) review
+
+Reviewer: deep-implement:code-reviewer. Consumers still compile, the 'reduce'->'reduced' rename propagated, useReducedMotion is a correct alias. Real defects below.
+
+## HIGH
+- **1. Polite coalescer is an unbounded 1-per-800ms drip.** `drainPolite` reschedules a fresh 800ms timer while the buffer is non-empty, so a finale burst of distinct events serializes into an ever-growing backlog (10 events = 8 seconds to fully read, strings stale by then). The plan's intent is a fixed burst window, not a drip.
+- **2. Announcer timer/buffer are module singletons with no cleanup outside the test reset.** A pending 800ms timer can outlive teardown (HMR/multi-root). Blast radius small for a single persistent mount, but there is no production cleanup hook.
+
+## MEDIUM
+- **3. Focus resolution dropped the plan's command-input step with the escape hatch unimplemented.** `resolveTarget` is heading->root; the comment hand-waves an opt-in that does not exist. The deferral reasoning (auto-focusing the input routes menu number-shortcuts into a field where shouldBail suppresses them) is sound, but a bare input-first screen with no heading would land focus on the root container. Needs a real opt-in.
+- **4. GlossaryTerm blur/mouse-leave close instantly, and tap double-fires (focus opens, click toggles -> net closed on first tap).** Untested tap path; a mobile tap can net to closed.
+- **5. GlossaryTerm and registerGlossaryTerms throw in ALL modes, but the plan says dev-only.** An unregistered id white-screens the game in production instead of degrading to the raw term.
+
+## LOW
+- **6.** The onAnnounce sink fires before the region write and sees raw (un-coalesced) calls; sink and region can disagree on what was spoken. Document that the sink is raw and the region coalesced.
+- **7.** motion.ts subscribe recreates the matchMedia object per subscriber. Not a leak (cleanup is paired); memoization is impossible without breaking per-test matchMedia mocks. Kept.
+- **8.** The assertive region carries aria-atomic, not strictly required by the plan (role=alert is implicitly atomic). Harmless; kept.
+- **9.** The ticker-never-announces boundary is enforced by convention, tested at the section-02 relay. Kept.
+
+## Fixes applied
+1 (+2): polite window now flushes all distinct buffered strings as one ordered utterance per window, then clears (bounded, finale-safe; timer always clears after one flush). 3: command-input step implemented as an opt-in `[data-a11y-focus]` marker (heading -> marked input -> root), so the menu still focuses its root (shortcuts work) and an input-first screen can opt in. 4: click now opens (idempotent with focus) rather than toggling, killing the tap double-fire; blur/leave/Escape still close. 5: unregistered-id and collision now throw in dev (import.meta.env.DEV) and degrade in prod (console.error + raw-term fallback / skip). 6: documented sink-is-raw. 7/8/9 kept with rationale.
diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
index 5792a8e..c1655b3 100644
--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
+++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
@@ -46,6 +46,10 @@
     "section-07-audio-engine": {
       "status": "complete",
       "commit_hash": "87ab1ed"
+    },
+    "section-08-cabinet-grid": {
+      "status": "complete",
+      "commit_hash": "cb57732"
     }
   },
   "pre_commit": {
diff --git a/planning/02-terminal-shell/sections/section-09-a11y-glossary.md b/planning/02-terminal-shell/sections/section-09-a11y-glossary.md
index 0734d56..0fe4886 100644
--- a/planning/02-terminal-shell/sections/section-09-a11y-glossary.md
+++ b/planning/02-terminal-shell/sections/section-09-a11y-glossary.md
@@ -126,4 +126,41 @@ Mount `<LiveRegions />` in the App shell as a direct sibling of the dialog host
 
 - section-01-app-scaffold: App shell with dialog host, jsdom Vitest project, Testing Library. Required before starting.
 - Blocks section-04 (precedence stack over the bail predicate, moveFocusTo on screen change, glossary terms in terminal text) and section-06 (settings writes the motion override, dialogs render glossary terms).
-- section-03 consumes useMotionPreference through its injected reducedMotion option and rewires to the real hook when this section lands; no work required here for that handoff beyond the stable export.
\ No newline at end of file
+- section-03 consumes useMotionPreference through its injected reducedMotion option and rewires to the real hook when this section lands; no work required here for that handoff beyond the stable export.
+
+## Implementation notes (as built)
+
+This section refined the stand-ins that sections 03-08 already consumed, so it
+modified existing files rather than only adding new ones, keeping every consumer
+green. Final suite 471 tests.
+
+- **motion.ts**: `MotionOverride` is `'system' | 'reduced' | 'full'`;
+  `useMotionPreference()` is the primary hook and `useReducedMotion` is a kept
+  alias (same function). The override persists to localStorage (`wg-motion-override`)
+  with a corrupt/missing read falling back to `'system'`; jsdom has no
+  localStorage, so the in-memory value is the session source of truth. The
+  subscribe path also listens to the live `prefers-reduced-motion` media query.
+  Call sites moved from the stand-in `'reduce'` literal to `'reduced'`.
+- **keys.ts** holds `shouldBailFromKeyHandling`; `keyHandler.ts` keeps
+  `shouldHandleKey` as its inverse and re-exports `KeyLike`.
+- **announce.ts** keeps the `onAnnounce` raw-sink API and adds a bounded polite
+  coalescer: one ~800ms window dedups identical strings and flushes all distinct
+  strings as a single ordered utterance, then clears (finale-safe, no backlog).
+  Assertive writes through immediately with a sequence bump (no coalesce). A
+  region store feeds `LiveRegions`, which renders `role="status"` (polite) and
+  `role="alert"` (assertive) with an inner span keyed on the sequence so an
+  identical string re-reads. App.tsx mounts `<LiveRegions />` as a dialog-host
+  sibling (replacing the old live-region-slot placeholder).
+- **focus.ts** `moveFocusTo` resolves heading -> an opt-in `[data-a11y-focus]`
+  input -> the root (tabindex -1 applied when needed, `preventScroll: true`).
+  The command-input step is opt-in on purpose: auto-focusing every screen's
+  command input would route menu number-shortcuts into the field (where the bail
+  predicate suppresses them). The menu keeps root focus; an input-first screen
+  marks its input.
+- **glossary.ts** ships ten entries with a registry (`getGlossaryEntry`,
+  `registerGlossaryTerms`, `allGlossaryEntries`, `hasGlossaryEntry`,
+  `__resetGlossary`). **GlossaryTerm.tsx** is an interactive button
+  (aria-expanded, aria-describedby tooltip, hover/focus open, click opens,
+  blur/leave/Escape close) that takes either an inline `{term, definition}` or a
+  registry `{id}`. An unregistered id throws in dev and degrades to the raw id in
+  production; registration collisions throw in dev and log-and-skip in prod.
\ No newline at end of file
diff --git a/src/app/App.tsx b/src/app/App.tsx
index 9fb1301..de8fa8a 100644
--- a/src/app/App.tsx
+++ b/src/app/App.tsx
@@ -11,6 +11,7 @@ import {
   type RouterState,
   type ScreenRegistry,
 } from './router'
+import { LiveRegions } from './a11y/LiveRegions'
 
 export interface AppProps {
   readonly registry?: ScreenRegistry
@@ -34,9 +35,9 @@ export function App({ registry = {}, initial }: AppProps) {
       >
         <Screen screenId={router.base} />
       </main>
-      {/* Reserved for section 09 live regions: a sibling of the dialog host,
-          outside any screen root. Keep the position; do not restructure. */}
-      <div data-testid="live-region-slot" hidden />
+      {/* The live regions: siblings of the dialog host, outside any screen
+          root, so an assertive announcement still fires while a modal is open. */}
+      <LiveRegions />
       <div className="dialog-host" data-testid="dialog-host" />
     </div>
   )
diff --git a/src/app/a11y/GlossaryTerm.tsx b/src/app/a11y/GlossaryTerm.tsx
index d862003..5c776af 100644
--- a/src/app/a11y/GlossaryTerm.tsx
+++ b/src/app/a11y/GlossaryTerm.tsx
@@ -1,25 +1,81 @@
-// Glossary term primitive stand-in. Section 09 builds the real
-// focus-and-tap-friendly definition popover with the per-project glossary;
-// this renders the term with its definition as an accessible description, so
-// settings and mission copy can wrap jargon now and section 09 upgrades the
-// presentation without touching callers.
-import type { ReactNode } from 'react'
+// The glossary term primitive. Renders a term inline as a real button (simpler
+// and more robust than a span with role and tabindex) with a dotted underline
+// style hook. Pointer hover and keyboard focus open the definition; blur and
+// mouse-leave close it; click toggles; Escape closes while open. The popup is a
+// plain-text, non-interactive tooltip associated by aria-describedby, so no
+// focus trap is needed. A term can be given inline (term + definition) or by
+// id, in which case it is looked up in the project glossary and an unregistered
+// id fails loudly.
+import { useId, useState } from 'react'
+import { getGlossaryEntry, hasGlossaryEntry } from './glossary'
+import './a11y.css'
 
-export interface GlossaryTermProps {
-  readonly term: ReactNode
-  /** Plain-language definition for a smart layperson. */
-  readonly definition: string
+function resolveEntry(
+  id: string,
+): { term: string; definition: string } {
+  if (hasGlossaryEntry(id)) return getGlossaryEntry(id)
+  // A missing id is a content bug. Fail loudly in dev; in production degrade to
+  // the raw id so a bad term never white-screens the game.
+  if (import.meta.env.DEV) {
+    throw new Error(`glossary: no entry registered for id "${id}"`)
+  }
+  console.error(`glossary: no entry registered for id "${id}"`)
+  return { term: id, definition: '' }
 }
 
-export function GlossaryTerm({ term, definition }: GlossaryTermProps) {
+export type GlossaryTermProps =
+  | { readonly id: string; readonly term?: never; readonly definition?: never }
+  | {
+      readonly id?: never
+      readonly term: string
+      /** Plain-language definition for a smart layperson. */
+      readonly definition: string
+    }
+
+export function GlossaryTerm(props: GlossaryTermProps) {
+  const popupId = useId()
+  const [open, setOpen] = useState(false)
+
+  const entry =
+    'id' in props && props.id !== undefined
+      ? resolveEntry(props.id)
+      : { term: props.term, definition: props.definition }
+
   return (
-    <abbr
-      className="glossary-term"
-      title={definition}
-      data-testid="glossary-term"
-      tabIndex={0}
-    >
-      {term}
-    </abbr>
+    <span className="glossary-wrap">
+      <button
+        type="button"
+        className="glossary-term"
+        data-testid="glossary-term"
+        aria-expanded={open}
+        aria-describedby={open ? popupId : undefined}
+        onMouseEnter={() => setOpen(true)}
+        onMouseLeave={() => setOpen(false)}
+        onFocus={() => setOpen(true)}
+        onBlur={() => setOpen(false)}
+        // Click OPENS (idempotent with focus) rather than toggling, so a touch
+        // tap (which fires focus then click) reliably opens instead of netting
+        // to closed. Close is via blur, mouse-leave, or Escape.
+        onClick={() => setOpen(true)}
+        onKeyDown={(e) => {
+          if (e.key === 'Escape' && open) {
+            e.stopPropagation()
+            setOpen(false)
+          }
+        }}
+      >
+        {entry.term}
+      </button>
+      {open ? (
+        <span
+          role="tooltip"
+          id={popupId}
+          className="glossary-popup"
+          data-testid="glossary-popup"
+        >
+          {entry.definition}
+        </span>
+      ) : null}
+    </span>
   )
 }
diff --git a/src/app/a11y/LiveRegions.tsx b/src/app/a11y/LiveRegions.tsx
new file mode 100644
index 0000000..9c301b6
--- /dev/null
+++ b/src/app/a11y/LiveRegions.tsx
@@ -0,0 +1,40 @@
+// The two persistent live regions, mounted once in the App shell as siblings
+// of the dialog host, outside every screen root, so an assertive announcement
+// still fires while a native modal dialog is open. They are visually hidden
+// (clip-rect, not display:none, so assistive tech still reads them) and never
+// unmounted across screen changes. The inner span is keyed on the sequence so
+// an identical string re-reads: React replaces the text node, which the screen
+// reader treats as a fresh utterance.
+import { useSyncExternalStore } from 'react'
+import { getRegionState, subscribeRegion } from './announce'
+import './a11y.css'
+
+export function LiveRegions() {
+  const state = useSyncExternalStore(
+    subscribeRegion,
+    getRegionState,
+    getRegionState,
+  )
+  return (
+    <>
+      <div
+        className="sr-only"
+        role="status"
+        aria-atomic="true"
+        data-testid="live-polite"
+        data-seq={state.politeSeq}
+      >
+        <span key={state.politeSeq}>{state.politeText}</span>
+      </div>
+      <div
+        className="sr-only"
+        role="alert"
+        aria-atomic="true"
+        data-testid="live-assertive"
+        data-seq={state.assertiveSeq}
+      >
+        <span key={state.assertiveSeq}>{state.assertiveText}</span>
+      </div>
+    </>
+  )
+}
diff --git a/src/app/a11y/a11y.css b/src/app/a11y/a11y.css
new file mode 100644
index 0000000..1a12a11
--- /dev/null
+++ b/src/app/a11y/a11y.css
@@ -0,0 +1,52 @@
+/* Accessibility primitives styling. The live regions are visually hidden with
+   the standard clip-rect technique (not display:none, which assistive tech
+   skips). The glossary term is a subtle dotted-underline inline control with a
+   plain-text popup; final color composes with the section-03 theme tokens. */
+.sr-only {
+  position: absolute;
+  width: 1px;
+  height: 1px;
+  padding: 0;
+  margin: -1px;
+  overflow: hidden;
+  clip: rect(0, 0, 0, 0);
+  white-space: nowrap;
+  border: 0;
+}
+
+.glossary-wrap {
+  position: relative;
+  display: inline-block;
+}
+
+.glossary-term {
+  font: inherit;
+  color: inherit;
+  background: none;
+  border: none;
+  padding: 0;
+  cursor: help;
+  text-decoration: underline dotted;
+  text-underline-offset: 2px;
+}
+
+.glossary-term:focus-visible {
+  outline: 2px solid var(--color-focus, #9fd8ff);
+  outline-offset: 2px;
+}
+
+.glossary-popup {
+  position: absolute;
+  left: 0;
+  top: 100%;
+  z-index: 20;
+  max-width: 22rem;
+  margin-top: 0.25rem;
+  padding: 0.5rem 0.75rem;
+  background: var(--color-glass, #050a14);
+  color: var(--color-glyph, #6cb6ff);
+  border: 1px solid var(--color-dim, #7fb0e0);
+  font-size: 0.9em;
+  line-height: 1.4;
+  white-space: normal;
+}
diff --git a/src/app/a11y/announce.ts b/src/app/a11y/announce.ts
index 48a9342..1f98ef0 100644
--- a/src/app/a11y/announce.ts
+++ b/src/app/a11y/announce.ts
@@ -1,11 +1,21 @@
-// Announcement stand-in. Section 09 owns the real aria-live regions mounted
-// at the app root; this section consumes a narrow announce() so screens can
-// report changes. Until section 09 wires the regions, announcements fan out
-// to any registered sink (the test spies on this).
+// The single entry point for every spoken notification in the app. The
+// engine-event relay (section 02) and the audio captions (section 07) route
+// through announce(); the repaint ticker NEVER does, which is what keeps
+// countdown ticks silent. There is no path to the live regions but this one.
+//
+// Polite announcements coalesce within an ~800ms burst window (identical
+// strings collapse to one utterance, distinct strings queue and flush in
+// arrival order) and retrigger across windows via a sequence bump so a screen
+// reader re-reads an identical string. Assertive announcements write through
+// immediately, with no coalescing and no debounce, so the finale's critical
+// warnings are never delayed or dropped. A raw sink (onAnnounce) also fires on
+// every call for tests and non-visual consumers.
 export type AnnounceChannel = 'polite' | 'assertive'
 
 export type AnnounceSink = (text: string, channel: AnnounceChannel) => void
 
+export const POLITE_WINDOW_MS = 800
+
 const sinks = new Set<AnnounceSink>()
 
 export function onAnnounce(sink: AnnounceSink): () => void {
@@ -15,14 +25,83 @@ export function onAnnounce(sink: AnnounceSink): () => void {
   }
 }
 
+export interface RegionState {
+  readonly politeText: string
+  readonly politeSeq: number
+  readonly assertiveText: string
+  readonly assertiveSeq: number
+}
+
+let region: RegionState = {
+  politeText: '',
+  politeSeq: 0,
+  assertiveText: '',
+  assertiveSeq: 0,
+}
+const regionListeners = new Set<() => void>()
+
+export function subscribeRegion(listener: () => void): () => void {
+  regionListeners.add(listener)
+  return () => regionListeners.delete(listener)
+}
+
+export function getRegionState(): RegionState {
+  return region
+}
+
+function emitRegion(next: RegionState): void {
+  region = next
+  for (const listener of regionListeners) listener()
+}
+
+// The polite coalescer: a fixed-window burst. Within one ~800ms window
+// identical strings collapse (dedup) and distinct strings accumulate in arrival
+// order; at the window end they flush as ONE ordered utterance and the buffer
+// clears. This bounds the announcer: a finale burst of N events reads once, not
+// as an N-times-800ms drip, and the timer always clears after a single flush.
+let buffer: string[] = []
+let timer: ReturnType<typeof setTimeout> | null = null
+
+function enqueuePolite(text: string): void {
+  if (!buffer.includes(text)) buffer.push(text)
+  if (timer === null) timer = setTimeout(flushPolite, POLITE_WINDOW_MS)
+}
+
+function flushPolite(): void {
+  timer = null
+  if (buffer.length === 0) return
+  const text = buffer.join('. ')
+  buffer = []
+  // Bump the sequence so an identical utterance across windows still re-reads.
+  emitRegion({ ...region, politeText: text, politeSeq: region.politeSeq + 1 })
+}
+
 export function announce(
   text: string,
   channel: AnnounceChannel = 'polite',
 ): void {
+  // The sink is RAW: it sees every call, including polite duplicates the region
+  // later coalesces away. The region is the coalesced truth; the sink is a tap.
   for (const sink of sinks) sink(text, channel)
+  if (channel === 'assertive') {
+    emitRegion({
+      ...region,
+      assertiveText: text,
+      assertiveSeq: region.assertiveSeq + 1,
+    })
+    return
+  }
+  enqueuePolite(text)
 }
 
 /** Test-only. */
 export function __resetAnnounce(): void {
   sinks.clear()
+  buffer = []
+  if (timer !== null) {
+    clearTimeout(timer)
+    timer = null
+  }
+  region = { politeText: '', politeSeq: 0, assertiveText: '', assertiveSeq: 0 }
+  regionListeners.clear()
 }
diff --git a/src/app/a11y/focus.ts b/src/app/a11y/focus.ts
index e7c3a51..cc80522 100644
--- a/src/app/a11y/focus.ts
+++ b/src/app/a11y/focus.ts
@@ -1,9 +1,42 @@
-// Focus management stand-in. Section 09 refines the heading-vs-input choice
-// and the roving details; this section needs to move focus to a new screen
-// root on every screen change.
+// Focus management. The router calls moveFocusTo on every screen change so
+// assistive tech lands on the new screen. Resolution order: the screen root's
+// heading, else an input a screen explicitly marks as its focus target, else
+// the root itself. The command-input step is opt-in by design: auto-focusing
+// EVERY screen's command input would route menu number-shortcuts into the text
+// field (where the key-handler bail predicate correctly suppresses them),
+// breaking keyboard selection. An input-first screen with no heading opts in by
+// marking its input with data-a11y-focus; the menu does not, so it keeps root
+// focus and its shortcuts. Native dialogs manage their own focus trap and
+// restore; this function never touches them.
+
+function resolveTarget(root: HTMLElement): HTMLElement {
+  const heading = root.querySelector<HTMLElement>(
+    'h1, h2, [role="heading"], [data-a11y-heading]',
+  )
+  if (heading) return heading
+  const markedInput = root.querySelector<HTMLElement>('[data-a11y-focus]')
+  if (markedInput) return markedInput
+  return root
+}
+
+function isNativelyFocusable(el: HTMLElement): boolean {
+  if (el.tabIndex >= 0) return true
+  const tag = el.tagName
+  return (
+    tag === 'A' ||
+    tag === 'BUTTON' ||
+    tag === 'INPUT' ||
+    tag === 'TEXTAREA' ||
+    tag === 'SELECT'
+  )
+}
+
 export function moveFocusTo(element: HTMLElement | null): void {
   if (!element) return
-  // A screen root is programmatically focusable via tabindex -1 (set by the
-  // router); focus it so assistive tech lands on the new screen.
-  element.focus()
+  const target = resolveTarget(element)
+  // Make the target programmatically focusable when it is not already.
+  if (!isNativelyFocusable(target) && !target.hasAttribute('tabindex')) {
+    target.setAttribute('tabindex', '-1')
+  }
+  target.focus({ preventScroll: true })
 }
diff --git a/src/app/a11y/glossary.ts b/src/app/a11y/glossary.ts
new file mode 100644
index 0000000..9ca3faa
--- /dev/null
+++ b/src/app/a11y/glossary.ts
@@ -0,0 +1,118 @@
+// The project glossary: one module, plain-language definitions for a smart
+// layperson. Missions register their channel and ledger jargon through
+// registerGlossaryTerms at screen-registration time. Pure data plus
+// registration; the open/close presentation lives in GlossaryTerm.
+export interface GlossaryEntry {
+  readonly id: string
+  readonly term: string
+  readonly definition: string
+}
+
+const INITIAL_ENTRIES: readonly GlossaryEntry[] = [
+  {
+    id: 'open-exceptions',
+    term: 'OPEN EXCEPTIONS',
+    definition:
+      'The count of reported problems nobody has resolved yet. A rising number is WOPR treating inaction as if it were an outcome.',
+  },
+  {
+    id: 'trace',
+    term: 'TRACE',
+    definition:
+      'A step-by-step replay of how a result was reached, so you can see the reasoning rather than just the verdict.',
+  },
+  {
+    id: 'check-source',
+    term: 'CHECK SOURCE',
+    definition:
+      'Verifying where a claim came from before acting on it, instead of trusting the number on the screen.',
+  },
+  {
+    id: 'observed',
+    term: 'OBSERVED',
+    definition:
+      'A fact confirmed by direct evidence, as opposed to one the machine inferred or assumed.',
+  },
+  {
+    id: 'exercise',
+    term: 'EXERCISE',
+    definition:
+      'A simulation run, not a real operation. The whole point of the film: knowing which one you are in.',
+  },
+  {
+    id: 'derived',
+    term: 'DERIVED',
+    definition:
+      'A value the system calculated from other numbers rather than measured directly. Useful, but only as sound as its inputs.',
+  },
+  {
+    id: 'independent-corroboration',
+    term: 'independent corroboration',
+    definition:
+      'A second, unrelated source agreeing with the first. Two feeds that share a cause are not independent.',
+  },
+  {
+    id: 'repeat-d-83',
+    term: 'REPEAT D-83',
+    definition:
+      'A command to re-run drill sequence D-83. In the story, the drill that will not stay a drill.',
+  },
+  {
+    id: 'hold-and-verify',
+    term: 'HOLD AND VERIFY',
+    definition:
+      'Pause before committing to an action and confirm the facts first. The discipline the game rewards.',
+  },
+  {
+    id: 'staged-recovery',
+    term: 'STAGED RECOVERY',
+    definition:
+      'Bringing a failed position back in planned steps, each checked for viability before the next, rather than all at once.',
+  },
+]
+
+const registry = new Map<string, GlossaryEntry>()
+
+function seed(): void {
+  registry.clear()
+  for (const entry of INITIAL_ENTRIES) registry.set(entry.id, entry)
+}
+
+seed()
+
+export function hasGlossaryEntry(id: string): boolean {
+  return registry.has(id)
+}
+
+export function getGlossaryEntry(id: string): GlossaryEntry {
+  const entry = registry.get(id)
+  if (!entry) {
+    throw new Error(`glossary: no entry registered for id "${id}"`)
+  }
+  return entry
+}
+
+export function allGlossaryEntries(): readonly GlossaryEntry[] {
+  return [...registry.values()]
+}
+
+/** Add mission terms. A colliding id is a programming error: it throws in dev
+ *  and, in production, logs and skips the duplicate rather than crashing a
+ *  mission registration. */
+export function registerGlossaryTerms(entries: readonly GlossaryEntry[]): void {
+  for (const entry of entries) {
+    if (registry.has(entry.id)) {
+      if (import.meta.env.DEV) {
+        throw new Error(`glossary: duplicate term id "${entry.id}"`)
+      }
+      console.error(`glossary: duplicate term id "${entry.id}" ignored`)
+      continue
+    }
+    registry.set(entry.id, entry)
+  }
+}
+
+/** Test-only: restore the registry to the shipped entries. */
+export function __resetGlossary(): void {
+  seed()
+}
diff --git a/src/app/a11y/keyHandler.ts b/src/app/a11y/keyHandler.ts
index 49c2cd0..468b19c 100644
--- a/src/app/a11y/keyHandler.ts
+++ b/src/app/a11y/keyHandler.ts
@@ -1,29 +1,13 @@
-// The shared key-handler guard. Section 09 owns the a11y spine and will
-// refine these; this section needs the bail conditions now, so they live here
-// as the real implementation. A key event is ignored when it targets an
-// editable element (so typing in the command input never triggers menu
-// shortcuts), when a modifier is held (browser and OS shortcuts win), or
-// while an IME composition is in progress.
-export interface KeyLike {
-  readonly key: string
-  readonly ctrlKey?: boolean
-  readonly metaKey?: boolean
-  readonly altKey?: boolean
-  readonly isComposing?: boolean
-  readonly target?: EventTarget | null
-}
+// The shared key-handler guard, expressed as the positive predicate the
+// terminal framework and grid consume. It is the inverse of the section-09
+// bail predicate in keys.ts; both names exist so callers read naturally
+// (shouldHandleKey at a shortcut site, shouldBailFromKeyHandling at a
+// precedence gate). KeyLike is re-exported so existing importers are undisturbed.
+import { shouldBailFromKeyHandling, type KeyLike } from './keys'
 
-function isEditableTarget(target: EventTarget | null | undefined): boolean {
-  if (!(target instanceof HTMLElement)) return false
-  if (target.isContentEditable) return true
-  const tag = target.tagName
-  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
-}
+export type { KeyLike }
 
 /** True when a screen/menu shortcut handler should act on this key. */
 export function shouldHandleKey(event: KeyLike): boolean {
-  if (event.ctrlKey || event.metaKey || event.altKey) return false
-  if (event.isComposing) return false
-  if (isEditableTarget(event.target ?? null)) return false
-  return true
+  return !shouldBailFromKeyHandling(event)
 }
diff --git a/src/app/a11y/keys.ts b/src/app/a11y/keys.ts
new file mode 100644
index 0000000..7a24e6d
--- /dev/null
+++ b/src/app/a11y/keys.ts
@@ -0,0 +1,30 @@
+// The shared key-handler bail predicate. The full input precedence stack
+// (dialog, diegetic prompt, type-in, menu shortcuts, globals) in section 04
+// composes on top of this; it is a pure function of the event so the table
+// test is trivial. A key event is ignored when it targets an editable element
+// (typing in the command input never triggers a menu shortcut), when a
+// modifier is held (browser and OS shortcuts win), or while an IME composition
+// is in progress.
+export interface KeyLike {
+  readonly key: string
+  readonly ctrlKey?: boolean
+  readonly metaKey?: boolean
+  readonly altKey?: boolean
+  readonly isComposing?: boolean
+  readonly target?: EventTarget | null
+}
+
+function isEditableTarget(target: EventTarget | null | undefined): boolean {
+  if (!(target instanceof HTMLElement)) return false
+  if (target.isContentEditable) return true
+  const tag = target.tagName
+  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
+}
+
+/** True when a screen/menu shortcut handler should NOT act on this key. */
+export function shouldBailFromKeyHandling(event: KeyLike): boolean {
+  if (event.ctrlKey || event.metaKey || event.altKey) return true
+  if (event.isComposing) return true
+  if (isEditableTarget(event.target ?? null)) return true
+  return false
+}
diff --git a/src/app/a11y/motion.ts b/src/app/a11y/motion.ts
index 8070dd1..1b565db 100644
--- a/src/app/a11y/motion.ts
+++ b/src/app/a11y/motion.ts
@@ -1,14 +1,41 @@
-// Motion-preference stand-in. Section 09 owns the real useMotionPreference
-// hook that composes the media query with an in-app override; this reads the
-// media query plus a session in-app override so settings can flip motion now
-// and every consumer sees one truth.
+// The motion preference. A tiny subscribable store holds the in-app override,
+// composed with a live prefers-reduced-motion media query: the override wins
+// unless it is 'system'. Section 06 settings writes the override; the type-in,
+// push-in, grid, and cabinet all read the hook. Contract: consumers sample the
+// preference when starting an animation; a mid-flight change never cancels a
+// running animation, which is structural here because this module holds no
+// animation references at all. The override persists to localStorage under one
+// key; a corrupt or missing read falls back to 'system'. jsdom on this Node
+// has no window.localStorage, so an in-memory value is the session source of
+// truth and localStorage is mirrored when present.
 import { useSyncExternalStore } from 'react'
 
-export type MotionOverride = 'reduce' | 'full' | null // null = follow system
+export type MotionOverride = 'system' | 'reduced' | 'full'
 
-let override: MotionOverride = null
+const STORE_KEY = 'wg-motion-override'
+const OVERRIDES: ReadonlySet<string> = new Set(['system', 'reduced', 'full'])
+
+let override: MotionOverride = readPersisted()
 const listeners = new Set<() => void>()
 
+function readPersisted(): MotionOverride {
+  try {
+    const raw = globalThis.localStorage?.getItem(STORE_KEY)
+    if (raw && OVERRIDES.has(raw)) return raw as MotionOverride
+  } catch {
+    // No storage, or a corrupt read: fall back to following the system.
+  }
+  return 'system'
+}
+
+function persist(value: MotionOverride): void {
+  try {
+    globalThis.localStorage?.setItem(STORE_KEY, value)
+  } catch {
+    // Storage is optional; the in-memory value remains the source of truth.
+  }
+}
+
 function systemReducedMotion(): boolean {
   if (typeof window === 'undefined' || !window.matchMedia) return false
   return window.matchMedia('(prefers-reduced-motion: reduce)').matches
@@ -16,7 +43,7 @@ function systemReducedMotion(): boolean {
 
 /** The composed truth: an explicit override wins, else the system setting. */
 export function prefersReducedMotion(): boolean {
-  if (override === 'reduce') return true
+  if (override === 'reduced') return true
   if (override === 'full') return false
   return systemReducedMotion()
 }
@@ -27,22 +54,47 @@ export function getMotionOverride(): MotionOverride {
 
 export function setMotionOverride(next: MotionOverride): void {
   override = next
+  persist(next)
   for (const listener of listeners) listener()
 }
 
-export function useReducedMotion(): boolean {
+function subscribe(listener: () => void): () => void {
+  listeners.add(listener)
+  // Re-render on a live system-preference change too, not just override writes.
+  const mql =
+    typeof window !== 'undefined' && window.matchMedia
+      ? window.matchMedia('(prefers-reduced-motion: reduce)')
+      : null
+  const onMedia = (): void => listener()
+  if (mql) {
+    if (mql.addEventListener) mql.addEventListener('change', onMedia)
+    else mql.addListener(onMedia)
+  }
+  return () => {
+    listeners.delete(listener)
+    if (mql) {
+      if (mql.removeEventListener) mql.removeEventListener('change', onMedia)
+      else mql.removeListener(onMedia)
+    }
+  }
+}
+
+/** True means reduce motion. The primary hook (the section 09 name). */
+export function useMotionPreference(): boolean {
   return useSyncExternalStore(
-    (l) => {
-      listeners.add(l)
-      return () => listeners.delete(l)
-    },
+    subscribe,
     prefersReducedMotion,
     prefersReducedMotion,
   )
 }
 
-/** Test-only. */
+/** Alias kept for the sections that adopted the stand-in name. */
+export const useReducedMotion = useMotionPreference
+
+/** Test-only. Re-reads persistence so a corrupt-store test can assert the
+ *  fallback, and so each test starts from whatever storage holds (nothing, in
+ *  jsdom, which means 'system'). */
 export function __resetMotion(): void {
-  override = null
   listeners.clear()
+  override = readPersisted()
 }
diff --git a/src/app/screens/SettingsDialog.tsx b/src/app/screens/SettingsDialog.tsx
index dd16644..521da40 100644
--- a/src/app/screens/SettingsDialog.tsx
+++ b/src/app/screens/SettingsDialog.tsx
@@ -83,7 +83,9 @@ export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
             type="checkbox"
             data-testid="toggle-motion"
             checked={reducedMotion}
-            onChange={(e) => setMotionOverride(e.target.checked ? 'reduce' : 'full')}
+            onChange={(e) =>
+              setMotionOverride(e.target.checked ? 'reduced' : 'full')
+            }
           />
           {' REDUCE MOTION'}
         </label>
diff --git a/test/app/a11y/announcer.test.tsx b/test/app/a11y/announcer.test.tsx
new file mode 100644
index 0000000..e1917be
--- /dev/null
+++ b/test/app/a11y/announcer.test.tsx
@@ -0,0 +1,111 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, render, screen } from '@testing-library/react'
+import { LiveRegions } from '@app/a11y/LiveRegions'
+import { announce, __resetAnnounce } from '@app/a11y/announce'
+
+beforeEach(() => {
+  __resetAnnounce()
+  vi.useFakeTimers()
+})
+afterEach(() => {
+  vi.useRealTimers()
+  cleanup()
+  __resetAnnounce()
+})
+
+const polite = () => screen.getByTestId('live-polite')
+const assertive = () => screen.getByTestId('live-assertive')
+
+describe('LiveRegions and announcer', () => {
+  it('both regions exist from boot with the right roles', () => {
+    render(<LiveRegions />)
+    expect(polite()).toHaveAttribute('role', 'status')
+    expect(polite()).toHaveAttribute('aria-atomic', 'true')
+    expect(assertive()).toHaveAttribute('role', 'alert')
+  })
+
+  it('advancing timers without an announce mutates nothing', () => {
+    render(<LiveRegions />)
+    act(() => {
+      vi.advanceTimersByTime(5000)
+    })
+    expect(polite()).toHaveAttribute('data-seq', '0')
+    expect(polite()).toHaveTextContent('')
+    expect(assertive()).toHaveAttribute('data-seq', '0')
+  })
+
+  it('polite coalesces identical strings within the window into one utterance', () => {
+    render(<LiveRegions />)
+    act(() => {
+      announce('MISSION ALPHA RESOLVED', 'polite')
+      announce('MISSION ALPHA RESOLVED', 'polite')
+    })
+    act(() => {
+      vi.advanceTimersByTime(800)
+    })
+    expect(polite()).toHaveTextContent('MISSION ALPHA RESOLVED')
+    expect(polite()).toHaveAttribute('data-seq', '1')
+  })
+
+  it('polite flushes distinct strings from one window as a single ordered utterance', () => {
+    render(<LiveRegions />)
+    act(() => {
+      announce('FIRST', 'polite')
+      announce('SECOND', 'polite')
+    })
+    act(() => {
+      vi.advanceTimersByTime(800)
+    })
+    // Bounded: one window, one utterance carrying both distinct strings in
+    // arrival order. A finale burst reads once, not as an 800ms-per-item drip.
+    expect(polite()).toHaveTextContent('FIRST. SECOND')
+    expect(polite()).toHaveAttribute('data-seq', '1')
+  })
+
+  it('a later window flushes its own batch (sequence bumps per window)', () => {
+    render(<LiveRegions />)
+    act(() => announce('ONE', 'polite'))
+    act(() => vi.advanceTimersByTime(800))
+    expect(polite()).toHaveTextContent('ONE')
+    expect(polite()).toHaveAttribute('data-seq', '1')
+    act(() => announce('TWO', 'polite'))
+    act(() => vi.advanceTimersByTime(800))
+    expect(polite()).toHaveTextContent('TWO')
+    expect(polite()).toHaveAttribute('data-seq', '2')
+  })
+
+  it('an identical polite string across windows retriggers (sequence bumps)', () => {
+    render(<LiveRegions />)
+    act(() => announce('ALERT', 'polite'))
+    act(() => vi.advanceTimersByTime(800))
+    expect(polite()).toHaveAttribute('data-seq', '1')
+    act(() => announce('ALERT', 'polite'))
+    act(() => vi.advanceTimersByTime(800))
+    expect(polite()).toHaveTextContent('ALERT')
+    expect(polite()).toHaveAttribute('data-seq', '2')
+  })
+
+  it('assertive never coalesces: two identical announcements both land', () => {
+    render(<LiveRegions />)
+    act(() => {
+      announce('DEFCON 1', 'assertive')
+      announce('DEFCON 1', 'assertive')
+    })
+    expect(assertive()).toHaveTextContent('DEFCON 1')
+    expect(assertive()).toHaveAttribute('data-seq', '2')
+  })
+
+  it('assertive fires while a modal dialog is open', () => {
+    render(
+      <div>
+        <LiveRegions />
+        <dialog data-testid="modal" open>
+          trapped
+        </dialog>
+      </div>,
+    )
+    act(() => announce('FINAL PHASE', 'assertive'))
+    // The region is outside the dialog but still receives the text.
+    expect(assertive()).toHaveTextContent('FINAL PHASE')
+  })
+})
diff --git a/test/app/a11y/focus.test.tsx b/test/app/a11y/focus.test.tsx
new file mode 100644
index 0000000..daa6caf
--- /dev/null
+++ b/test/app/a11y/focus.test.tsx
@@ -0,0 +1,63 @@
+import { afterEach, describe, expect, it, vi } from 'vitest'
+import { moveFocusTo } from '@app/a11y/focus'
+
+afterEach(() => {
+  vi.restoreAllMocks()
+  document.body.innerHTML = ''
+})
+
+describe('moveFocusTo', () => {
+  it('focuses a bare container with tabindex -1 and preventScroll', () => {
+    const el = document.createElement('div')
+    document.body.appendChild(el)
+    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
+    moveFocusTo(el)
+    expect(el.getAttribute('tabindex')).toBe('-1')
+    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
+    expect(document.activeElement).toBe(el)
+  })
+
+  it('focuses the screen root heading when one is present', () => {
+    const root = document.createElement('div')
+    const heading = document.createElement('h2')
+    heading.textContent = 'MISSION ALPHA'
+    root.appendChild(heading)
+    document.body.appendChild(root)
+    moveFocusTo(root)
+    expect(document.activeElement).toBe(heading)
+    expect(heading.getAttribute('tabindex')).toBe('-1')
+  })
+
+  it('focuses an input only when the screen opts in via data-a11y-focus', () => {
+    // Without the marker, a command input in the root is skipped (so menu
+    // number-shortcuts are not swallowed) and the root receives focus.
+    const plain = document.createElement('div')
+    plain.setAttribute('tabindex', '-1')
+    const unmarked = document.createElement('input')
+    plain.appendChild(unmarked)
+    document.body.appendChild(plain)
+    moveFocusTo(plain)
+    expect(document.activeElement).toBe(plain)
+
+    // With the marker, an input-first screen lands focus in the field.
+    const inputFirst = document.createElement('div')
+    const marked = document.createElement('input')
+    marked.setAttribute('data-a11y-focus', '')
+    inputFirst.appendChild(marked)
+    document.body.appendChild(inputFirst)
+    moveFocusTo(inputFirst)
+    expect(document.activeElement).toBe(marked)
+  })
+
+  it('does nothing when given null', () => {
+    expect(() => moveFocusTo(null)).not.toThrow()
+  })
+
+  it('does not override an existing tabindex', () => {
+    const el = document.createElement('div')
+    el.setAttribute('tabindex', '0')
+    document.body.appendChild(el)
+    moveFocusTo(el)
+    expect(el.getAttribute('tabindex')).toBe('0')
+  })
+})
diff --git a/test/app/a11y/glossary.test.tsx b/test/app/a11y/glossary.test.tsx
new file mode 100644
index 0000000..e7c1fb0
--- /dev/null
+++ b/test/app/a11y/glossary.test.tsx
@@ -0,0 +1,107 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { GlossaryTerm } from '@app/a11y/GlossaryTerm'
+import {
+  allGlossaryEntries,
+  getGlossaryEntry,
+  registerGlossaryTerms,
+  __resetGlossary,
+} from '@app/a11y/glossary'
+
+beforeEach(() => {
+  __resetGlossary()
+})
+afterEach(() => {
+  cleanup()
+  __resetGlossary()
+})
+
+describe('GlossaryTerm interaction', () => {
+  it('opens on hover, focus, and click; Escape closes', () => {
+    render(<GlossaryTerm id="open-exceptions" />)
+    const term = screen.getByTestId('glossary-term')
+    expect(term).toHaveTextContent('OPEN EXCEPTIONS')
+    expect(term).toHaveAttribute('aria-expanded', 'false')
+    expect(screen.queryByTestId('glossary-popup')).toBeNull()
+
+    fireEvent.mouseEnter(term)
+    expect(term).toHaveAttribute('aria-expanded', 'true')
+    const popup = screen.getByTestId('glossary-popup')
+    expect(term.getAttribute('aria-describedby')).toBe(popup.id)
+    fireEvent.mouseLeave(term)
+    expect(screen.queryByTestId('glossary-popup')).toBeNull()
+
+    fireEvent.focus(term)
+    expect(screen.getByTestId('glossary-popup')).toBeInTheDocument()
+    fireEvent.keyDown(term, { key: 'Escape' })
+    expect(screen.queryByTestId('glossary-popup')).toBeNull()
+
+    // Click opens (idempotent with focus) so a tap never nets to closed; close
+    // is via blur/leave/Escape.
+    fireEvent.click(term)
+    expect(term).toHaveAttribute('aria-expanded', 'true')
+    fireEvent.blur(term)
+    expect(term).toHaveAttribute('aria-expanded', 'false')
+  })
+
+  it('is focusable and labeled (reachable as a button carrying the term)', () => {
+    render(<GlossaryTerm term="EXTENDED TIME" definition="A calmer pace." />)
+    const term = screen.getByRole('button', { name: 'EXTENDED TIME' })
+    expect(term).toBeInTheDocument()
+  })
+
+  it('renders an inline term and definition without the registry', () => {
+    render(<GlossaryTerm term="WOPR" definition="War Operation Plan Response." />)
+    fireEvent.focus(screen.getByTestId('glossary-term'))
+    expect(screen.getByTestId('glossary-popup')).toHaveTextContent(
+      'War Operation Plan Response.',
+    )
+  })
+
+  it('fails loudly when rendered for an unregistered id', () => {
+    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
+    expect(() => render(<GlossaryTerm id="no-such-term" />)).toThrow()
+    spy.mockRestore()
+  })
+})
+
+describe('glossary registry', () => {
+  it('every registered term has a non-empty definition', () => {
+    for (const entry of allGlossaryEntries()) {
+      expect(entry.definition.trim().length).toBeGreaterThan(0)
+    }
+  })
+
+  it('ships the initial terms', () => {
+    const terms = allGlossaryEntries().map((e) => e.term)
+    for (const expected of [
+      'OPEN EXCEPTIONS',
+      'TRACE',
+      'CHECK SOURCE',
+      'OBSERVED',
+      'EXERCISE',
+      'DERIVED',
+      'independent corroboration',
+      'REPEAT D-83',
+      'HOLD AND VERIFY',
+      'STAGED RECOVERY',
+    ]) {
+      expect(terms).toContain(expected)
+    }
+  })
+
+  it('registerGlossaryTerms adds mission terms', () => {
+    registerGlossaryTerms([
+      { id: 'decoy-run', term: 'DECOY RUN', definition: 'A feint to draw attention.' },
+    ])
+    expect(getGlossaryEntry('decoy-run').term).toBe('DECOY RUN')
+  })
+
+  it('a colliding term id throws', () => {
+    expect(() =>
+      registerGlossaryTerms([
+        { id: 'trace', term: 'TRACE', definition: 'duplicate' },
+      ]),
+    ).toThrow()
+  })
+})
diff --git a/test/app/a11y/keys.test.ts b/test/app/a11y/keys.test.ts
new file mode 100644
index 0000000..1fc18b6
--- /dev/null
+++ b/test/app/a11y/keys.test.ts
@@ -0,0 +1,45 @@
+import { describe, expect, it } from 'vitest'
+import { shouldBailFromKeyHandling, type KeyLike } from '@app/a11y/keys'
+import { shouldHandleKey } from '@app/a11y/keyHandler'
+
+function editable(tag: string): HTMLElement {
+  return document.createElement(tag)
+}
+
+function contentEditableDiv(): HTMLElement {
+  const d = document.createElement('div')
+  Object.defineProperty(d, 'isContentEditable', { value: true })
+  return d
+}
+
+const plainTarget = document.createElement('div')
+
+describe('shouldBailFromKeyHandling', () => {
+  const bailCases: Array<[string, KeyLike]> = [
+    ['input target', { key: 'a', target: editable('input') }],
+    ['textarea target', { key: 'a', target: editable('textarea') }],
+    ['select target', { key: 'a', target: editable('select') }],
+    ['contentEditable target', { key: 'a', target: contentEditableDiv() }],
+    ['ctrl held', { key: 'a', ctrlKey: true, target: plainTarget }],
+    ['meta held', { key: 'a', metaKey: true, target: plainTarget }],
+    ['alt held', { key: 'a', altKey: true, target: plainTarget }],
+    ['composing', { key: 'a', isComposing: true, target: plainTarget }],
+  ]
+
+  for (const [name, event] of bailCases) {
+    it(`bails for ${name}`, () => {
+      expect(shouldBailFromKeyHandling(event)).toBe(true)
+      expect(shouldHandleKey(event)).toBe(false)
+    })
+  }
+
+  it('does not bail for a plain key on a non-editable target', () => {
+    const event: KeyLike = { key: '1', target: plainTarget }
+    expect(shouldBailFromKeyHandling(event)).toBe(false)
+    expect(shouldHandleKey(event)).toBe(true)
+  })
+
+  it('does not bail when target is null', () => {
+    expect(shouldBailFromKeyHandling({ key: 'Enter', target: null })).toBe(false)
+  })
+})
diff --git a/test/app/a11y/motion.test.tsx b/test/app/a11y/motion.test.tsx
new file mode 100644
index 0000000..16c15d6
--- /dev/null
+++ b/test/app/a11y/motion.test.tsx
@@ -0,0 +1,107 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, render, screen, act } from '@testing-library/react'
+import {
+  useMotionPreference,
+  useReducedMotion,
+  setMotionOverride,
+  getMotionOverride,
+  __resetMotion,
+} from '@app/a11y/motion'
+
+function installMatchMedia(matches: boolean) {
+  const listeners = new Set<() => void>()
+  const mql = {
+    matches,
+    media: '',
+    onchange: null,
+    addEventListener: (_: string, l: () => void) => listeners.add(l),
+    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
+    addListener: (l: () => void) => listeners.add(l),
+    removeListener: (l: () => void) => listeners.delete(l),
+    dispatchEvent: () => false,
+  }
+  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia
+  return {
+    setMatches(v: boolean) {
+      mql.matches = v
+      for (const l of listeners) l()
+    },
+  }
+}
+
+function Probe() {
+  const reduced = useMotionPreference()
+  return <span data-testid="reduced">{reduced ? 'yes' : 'no'}</span>
+}
+
+beforeEach(() => {
+  __resetMotion()
+})
+afterEach(() => {
+  cleanup()
+  vi.unstubAllGlobals()
+  __resetMotion()
+  vi.restoreAllMocks()
+})
+
+describe('useMotionPreference', () => {
+  it('mirrors prefers-reduced-motion when the override is system', () => {
+    installMatchMedia(true)
+    render(<Probe />)
+    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
+  })
+
+  it('reflects the system off state too', () => {
+    installMatchMedia(false)
+    render(<Probe />)
+    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
+  })
+
+  it('an explicit override wins over the media query and reverts to system', () => {
+    installMatchMedia(true) // system prefers reduce
+    render(<Probe />)
+    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
+    act(() => setMotionOverride('full'))
+    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
+    act(() => setMotionOverride('reduced'))
+    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
+    act(() => setMotionOverride('system'))
+    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
+  })
+
+  it('re-renders on a live media-query change', () => {
+    const media = installMatchMedia(false)
+    render(<Probe />)
+    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
+    act(() => media.setMatches(true))
+    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
+  })
+
+  it('useReducedMotion is the same hook', () => {
+    expect(useReducedMotion).toBe(useMotionPreference)
+  })
+
+  it('a flip never cancels a running animation (hook holds no animation refs)', () => {
+    installMatchMedia(false)
+    const anim = { cancel: vi.fn(), finish: vi.fn() }
+    function Consumer() {
+      // The documented pattern: sample once at animation start.
+      useMotionPreference()
+      return <span data-testid="c">ok</span>
+    }
+    render(<Consumer />)
+    act(() => setMotionOverride('reduced'))
+    expect(anim.cancel).not.toHaveBeenCalled()
+    expect(anim.finish).not.toHaveBeenCalled()
+  })
+
+  it('a corrupt or missing persisted override falls back to system', () => {
+    vi.stubGlobal('localStorage', {
+      getItem: () => 'garbage-not-an-override',
+      setItem: () => {},
+      removeItem: () => {},
+    })
+    __resetMotion()
+    expect(getMotionOverride()).toBe('system')
+  })
+})
diff --git a/test/app/grid/characterGrid.test.tsx b/test/app/grid/characterGrid.test.tsx
index 12c6f36..fd698ab 100644
--- a/test/app/grid/characterGrid.test.tsx
+++ b/test/app/grid/characterGrid.test.tsx
@@ -158,7 +158,7 @@ describe('CharacterGrid', () => {
       <CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />,
     )
     expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-anim')
-    setMotionOverride('reduce')
+    setMotionOverride('reduced')
     rerender(<CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />)
     expect(screen.getAllByRole('gridcell')[0]).not.toHaveClass('char-cell-anim')
   })
diff --git a/test/app/grid/playBranchTrace.test.tsx b/test/app/grid/playBranchTrace.test.tsx
index 3365053..7207d46 100644
--- a/test/app/grid/playBranchTrace.test.tsx
+++ b/test/app/grid/playBranchTrace.test.tsx
@@ -45,7 +45,7 @@ describe('PlayBranchTrace', () => {
   })
 
   it('under reduced motion every step is present at once', () => {
-    setMotionOverride('reduce')
+    setMotionOverride('reduced')
     render(<PlayBranchTrace steps={STEPS} />)
     expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
     expect(screen.queryByTestId('branch-skip')).toBeNull()
diff --git a/test/app/smoke.test.tsx b/test/app/smoke.test.tsx
index 244e39e..1ffd747 100644
--- a/test/app/smoke.test.tsx
+++ b/test/app/smoke.test.tsx
@@ -7,8 +7,9 @@ describe('app smoke', () => {
     render(<App />)
     expect(screen.getByTestId('screen-root')).toBeInTheDocument()
     expect(screen.getByTestId('dialog-host')).toBeInTheDocument()
-    // The reserved live-region position exists so section 09 is an insertion.
-    expect(screen.getByTestId('live-region-slot')).toBeInTheDocument()
+    // The live regions mount at the app root as dialog-host siblings.
+    expect(screen.getByTestId('live-polite')).toBeInTheDocument()
+    expect(screen.getByTestId('live-assertive')).toBeInTheDocument()
   })
 
   it('defaults to the hero base screen', () => {
