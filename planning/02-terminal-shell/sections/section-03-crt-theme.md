# Section 03: CRT Theme and Presentation Layer

Section id: `section-03-crt-theme`. Implements `src/app/theme/` and `src/app/crt/` for the 02-terminal-shell split of SHALL WE PLAY A GAME?, a WarGames-inspired browser game. This section delivers the visual identity of the terminal: palette tokens, font loading, the layered CRT effect stack, the reduce-glow degradation path, and the type-in text effect hook. Everything downstream (terminal framework, hero scene, cabinet chrome) renders inside this presentation layer.

## Background and context

The project is a React 18+ / Vite / TypeScript static site deployed to GitHub Pages at a subpath. The headless game engine lives in `src/engine/` and is out of scope here; this section is purely presentational and has no engine dependency. The app shell scaffold (Vite config, jsdom Vitest project under `test/app/`, Testing Library dev deps, self-hosted fonts under `public/fonts/`, the `urlFor(path)` base-aware URL helper) is provided by section-01-app-scaffold, which is the only hard dependency. This section is parallelizable with section-02 (engine binding) and blocks section-04 (terminal framework) and section-05 (hero push-in).

Visual anchor: `planning/reference/crt-reference.jpg`. The look is an electric blue dot-matrix terminal on navy-black glass with a thin luminous border and a left-aligned column. Effect intensity is cinematic by default with a reduce-glow toggle. Dependency footprint is locked: react, react-dom only; no UI, animation, or audio libraries. House rule: no em-dashes anywhere, including comments and strings.

The in-app motion setting and `useMotionPreference` hook are owned by section-09-a11y-glossary. This section must consume motion preference through a narrow interface (a boolean prop or a small injected hook signature) so the type-in hook can be built and tested now with a local stand-in and rewired to the real hook when section-09 lands. Do not duplicate section-09's implementation.

## Tests first

Write these in `test/app/theme/` and `test/app/crt/` under the jsdom Vitest project before implementing. Stubs describe what to assert, not how.

Type-in hook tests (`test/app/crt/type-in.test.tsx`):

- Reveals authored text progressively over time (fake timers) at a period-plausible character rate.
- Emits a key-tick cue callback per revealed character (spy on the cue callback; the audio engine itself is section-07 and is not imported here).
- Any non-consumed keypress, click, or tap completes the reveal instantly; the triggering event is considered handled by the type-in (the swallowing semantics are enforced by section-04's key-handler precedence stack; here assert the hook exposes a complete() path and a running flag the stack can consult).
- The full text exists in the DOM from the first render for assistive technology; the effect is visual clipping only (assert text content is complete while the visible portion is partial).
- Instant completion under prefers-reduced-motion (mock matchMedia) and under the in-app motion override (the injected preference).
- Completion fires an onComplete callback exactly once whether the reveal ran to the end or was skipped.

Theme and overlay tests (`test/app/theme/tokens.test.ts`, `test/app/crt/layers.test.tsx`):

- Automated contrast assertions: glyph core color, dim secondary text color, and focus ring color against the glass background, each computed INCLUDING the vignette's darkest overlap (composite the vignette's maximum darkening over the background color in the test, then run the WCAG contrast formula), all clearing 4.5:1 AA. The vignette strength constant is imported from the theme module so the test constrains it: if someone deepens the vignette past the AA boundary, this test fails. Write a small pure contrastRatio(fg, bg) helper in the test utilities (or theme module) rather than pulling a dependency.
- Reduce-glow: applying the reduce-glow class (single class on the glass container) removes the outer text-shadow layers and the breathing-glow layer; assert via class presence and the documented CSS contract (jsdom cannot compute real shadows, so assert the class toggling logic and that the stylesheet defines the override; a snapshot of the container class list under both settings is sufficient).
- Cursor span and scanline overlay elements carry `pointer-events: none` styling hooks and `aria-hidden="true"`.
- Vignette and scanline overlays are render-static: no animation properties other than the breathing layer's opacity tween; assert the breathing layer is absent when reduce-glow is active.

