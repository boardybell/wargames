# Section 01: App Scaffold

Vite + React application scaffold for the terminal shell of SHALL WE PLAY A GAME?, built beside the existing headless engine. This section has no dependencies within the split and blocks every other section. It delivers the src/app tree, the jsdom Vitest project, Testing Library dev dependencies, base-path handling with the urlFor helper and its no-raw-absolute-paths check, the self-hosted fonts, the App shell with a screen router skeleton and dialog host, and the built-HTML base smoke test.

## Background

The repo at `/Users/darkpool/wargames` already contains the engine from split 01: pure TypeScript under `src/engine/`, zero DOM dependencies, tested in Node through a Vitest project named `engine` (environment node, glob `test/engine/**/*.test.ts`, `@engine` alias, v8 coverage scoped to `src/engine/**`, flat ESLint config with a purity gate path-scoped to `src/engine/**`). Runtime deps so far are exactly `pure-rand` and `valibot`. The engine exposes createCampaign, dispatch, advanceToNow, selectors, a save codec with a storage port, and a test-double mission via `@engine/testing`. Vitest 4 is in use, so projects live in `vitest.config.ts` (no workspace file).

The shell this split builds is the player-facing frame: React 18+, Vite, TypeScript, static build, deployed to a GitHub Pages project site. That deployment target drives a hard rule: every asset URL must derive from Vite's base so the app works at `/wargames/` and at `/`. Dependency footprint stays minimal: `react` and `react-dom` are the only new runtime dependencies. No UI, animation, or audio libraries ever. The shell lives in `src/app/`; tests mirror it under `test/app/` in a new jsdom Vitest project appended beside the engine's node project. House rules: no em-dashes anywhere in code, comments, or strings; zero external network requests (fonts self-hosted).

This section builds scaffolding only. It must not implement engine binding, CRT styling, terminal primitives, audio, or accessibility behavior; those are later sections. What it must get right is the config surface every later section assumes: both Vitest projects green in one `npm test` run, the `urlFor` discipline enforced mechanically, fonts in place, and an App root whose structure (screen root, dialog host, reserved sibling position for live regions) later sections extend without restructuring.

## Tests First

Write these before implementing. They live under `test/app/` unless noted. TDD block 13 is the core; stubs and docstrings suffice wherever behavior is obvious from the name.

### Base-path discipline (TDD block 13)

1. `test/app/build/urlFor.test.ts`: `urlFor(path)` prefixes `import.meta.env.BASE_URL` onto every asset reference. Assert: joins without double slashes whether or not the caller leads with `/`, returns base-relative URLs for nested paths (`fonts/glass-tty.woff2`, `audio/cue.wav`), and is a pure string function (no DOM).
2. `test/app/build/no-raw-paths.test.ts`: a Node-environment test (per-file `// @vitest-environment node` override) that walks every file under `src/app/**` and fails on raw absolute asset references: `src="/`, `href="/`, `url(/`, `fetch('/`, `new URL('/`, string literals matching `^/(?:fonts|audio|art|assets)/`. Allowlist nothing; the only sanctioned path to an asset URL is `urlFor`. Keep the scanner dumb and loud; false positives get fixed by rewriting the source through `urlFor`, not by widening the allowlist.
3. `test/app/build/built-html.test.ts`: a Node-environment test that invokes Vite's programmatic `build()` with `base: '/wargames/'` into a temp outDir (use the session scratchpad or an OS temp dir, cleaned after), parses the emitted `index.html`, and asserts every `src` and `href` attribute referencing a local asset starts with `/wargames/`. This is the smoke that proves subpath deployment cannot silently break. It is slow relative to unit tests; that is acceptable, it still runs inside `npm test`.

### Vitest project split (TDD block 13)

4. `test/app/smoke.test.tsx`: renders the App component with Testing Library inside jsdom and asserts the root mounts (screen root present, dialog host present). Proves the jsdom project, the React plugin pipeline, JSX, and alias resolution all work.
5. Both projects green in one run: `npm test` executes engine tests under node and app tests under jsdom. Verified by the run itself, not by a meta test; the acceptance checklist pins it.

### Scaffold structure

