diff --git a/docs/manual-smoke-checklist.md b/docs/manual-smoke-checklist.md
new file mode 100644
index 0000000..fb5bfc5
--- /dev/null
+++ b/docs/manual-smoke-checklist.md
@@ -0,0 +1,24 @@
+# Manual Smoke Checklist: SHALL WE PLAY A GAME? (split 02 terminal shell)
+
+Run these by hand in a real browser before closing the split. Browser-level
+verification (real visuals, audio, screen readers, devices) is the deployment
+split's Playwright and manual pass; this checklist records the local run so that
+pass can re-verify. Mark each PASS or FAIL with a note.
+
+| # | Check | Result | Notes |
+|---|-------|--------|-------|
+| 1 | Push-in register and feel at desktop and phone widths: the photo glass rectangle hands off to the live terminal cleanly, and the GREETINGS PROFESSOR FALKEN greeting stays in register through the move. | | |
+| 2 | Cinematic glow look matches the intended reference (planning/reference/crt-reference.jpg): halo strength, scanlines, vignette, no banding. | | |
+| 3 | Audio audibility and ducking by ear: the WOPR voice reads clearly over the ambience hum, the ambience ducks while it speaks and restores after, and no cue clicks on stop (micro-fades land). | | |
+| 4 | VoiceOver (or NVDA) pass over activation, the menu, a debrief, and a timer-milestone announcement: focus lands sensibly on each screen, the live regions read, and the countdown never announces its ticks. | | |
+| 5 | Throttled-CPU performance profile of the CRT stack and a finale-scale character grid: no dropped frames from animated filters, no per-cell shadow blowup, steady paint. | | |
+| 6 | Reduced-motion walk (OS setting or in-app toggle): the push-in is replaced by a crossfade, type-ins are instant, tic-tac-toe is instant, and the cabinet lamps show no ambient blinking. | | |
+
+## How to run
+
+- Serve the production build locally (not the dev server) so base-path URLs and
+  asset preloads behave as they will on GitHub Pages.
+- Exercise the reduced-motion row twice: once via the OS setting, once via the
+  in-app MOTION toggle in SETTINGS, confirming both reach the same state.
+- Record anything that fails here and in the split notes so the deployment split
+  re-tests it in Playwright.
diff --git a/planning/02-terminal-shell/implementation/code_review/section-10-diff.md b/planning/02-terminal-shell/implementation/code_review/section-10-diff.md
new file mode 100644
index 0000000..df8d679
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-10-diff.md
@@ -0,0 +1,1092 @@
+diff --git a/docs/manual-smoke-checklist.md b/docs/manual-smoke-checklist.md
+new file mode 100644
+index 0000000..fb5bfc5
+--- /dev/null
++++ b/docs/manual-smoke-checklist.md
+@@ -0,0 +1,24 @@
++# Manual Smoke Checklist: SHALL WE PLAY A GAME? (split 02 terminal shell)
++
++Run these by hand in a real browser before closing the split. Browser-level
++verification (real visuals, audio, screen readers, devices) is the deployment
++split's Playwright and manual pass; this checklist records the local run so that
++pass can re-verify. Mark each PASS or FAIL with a note.
++
++| # | Check | Result | Notes |
++|---|-------|--------|-------|
++| 1 | Push-in register and feel at desktop and phone widths: the photo glass rectangle hands off to the live terminal cleanly, and the GREETINGS PROFESSOR FALKEN greeting stays in register through the move. | | |
++| 2 | Cinematic glow look matches the intended reference (planning/reference/crt-reference.jpg): halo strength, scanlines, vignette, no banding. | | |
++| 3 | Audio audibility and ducking by ear: the WOPR voice reads clearly over the ambience hum, the ambience ducks while it speaks and restores after, and no cue clicks on stop (micro-fades land). | | |
++| 4 | VoiceOver (or NVDA) pass over activation, the menu, a debrief, and a timer-milestone announcement: focus lands sensibly on each screen, the live regions read, and the countdown never announces its ticks. | | |
++| 5 | Throttled-CPU performance profile of the CRT stack and a finale-scale character grid: no dropped frames from animated filters, no per-cell shadow blowup, steady paint. | | |
++| 6 | Reduced-motion walk (OS setting or in-app toggle): the push-in is replaced by a crossfade, type-ins are instant, tic-tac-toe is instant, and the cabinet lamps show no ambient blinking. | | |
++
++## How to run
++
++- Serve the production build locally (not the dev server) so base-path URLs and
++  asset preloads behave as they will on GitHub Pages.
++- Exercise the reduced-motion row twice: once via the OS setting, once via the
++  in-app MOTION toggle in SETTINGS, confirming both reach the same state.
++- Record anything that fails here and in the split notes so the deployment split
++  re-tests it in Playwright.
+diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
+index c1655b3..5cc437f 100644
+--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
++++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
+@@ -50,6 +50,10 @@
+     "section-08-cabinet-grid": {
+       "status": "complete",
+       "commit_hash": "cb57732"
++    },
++    "section-09-a11y-glossary": {
++      "status": "complete",
++      "commit_hash": "f79ed66"
+     }
+   },
+   "pre_commit": {
+diff --git a/src/app/art/ArtSlot.tsx b/src/app/art/ArtSlot.tsx
+new file mode 100644
+index 0000000..adc49c8
+--- /dev/null
++++ b/src/app/art/ArtSlot.tsx
+@@ -0,0 +1,33 @@
++// The consumer component. Reserves aspect-ratio space from the entry so layout
++// never shifts, then renders either the graded placeholder or an img with the
++// entry's base-prefixed URL and the correct alt text (empty for decorative, the
++// description for informative). Consumers never branch on source kind: swapping
++// the source in the registry is the whole media-split interface.
++import { getArtSlot } from './registry'
++import type { ArtSlotId } from './types'
++import './art.css'
++
++export interface ArtSlotProps {
++  readonly id: ArtSlotId
++  readonly className?: string
++}
++
++export function ArtSlot({ id, className }: ArtSlotProps) {
++  const entry = getArtSlot(id)
++  const alt = entry.text.kind === 'informative' ? entry.text.description : ''
++  const cls = className ? `art-slot ${className}` : 'art-slot'
++  return (
++    <div
++      className={cls}
++      data-testid={`art-slot-${id}`}
++      data-slot={id}
++      style={{ aspectRatio: String(entry.aspectRatio) }}
++    >
++      {entry.source.kind === 'image' ? (
++        <img className="art-slot-media" src={entry.source.url} alt={alt} />
++      ) : (
++        entry.source.render()
++      )}
++    </div>
++  )
++}
+diff --git a/src/app/art/art.css b/src/app/art/art.css
+new file mode 100644
+index 0000000..25aabca
+--- /dev/null
++++ b/src/app/art/art.css
+@@ -0,0 +1,32 @@
++/* Art slot styling. The wrapper reserves aspect-ratio space so layout never
++   shifts before a source loads; the placeholder and the image both fill it. */
++.art-slot {
++  display: block;
++  width: 100%;
++  position: relative;
++  overflow: hidden;
++  background: var(--color-glass, #050a14);
++}
++
++.art-slot-media,
++.art-placeholder {
++  position: absolute;
++  inset: 0;
++  width: 100%;
++  height: 100%;
++  object-fit: cover;
++}
++
++.art-placeholder {
++  display: flex;
++  align-items: center;
++  justify-content: center;
++}
++
++.art-placeholder-label {
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++  color: var(--color-glyph, #6cb6ff);
++  letter-spacing: 0.2em;
++  opacity: 0.45;
++  font-size: clamp(0.75rem, 3vw, 1.5rem);
++}
+diff --git a/src/app/art/index.ts b/src/app/art/index.ts
+index 55b2ba0..c3682d0 100644
+--- a/src/app/art/index.ts
++++ b/src/app/art/index.ts
+@@ -1,12 +1,10 @@
+-// Minimal art slot registry. Section 10 builds the full 13-slot registry with
+-// a source-swap function and preload priorities; this provides the hero slots
+-// the push-in needs, resolving every URL through urlFor so a subpath deploy
+-// cannot break. A graded CSS placeholder renders behind the image, so a
+-// missing asset degrades to the placeholder rather than a broken image.
++// The art package surface. Two layers share this folder: the hero image-source
++// helpers the push-in uses (artSources/artNatural, keyed to the two hero
++// slots), and the full section-10 slot registry (13 slots, graded placeholders,
++// source swap, preload). Final art arrives by swapping sources in the registry;
++// no consumer changes.
+ import { urlFor } from '../urlFor'
+-import type { ArtSlotId } from '../hero/heroCrop'
+-
+-export type { ArtSlotId }
++import type { ArtSlotId as HeroArtSlotId } from '../hero/heroCrop'
+ 
+ export interface ArtSources {
+   readonly avif: string
+@@ -18,18 +16,48 @@ export interface Size {
+   readonly h: number
+ }
+ 
+-const NATURAL: Readonly<Record<ArtSlotId, Size>> = {
++const NATURAL: Readonly<Record<HeroArtSlotId, Size>> = {
+   'hero-desktop': { w: 1600, h: 900 },
+   'hero-portrait': { w: 1080, h: 1920 },
+ }
+ 
+-export function artSources(slot: ArtSlotId): ArtSources {
++export function artSources(slot: HeroArtSlotId): ArtSources {
+   return { avif: urlFor(`art/${slot}.avif`), jpg: urlFor(`art/${slot}.jpg`) }
+ }
+ 
+-export function artNatural(slot: ArtSlotId): Size {
++export function artNatural(slot: HeroArtSlotId): Size {
+   return NATURAL[slot]
+ }
+ 
+-/** Hero slots preload eagerly; below-fold and ending slots (section 10) lazy. */
++/** Hero slots preload eagerly; below-fold and ending slots lazy. */
+ export const HERO_PRELOAD = 'eager' as const
++
++// The section-10 registry surface.
++export type {
++  ArtSlotId,
++  ArtSlotEntry,
++  ArtSource,
++  ArtPriority,
++  ArtText,
++  HeroCrop,
++  PlaceholderRenderer,
++} from './types'
++export {
++  getArtSlot,
++  allArtSlots,
++  slotsByPriority,
++  swapArtSource,
++  imageSource,
++  validateArtRegistry,
++  validateEntries,
++  __resetArtRegistry,
++} from './registry'
++export { ArtSlot, type ArtSlotProps } from './ArtSlot'
++export { PLACEHOLDERS } from './placeholders'
++export {
++  preloadEagerArt,
++  preloadForMission,
++  preloadSlot,
++  preloadAllArt,
++  type ArtLoader,
++} from './preload'
+diff --git a/src/app/art/placeholders.tsx b/src/app/art/placeholders.tsx
+new file mode 100644
+index 0000000..a9af7a6
+--- /dev/null
++++ b/src/app/art/placeholders.tsx
+@@ -0,0 +1,69 @@
++// Graded CSS placeholder scenes, one per slot. Gradients and panel textures
++// built from the theme tokens: navy-black fields, electric blue accents, a
++// hammered gray-olive feel for rack and cabinet-adjacent slots, amber lamp dots
++// where the final art will show hardware. No images, no canvas, no animation.
++// Each renderer fills its container; the container (ArtSlot) owns the
++// aspect-ratio reservation.
++import type { CSSProperties, ReactNode } from 'react'
++import type { ArtSlotId, PlaceholderRenderer } from './types'
++import './art.css'
++
++type Variant = 'glass' | 'panel' | 'lamps' | 'ledger' | 'wall' | 'ending'
++
++const VARIANT_STYLE: Readonly<Record<Variant, CSSProperties>> = {
++  glass: {
++    background:
++      'radial-gradient(120% 90% at 50% 40%, #0d1a2e 0%, #050a14 70%), linear-gradient(180deg, #0a1322, #050a14)',
++    boxShadow: 'inset 0 0 60px rgba(108,182,255,0.18)',
++  },
++  panel: {
++    background:
++      'repeating-linear-gradient(135deg, #22241d 0 6px, #1b1d17 6px 12px)',
++  },
++  lamps: {
++    background:
++      'radial-gradient(circle at 12px 12px, #ffb84d 0 2px, transparent 3px) 0 0 / 20px 20px, #22241d',
++  },
++  ledger: {
++    background: 'linear-gradient(180deg, #081120, #050a14)',
++    boxShadow: 'inset 0 0 40px rgba(108,182,255,0.1)',
++  },
++  wall: {
++    background:
++      'repeating-linear-gradient(0deg, #0a1322 0 3px, #070e1a 3px 6px)',
++  },
++  ending: {
++    background: 'radial-gradient(90% 90% at 50% 50%, #0d1a2e, #050a14)',
++  },
++}
++
++function makePlaceholder(variant: Variant, label: string): PlaceholderRenderer {
++  const Placeholder = (): ReactNode => (
++    <div
++      className="art-placeholder"
++      data-testid="art-placeholder"
++      data-variant={variant}
++      style={VARIANT_STYLE[variant]}
++      aria-hidden="true"
++    >
++      <span className="art-placeholder-label">{label}</span>
++    </div>
++  )
++  return Placeholder
++}
++
++export const PLACEHOLDERS: Readonly<Record<ArtSlotId, PlaceholderRenderer>> = {
++  'hero-desktop': makePlaceholder('glass', 'WOPR'),
++  'hero-portrait': makePlaceholder('glass', 'WOPR'),
++  'hero-return': makePlaceholder('glass', 'WOPR'),
++  'menu-rack': makePlaceholder('lamps', 'RACK'),
++  'bezel-texture': makePlaceholder('panel', ''),
++  'countdown-insert': makePlaceholder('panel', ''),
++  'briefing-outlook': makePlaceholder('ledger', 'OUTLOOK'),
++  'briefing-flights': makePlaceholder('ledger', 'FLIGHTS'),
++  'briefing-bank': makePlaceholder('ledger', 'BANK'),
++  'failsafe-wall': makePlaceholder('wall', 'FAILSAFE'),
++  'ending-recovery': makePlaceholder('ending', 'RECOVERY'),
++  'ending-containment': makePlaceholder('ending', 'CONTAINMENT'),
++  'ending-failure': makePlaceholder('ending', 'FAILURE'),
++}
+diff --git a/src/app/art/preload.ts b/src/app/art/preload.ts
+new file mode 100644
+index 0000000..d75ce88
+--- /dev/null
++++ b/src/app/art/preload.ts
+@@ -0,0 +1,51 @@
++// Priority-driven preload. A loader port (so tests can spy) plus three entry
++// points: an eager pass the app runs at boot, a per-mission warm for the three
++// briefing slots, and a deferred trigger for a slot's first stable view. The
++// default loader fetch-aheads an image; a placeholder source is a no-op. All
++// failures are silent to gameplay.
++import { allArtSlots, slotsByPriority, getArtSlot } from './registry'
++import type { ArtSlotEntry, ArtSlotId } from './types'
++
++export type ArtLoader = (entry: ArtSlotEntry) => void
++
++const defaultLoader: ArtLoader = (entry) => {
++  if (entry.source.kind !== 'image') return // placeholders need no load
++  try {
++    const img = new Image()
++    img.src = entry.source.url
++  } catch {
++    // A failed preload never breaks gameplay.
++  }
++}
++
++const BRIEFING_SLOTS: readonly ArtSlotId[] = [
++  'briefing-outlook',
++  'briefing-flights',
++  'briefing-bank',
++]
++
++/** Boot pass: warm every eager slot. */
++export function preloadEagerArt(loader: ArtLoader = defaultLoader): void {
++  for (const entry of slotsByPriority('eager')) loader(entry)
++}
++
++/** Warm the briefing slots when a mission is selected. */
++export function preloadForMission(
++  _missionId: string,
++  loader: ArtLoader = defaultLoader,
++): void {
++  for (const id of BRIEFING_SLOTS) loader(getArtSlot(id))
++}
++
++/** A deferred slot's first stable view warms it. */
++export function preloadSlot(
++  id: ArtSlotId,
++  loader: ArtLoader = defaultLoader,
++): void {
++  loader(getArtSlot(id))
++}
++
++/** For completeness: the full set, used by a prefetch-everything smoke pass. */
++export function preloadAllArt(loader: ArtLoader = defaultLoader): void {
++  for (const entry of allArtSlots()) loader(entry)
++}
+diff --git a/src/app/art/registry.ts b/src/app/art/registry.ts
+new file mode 100644
+index 0000000..35d5206
+--- /dev/null
++++ b/src/app/art/registry.ts
+@@ -0,0 +1,179 @@
++// The art slot registry: every id mapped to a graded placeholder at ship, with
++// reserved aspect ratio, load priority, and accessible-text declaration. The
++// media split swaps sources through swapArtSource only; nothing else changes.
++// Image URLs always resolve through urlFor so a subpath deploy cannot break.
++import { urlFor } from '../urlFor'
++import { PLACEHOLDERS } from './placeholders'
++import type {
++  ArtPriority,
++  ArtSlotEntry,
++  ArtSlotId,
++  ArtSource,
++  HeroCrop,
++} from './types'
++
++/** Build an image source with a base-prefixed URL. The media split uses this. */
++export function imageSource(path: string): ArtSource {
++  return { kind: 'image', url: urlFor(path) }
++}
++
++function placeholder(id: ArtSlotId): ArtSource {
++  return { kind: 'placeholder', render: PLACEHOLDERS[id] }
++}
++
++const HERO_DESKTOP_CROP: HeroCrop = {
++  srcKey: 'hero-desktop',
++  glass: { x: 0.34, y: 0.3, w: 0.32, h: 0.4 },
++  greetingAnchor: { x: 0.4, y: 0.38 },
++}
++const HERO_PORTRAIT_CROP: HeroCrop = {
++  srcKey: 'hero-portrait',
++  glass: { x: 0.22, y: 0.34, w: 0.56, h: 0.3 },
++  greetingAnchor: { x: 0.3, y: 0.4 },
++}
++
++function seed(): Record<ArtSlotId, ArtSlotEntry> {
++  const decorative = { kind: 'decorative' } as const
++  const info = (description: string) =>
++    ({ kind: 'informative', description }) as const
++  return {
++    'hero-desktop': {
++      id: 'hero-desktop',
++      source: placeholder('hero-desktop'),
++      aspectRatio: 16 / 9,
++      priority: 'eager',
++      text: decorative,
++      heroCrop: HERO_DESKTOP_CROP,
++    },
++    'hero-portrait': {
++      id: 'hero-portrait',
++      source: placeholder('hero-portrait'),
++      aspectRatio: 9 / 16,
++      priority: 'eager',
++      text: decorative,
++      heroCrop: HERO_PORTRAIT_CROP,
++    },
++    'hero-return': {
++      id: 'hero-return',
++      source: placeholder('hero-return'),
++      aspectRatio: 16 / 9,
++      priority: 'eager',
++      text: decorative,
++    },
++    'menu-rack': {
++      id: 'menu-rack',
++      source: placeholder('menu-rack'),
++      aspectRatio: 4 / 1,
++      priority: 'deferred',
++      text: decorative,
++    },
++    'bezel-texture': {
++      id: 'bezel-texture',
++      source: placeholder('bezel-texture'),
++      aspectRatio: 1,
++      priority: 'deferred',
++      text: decorative,
++    },
++    'countdown-insert': {
++      id: 'countdown-insert',
++      source: placeholder('countdown-insert'),
++      aspectRatio: 3 / 1,
++      priority: 'deferred',
++      text: decorative,
++    },
++    'briefing-outlook': {
++      id: 'briefing-outlook',
++      source: placeholder('briefing-outlook'),
++      aspectRatio: 4 / 3,
++      priority: 'on-mission-select',
++      text: info('A chart of how the mission is expected to unfold.'),
++    },
++    'briefing-flights': {
++      id: 'briefing-flights',
++      source: placeholder('briefing-flights'),
++      aspectRatio: 4 / 3,
++      priority: 'on-mission-select',
++      text: info('The flight board for the mission under review.'),
++    },
++    'briefing-bank': {
++      id: 'briefing-bank',
++      source: placeholder('briefing-bank'),
++      aspectRatio: 4 / 3,
++      priority: 'on-mission-select',
++      text: info('The ledger of balances tied to the mission.'),
++    },
++    'failsafe-wall': {
++      id: 'failsafe-wall',
++      source: placeholder('failsafe-wall'),
++      aspectRatio: 21 / 9,
++      priority: 'deferred',
++      text: info('The hidden global failsafe panel behind the terminal.'),
++    },
++    'ending-recovery': {
++      id: 'ending-recovery',
++      source: placeholder('ending-recovery'),
++      aspectRatio: 16 / 9,
++      priority: 'deferred',
++      text: info('The recovery ending: the machine learns and stands down.'),
++    },
++    'ending-containment': {
++      id: 'ending-containment',
++      source: placeholder('ending-containment'),
++      aspectRatio: 16 / 9,
++      priority: 'deferred',
++      text: info('The containment ending: the crisis is held, at a cost.'),
++    },
++    'ending-failure': {
++      id: 'ending-failure',
++      source: placeholder('ending-failure'),
++      aspectRatio: 16 / 9,
++      priority: 'deferred',
++      text: info('The failure ending: the only winning move was not to play.'),
++    },
++  }
++}
++
++let registry: Record<ArtSlotId, ArtSlotEntry> = seed()
++
++export function getArtSlot(id: ArtSlotId): ArtSlotEntry {
++  const entry = registry[id]
++  if (!entry) throw new Error(`art: no slot registered for id "${id}"`)
++  return entry
++}
++
++export function allArtSlots(): readonly ArtSlotEntry[] {
++  return Object.values(registry)
++}
++
++export function slotsByPriority(priority: ArtPriority): ArtSlotEntry[] {
++  return Object.values(registry).filter((e) => e.priority === priority)
++}
++
++/** Replace one slot's source, leaving aspect ratio, priority, text, and crop
++ *  intact. The whole interface the media split relies on. */
++export function swapArtSource(id: ArtSlotId, source: ArtSource): void {
++  registry[id] = { ...getArtSlot(id), source }
++}
++
++/** Throws on an informative entry with a missing or empty description. Pure
++ *  over its input so the throw branch is directly testable. */
++export function validateEntries(entries: readonly ArtSlotEntry[]): void {
++  for (const entry of entries) {
++    if (entry.text.kind === 'informative' && !entry.text.description.trim()) {
++      throw new Error(`art: informative slot "${entry.id}" has no description`)
++    }
++  }
++}
++
++/** Throws in dev when the shipped registry has an informative entry with no
++ *  description. */
++export function validateArtRegistry(): void {
++  validateEntries(Object.values(registry))
++}
++
++/** Test-only: restore the shipped placeholder registry. */
++export function __resetArtRegistry(): void {
++  registry = seed()
++}
++
++if (import.meta.env.DEV) validateArtRegistry()
+diff --git a/src/app/art/types.ts b/src/app/art/types.ts
+new file mode 100644
+index 0000000..903d6ba
+--- /dev/null
++++ b/src/app/art/types.ts
+@@ -0,0 +1,50 @@
++// Art slot types. The id union is fixed; the full registry (registry.ts) maps
++// every id to a graded placeholder now and an image URL later, swapped in one
++// place so no consumer code changes when final art lands.
++import type { ReactNode } from 'react'
++
++export type ArtSlotId =
++  | 'hero-desktop'
++  | 'hero-portrait'
++  | 'menu-rack'
++  | 'bezel-texture'
++  | 'briefing-outlook'
++  | 'briefing-flights'
++  | 'briefing-bank'
++  | 'failsafe-wall'
++  | 'countdown-insert'
++  | 'hero-return'
++  | 'ending-recovery'
++  | 'ending-containment'
++  | 'ending-failure'
++
++export type PlaceholderRenderer = () => ReactNode
++
++// HeroCrop rides with the hero slot entries (placeholder and final alike);
++// section 05 authors its own calibrated values in hero/heroCrop.ts and consumes
++// them there. This is the registry-level shape the media split fills in.
++export interface HeroCrop {
++  readonly srcKey: ArtSlotId
++  readonly glass: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
++  readonly greetingAnchor: { readonly x: number; readonly y: number }
++}
++
++export type ArtSource =
++  | { readonly kind: 'placeholder'; readonly render: PlaceholderRenderer }
++  | { readonly kind: 'image'; readonly url: string }
++
++export type ArtPriority = 'eager' | 'deferred' | 'on-mission-select'
++
++export type ArtText =
++  | { readonly kind: 'decorative' }
++  | { readonly kind: 'informative'; readonly description: string }
++
++export interface ArtSlotEntry {
++  readonly id: ArtSlotId
++  readonly source: ArtSource
++  /** Reserved layout space, so nothing shifts before a source loads. */
++  readonly aspectRatio: number
++  readonly priority: ArtPriority
++  readonly text: ArtText
++  readonly heroCrop?: HeroCrop
++}
+diff --git a/src/app/games/TicTacToeView.tsx b/src/app/games/TicTacToeView.tsx
+new file mode 100644
+index 0000000..1ca996a
+--- /dev/null
++++ b/src/app/games/TicTacToeView.tsx
+@@ -0,0 +1,78 @@
++// Replays the optimal game at a watchable pace on an injected cell renderer
++// (the character grid in production, any matrix stub in tests). Skippable, and
++// instant under reduced motion. Entirely outside campaign state; closing it
++// leaves nothing behind. Section 04's idle HELP wires LIST GAMES to mount this.
++import { useEffect, useRef, useState, type ReactNode } from 'react'
++import { playOptimalGame, boardAfter, type Cell, type Move } from './tictactoe'
++
++export interface TicTacToeViewProps {
++  /** Defaults to the module's own optimal game. */
++  readonly moves?: readonly Move[]
++  readonly renderBoard: (cells: readonly Cell[]) => ReactNode
++  readonly reducedMotion: boolean
++  readonly stepMs?: number
++  readonly onDone?: () => void
++}
++
++const DEFAULT_STEP_MS = 500
++
++export function TicTacToeView({
++  moves,
++  renderBoard,
++  reducedMotion,
++  stepMs = DEFAULT_STEP_MS,
++  onDone,
++}: TicTacToeViewProps) {
++  const list = moves ?? playOptimalGame().moves
++  const total = list.length
++  const [revealed, setRevealed] = useState(() => (reducedMotion ? total : 0))
++  const doneFired = useRef(false)
++
++  useEffect(() => {
++    doneFired.current = false
++    if (reducedMotion || total === 0) {
++      setRevealed(total)
++      return
++    }
++    setRevealed(0)
++    let count = 0
++    let timer: ReturnType<typeof setTimeout>
++    const tick = (): void => {
++      count += 1
++      setRevealed(count)
++      if (count < total) timer = setTimeout(tick, stepMs)
++    }
++    timer = setTimeout(tick, stepMs)
++    return () => clearTimeout(timer)
++  }, [total, reducedMotion, stepMs])
++
++  useEffect(() => {
++    if (revealed >= total && !doneFired.current) {
++      doneFired.current = true
++      onDone?.()
++    }
++  }, [revealed, total, onDone])
++
++  const skip = (): void => setRevealed(total)
++  const complete = revealed >= total
++  const cells = boardAfter(list, revealed)
++
++  return (
++    <div className="tictactoe" data-testid="tictactoe">
++      <div data-testid="tictactoe-board">{renderBoard(cells)}</div>
++      <p className="tictactoe-status" data-testid="tictactoe-status">
++        {complete ? 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.' : null}
++      </p>
++      {!complete ? (
++        <button
++          type="button"
++          className="tictactoe-skip"
++          data-testid="tictactoe-skip"
++          onClick={skip}
++        >
++          SKIP
++        </button>
++      ) : null}
++    </div>
++  )
++}
+diff --git a/src/app/games/index.ts b/src/app/games/index.ts
+new file mode 100644
+index 0000000..973f18d
+--- /dev/null
++++ b/src/app/games/index.ts
+@@ -0,0 +1,11 @@
++// The games package surface: the pure optimal game and its replay view.
++export {
++  playOptimalGame,
++  boardAfter,
++  type Player,
++  type Cell,
++  type Board,
++  type Move,
++  type GameResult,
++} from './tictactoe'
++export { TicTacToeView, type TicTacToeViewProps } from './TicTacToeView'
+diff --git a/src/app/games/tictactoe.ts b/src/app/games/tictactoe.ts
+new file mode 100644
+index 0000000..fb8df0a
+--- /dev/null
++++ b/src/app/games/tictactoe.ts
+@@ -0,0 +1,92 @@
++// Tic-tac-toe played optimally by both sides, from the empty board to a draw.
++// The WOPR-learns-futility beat from the film, played straight: the machine
++// plays itself and cannot win. Pure functions over its own board type, zero
++// imports from engine or app state, deterministic by construction (ties in move
++// evaluation break by lowest cell index), so the emitted move list is identical
++// on every run.
++export type Player = 'X' | 'O'
++export type Cell = Player | null
++export type Board = readonly Cell[]
++
++export interface Move {
++  readonly player: Player
++  readonly cell: number
++}
++
++export interface GameResult {
++  readonly moves: readonly Move[]
++  readonly result: 'draw' | Player
++}
++
++const LINES: ReadonlyArray<readonly [number, number, number]> = [
++  [0, 1, 2],
++  [3, 4, 5],
++  [6, 7, 8],
++  [0, 3, 6],
++  [1, 4, 7],
++  [2, 5, 8],
++  [0, 4, 8],
++  [2, 4, 6],
++]
++
++function winner(board: Board): Player | null {
++  for (const [a, b, c] of LINES) {
++    const v = board[a]
++    if (v && v === board[b] && v === board[c]) return v
++  }
++  return null
++}
++
++function isFull(board: Board): boolean {
++  return board.every((c) => c !== null)
++}
++
++const other = (p: Player): Player => (p === 'X' ? 'O' : 'X')
++
++// Score from X's perspective: X win +1, O win -1, draw 0. Returns the chosen
++// cell too, lowest index among equally optimal moves (strict comparisons keep
++// the first seen, and cells are scanned in ascending order).
++function best(board: Cell[], player: Player): { score: number; cell: number } {
++  const win = winner(board)
++  if (win === 'X') return { score: 1, cell: -1 }
++  if (win === 'O') return { score: -1, cell: -1 }
++  if (isFull(board)) return { score: 0, cell: -1 }
++
++  let bestCell = -1
++  let bestScore = player === 'X' ? -Infinity : Infinity
++  for (let i = 0; i < 9; i++) {
++    if (board[i] !== null) continue
++    board[i] = player
++    const { score } = best(board, other(player))
++    board[i] = null
++    if (player === 'X' ? score > bestScore : score < bestScore) {
++      bestScore = score
++      bestCell = i
++    }
++  }
++  return { score: bestScore, cell: bestCell }
++}
++
++/** Play the whole game optimally. Both optimal means a draw, every time. */
++export function playOptimalGame(): GameResult {
++  const board: Cell[] = Array<Cell>(9).fill(null)
++  const moves: Move[] = []
++  let player: Player = 'X'
++  while (winner(board) === null && !isFull(board)) {
++    const { cell } = best(board, player)
++    board[cell] = player
++    moves.push({ player, cell })
++    player = other(player)
++  }
++  return { moves, result: winner(board) ?? 'draw' }
++}
++
++/** Apply the first n moves to a fresh board (for the replay view). */
++export function boardAfter(moves: readonly Move[], n: number): Cell[] {
++  const board: Cell[] = Array<Cell>(9).fill(null)
++  for (let i = 0; i < n && i < moves.length; i++) {
++    const move = moves[i]!
++    board[move.cell] = move.player
++  }
++  return board
++}
+diff --git a/test/app/art/artslot.test.tsx b/test/app/art/artslot.test.tsx
+new file mode 100644
+index 0000000..7028fc4
+--- /dev/null
++++ b/test/app/art/artslot.test.tsx
+@@ -0,0 +1,80 @@
++import { afterEach, beforeEach, describe, expect, it } from 'vitest'
++import { cleanup, render, screen } from '@testing-library/react'
++import {
++  ArtSlot,
++  swapArtSource,
++  imageSource,
++  __resetArtRegistry,
++  type ArtSlotId,
++} from '@app/art'
++
++const ALL_IDS: readonly ArtSlotId[] = [
++  'hero-desktop',
++  'hero-portrait',
++  'menu-rack',
++  'bezel-texture',
++  'briefing-outlook',
++  'briefing-flights',
++  'briefing-bank',
++  'failsafe-wall',
++  'countdown-insert',
++  'hero-return',
++  'ending-recovery',
++  'ending-containment',
++  'ending-failure',
++]
++
++beforeEach(() => {
++  __resetArtRegistry()
++})
++afterEach(() => {
++  cleanup()
++  __resetArtRegistry()
++})
++
++describe('ArtSlot', () => {
++  it('reserves aspect-ratio space for every slot before any source loads', () => {
++    for (const id of ALL_IDS) {
++      const { unmount } = render(<ArtSlot id={id} />)
++      const el = screen.getByTestId(`art-slot-${id}`)
++      expect(el.style.aspectRatio).not.toBe('')
++      unmount()
++    }
++  })
++
++  it('renders the graded placeholder for a placeholder source', () => {
++    render(<ArtSlot id="hero-desktop" />)
++    expect(screen.getByTestId('art-placeholder')).toBeInTheDocument()
++  })
++
++  it('a decorative slot has an empty alt once swapped to an image', () => {
++    swapArtSource('hero-desktop', imageSource('art/hero-desktop.avif'))
++    render(<ArtSlot id="hero-desktop" />)
++    const img = screen
++      .getByTestId('art-slot-hero-desktop')
++      .querySelector('img')
++    expect(img).not.toBeNull()
++    expect(img).toHaveAttribute('alt', '')
++  })
++
++  it('an informative slot carries its description as alt once swapped to an image', () => {
++    swapArtSource('briefing-outlook', imageSource('art/briefing-outlook.avif'))
++    render(<ArtSlot id="briefing-outlook" />)
++    const img = screen
++      .getByTestId('art-slot-briefing-outlook')
++      .querySelector('img')
++    expect(img?.getAttribute('alt')?.length).toBeGreaterThan(0)
++    expect(img).toHaveAttribute('src')
++  })
++
++  it('the same consumer renders an image after a source swap (media-split contract)', () => {
++    render(<ArtSlot id="menu-rack" />)
++    expect(screen.getByTestId('art-placeholder')).toBeInTheDocument()
++    cleanup()
++    swapArtSource('menu-rack', imageSource('art/menu-rack.avif'))
++    render(<ArtSlot id="menu-rack" />)
++    expect(screen.queryByTestId('art-placeholder')).toBeNull()
++    const img = screen.getByTestId('art-slot-menu-rack').querySelector('img')
++    expect(img).toHaveAttribute('src')
++  })
++})
+diff --git a/test/app/art/registry.test.ts b/test/app/art/registry.test.ts
+new file mode 100644
+index 0000000..c866b89
+--- /dev/null
++++ b/test/app/art/registry.test.ts
+@@ -0,0 +1,128 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import {
++  allArtSlots,
++  getArtSlot,
++  slotsByPriority,
++  swapArtSource,
++  imageSource,
++  validateArtRegistry,
++  validateEntries,
++  __resetArtRegistry,
++  type ArtLoader,
++  type ArtSlotId,
++  type ArtSlotEntry,
++} from '@app/art'
++import { preloadEagerArt, preloadForMission } from '@app/art/preload'
++
++const ALL_IDS: readonly ArtSlotId[] = [
++  'hero-desktop',
++  'hero-portrait',
++  'menu-rack',
++  'bezel-texture',
++  'briefing-outlook',
++  'briefing-flights',
++  'briefing-bank',
++  'failsafe-wall',
++  'countdown-insert',
++  'hero-return',
++  'ending-recovery',
++  'ending-containment',
++  'ending-failure',
++]
++
++beforeEach(() => {
++  __resetArtRegistry()
++})
++afterEach(() => {
++  __resetArtRegistry()
++})
++
++describe('art registry', () => {
++  it('every ArtSlotId resolves to an entry with a placeholder and an aspect ratio', () => {
++    for (const id of ALL_IDS) {
++      const entry = getArtSlot(id)
++      expect(entry.id).toBe(id)
++      expect(entry.source.kind).toBe('placeholder')
++      expect(entry.aspectRatio).toBeGreaterThan(0)
++    }
++    expect(allArtSlots()).toHaveLength(ALL_IDS.length)
++  })
++
++  it('the shipped registry validates (every informative entry has a description)', () => {
++    expect(() => validateArtRegistry()).not.toThrow()
++    for (const entry of allArtSlots()) {
++      if (entry.text.kind === 'informative') {
++        expect(entry.text.description.trim().length).toBeGreaterThan(0)
++      }
++    }
++  })
++
++  it('validation throws for an informative entry with an empty description', () => {
++    const bad: ArtSlotEntry = {
++      ...getArtSlot('briefing-outlook'),
++      text: { kind: 'informative', description: '   ' },
++    }
++    expect(() => validateEntries([bad])).toThrow()
++    // The shipped entries do not trip it.
++    expect(() => validateEntries(allArtSlots())).not.toThrow()
++  })
++
++  it('hero slots are eager; briefing slots are on-mission-select; the rest deferred', () => {
++    const eager = slotsByPriority('eager').map((e) => e.id)
++    expect(eager).toContain('hero-desktop')
++    expect(eager).toContain('hero-portrait')
++    const onSelect = slotsByPriority('on-mission-select').map((e) => e.id)
++    expect(onSelect.sort()).toEqual([
++      'briefing-bank',
++      'briefing-flights',
++      'briefing-outlook',
++    ])
++  })
++
++  it('preload fires eager at boot and briefing only on mission select', () => {
++    const loaded: string[] = []
++    const spy: ArtLoader = (entry) => loaded.push(entry.id)
++
++    preloadEagerArt(spy)
++    expect(loaded).toContain('hero-desktop')
++    expect(loaded).not.toContain('briefing-outlook')
++
++    loaded.length = 0
++    preloadForMission('alpha', spy)
++    expect(loaded.sort()).toEqual([
++      'briefing-bank',
++      'briefing-flights',
++      'briefing-outlook',
++    ])
++  })
++
++  it('the default loader only fetch-aheads image sources (placeholders no-op)', () => {
++    const ImageSpy = vi.fn()
++    vi.stubGlobal(
++      'Image',
++      class {
++        set src(_v: string) {
++          ImageSpy()
++        }
++      },
++    )
++    // All slots ship as placeholders: the default loader must not construct any
++    // Image for them.
++    preloadEagerArt()
++    expect(ImageSpy).not.toHaveBeenCalled()
++    vi.unstubAllGlobals()
++  })
++
++  it('swapping a source to an image routes the URL through urlFor and keeps everything else', () => {
++    const before = getArtSlot('menu-rack')
++    swapArtSource('menu-rack', imageSource('art/menu-rack.avif'))
++    const after = getArtSlot('menu-rack')
++    expect(after.source.kind).toBe('image')
++    if (after.source.kind === 'image') {
++      // urlFor prefixes BASE_URL; in test that is '/', so the path is preserved.
++      expect(after.source.url).toContain('art/menu-rack.avif')
++    }
++    expect(after.aspectRatio).toBe(before.aspectRatio)
++    expect(after.priority).toBe(before.priority)
++  })
++})
+diff --git a/test/app/games/tictactoe.test.ts b/test/app/games/tictactoe.test.ts
+new file mode 100644
+index 0000000..d5c4e3a
+--- /dev/null
++++ b/test/app/games/tictactoe.test.ts
+@@ -0,0 +1,36 @@
++import { describe, expect, it } from 'vitest'
++import { playOptimalGame, boardAfter } from '@app/games'
++
++describe('optimal tic-tac-toe', () => {
++  it('two optimal players reach a draw from the empty board', () => {
++    const game = playOptimalGame()
++    expect(game.result).toBe('draw')
++    // A draw fills the board: nine moves, every cell taken.
++    expect(game.moves).toHaveLength(9)
++    const final = boardAfter(game.moves, game.moves.length)
++    expect(final.every((c) => c !== null)).toBe(true)
++  })
++
++  it('the move list is deterministic across independent runs', () => {
++    const a = playOptimalGame()
++    const b = playOptimalGame()
++    expect(a.moves).toEqual(b.moves)
++  })
++
++  it('alternates X and O starting with X, each cell used once', () => {
++    const { moves } = playOptimalGame()
++    moves.forEach((m, i) => {
++      expect(m.player).toBe(i % 2 === 0 ? 'X' : 'O')
++    })
++    const cells = moves.map((m) => m.cell).sort((x, y) => x - y)
++    expect(cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
++  })
++
++  it('is pure: boardAfter never mutates the move list and is reproducible', () => {
++    const { moves } = playOptimalGame()
++    const first = boardAfter(moves, 5)
++    const second = boardAfter(moves, 5)
++    expect(first).toEqual(second)
++    expect(moves).toHaveLength(9)
++  })
++})
+diff --git a/test/app/games/view.test.tsx b/test/app/games/view.test.tsx
+new file mode 100644
+index 0000000..0093ddd
+--- /dev/null
++++ b/test/app/games/view.test.tsx
+@@ -0,0 +1,54 @@
++import { afterEach, describe, expect, it, vi } from 'vitest'
++import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
++import { TicTacToeView } from '@app/games'
++import type { Cell } from '@app/games'
++
++function renderBoard(cells: readonly Cell[]) {
++  return (
++    <span data-testid="board">
++      {cells.map((c) => c ?? '.').join('')}
++    </span>
++  )
++}
++
++function filled(cells: string): number {
++  return cells.split('').filter((c) => c !== '.').length
++}
++
++afterEach(() => {
++  cleanup()
++  vi.useRealTimers()
++})
++
++describe('TicTacToeView', () => {
++  it('reveals moves one at a time at a watchable pace', () => {
++    vi.useFakeTimers()
++    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={false} stepMs={300} />)
++    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(0)
++    act(() => {
++      vi.advanceTimersByTime(300)
++    })
++    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(1)
++    act(() => {
++      vi.advanceTimersByTime(300)
++    })
++    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(2)
++  })
++
++  it('skip jumps to the final drawn board, which stays readable', () => {
++    vi.useFakeTimers()
++    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={false} />)
++    fireEvent.click(screen.getByTestId('tictactoe-skip'))
++    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(9)
++    expect(screen.queryByTestId('tictactoe-skip')).toBeNull()
++    expect(screen.getByTestId('tictactoe-status')).toHaveTextContent(
++      'NOT TO PLAY',
++    )
++  })
++
++  it('renders the final board instantly under reduced motion', () => {
++    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={true} />)
++    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(9)
++    expect(screen.queryByTestId('tictactoe-skip')).toBeNull()
++  })
++})
diff --git a/planning/02-terminal-shell/implementation/code_review/section-10-interview.md b/planning/02-terminal-shell/implementation/code_review/section-10-interview.md
new file mode 100644
index 0000000..026ae66
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-10-interview.md
@@ -0,0 +1,24 @@
+# Section 10 review triage and fixes
+
+Standing directive: full autonomy, no questions. Fixed the two HIGH items and the correctness/dedup mediums; kept the low-severity items with rationale.
+
+## Auto-fixed
+
+- **H1 (deferred preload trigger missing).** ArtSlot now self-triggers `preloadSlot(id)` on mount for `deferred` slots only (eager slots are warmed at boot, on-mission-select by preloadForMission). It accepts an optional `loader` for test injection. Tests added: a deferred slot warms its loader on view; eager and on-mission-select slots do not.
+
+- **H2 (TicTacToeView done-latch double-fire).** The view now latches on a move-signature and resets `doneFired` only when the signature changes (a new game), not on a stepMs/reducedMotion change. The reveal effect keys on the signature; the completion guard also requires total > 0. Test added: a reducedMotion flip after completion does not re-fire onDone.
+
+- **M3 (swapArtSource unvalidated).** swapArtSource now validates the resulting entry in dev (import.meta.env.DEV) before committing it.
+
+- **M4 (HeroCrop duplication + unasserted preservation).** The registry's hero crops now derive from hero/heroCrop.ts `HERO_CROPS` (one source of truth; no hand-copied numbers to drift when the calibration tool refines them). The swap test now asserts heroCrop and text survive a source swap.
+
+- **L7 (Image not retained).** The default loader retains each prefetch Image in an in-flight set until load/error so GC cannot reclaim it mid-fetch.
+
+- **L8 (zero-import constraint untested).** A source-scan test asserts tictactoe.ts imports nothing from app state or the engine.
+
+## Let go (with rationale)
+- **M5.** Reserved space uses CSS aspect-ratio; all target browsers (modern evergreen, GitHub Pages) support it. A padding-top fallback conflicts with the absolute-filled children; kept with the documented modern-browser assumption.
+- **L6.** preloadForMission ignores missionId by design (it warms all three briefing slots); the param is kept for future per-mission targeting.
+
+## Verification
+- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm test`: 496 passed / 76 files (was 490). New tests: deferred-preload trigger (3), heroCrop/text swap preservation (2), view no-double-fire (1), tic-tac-toe zero-import scan (1).
diff --git a/planning/02-terminal-shell/implementation/code_review/section-10-review.md b/planning/02-terminal-shell/implementation/code_review/section-10-review.md
new file mode 100644
index 0000000..ac55dc7
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-10-review.md
@@ -0,0 +1,20 @@
+# Art slots + tic-tac-toe (section-10) review
+
+Reviewer: deep-implement:code-reviewer. urlFor discipline honored, minimax genuinely optimal (always a 9-move draw, lowest-index tie-break deterministic, boardAfter pure). Real gaps below.
+
+## HIGH
+- **1. The deferred preload trigger is never wired.** `preloadSlot(id)` exists but nothing calls it; `ArtSlot` has no effect, so a `deferred` slot is never warmed on its first stable view. The central deferred-loading behavior is absent and untested.
+- **2. TicTacToeView done-latch can double-fire across prop changes.** The reveal effect resets `doneFired` on every run (deps `[total, reducedMotion, stepMs]`) while the completion effect reads it (deps include `onDone`). A prop change after completion (e.g. a reducedMotion flip, or an inline onDone identity change) can reset the latch and re-fire `onDone`. Same class as the earlier branch-trace latch.
+
+## MEDIUM
+- **3. swapArtSource does no validation.** The media-split mutation is unguarded (though text is structurally preserved, so an image with no description cannot actually arise through swap). Cheap to add a dev guard.
+- **4. HeroCrop values are hand-duplicated and the swap test does not assert heroCrop/text survive.** registry.ts copies glass/greetingAnchor from hero/heroCrop.ts by hand (two sources of truth that will drift when the calibration tool refines hero/heroCrop.ts). The swap test asserts only aspectRatio and priority.
+- **5. Reserved space relies solely on CSS aspect-ratio.** An engine not honoring aspect-ratio would collapse the slot. Target browsers (GitHub Pages, modern evergreen) all support aspect-ratio, so kept with a documented assumption.
+
+## LOW
+- **6.** preloadForMission ignores its missionId (warms all three briefing slots). Matches the plan literally; param kept for future per-mission targeting.
+- **7.** The default loader's `new Image()` is not retained, so GC may reclaim it before the prefetch completes.
+- **8.** No test enforced the tic-tac-toe zero-import constraint (it is clean by inspection).
+
+## Fixes applied
+1: ArtSlot self-triggers `preloadSlot(id)` on mount for deferred slots (accepts an optional loader for testing); test added. 2: TicTacToeView latches on a move-signature and resets `doneFired` only when the signature changes, not on stepMs/reducedMotion; test added that a post-completion prop change does not re-fire onDone. 3: swapArtSource validates the resulting entry in dev. 4: registry heroCrop derives from hero/heroCrop.ts HERO_CROPS (one source of truth); swap test now asserts heroCrop and text survive. 7: the default loader retains the Image until load/error. 8: a source-scan test asserts tictactoe.ts imports nothing from state/engine. 5/6 kept with rationale.
diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
index c1655b3..5cc437f 100644
--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
+++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
@@ -50,6 +50,10 @@
     "section-08-cabinet-grid": {
       "status": "complete",
       "commit_hash": "cb57732"
+    },
+    "section-09-a11y-glossary": {
+      "status": "complete",
+      "commit_hash": "f79ed66"
     }
   },
   "pre_commit": {
diff --git a/planning/02-terminal-shell/sections/section-10-art-slots-extras.md b/planning/02-terminal-shell/sections/section-10-art-slots-extras.md
index 04ab859..ac4a2cb 100644
--- a/planning/02-terminal-shell/sections/section-10-art-slots-extras.md
+++ b/planning/02-terminal-shell/sections/section-10-art-slots-extras.md
@@ -232,4 +232,37 @@ All four test files pass under the jsdom project in one `npm test` run
 alongside the existing engine tests, every ArtSlotId renders a graded
 placeholder with reserved space, the swap test proves the media-split
 contract, the tic-tac-toe draw sequence is byte-identical across runs, and
-`docs/manual-smoke-checklist.md` exists with the six checks above.
\ No newline at end of file
+`docs/manual-smoke-checklist.md` exists with the six checks above.
+
+## Implementation notes (as built)
+
+Final suite 496 tests. All three pieces shipped as planned.
+
+- **art/**: `types.ts` holds the canonical 13-id `ArtSlotId`, `ArtSlotEntry`,
+  and the registry-level `HeroCrop`. `registry.ts` seeds all 13 entries as
+  graded placeholders with reserved aspect ratios; hero slots eager and
+  decorative, briefing slots on-mission-select and informative, the rest
+  deferred. The hero crops are DERIVED from `hero/heroCrop.ts` `HERO_CROPS` so
+  the calibration values have one source of truth. `swapArtSource` replaces only
+  the source (validating the result in dev), the media-split contract.
+  `placeholders.tsx` renders six graded CSS variants, no images. `ArtSlot.tsx`
+  reserves aspect-ratio space and self-triggers `preloadSlot` on first stable
+  view for deferred slots. `preload.ts` is a loader port (default `new Image()`,
+  retained until settle; no-op for placeholders) with eager/mission/slot
+  entry points. The barrel keeps the section-05 hero helpers
+  (`artSources`/`artNatural`, typed to the two hero slots) working.
+- **games/**: `tictactoe.ts` is a pure, dependency-free minimax (both sides
+  optimal to a nine-move draw, lowest-index tie-break, deterministic; a
+  source-scan test enforces the zero-import rule). `TicTacToeView.tsx` replays
+  on an injected cell renderer (the character grid in production), skippable and
+  instant under reduced motion, with a signature-keyed done latch so onDone
+  never double-fires.
+- **docs/manual-smoke-checklist.md**: the six manual checks that close the split
+  locally before the deployment split re-verifies.
+
+### Reconciliation with section 05
+Section 05 shipped a two-slot hero stand-in in `art/index.ts`; this section kept
+those helpers (now typed to a hero-only slot subset) and added the full
+registry. `hero/heroCrop.ts` keeps its own local 2-id ArtSlotId and HeroCrop
+(section 05 is committed and working); the registry derives its crop values from
+there rather than retrofitting hero to import the registry.
\ No newline at end of file
diff --git a/src/app/art/ArtSlot.tsx b/src/app/art/ArtSlot.tsx
new file mode 100644
index 0000000..8991650
--- /dev/null
+++ b/src/app/art/ArtSlot.tsx
@@ -0,0 +1,45 @@
+// The consumer component. Reserves aspect-ratio space from the entry so layout
+// never shifts, then renders either the graded placeholder or an img with the
+// entry's base-prefixed URL and the correct alt text (empty for decorative, the
+// description for informative). Consumers never branch on source kind: swapping
+// the source in the registry is the whole media-split interface.
+import { useEffect } from 'react'
+import { getArtSlot } from './registry'
+import { preloadSlot, type ArtLoader } from './preload'
+import type { ArtSlotId } from './types'
+import './art.css'
+
+export interface ArtSlotProps {
+  readonly id: ArtSlotId
+  readonly className?: string
+  /** Override the preload loader (tests inject a spy). */
+  readonly loader?: ArtLoader
+}
+
+export function ArtSlot({ id, className, loader }: ArtSlotProps) {
+  const entry = getArtSlot(id)
+
+  // A deferred slot warms on its first stable view. Eager slots are warmed at
+  // boot and on-mission-select slots by preloadForMission, so neither
+  // self-triggers here (that would defeat their priority).
+  useEffect(() => {
+    if (entry.priority === 'deferred') preloadSlot(id, loader)
+    // Re-warm only when the slot id changes; loader/entry are stable per id.
+  }, [id])
+  const alt = entry.text.kind === 'informative' ? entry.text.description : ''
+  const cls = className ? `art-slot ${className}` : 'art-slot'
+  return (
+    <div
+      className={cls}
+      data-testid={`art-slot-${id}`}
+      data-slot={id}
+      style={{ aspectRatio: String(entry.aspectRatio) }}
+    >
+      {entry.source.kind === 'image' ? (
+        <img className="art-slot-media" src={entry.source.url} alt={alt} />
+      ) : (
+        entry.source.render()
+      )}
+    </div>
+  )
+}
diff --git a/src/app/art/art.css b/src/app/art/art.css
new file mode 100644
index 0000000..25aabca
--- /dev/null
+++ b/src/app/art/art.css
@@ -0,0 +1,32 @@
+/* Art slot styling. The wrapper reserves aspect-ratio space so layout never
+   shifts before a source loads; the placeholder and the image both fill it. */
+.art-slot {
+  display: block;
+  width: 100%;
+  position: relative;
+  overflow: hidden;
+  background: var(--color-glass, #050a14);
+}
+
+.art-slot-media,
+.art-placeholder {
+  position: absolute;
+  inset: 0;
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+}
+
+.art-placeholder {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+}
+
+.art-placeholder-label {
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+  color: var(--color-glyph, #6cb6ff);
+  letter-spacing: 0.2em;
+  opacity: 0.45;
+  font-size: clamp(0.75rem, 3vw, 1.5rem);
+}
diff --git a/src/app/art/index.ts b/src/app/art/index.ts
index 55b2ba0..c3682d0 100644
--- a/src/app/art/index.ts
+++ b/src/app/art/index.ts
@@ -1,12 +1,10 @@
-// Minimal art slot registry. Section 10 builds the full 13-slot registry with
-// a source-swap function and preload priorities; this provides the hero slots
-// the push-in needs, resolving every URL through urlFor so a subpath deploy
-// cannot break. A graded CSS placeholder renders behind the image, so a
-// missing asset degrades to the placeholder rather than a broken image.
+// The art package surface. Two layers share this folder: the hero image-source
+// helpers the push-in uses (artSources/artNatural, keyed to the two hero
+// slots), and the full section-10 slot registry (13 slots, graded placeholders,
+// source swap, preload). Final art arrives by swapping sources in the registry;
+// no consumer changes.
 import { urlFor } from '../urlFor'
-import type { ArtSlotId } from '../hero/heroCrop'
-
-export type { ArtSlotId }
+import type { ArtSlotId as HeroArtSlotId } from '../hero/heroCrop'
 
 export interface ArtSources {
   readonly avif: string
@@ -18,18 +16,48 @@ export interface Size {
   readonly h: number
 }
 
-const NATURAL: Readonly<Record<ArtSlotId, Size>> = {
+const NATURAL: Readonly<Record<HeroArtSlotId, Size>> = {
   'hero-desktop': { w: 1600, h: 900 },
   'hero-portrait': { w: 1080, h: 1920 },
 }
 
-export function artSources(slot: ArtSlotId): ArtSources {
+export function artSources(slot: HeroArtSlotId): ArtSources {
   return { avif: urlFor(`art/${slot}.avif`), jpg: urlFor(`art/${slot}.jpg`) }
 }
 
-export function artNatural(slot: ArtSlotId): Size {
+export function artNatural(slot: HeroArtSlotId): Size {
   return NATURAL[slot]
 }
 
-/** Hero slots preload eagerly; below-fold and ending slots (section 10) lazy. */
+/** Hero slots preload eagerly; below-fold and ending slots lazy. */
 export const HERO_PRELOAD = 'eager' as const
+
+// The section-10 registry surface.
+export type {
+  ArtSlotId,
+  ArtSlotEntry,
+  ArtSource,
+  ArtPriority,
+  ArtText,
+  HeroCrop,
+  PlaceholderRenderer,
+} from './types'
+export {
+  getArtSlot,
+  allArtSlots,
+  slotsByPriority,
+  swapArtSource,
+  imageSource,
+  validateArtRegistry,
+  validateEntries,
+  __resetArtRegistry,
+} from './registry'
+export { ArtSlot, type ArtSlotProps } from './ArtSlot'
+export { PLACEHOLDERS } from './placeholders'
+export {
+  preloadEagerArt,
+  preloadForMission,
+  preloadSlot,
+  preloadAllArt,
+  type ArtLoader,
+} from './preload'
diff --git a/src/app/art/placeholders.tsx b/src/app/art/placeholders.tsx
new file mode 100644
index 0000000..a9af7a6
--- /dev/null
+++ b/src/app/art/placeholders.tsx
@@ -0,0 +1,69 @@
+// Graded CSS placeholder scenes, one per slot. Gradients and panel textures
+// built from the theme tokens: navy-black fields, electric blue accents, a
+// hammered gray-olive feel for rack and cabinet-adjacent slots, amber lamp dots
+// where the final art will show hardware. No images, no canvas, no animation.
+// Each renderer fills its container; the container (ArtSlot) owns the
+// aspect-ratio reservation.
+import type { CSSProperties, ReactNode } from 'react'
+import type { ArtSlotId, PlaceholderRenderer } from './types'
+import './art.css'
+
+type Variant = 'glass' | 'panel' | 'lamps' | 'ledger' | 'wall' | 'ending'
+
+const VARIANT_STYLE: Readonly<Record<Variant, CSSProperties>> = {
+  glass: {
+    background:
+      'radial-gradient(120% 90% at 50% 40%, #0d1a2e 0%, #050a14 70%), linear-gradient(180deg, #0a1322, #050a14)',
+    boxShadow: 'inset 0 0 60px rgba(108,182,255,0.18)',
+  },
+  panel: {
+    background:
+      'repeating-linear-gradient(135deg, #22241d 0 6px, #1b1d17 6px 12px)',
+  },
+  lamps: {
+    background:
+      'radial-gradient(circle at 12px 12px, #ffb84d 0 2px, transparent 3px) 0 0 / 20px 20px, #22241d',
+  },
+  ledger: {
+    background: 'linear-gradient(180deg, #081120, #050a14)',
+    boxShadow: 'inset 0 0 40px rgba(108,182,255,0.1)',
+  },
+  wall: {
+    background:
+      'repeating-linear-gradient(0deg, #0a1322 0 3px, #070e1a 3px 6px)',
+  },
+  ending: {
+    background: 'radial-gradient(90% 90% at 50% 50%, #0d1a2e, #050a14)',
+  },
+}
+
+function makePlaceholder(variant: Variant, label: string): PlaceholderRenderer {
+  const Placeholder = (): ReactNode => (
+    <div
+      className="art-placeholder"
+      data-testid="art-placeholder"
+      data-variant={variant}
+      style={VARIANT_STYLE[variant]}
+      aria-hidden="true"
+    >
+      <span className="art-placeholder-label">{label}</span>
+    </div>
+  )
+  return Placeholder
+}
+
+export const PLACEHOLDERS: Readonly<Record<ArtSlotId, PlaceholderRenderer>> = {
+  'hero-desktop': makePlaceholder('glass', 'WOPR'),
+  'hero-portrait': makePlaceholder('glass', 'WOPR'),
+  'hero-return': makePlaceholder('glass', 'WOPR'),
+  'menu-rack': makePlaceholder('lamps', 'RACK'),
+  'bezel-texture': makePlaceholder('panel', ''),
+  'countdown-insert': makePlaceholder('panel', ''),
+  'briefing-outlook': makePlaceholder('ledger', 'OUTLOOK'),
+  'briefing-flights': makePlaceholder('ledger', 'FLIGHTS'),
+  'briefing-bank': makePlaceholder('ledger', 'BANK'),
+  'failsafe-wall': makePlaceholder('wall', 'FAILSAFE'),
+  'ending-recovery': makePlaceholder('ending', 'RECOVERY'),
+  'ending-containment': makePlaceholder('ending', 'CONTAINMENT'),
+  'ending-failure': makePlaceholder('ending', 'FAILURE'),
+}
diff --git a/src/app/art/preload.ts b/src/app/art/preload.ts
new file mode 100644
index 0000000..6b4780b
--- /dev/null
+++ b/src/app/art/preload.ts
@@ -0,0 +1,61 @@
+// Priority-driven preload. A loader port (so tests can spy) plus three entry
+// points: an eager pass the app runs at boot, a per-mission warm for the three
+// briefing slots, and a deferred trigger for a slot's first stable view. The
+// default loader fetch-aheads an image; a placeholder source is a no-op. All
+// failures are silent to gameplay.
+import { allArtSlots, slotsByPriority, getArtSlot } from './registry'
+import type { ArtSlotEntry, ArtSlotId } from './types'
+
+export type ArtLoader = (entry: ArtSlotEntry) => void
+
+// Retain in-flight prefetch Images so they are not garbage-collected before the
+// fetch completes; drop each when it settles.
+const inFlight = new Set<HTMLImageElement>()
+
+const defaultLoader: ArtLoader = (entry) => {
+  if (entry.source.kind !== 'image') return // placeholders need no load
+  try {
+    const img = new Image()
+    const done = (): void => {
+      inFlight.delete(img)
+    }
+    img.onload = done
+    img.onerror = done
+    inFlight.add(img)
+    img.src = entry.source.url
+  } catch {
+    // A failed preload never breaks gameplay.
+  }
+}
+
+const BRIEFING_SLOTS: readonly ArtSlotId[] = [
+  'briefing-outlook',
+  'briefing-flights',
+  'briefing-bank',
+]
+
+/** Boot pass: warm every eager slot. */
+export function preloadEagerArt(loader: ArtLoader = defaultLoader): void {
+  for (const entry of slotsByPriority('eager')) loader(entry)
+}
+
+/** Warm the briefing slots when a mission is selected. */
+export function preloadForMission(
+  _missionId: string,
+  loader: ArtLoader = defaultLoader,
+): void {
+  for (const id of BRIEFING_SLOTS) loader(getArtSlot(id))
+}
+
+/** A deferred slot's first stable view warms it. */
+export function preloadSlot(
+  id: ArtSlotId,
+  loader: ArtLoader = defaultLoader,
+): void {
+  loader(getArtSlot(id))
+}
+
+/** For completeness: the full set, used by a prefetch-everything smoke pass. */
+export function preloadAllArt(loader: ArtLoader = defaultLoader): void {
+  for (const entry of allArtSlots()) loader(entry)
+}
diff --git a/src/app/art/registry.ts b/src/app/art/registry.ts
new file mode 100644
index 0000000..9a90c49
--- /dev/null
+++ b/src/app/art/registry.ts
@@ -0,0 +1,181 @@
+// The art slot registry: every id mapped to a graded placeholder at ship, with
+// reserved aspect ratio, load priority, and accessible-text declaration. The
+// media split swaps sources through swapArtSource only; nothing else changes.
+// Image URLs always resolve through urlFor so a subpath deploy cannot break.
+import { urlFor } from '../urlFor'
+import { HERO_CROPS } from '../hero/heroCrop'
+import { PLACEHOLDERS } from './placeholders'
+import type {
+  ArtPriority,
+  ArtSlotEntry,
+  ArtSlotId,
+  ArtSource,
+  HeroCrop,
+} from './types'
+
+/** Build an image source with a base-prefixed URL. The media split uses this. */
+export function imageSource(path: string): ArtSource {
+  return { kind: 'image', url: urlFor(path) }
+}
+
+function placeholder(id: ArtSlotId): ArtSource {
+  return { kind: 'placeholder', render: PLACEHOLDERS[id] }
+}
+
+// One source of truth for the hero calibration: derive the registry crop from
+// hero/heroCrop.ts (which the calibration tool refines) rather than copying the
+// numbers, so the two can never drift.
+function heroCropFor(id: 'hero-desktop' | 'hero-portrait'): HeroCrop {
+  const c = HERO_CROPS[id]
+  return { srcKey: id, glass: c.glass, greetingAnchor: c.greetingAnchor }
+}
+const HERO_DESKTOP_CROP: HeroCrop = heroCropFor('hero-desktop')
+const HERO_PORTRAIT_CROP: HeroCrop = heroCropFor('hero-portrait')
+
+function seed(): Record<ArtSlotId, ArtSlotEntry> {
+  const decorative = { kind: 'decorative' } as const
+  const info = (description: string) =>
+    ({ kind: 'informative', description }) as const
+  return {
+    'hero-desktop': {
+      id: 'hero-desktop',
+      source: placeholder('hero-desktop'),
+      aspectRatio: 16 / 9,
+      priority: 'eager',
+      text: decorative,
+      heroCrop: HERO_DESKTOP_CROP,
+    },
+    'hero-portrait': {
+      id: 'hero-portrait',
+      source: placeholder('hero-portrait'),
+      aspectRatio: 9 / 16,
+      priority: 'eager',
+      text: decorative,
+      heroCrop: HERO_PORTRAIT_CROP,
+    },
+    'hero-return': {
+      id: 'hero-return',
+      source: placeholder('hero-return'),
+      aspectRatio: 16 / 9,
+      priority: 'eager',
+      text: decorative,
+    },
+    'menu-rack': {
+      id: 'menu-rack',
+      source: placeholder('menu-rack'),
+      aspectRatio: 4 / 1,
+      priority: 'deferred',
+      text: decorative,
+    },
+    'bezel-texture': {
+      id: 'bezel-texture',
+      source: placeholder('bezel-texture'),
+      aspectRatio: 1,
+      priority: 'deferred',
+      text: decorative,
+    },
+    'countdown-insert': {
+      id: 'countdown-insert',
+      source: placeholder('countdown-insert'),
+      aspectRatio: 3 / 1,
+      priority: 'deferred',
+      text: decorative,
+    },
+    'briefing-outlook': {
+      id: 'briefing-outlook',
+      source: placeholder('briefing-outlook'),
+      aspectRatio: 4 / 3,
+      priority: 'on-mission-select',
+      text: info('A chart of how the mission is expected to unfold.'),
+    },
+    'briefing-flights': {
+      id: 'briefing-flights',
+      source: placeholder('briefing-flights'),
+      aspectRatio: 4 / 3,
+      priority: 'on-mission-select',
+      text: info('The flight board for the mission under review.'),
+    },
+    'briefing-bank': {
+      id: 'briefing-bank',
+      source: placeholder('briefing-bank'),
+      aspectRatio: 4 / 3,
+      priority: 'on-mission-select',
+      text: info('The ledger of balances tied to the mission.'),
+    },
+    'failsafe-wall': {
+      id: 'failsafe-wall',
+      source: placeholder('failsafe-wall'),
+      aspectRatio: 21 / 9,
+      priority: 'deferred',
+      text: info('The hidden global failsafe panel behind the terminal.'),
+    },
+    'ending-recovery': {
+      id: 'ending-recovery',
+      source: placeholder('ending-recovery'),
+      aspectRatio: 16 / 9,
+      priority: 'deferred',
+      text: info('The recovery ending: the machine learns and stands down.'),
+    },
+    'ending-containment': {
+      id: 'ending-containment',
+      source: placeholder('ending-containment'),
+      aspectRatio: 16 / 9,
+      priority: 'deferred',
+      text: info('The containment ending: the crisis is held, at a cost.'),
+    },
+    'ending-failure': {
+      id: 'ending-failure',
+      source: placeholder('ending-failure'),
+      aspectRatio: 16 / 9,
+      priority: 'deferred',
+      text: info('The failure ending: the only winning move was not to play.'),
+    },
+  }
+}
+
+let registry: Record<ArtSlotId, ArtSlotEntry> = seed()
+
+export function getArtSlot(id: ArtSlotId): ArtSlotEntry {
+  const entry = registry[id]
+  if (!entry) throw new Error(`art: no slot registered for id "${id}"`)
+  return entry
+}
+
+export function allArtSlots(): readonly ArtSlotEntry[] {
+  return Object.values(registry)
+}
+
+export function slotsByPriority(priority: ArtPriority): ArtSlotEntry[] {
+  return Object.values(registry).filter((e) => e.priority === priority)
+}
+
+/** Replace one slot's source, leaving aspect ratio, priority, text, and crop
+ *  intact. The whole interface the media split relies on. */
+export function swapArtSource(id: ArtSlotId, source: ArtSource): void {
+  const next = { ...getArtSlot(id), source }
+  if (import.meta.env.DEV) validateEntries([next])
+  registry[id] = next
+}
+
+/** Throws on an informative entry with a missing or empty description. Pure
+ *  over its input so the throw branch is directly testable. */
+export function validateEntries(entries: readonly ArtSlotEntry[]): void {
+  for (const entry of entries) {
+    if (entry.text.kind === 'informative' && !entry.text.description.trim()) {
+      throw new Error(`art: informative slot "${entry.id}" has no description`)
+    }
+  }
+}
+
+/** Throws in dev when the shipped registry has an informative entry with no
+ *  description. */
+export function validateArtRegistry(): void {
+  validateEntries(Object.values(registry))
+}
+
+/** Test-only: restore the shipped placeholder registry. */
+export function __resetArtRegistry(): void {
+  registry = seed()
+}
+
+if (import.meta.env.DEV) validateArtRegistry()
diff --git a/src/app/art/types.ts b/src/app/art/types.ts
new file mode 100644
index 0000000..903d6ba
--- /dev/null
+++ b/src/app/art/types.ts
@@ -0,0 +1,50 @@
+// Art slot types. The id union is fixed; the full registry (registry.ts) maps
+// every id to a graded placeholder now and an image URL later, swapped in one
+// place so no consumer code changes when final art lands.
+import type { ReactNode } from 'react'
+
+export type ArtSlotId =
+  | 'hero-desktop'
+  | 'hero-portrait'
+  | 'menu-rack'
+  | 'bezel-texture'
+  | 'briefing-outlook'
+  | 'briefing-flights'
+  | 'briefing-bank'
+  | 'failsafe-wall'
+  | 'countdown-insert'
+  | 'hero-return'
+  | 'ending-recovery'
+  | 'ending-containment'
+  | 'ending-failure'
+
+export type PlaceholderRenderer = () => ReactNode
+
+// HeroCrop rides with the hero slot entries (placeholder and final alike);
+// section 05 authors its own calibrated values in hero/heroCrop.ts and consumes
+// them there. This is the registry-level shape the media split fills in.
+export interface HeroCrop {
+  readonly srcKey: ArtSlotId
+  readonly glass: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
+  readonly greetingAnchor: { readonly x: number; readonly y: number }
+}
+
+export type ArtSource =
+  | { readonly kind: 'placeholder'; readonly render: PlaceholderRenderer }
+  | { readonly kind: 'image'; readonly url: string }
+
+export type ArtPriority = 'eager' | 'deferred' | 'on-mission-select'
+
+export type ArtText =
+  | { readonly kind: 'decorative' }
+  | { readonly kind: 'informative'; readonly description: string }
+
+export interface ArtSlotEntry {
+  readonly id: ArtSlotId
+  readonly source: ArtSource
+  /** Reserved layout space, so nothing shifts before a source loads. */
+  readonly aspectRatio: number
+  readonly priority: ArtPriority
+  readonly text: ArtText
+  readonly heroCrop?: HeroCrop
+}
diff --git a/src/app/games/TicTacToeView.tsx b/src/app/games/TicTacToeView.tsx
new file mode 100644
index 0000000..62bb012
--- /dev/null
+++ b/src/app/games/TicTacToeView.tsx
@@ -0,0 +1,87 @@
+// Replays the optimal game at a watchable pace on an injected cell renderer
+// (the character grid in production, any matrix stub in tests). Skippable, and
+// instant under reduced motion. Entirely outside campaign state; closing it
+// leaves nothing behind. Section 04's idle HELP wires LIST GAMES to mount this.
+import { useEffect, useRef, useState, type ReactNode } from 'react'
+import { playOptimalGame, boardAfter, type Cell, type Move } from './tictactoe'
+
+export interface TicTacToeViewProps {
+  /** Defaults to the module's own optimal game. */
+  readonly moves?: readonly Move[]
+  readonly renderBoard: (cells: readonly Cell[]) => ReactNode
+  readonly reducedMotion: boolean
+  readonly stepMs?: number
+  readonly onDone?: () => void
+}
+
+const DEFAULT_STEP_MS = 500
+
+export function TicTacToeView({
+  moves,
+  renderBoard,
+  reducedMotion,
+  stepMs = DEFAULT_STEP_MS,
+  onDone,
+}: TicTacToeViewProps) {
+  const list = moves ?? playOptimalGame().moves
+  const total = list.length
+  // Identity of the actual game, not the array reference, so a re-render with a
+  // fresh-but-equal move list does not restart playback or re-arm the latch.
+  const signature = list.map((m) => `${m.player}${m.cell}`).join(',')
+  const [revealed, setRevealed] = useState(() => (reducedMotion ? total : 0))
+  const doneFired = useRef(false)
+  const lastSignature = useRef(signature)
+
+  useEffect(() => {
+    // Only a NEW game re-arms the done latch; a motion or pace change does not,
+    // so onDone cannot re-fire for an already-finished game.
+    if (lastSignature.current !== signature) {
+      lastSignature.current = signature
+      doneFired.current = false
+    }
+    if (reducedMotion || total === 0) {
+      setRevealed(total)
+      return
+    }
+    setRevealed(0)
+    let count = 0
+    let timer: ReturnType<typeof setTimeout>
+    const tick = (): void => {
+      count += 1
+      setRevealed(count)
+      if (count < total) timer = setTimeout(tick, stepMs)
+    }
+    timer = setTimeout(tick, stepMs)
+    return () => clearTimeout(timer)
+  }, [signature, reducedMotion, stepMs])
+
+  useEffect(() => {
+    if (revealed >= total && total > 0 && !doneFired.current) {
+      doneFired.current = true
+      onDone?.()
+    }
+  }, [revealed, total, onDone])
+
+  const skip = (): void => setRevealed(total)
+  const complete = revealed >= total
+  const cells = boardAfter(list, revealed)
+
+  return (
+    <div className="tictactoe" data-testid="tictactoe">
+      <div data-testid="tictactoe-board">{renderBoard(cells)}</div>
+      <p className="tictactoe-status" data-testid="tictactoe-status">
+        {complete ? 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.' : null}
+      </p>
+      {!complete ? (
+        <button
+          type="button"
+          className="tictactoe-skip"
+          data-testid="tictactoe-skip"
+          onClick={skip}
+        >
+          SKIP
+        </button>
+      ) : null}
+    </div>
+  )
+}
diff --git a/src/app/games/index.ts b/src/app/games/index.ts
new file mode 100644
index 0000000..973f18d
--- /dev/null
+++ b/src/app/games/index.ts
@@ -0,0 +1,11 @@
+// The games package surface: the pure optimal game and its replay view.
+export {
+  playOptimalGame,
+  boardAfter,
+  type Player,
+  type Cell,
+  type Board,
+  type Move,
+  type GameResult,
+} from './tictactoe'
+export { TicTacToeView, type TicTacToeViewProps } from './TicTacToeView'
diff --git a/src/app/games/tictactoe.ts b/src/app/games/tictactoe.ts
new file mode 100644
index 0000000..fb8df0a
--- /dev/null
+++ b/src/app/games/tictactoe.ts
@@ -0,0 +1,92 @@
+// Tic-tac-toe played optimally by both sides, from the empty board to a draw.
+// The WOPR-learns-futility beat from the film, played straight: the machine
+// plays itself and cannot win. Pure functions over its own board type, zero
+// imports from engine or app state, deterministic by construction (ties in move
+// evaluation break by lowest cell index), so the emitted move list is identical
+// on every run.
+export type Player = 'X' | 'O'
+export type Cell = Player | null
+export type Board = readonly Cell[]
+
+export interface Move {
+  readonly player: Player
+  readonly cell: number
+}
+
+export interface GameResult {
+  readonly moves: readonly Move[]
+  readonly result: 'draw' | Player
+}
+
+const LINES: ReadonlyArray<readonly [number, number, number]> = [
+  [0, 1, 2],
+  [3, 4, 5],
+  [6, 7, 8],
+  [0, 3, 6],
+  [1, 4, 7],
+  [2, 5, 8],
+  [0, 4, 8],
+  [2, 4, 6],
+]
+
+function winner(board: Board): Player | null {
+  for (const [a, b, c] of LINES) {
+    const v = board[a]
+    if (v && v === board[b] && v === board[c]) return v
+  }
+  return null
+}
+
+function isFull(board: Board): boolean {
+  return board.every((c) => c !== null)
+}
+
+const other = (p: Player): Player => (p === 'X' ? 'O' : 'X')
+
+// Score from X's perspective: X win +1, O win -1, draw 0. Returns the chosen
+// cell too, lowest index among equally optimal moves (strict comparisons keep
+// the first seen, and cells are scanned in ascending order).
+function best(board: Cell[], player: Player): { score: number; cell: number } {
+  const win = winner(board)
+  if (win === 'X') return { score: 1, cell: -1 }
+  if (win === 'O') return { score: -1, cell: -1 }
+  if (isFull(board)) return { score: 0, cell: -1 }
+
+  let bestCell = -1
+  let bestScore = player === 'X' ? -Infinity : Infinity
+  for (let i = 0; i < 9; i++) {
+    if (board[i] !== null) continue
+    board[i] = player
+    const { score } = best(board, other(player))
+    board[i] = null
+    if (player === 'X' ? score > bestScore : score < bestScore) {
+      bestScore = score
+      bestCell = i
+    }
+  }
+  return { score: bestScore, cell: bestCell }
+}
+
+/** Play the whole game optimally. Both optimal means a draw, every time. */
+export function playOptimalGame(): GameResult {
+  const board: Cell[] = Array<Cell>(9).fill(null)
+  const moves: Move[] = []
+  let player: Player = 'X'
+  while (winner(board) === null && !isFull(board)) {
+    const { cell } = best(board, player)
+    board[cell] = player
+    moves.push({ player, cell })
+    player = other(player)
+  }
+  return { moves, result: winner(board) ?? 'draw' }
+}
+
+/** Apply the first n moves to a fresh board (for the replay view). */
+export function boardAfter(moves: readonly Move[], n: number): Cell[] {
+  const board: Cell[] = Array<Cell>(9).fill(null)
+  for (let i = 0; i < n && i < moves.length; i++) {
+    const move = moves[i]!
+    board[move.cell] = move.player
+  }
+  return board
+}
diff --git a/test/app/art/artslot.test.tsx b/test/app/art/artslot.test.tsx
new file mode 100644
index 0000000..3b79be9
--- /dev/null
+++ b/test/app/art/artslot.test.tsx
@@ -0,0 +1,102 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import { cleanup, render, screen } from '@testing-library/react'
+import {
+  ArtSlot,
+  swapArtSource,
+  imageSource,
+  __resetArtRegistry,
+  type ArtLoader,
+  type ArtSlotId,
+} from '@app/art'
+
+const ALL_IDS: readonly ArtSlotId[] = [
+  'hero-desktop',
+  'hero-portrait',
+  'menu-rack',
+  'bezel-texture',
+  'briefing-outlook',
+  'briefing-flights',
+  'briefing-bank',
+  'failsafe-wall',
+  'countdown-insert',
+  'hero-return',
+  'ending-recovery',
+  'ending-containment',
+  'ending-failure',
+]
+
+beforeEach(() => {
+  __resetArtRegistry()
+})
+afterEach(() => {
+  cleanup()
+  __resetArtRegistry()
+})
+
+describe('ArtSlot', () => {
+  it('reserves aspect-ratio space for every slot before any source loads', () => {
+    for (const id of ALL_IDS) {
+      const { unmount } = render(<ArtSlot id={id} />)
+      const el = screen.getByTestId(`art-slot-${id}`)
+      expect(el.style.aspectRatio).not.toBe('')
+      unmount()
+    }
+  })
+
+  it('renders the graded placeholder for a placeholder source', () => {
+    render(<ArtSlot id="hero-desktop" />)
+    expect(screen.getByTestId('art-placeholder')).toBeInTheDocument()
+  })
+
+  it('a deferred slot warms its loader on first stable view', () => {
+    const loaded: string[] = []
+    const spy: ArtLoader = (entry) => loaded.push(entry.id)
+    render(<ArtSlot id="menu-rack" loader={spy} />) // menu-rack is deferred
+    expect(loaded).toEqual(['menu-rack'])
+  })
+
+  it('an eager slot does not self-trigger the deferred loader', () => {
+    const loaded: string[] = []
+    const spy: ArtLoader = (entry) => loaded.push(entry.id)
+    render(<ArtSlot id="hero-desktop" loader={spy} />) // hero is eager
+    expect(loaded).toEqual([])
+  })
+
+  it('an on-mission-select slot does not self-trigger on view', () => {
+    const loaded: string[] = []
+    const spy: ArtLoader = (entry) => loaded.push(entry.id)
+    render(<ArtSlot id="briefing-outlook" loader={spy} />)
+    expect(loaded).toEqual([])
+  })
+
+  it('a decorative slot has an empty alt once swapped to an image', () => {
+    swapArtSource('hero-desktop', imageSource('art/hero-desktop.avif'))
+    render(<ArtSlot id="hero-desktop" />)
+    const img = screen
+      .getByTestId('art-slot-hero-desktop')
+      .querySelector('img')
+    expect(img).not.toBeNull()
+    expect(img).toHaveAttribute('alt', '')
+  })
+
+  it('an informative slot carries its description as alt once swapped to an image', () => {
+    swapArtSource('briefing-outlook', imageSource('art/briefing-outlook.avif'))
+    render(<ArtSlot id="briefing-outlook" />)
+    const img = screen
+      .getByTestId('art-slot-briefing-outlook')
+      .querySelector('img')
+    expect(img?.getAttribute('alt')?.length).toBeGreaterThan(0)
+    expect(img).toHaveAttribute('src')
+  })
+
+  it('the same consumer renders an image after a source swap (media-split contract)', () => {
+    render(<ArtSlot id="menu-rack" />)
+    expect(screen.getByTestId('art-placeholder')).toBeInTheDocument()
+    cleanup()
+    swapArtSource('menu-rack', imageSource('art/menu-rack.avif'))
+    render(<ArtSlot id="menu-rack" />)
+    expect(screen.queryByTestId('art-placeholder')).toBeNull()
+    const img = screen.getByTestId('art-slot-menu-rack').querySelector('img')
+    expect(img).toHaveAttribute('src')
+  })
+})
diff --git a/test/app/art/registry.test.ts b/test/app/art/registry.test.ts
new file mode 100644
index 0000000..b0f4ac9
--- /dev/null
+++ b/test/app/art/registry.test.ts
@@ -0,0 +1,138 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import {
+  allArtSlots,
+  getArtSlot,
+  slotsByPriority,
+  swapArtSource,
+  imageSource,
+  validateArtRegistry,
+  validateEntries,
+  __resetArtRegistry,
+  type ArtLoader,
+  type ArtSlotId,
+  type ArtSlotEntry,
+} from '@app/art'
+import { preloadEagerArt, preloadForMission } from '@app/art/preload'
+
+const ALL_IDS: readonly ArtSlotId[] = [
+  'hero-desktop',
+  'hero-portrait',
+  'menu-rack',
+  'bezel-texture',
+  'briefing-outlook',
+  'briefing-flights',
+  'briefing-bank',
+  'failsafe-wall',
+  'countdown-insert',
+  'hero-return',
+  'ending-recovery',
+  'ending-containment',
+  'ending-failure',
+]
+
+beforeEach(() => {
+  __resetArtRegistry()
+})
+afterEach(() => {
+  __resetArtRegistry()
+})
+
+describe('art registry', () => {
+  it('every ArtSlotId resolves to an entry with a placeholder and an aspect ratio', () => {
+    for (const id of ALL_IDS) {
+      const entry = getArtSlot(id)
+      expect(entry.id).toBe(id)
+      expect(entry.source.kind).toBe('placeholder')
+      expect(entry.aspectRatio).toBeGreaterThan(0)
+    }
+    expect(allArtSlots()).toHaveLength(ALL_IDS.length)
+  })
+
+  it('the shipped registry validates (every informative entry has a description)', () => {
+    expect(() => validateArtRegistry()).not.toThrow()
+    for (const entry of allArtSlots()) {
+      if (entry.text.kind === 'informative') {
+        expect(entry.text.description.trim().length).toBeGreaterThan(0)
+      }
+    }
+  })
+
+  it('validation throws for an informative entry with an empty description', () => {
+    const bad: ArtSlotEntry = {
+      ...getArtSlot('briefing-outlook'),
+      text: { kind: 'informative', description: '   ' },
+    }
+    expect(() => validateEntries([bad])).toThrow()
+    // The shipped entries do not trip it.
+    expect(() => validateEntries(allArtSlots())).not.toThrow()
+  })
+
+  it('hero slots are eager; briefing slots are on-mission-select; the rest deferred', () => {
+    const eager = slotsByPriority('eager').map((e) => e.id)
+    expect(eager).toContain('hero-desktop')
+    expect(eager).toContain('hero-portrait')
+    const onSelect = slotsByPriority('on-mission-select').map((e) => e.id)
+    expect(onSelect.sort()).toEqual([
+      'briefing-bank',
+      'briefing-flights',
+      'briefing-outlook',
+    ])
+  })
+
+  it('preload fires eager at boot and briefing only on mission select', () => {
+    const loaded: string[] = []
+    const spy: ArtLoader = (entry) => loaded.push(entry.id)
+
+    preloadEagerArt(spy)
+    expect(loaded).toContain('hero-desktop')
+    expect(loaded).not.toContain('briefing-outlook')
+
+    loaded.length = 0
+    preloadForMission('alpha', spy)
+    expect(loaded.sort()).toEqual([
+      'briefing-bank',
+      'briefing-flights',
+      'briefing-outlook',
+    ])
+  })
+
+  it('the default loader only fetch-aheads image sources (placeholders no-op)', () => {
+    const ImageSpy = vi.fn()
+    vi.stubGlobal(
+      'Image',
+      class {
+        set src(_v: string) {
+          ImageSpy()
+        }
+      },
+    )
+    // All slots ship as placeholders: the default loader must not construct any
+    // Image for them.
+    preloadEagerArt()
+    expect(ImageSpy).not.toHaveBeenCalled()
+    vi.unstubAllGlobals()
+  })
+
+  it('swapping a source to an image routes the URL through urlFor and keeps everything else', () => {
+    const before = getArtSlot('menu-rack')
+    swapArtSource('menu-rack', imageSource('art/menu-rack.avif'))
+    const after = getArtSlot('menu-rack')
+    expect(after.source.kind).toBe('image')
+    if (after.source.kind === 'image') {
+      // urlFor prefixes BASE_URL; in test that is '/', so the path is preserved.
+      expect(after.source.url).toContain('art/menu-rack.avif')
+    }
+    expect(after.aspectRatio).toBe(before.aspectRatio)
+    expect(after.priority).toBe(before.priority)
+    expect(after.text).toEqual(before.text)
+  })
+
+  it('a hero source swap preserves the heroCrop metadata', () => {
+    const before = getArtSlot('hero-desktop')
+    expect(before.heroCrop).toBeDefined()
+    swapArtSource('hero-desktop', imageSource('art/hero-desktop.avif'))
+    const after = getArtSlot('hero-desktop')
+    expect(after.heroCrop).toEqual(before.heroCrop)
+    expect(after.text).toEqual(before.text)
+  })
+})
diff --git a/test/app/games/tictactoe.test.ts b/test/app/games/tictactoe.test.ts
new file mode 100644
index 0000000..1dd4dbb
--- /dev/null
+++ b/test/app/games/tictactoe.test.ts
@@ -0,0 +1,49 @@
+import { readFileSync } from 'node:fs'
+import { resolve } from 'node:path'
+import { describe, expect, it } from 'vitest'
+import { playOptimalGame, boardAfter } from '@app/games'
+
+describe('optimal tic-tac-toe', () => {
+  it('two optimal players reach a draw from the empty board', () => {
+    const game = playOptimalGame()
+    expect(game.result).toBe('draw')
+    // A draw fills the board: nine moves, every cell taken.
+    expect(game.moves).toHaveLength(9)
+    const final = boardAfter(game.moves, game.moves.length)
+    expect(final.every((c) => c !== null)).toBe(true)
+  })
+
+  it('the move list is deterministic across independent runs', () => {
+    const a = playOptimalGame()
+    const b = playOptimalGame()
+    expect(a.moves).toEqual(b.moves)
+  })
+
+  it('alternates X and O starting with X, each cell used once', () => {
+    const { moves } = playOptimalGame()
+    moves.forEach((m, i) => {
+      expect(m.player).toBe(i % 2 === 0 ? 'X' : 'O')
+    })
+    const cells = moves.map((m) => m.cell).sort((x, y) => x - y)
+    expect(cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
+  })
+
+  it('is pure: boardAfter never mutates the move list and is reproducible', () => {
+    const { moves } = playOptimalGame()
+    const first = boardAfter(moves, 5)
+    const second = boardAfter(moves, 5)
+    expect(first).toEqual(second)
+    expect(moves).toHaveLength(9)
+  })
+
+  it('imports nothing from app state or the engine (dependency-free by construction)', () => {
+    const src = readFileSync(
+      resolve(process.cwd(), 'src/app/games/tictactoe.ts'),
+      'utf8',
+    )
+    expect(src).not.toMatch(/from ['"].*app\/state/)
+    expect(src).not.toMatch(/from ['"]@app\/state/)
+    expect(src).not.toMatch(/from ['"]@engine/)
+    expect(src).not.toMatch(/from ['"].*\/engine/)
+  })
+})
diff --git a/test/app/games/view.test.tsx b/test/app/games/view.test.tsx
new file mode 100644
index 0000000..b5d589c
--- /dev/null
+++ b/test/app/games/view.test.tsx
@@ -0,0 +1,75 @@
+import { afterEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { TicTacToeView } from '@app/games'
+import type { Cell } from '@app/games'
+
+function renderBoard(cells: readonly Cell[]) {
+  return (
+    <span data-testid="board">
+      {cells.map((c) => c ?? '.').join('')}
+    </span>
+  )
+}
+
+function filled(cells: string): number {
+  return cells.split('').filter((c) => c !== '.').length
+}
+
+afterEach(() => {
+  cleanup()
+  vi.useRealTimers()
+})
+
+describe('TicTacToeView', () => {
+  it('reveals moves one at a time at a watchable pace', () => {
+    vi.useFakeTimers()
+    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={false} stepMs={300} />)
+    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(0)
+    act(() => {
+      vi.advanceTimersByTime(300)
+    })
+    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(1)
+    act(() => {
+      vi.advanceTimersByTime(300)
+    })
+    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(2)
+  })
+
+  it('skip jumps to the final drawn board, which stays readable', () => {
+    vi.useFakeTimers()
+    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={false} />)
+    fireEvent.click(screen.getByTestId('tictactoe-skip'))
+    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(9)
+    expect(screen.queryByTestId('tictactoe-skip')).toBeNull()
+    expect(screen.getByTestId('tictactoe-status')).toHaveTextContent(
+      'NOT TO PLAY',
+    )
+  })
+
+  it('renders the final board instantly under reduced motion', () => {
+    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={true} />)
+    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(9)
+    expect(screen.queryByTestId('tictactoe-skip')).toBeNull()
+  })
+
+  it('does not re-fire onDone when a prop changes after completion', () => {
+    const onDone = vi.fn()
+    const { rerender } = render(
+      <TicTacToeView
+        renderBoard={renderBoard}
+        reducedMotion={true}
+        onDone={onDone}
+      />,
+    )
+    expect(onDone).toHaveBeenCalledTimes(1)
+    // A motion/pace flip after the game is done must not re-arm the latch.
+    rerender(
+      <TicTacToeView
+        renderBoard={renderBoard}
+        reducedMotion={false}
+        onDone={onDone}
+      />,
+    )
+    expect(onDone).toHaveBeenCalledTimes(1)
+  })
+})