## Implementation

### Files to create

    src/app/theme/tokens.ts        palette constants and vignette strength
    src/app/theme/fonts.css        @font-face for Glass TTY VT220 + VT323
    src/app/theme/theme.css        global tokens as CSS custom properties
    src/app/crt/GlassContainer.tsx glass frame, overlay layers, border
    src/app/crt/crt.css            layer stack styles, reduce-glow override
    src/app/crt/Cursor.tsx         blinking block cursor span
    src/app/crt/useTypeIn.ts       type-in effect hook
    test/app/theme/tokens.test.ts
    test/app/crt/layers.test.tsx
    test/app/crt/type-in.test.tsx

### Palette tokens (src/app/theme/tokens.ts)

Export named constants consumed by both CSS custom properties and the contrast tests:

- Glass background near `#050A14`.
- Glyph core electric blue near `#6CB6FF`, verified 4.5:1 against the background at the vignette's darkest overlap. Adjust the exact hex if the composite check fails; the AA check constrains the palette, not the other way around.
- Dim blue for secondary text, still AA at the same worst case.
- Amber and red reserved for cabinet chrome only (section-08); define the tokens here so there is one palette module, but nothing in theme/crt uses them.
- A `VIGNETTE_MAX_DARKEN` constant (0 to 1) exported for the contrast test composite. Contrast is measured at the vignette's darkest overlap; vignette strength is constrained by the AA check.

Status colors always pair with text elsewhere in the app; the tokens module documents that rule in a comment.

### Fonts (src/app/theme/fonts.css)

Both Glass TTY VT220 (public domain) and VT323 are self-hosted woff2 under `public/fonts/` (placed by section-01); zero external font requests. Declare `@font-face` with `font-display: swap`, falling through Glass TTY to VT323 to generic monospace in the family stack. Font URLs go through the base-aware path convention (CSS `url()` relative to the built asset, or the `urlFor` helper where referenced from TS); never a raw absolute `/fonts/` path. Sizes are chosen to respect the font's raster character; line-height and letter-spacing are calibrated once against `planning/reference/crt-reference.jpg` and the chosen values documented in a short comparison note committed alongside the theme (a comment block or a small markdown note in `src/app/theme/` recording the calibration screenshots and final values).

### CRT layer stack (src/app/crt/GlassContainer.tsx, crt.css)

The glass container wraps real DOM text with pre/output semantics. Layers, bottom to top:

1. Text layer: actual DOM text with a layered `text-shadow` on glyphs: tight core, mid halo, wide faint halo.
2. Scanline overlay: `repeating-linear-gradient`, 3 to 4 px device-aligned period, `pointer-events: none`, `aria-hidden`.
3. Radial vignette overlay, static, strength tied to `VIGNETTE_MAX_DARKEN`.
4. Thin luminous border via `box-shadow` on the container.
5. Optional breathing-glow layer animating ONLY opacity.
6. Cursor: a span with an `opacity` animation using `steps(2)` for a hard blink.

Hard constraints: no `filter` or shadow property is ever animated; `backdrop-filter` is not used; overlays are static layers (performance on mid-tier phones is a named risk, mitigated exactly this way). `::selection` resets `text-shadow` so selected text stays readable.

Reduce-glow: one class on the container (for example `crt-reduce-glow`) whose CSS drops the outer shadow layers (keeping the tight core shadow) and removes the breathing layer. The setting itself is surfaced in settings (section-06); this section exposes the class and a prop on GlassContainer.

GlassContainer stub shape:

    interface GlassContainerProps {
      reduceGlow: boolean
      children: ReactNode
    }
    function GlassContainer(props: GlassContainerProps): JSX.Element
      // Renders the layer stack; toggles the reduce-glow class; overlays are
      // aria-hidden siblings of the text layer, never parents of it.

