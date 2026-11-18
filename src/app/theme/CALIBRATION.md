# Terminal Type Calibration

Reference: `planning/reference/crt-reference.jpg` (electric blue dot-matrix on
navy-black glass, left-aligned column, thin luminous border).

## Final values (theme.css custom properties)

- Font stack: `'Glass TTY VT220', 'VT323', ui-monospace, monospace`. Glass TTY
  VT220 carries the DEC raster character; VT323 is the fallback with the same
  terminal feel; generic monospace is the last resort.
- `--terminal-line-height: 1.35`. The raster glyphs want air between rows to
  read as scanned lines rather than a solid block, matching the reference's
  row rhythm.
- `--terminal-letter-spacing: 0.04em`. A hair of tracking separates the dot
  cells so adjacent glyphs do not bleed, again per the reference.

## Palette (tokens.ts, the contrast-guarded source of truth)

- Glass background `#050A14`; glyph `#6CB6FF`; dim `#7FB0E0`; focus `#9FD8FF`.
- `VIGNETTE_MAX_DARKEN = 0.25`: the strongest vignette darkening that keeps
  glyph, dim, and focus above WCAG AA 4.5:1 at the vignette's darkest overlap
  (glyph 5.41:1, dim 5.13:1, focus 7.38:1 at that worst case).

## Manual verification

The actual glow look against the reference is verified in a browser during
the split-wide manual smoke (section 10) and the deploy Playwright pass; this
section's automated bar is jsdom-green plus the contrast and stylesheet
contract tests.
