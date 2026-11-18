# Code Review: 02-terminal-shell / section-03-crt-theme

Reviewer: deep-implement code-reviewer subagent (adversarial).

Confirmed correct: WCAG contrastRatio, the vignette darkest-overlap worst
case (dims glyph AND bg, strictly adversarial), the test genuinely
constraining the live palette + vignette constant, GlassContainer overlays as
aria-hidden siblings (breathe removed from DOM under reduce-glow), crt.css
animating only breathe + cursor opacity (no filter, no backdrop-filter,
::selection resets shadow, reduced-motion disables animation), font injection
via urlFor with a double-injection guard, tokens as the single CSS-var source,
no em-dashes, only react/react-dom.

Findings:
- MUST-FIX: useTypeIn did not reset on a text-prop change (completedRef/visibleCount). FIXED + test.
- SHOULD: dead-literal binding-constraint test (tied to live constant now); breathe full opacity under reduced motion (base opacity added); scanline darkening not composited (documented).
- NICE: dead reduce-glow breathe CSS rule (removed); accessibility full-text contract lives in the caller (flagged for section 04).

See section-03-interview.md for dispositions.