### Type-in hook (src/app/crt/useTypeIn.ts)

    interface TypeInOptions {
      text: string
      onTick?: () => void        // key-tick cue per revealed character
      onComplete?: () => void    // exactly once, reveal or skip
      reducedMotion: boolean     // injected; section-09 provides the real hook
    }
    interface TypeInState {
      visibleCount: number       // characters currently revealed
      running: boolean           // true while the effect is in progress
      complete: () => void       // reveal everything now
    }
    function useTypeIn(opts: TypeInOptions): TypeInState

Behavior: reveals authored lines character by character at a period-plausible rate (pick a per-character interval in the 20 to 45 ms band and keep it a named constant); each revealed character fires `onTick`. Any key, click, or tap completes it instantly via `complete()`; the surrounding component or the section-04 key-handler decides which events reach it (precedence: a running type-in consumes any non-consumed key, which completes it and swallows the keystroke, so for example pressing 1 during the menu type-in completes the text and does NOT select row one; that collision test lives in section-04, but the hook must expose `running` so the stack can implement it).

Accessibility contract: the full text is present in the DOM immediately; the effect visually clips the unrevealed remainder (for example a wrapper that renders the whole string with the tail in a visually-hidden-but-present treatment, or rendering full text with `aria-hidden` mirroring reversed; choose the approach where assistive tech reads the complete text from first render and sighted users see the progressive reveal). Under `prefers-reduced-motion` or when `reducedMotion` is true, the reveal is instant: `visibleCount` starts at full length, `running` is false, `onComplete` still fires once.

Note on preference change mid-animation (review integration 13): in-flight animations complete rather than abort when the preference flips; for the type-in, a flip to reduced motion during a reveal may simply complete it, which satisfies the rule.

## Definition of done

- All tests above green under `npm test` (jsdom project, alongside the untouched engine node project).
- GlassContainer, Cursor, useTypeIn, and the token module exported for section-04 and section-05 consumption.
- Contrast test imports live palette and vignette constants so future palette edits are regression-guarded.
- Font calibration values documented in-repo.
- Manual browser verification of the actual glow look against crt-reference.jpg is explicitly deferred to the split-wide manual smoke checklist (owned by section-10) and the deployment split's Playwright pass; this section's bar is jsdom-green plus the stylesheet contracts.

## Dependencies

- section-01-app-scaffold: Vite/Vitest/jsdom project, fonts in `public/fonts/`, `urlFor` helper. Required before starting.
- section-09-a11y-glossary: the real `useMotionPreference` hook. Not required to start; consume motion preference via the injected `reducedMotion` option and rewire when available.
- Blocks section-04 (terminal framework renders inside GlassContainer and uses useTypeIn) and section-05 (hero push-in crossfades into the glass container and starts the greeting type-in).
## As Built (section-03 implementation)

Built and committed. 280 tests green; tsc, eslint, and the production build clean.

- src/app/theme/: tokens.ts (AA-guarded palette + contrast helpers; VIGNETTE_MAX_DARKEN 0.25 chosen against the AA boundary), fonts.ts (injectFontFaces via urlFor), theme.ts (initTheme publishes tokens as :root CSS vars + injects fonts), theme.css, CALIBRATION.md.
- src/app/crt/: GlassContainer (aria-hidden sibling overlays; breathing layer removed from the DOM under reduce-glow), crt.css (text halos, scanlines, static vignette above text, breathing + cursor opacity-only animations, luminous border, reduced-motion disables animation), Cursor, useTypeIn (reveal + onTick + complete + exactly-once onComplete + reduced-motion instant + clean text-change restart).
- Wired initTheme into main.tsx boot.
- Review fixes: useTypeIn resets on text change (was swallowing onComplete); binding-constraint test tied to the live vignette constant; breathe base opacity so reduced motion lands dim; scanline-exclusion documented.
- Downstream note: the full-text-in-DOM accessibility contract is the CALLER's responsibility (the hook returns only visibleCount); section 04/05 must render the complete text for assistive tech.