6. `test/app/router.test.tsx`: the screen router skeleton renders the component registered for the current ScreenId and renders the plain fallback frame for an unregistered id. Assert that `settings` and `help` are representable as overlays over an active screen rather than exclusive screens (shape-level test on the router's props or state model; no overlay behavior yet, that is section 06).
7. Font presence check inside `no-raw-paths` or its own small node test: `public/fonts/` contains the Glass TTY VT220 woff2 and the VT323 woff2, and no file under `src/app/**` or `index.html` references fonts.googleapis.com, fonts.gstatic.com, or any other external origin.

## Implementation

All paths relative to `/Users/darkpool/wargames`.

### 1. package.json additions

Runtime dependencies: add `react` (18+) and `react-dom` (matching). Total runtime surface after this section: react, react-dom, pure-rand, valibot. Dev dependencies: `@vitejs/plugin-react`, `vite`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@types/react`, `@types/react-dom`. Scripts: add `dev` (`vite`), `build` (`vite build`), `preview` (`vite preview`). `test` stays `vitest run` (the manifest's test command is `npm test`); `typecheck` and `lint` already exist from the engine split. Do not register a preview service in services.json; split 08 owns that.

### 2. vite.config.ts

Create at repo root:

- `base` from an environment variable with a local default of `/wargames/` (subpath parity testing is the default posture; split 08's CI derives the real value). Something like `process.env.VITE_BASE ?? '/wargames/'`.
- React plugin.
- `resolve.alias` for `@engine` and `@app` mirroring tsconfig.

`index.html` at repo root per Vite convention: minimal document, `<div id="root">`, title SHALL WE PLAY A GAME?, no external references of any kind, `lang="en"`, dark `color-scheme` meta. Font preloading and CSS belong to section 03; do not add `<link>` font tags here.

### 3. tsconfig.json extensions

Additive changes only (the engine config must keep working): add `"jsx": "react-jsx"`, add `DOM` and `DOM.Iterable` to `lib`, add path aliases `@app/*` -> `src/app/*` and `@app` -> `src/app/index.ts` beside the existing `@engine` aliases, ensure `include` covers `src` and `test` (it already does). Add `"types": ["vite/client"]` or an `env.d.ts` with `/// <reference types="vite/client" />` under `src/app/` so `import.meta.env.BASE_URL` type-checks. The ESLint purity gate stays path-scoped to `src/engine/**` and is untouched; app code may read the DOM freely.

### 4. vitest.config.ts: append the app project

Beside the existing `engine` project, add a project named `app`: `extends: true`, `environment: 'jsdom'`, include `test/app/**/*.test.{ts,tsx}`, `setupFiles` pointing at `test/app/setup.ts` (registers `@testing-library/jest-dom` matchers), aliases resolved for both `@engine` and `@app`. Leave the engine project untouched; this addition is a pure append, exactly as the engine split's config anticipated. The two Node-environment build tests under `test/app/build/` opt out of jsdom per file with the `@vitest-environment node` pragma rather than a third project.

### 5. Directory skeleton

Create the src/app tree with placeholder index files only where a test imports them:

    src/app/
      main.tsx            createRoot, render App; the only side-effectful module
      App.tsx             root layout: screen root, dialog host, live-region slot
      router.tsx          ScreenId union, registry type, router skeleton, fallback
      urlFor.ts           the base-aware URL helper
      theme/              (section 03)
      crt/                (section 03)
      hero/               (section 05)
      screens/            (sections 04, 06)
      terminal/           (section 04)
      grid/               (section 08)
      cabinet/            (section 08)
      audio/              (section 07)
      a11y/               (section 09)
      state/              (section 02)
      art/                (section 10)
      games/              (section 10)
    public/fonts/         Glass TTY VT220 woff2 + VT323 woff2 + LICENSE notes
    test/app/             setup.ts, smoke.test.tsx, router.test.tsx, build/

### 6. urlFor

    /** Joins a project-relative asset path onto import.meta.env.BASE_URL.
     *  The ONLY sanctioned way to reference anything under public/.
     *  Handles leading-slash and no-slash inputs; never emits a double
     *  slash; pure string function. */
    export function urlFor(path: string): string

Every later section routes font, audio, and art URLs through this. The no-raw-paths scanner is the mechanical teeth.

### 7. App shell and router skeleton

`App.tsx` renders a stable root structure that later sections fill rather than rearrange:

- A screen root element (the router's mount point) that will receive `tabindex="-1"` focus management in section 09.
- A dialog host element at the app root, sibling to the screen root. Native `<dialog>` elements from section 06 mount here. The live regions from section 09 mount as siblings of this host, outside screen roots; reserve that position now with a clearly named empty fragment or slot so section 09 is an insertion, not a refactor.

`router.tsx` defines the screen model from the plan:

    type ScreenId = 'hero' | 'menu' | `mission:${string}` | 'debrief' |
      'finale' | 'settings' | 'help'

with the documented caveat that `settings` and `help` are overlays, not engine phases; the router's state model keeps an active base screen plus an optional overlay rather than treating all seven as exclusive. Provide a registry type mapping ScreenId to a component, a `registerScreen` stub (mission splits register by mission id later), and a plain fallback frame component that renders the screen id as unstyled terminal-ish text so split 02 is testable with the engine's test-double mission before section 04 lands. The router does not read engine phase yet; section 02 wires state, section 04 derives screen from phase. For now App defaults to `hero` with a bare placeholder.

Keep all of this intentionally thin. No styling beyond structural CSS, no key handling, no engine imports outside type positions.

### 8. Fonts

Self-host both faces under `public/fonts/`, zero external requests:

- Glass TTY VT220 (public domain). Obtain the TTF, convert to woff2 (any standard converter run locally), commit the woff2 plus a provenance note.
- VT323 (SIL OFL, the fallback face). Download the woff2 from the Google Fonts repo or via a one-time local fetch, commit it plus its OFL license file beside it.

This section only places the files and license notes; `@font-face` rules, `font-display: swap`, and size calibration against `planning/reference/crt-reference.jpg` belong to section 03. The presence test (Tests First, item 7) pins the files and the no-external-origins rule.

## Acceptance Checklist

- `npm test` green with both projects in one run: engine tests under node, app tests under jsdom.
- `npm run typecheck` green with JSX and DOM libs enabled; engine purity gate still passes untouched.
- `vite build` succeeds locally with the default `/wargames/` base; the built-HTML test proves every local asset reference is base-prefixed.
- `urlFor` tested; the no-raw-paths scanner passes over `src/app/**` and would fail on a planted violation (verify once by hand, do not commit the plant).
- Glass TTY VT220 and VT323 woff2 files present under `public/fonts/` with license notes; no external font or asset origin anywhere.
- App renders in jsdom with screen root, dialog host, and the reserved live-region position; router skeleton renders registered screens and the fallback frame.
- No new runtime dependency beyond react and react-dom.

## Dependencies and Downstream

Depends on split 01 (the engine and its tooling skeleton) being in place at the repo root. Blocks every other section of this split: 02 (engine binding), 03 (CRT theme), 09 (a11y spine), and 10 (art slots) start in parallel immediately after this lands, each relying on the jsdom project, the `@app` alias, the App root structure, `urlFor`, and the fonts directory.
## As Built (section-01 implementation)

Built and committed. 236 tests green (219 engine node + 17 app jsdom) in one `npm test`; tsc and eslint clean; `npm run build` succeeds with base-prefixed assets.

- Toolchain: react@^18, react-dom@^18 (only new runtime deps); dev: vite@^6, @vitejs/plugin-react@^5 (v6 requires vite 8, which conflicts with vitest 4 — pinned to 5), jsdom, @testing-library/{react,user-event,jest-dom}, @types/react(-dom).
- Fonts self-hosted under public/fonts/: glass-tty-vt220.woff2 (public domain, Slavinsky; TTF converted via `npx ttf2woff2` since no pip/fonttools available) + VT323 woff2 (OFL) + provenance/license notes.
- vitest.config appends an `app` jsdom project beside `engine`; the React plugin is applied at root (no-op for the node engine tests); the three build tests opt out of jsdom with `// @vitest-environment node`.
- Testing Library auto-cleanup does not run with vitest globals off; `test/app/setup.ts` calls `afterEach(cleanup)`.
- Review hardening: the no-raw-paths scanner now catches backtick templates, `src={...}`, `new URL`/`fetch` backtick forms, and `'/' + ...` concatenation (with a teeth-proof test), since sections 07/10 write dynamic asset URLs that way. main.tsx throws on a missing #root.
