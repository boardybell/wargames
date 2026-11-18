# Review Triage: 02-terminal-shell / section-01-app-scaffold

Mode: autonomous. The review confirmed config isolation, additive tsconfig,
overlay router, App root structure, fonts, and dep footprint all correct.
Dispositions:

## Fixed
- **HIGH-1 (scanner fails open on backtick/concatenation).** The no-raw-paths
  scanner only matched double-quote and single-quote forms, waving through
  the template-literal and concatenation asset URLs that sections 07 (audio)
  and 10 (art) will actually write. Rewrote every pattern to include the
  backtick in its quote class (`["'\`]`), added `src={...}` brace handling,
  the `new URL`/`fetch` backtick forms, and a `'/' + ...` concatenation
  pattern. Added a teeth-proof test asserting the scanner catches backtick,
  concatenation, and single-quote raw paths AND leaves sanctioned `urlFor`
  forms clean.
- **MED-2 (urlFor empty/root untested).** Added `urlFor('')` and `urlFor('/')`
  tests (both resolve to the base root, no double slash) and documented the
  Vite-guarantees-a-trailing-slash assumption in the function comment.
- **LOW-6 (silent missing #root).** main.tsx now throws on a missing #root
  rather than no-op'ing to a blank page.

## Confirmed correct (no change)
- Coverage include stays `src/engine/**` (app code intentionally uncovered;
  no bleed across projects).
- React plugin applied globally is a no-op for the node engine project.
- built-html test is non-vacuous (asserts >0 local refs); at scaffold stage
  the only ref is the hashed bundle, which is fine — the scanner (now
  hardened) guards hand-written asset URLs.
- tsconfig additive-only; runtime deps only react + react-dom; no em-dashes;
  no external origins; overlay router model sound and extensible.

## Verification
tsc 0, eslint 0, 236 tests green (both projects in one run), `npm run build` OK.
