# Review Triage: 02-terminal-shell / section-03-crt-theme

Mode: autonomous. The reviewer confirmed contrast math correctness, the
vignette worst-case model, GlassContainer sibling/aria structure, the CSS
animation constraints (only breathe + cursor opacity animate; no filter,
no backdrop-filter; ::selection resets shadow; reduced-motion disables
animation), and font injection via urlFor. Dispositions:

## Fixed
- **MUST-FIX (useTypeIn text-change reset).** completedRef was never reset and
  visibleCount was not reset on a text prop change, so onComplete was
  swallowed for the new string and a shorter string could render a stale
  tail. The effect now clears completedRef and resets visibleCount (and
  running) on every run. New test: rerender with new text asserts the reveal
  resets to empty and onComplete fires a second time.
- **SHOULD-FIX (dead-literal binding test).** The "binding constraint" test
  used a magic 0.45; it now ties to the LIVE VIGNETTE_MAX_DARKEN (asserts the
  glyph clears AA at the constant but breaches at constant + 0.2).
- **SHOULD-FIX (breathe at full opacity under reduced motion).** .crt-breathe
  now has a base opacity of 0.4 (the dim end of the tween), so animation:none
  lands dim rather than full strength.
- **SHOULD-FIX (scanline darkening excluded).** Documented in contrastAtVignette
  that scanline darkening is intentionally not composited (plan scopes the
  automated guard to the vignette; the deploy Playwright pass covers the full
  composite).
- **NICE (dead CSS rule).** Removed the dead .crt-reduce-glow .crt-breathe
  display:none (the element is not rendered under reduce-glow).

## Noted for downstream
- The full-text-in-DOM accessibility contract is delegated to the CALLER (the
  hook returns only visibleCount). Section 04/05, the real consumers, must
  render the complete text for assistive tech; flagged as a section-04
  acceptance criterion.

## Verification
tsc 0, eslint 0, 280 tests green, npm run build emits the CSS.
