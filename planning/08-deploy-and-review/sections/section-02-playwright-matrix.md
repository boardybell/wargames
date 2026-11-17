# section-02-playwright-matrix: Browser-Level Verification Matrix

## Purpose and Context

SHALL WE PLAY A GAME? is a WarGames-inspired standalone browser game: TypeScript, React, Vite, static build, deployed to GitHub Pages at https://boardybell.github.io/wargames/. The repo root is `/Users/darkpool/wargames`. The headless engine lives under `src/engine/` (pure TS, no DOM), the shell and mission UIs under `src/app/`, unit and simulation tests under `test/` on Vitest. Splits 01 through 06 are implemented: engine, terminal shell, the three missions (CRASH OUTLOOK, GROUND ALL FLIGHTS, FREEZE BANK ACCOUNTS), and the GLOBAL FAILSAFE finale with three endings.

This section builds the full Playwright matrix: browser-level proof, against the production preview served under the `/wargames/` base, that the shipped site actually plays. These specs ARE the product of this section; there is no separate feature code beyond the small fixtures and hooks they need. It also tightens the CI gate: the Playwright job added by section-01 on `continue-on-error` becomes a hard gate.

Background facts the specs depend on:

- The hero is a photographed operator station rendered as one accessible button. The glass carries `GREETINGS PROFESSOR FALKEN` as live HTML. Activation (click, tap, Enter, Space) runs a 700 ms push-in, then WOPR types `SHALL WE PLAY A GAME?` and reveals exactly three numbered choices: `1. CRASH OUTLOOK`, `2. GROUND ALL FLIGHTS`, `3. FREEZE BANK ACCOUNTS`. The fourth row, `4. GLOBAL FAILSAFE`, stays hidden until all three debriefs are acknowledged. Reduced motion replaces the push-in with an immediate reveal; type-in is skippable.
- Missions run on a real-time countdown (about four minutes each, three for the finale) derived from a persisted deadline. The save layer writes a versioned payload to localStorage keys `wargames.save.primary` and `wargames.save.backup` (exported constants in `src/engine/save/port.ts`). `CampaignState` stores `seedName`; `createCampaign(seedName, preferences)` looks seeds up in `src/engine/seeds/catalog.ts` (three shipped seeds; seed one is the requirements fixture: C17 event 21:14:00 receipt 21:14:05 EXERCISE run R04, F06 event 21:14:08 receipt 21:14:52, B04 event 21:14:21 receipt 21:14:30, plus the observed local weather decoy). Receipt times make B04 look older than F06; event times and parent links resolve it. Deadline durations are seed tuning values relative to mission start, never absolute times.
- `@engine/testing` (`src/engine/testing/index.ts`) is a test-only entry point excluded from the production bundle; it already exports the test-double mission. Mission walkthrough action scripts live in the engine test trees (for example `test/engine/missions/bank/fixtures.ts` and the outlook and flights equivalents) and in `src/engine/seeds/fixtures/`.
- The glossary primitive (`src/app/a11y/glossary.ts`, `GlossaryTerm.tsx`) shows a plain-language definition on hover and focus, closes on Escape, and registers terms like OPEN EXCEPTIONS, TRACE, OBSERVED, EXERCISE, DERIVED.
- Audio is muted by default behind a user-activation gate with a diegetic ENABLE SOUND? prompt and a caption line for every spoken cue.

## Dependencies

- **section-01-repo-workflow** (this split): the deploy workflow exists with a Playwright job stubbed on `continue-on-error: true`; `vite preview` is registered as `wargames-preview` in `~/mainframe/services.json` on port 4173; the 4173 value lives in ONE shared constant created by section-01. Import that constant into `playwright.config.ts` from wherever section-01 placed it (expected under `/Users/darkpool/wargames/scripts/`). Never write a second `4173` literal.
- **Splits 01 through 06** implemented and green under `npm test`.
- **Split 07** is not required to write or run the matrix (placeholder art and the shell's cue manifest are enough), but the final verifying run in CI happens after 07 integrates, since `sound.spec` and `subpath-assets.spec` exercise whatever media actually ships.

Blocks: section-03-review-readme (the capture script reuses this section's fixtures, helpers, and config; the README verification mapping table cites these spec files by name).

## Deliverables (file paths)

    /Users/darkpool/wargames/playwright.config.ts
    /Users/darkpool/wargames/e2e/hero-activation.spec.ts
    /Users/darkpool/wargames/e2e/reload-resume.spec.ts
    /Users/darkpool/wargames/e2e/expired-session.spec.ts
    /Users/darkpool/wargames/e2e/catchup-clock.spec.ts
    /Users/darkpool/wargames/e2e/keyboard-campaign.spec.ts
    /Users/darkpool/wargames/e2e/finale-validation.spec.ts
    /Users/darkpool/wargames/e2e/reduced-motion.spec.ts
    /Users/darkpool/wargames/e2e/sound.spec.ts
    /Users/darkpool/wargames/e2e/glossary.spec.ts
    /Users/darkpool/wargames/e2e/mobile.spec.ts
    /Users/darkpool/wargames/e2e/subpath-assets.spec.ts
    /Users/darkpool/wargames/e2e/helpers/build-save.ts        (Node-side save construction)
    /Users/darkpool/wargames/e2e/helpers/inject.ts            (addInitScript injection of saves and test seeds)
    /Users/darkpool/wargames/src/engine/testing/short-deadline-seed.ts  (exported through @engine/testing)
    /Users/darkpool/wargames/test/engine/seeds/short-deadline-seed.test.ts
    /Users/darkpool/wargames/src/app/boot/e2e-hook.ts         (inert injection hook, a few lines)

Modified: `package.json` (devDependency `@playwright/test` at the current release, scripts `test:e2e` and friends), `.github/workflows/deploy.yml` (gate tightening only; the workflow itself is section-01's), the shell boot module (one call into `e2e-hook.ts`), `.gitignore` (`playwright-report/`, `test-results/`).

## Tests First

The Playwright specs are the tests. Write every spec file with its assertions stubbed and failing (or `test.fixme` where a fixture is not yet built) before writing the helpers and fixtures that make them pass. Two Node-level Vitest files accompany them and are written first among equals.

### Node-level tests (Vitest, engine project)

**test/engine/seeds/short-deadline-seed.test.ts**

- The short-deadline seed passes the same mechanical seed validators section-07 of the engine split runs over the catalog (time bounds, monotonic acyclic parent chains, independent observation present against the exercise run, integer tuning, JSON safety, arrays sorted by id). Import the validators; do not re-implement them.
- Mission deadline durations are about 20 seconds and the finale about 15 (assert the tuning values directly).
- The shipped catalog does NOT contain the short-deadline seed: assert `catalog` has exactly the three production seed names.

**build-save helper sanity** (either a small Vitest file or assertions inside the helper's first consumer): a save built for a mid-mission state decodes cleanly through the engine's own `decodeSave` with the production mission registry, and its `endsAt` lands where the builder was told to put it.

### The Playwright matrix (production preview, /wargames/ base)

Every spec clears storage in `beforeEach` unless it injects a save. Timer assertions use tolerance bands (for example remaining time within a few seconds of expected, and strictly decreasing across samples), never exact equality. No wall-clock sleeps except short authored waits where the UI genuinely animates; deadline manipulation goes through the fixture seed, injected saves, or `page.clock`.

**hero-activation.spec.ts**

- Fresh load shows the hero with `GREETINGS PROFESSOR FALKEN`, an idle cursor, and a visible entry action (the ACTIVATE TERMINAL affordance).
- Mouse click, tap (touch context), Enter, and Space each activate the transition, and exactly once per entry: a rapid double-click or Enter-then-Space produces one activation, one push-in, one terminal.
- After reveal: `SHALL WE PLAY A GAME?` and exactly three numbered menu rows, no fourth row.
- Focus lands in the live terminal when it is ready.
- Type-in skip: triggering skip during the type-in completes the text immediately and the menu is interactive promptly.

**reload-resume.spec.ts** (short-deadline fixture seed, injected via the e2e hook)

- Start a mission on the short-deadline seed, note the displayed remaining time, reload mid-mission: the mission screen is restored directly (no hero), the timer shows less than the full duration, within tolerance of expected, and keeps counting down.
- Menu-state reload: with settled outcomes in the save, a reload at the menu shows the hero again (fresh-visit rule), and activation returns to a menu that still reflects the settled state.

**expired-session.spec.ts** (injected save with `endsAt` already in the past)

- Arrival processes catch-up and settles the mission exactly once: the debrief renders, and the delivery log or outcome record shows a single settlement. A second reload after settlement changes nothing (settlement permanence through the browser).

**catchup-clock.spec.ts** (`page.clock.install` plus `fastForward`)

- Fast-forward past a mission's authored milestones in one jump (simulated backgrounding): each milestone consequence is delivered exactly once, in chronological order.
- Double-apply guard: after catch-up, a reload (save already carries the applied-consequence markers) does not re-apply any consequence; counters and capacity values are unchanged.
- Backward clock jump (`clock.setSystemTime` earlier): the displayed remaining time never increases.

**keyboard-campaign.spec.ts** (shipped fixture seed, seed one; keyboard only, no pointer)

- A complete campaign: activation by Enter, menu by numeric shortcuts and arrows plus Enter, one scripted flow per mission adapted from the engine walkthrough action logs (outlook deliveries, flights decisions, bank holds and releases), each debrief acknowledged, the fourth row appears only after the third acknowledgment, finale case built and committed, an ending readback reached. Raise this spec's timeout; it runs against real four-minute deadlines with plenty of margin.

**finale-validation.spec.ts** (injected finale-unlocked save built from the engine walkthrough end states)

- Build a case in receipt-time order (which places B04 before F06) through the case builder UI: Joshua rejects it and the UI highlights the specific unsupported slot; the evidence stays editable.
- Correct to event-time order (C17, F06, B04) with the root source and an independent observed record: the case is accepted.

**reduced-motion.spec.ts** (context option `reducedMotion: 'reduce'`)

- Activation produces an immediate reveal (fade, no push-in): the terminal is interactive well under the 700 ms animation budget, and no long-running transform animation exists (inspect `document.getAnimations()`).
- Type-ins render instantly; flight-map grid traces render instantly.

**sound.spec.ts**

- Muted startup: no audio before any gesture; the sound control reflects muted.
- The diegetic ENABLE SOUND? prompt answered Y enables audio (assert the engine or UI state flips; actual audible output is the manual device pass, out of scope here).
- With sound off, triggering a spoken cue renders its caption line.
- Audio files load from the subpath: captured network requests for audio resources return 200 under `/wargames/`.

**glossary.spec.ts**

- A registered term (for example OPEN EXCEPTIONS in the cabinet readout) opens its plain-language definition on hover, opens it on keyboard focus, and Escape closes it with focus retained.

**mobile.spec.ts** (390x844, touch)

- Hero shows the portrait crop with the greeting readable; activation by tap.
- Menu rows tappable; settings reachable.
- GROUND ALL FLIGHTS narrow layout: the compact flight list carries selection, conditions, and full action rows, so the character map is never required.
- FREEZE BANK ACCOUNTS: the ledger works as a single-pane flow.
- Finale: the three zero-player branch columns stack vertically and all results remain readable.

**subpath-assets.spec.ts**

- Record every request across load, activation, and a mission start: no request escapes the base; every script, style, image, font, and audio URL begins with `/wargames/`; no raw root-absolute asset path appears.
- Carry a comment in the file noting that base `/` also builds (the root-domain case is a one-line change documented in the README by section-03; CI builds with `VITE_BASE="/${{ github.event.repository.name }}/"`).

## Implementation

### 1. Tooling and config

Add `@playwright/test` as a devDependency. `package.json` scripts:

    "test:e2e": "playwright test"

`playwright.config.ts`:

- `webServer`: command builds and serves the production bundle under the subpath, for example `VITE_BASE=/wargames/ npm run build && npm run preview -- --port <PORT> --strictPort`, with `PORT` imported from section-01's shared constant (value 4173). `reuseExistingServer: !process.env.CI`.
- `use.baseURL`: `http://localhost:4173/wargames/` (built from the same constant).
- Projects: `chromium-desktop` (viewport 1280x800) running every spec except `mobile.spec.ts`; `chromium-mobile` (viewport 390x844, `hasTouch: true`) running `mobile.spec.ts` plus the tap cases of `hero-activation` and `glossary`; `webkit` listed but excluded from the default run (gate behind an env flag such as `PW_WEBKIT=1`), documented as the local manual pass.
- Artifacts: `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`.

### 2. Short-deadline fixture seed (`src/engine/testing/short-deadline-seed.ts`)

Derive it from seed one: same records, same evidence graph, same walkthrough-solvable content, with deadline tuning overridden to about 20 second missions and a 15 second finale. Deadlines are durations relative to mission start in `SeedDefinition` tuning, so this is a tuning override, not a content fork. Export it through `@engine/testing` only; it must never enter `src/engine/seeds/catalog.ts` or the production bundle (the existing import-surface test already excludes `@engine/testing`; the new catalog-exactness test pins the other half).

### 3. Browser entry for test state (`src/app/boot/e2e-hook.ts`)

The production catalog cannot contain the test seed, and `CampaignState` stores only `seedName`, so the browser needs a narrow injection point. Add an inert hook read once at shell boot, before engine binding:

    // window.__WARGAMES_E2E__?: { extraSeeds?: SeedDefinition[] }
    // If present, merge extraSeeds into the seed registry handed to the
    // engine binding (and into the New Campaign metadata list). Absent,
    // this module does nothing and ships as a few dead-cheap lines.

No test content ships; the seed data crosses the boundary at runtime via `page.addInitScript` from `@engine/testing` in the Playwright Node context. This keeps the bundle under test byte-identical to the deployed artifact apart from a dormant conditional. Rejected alternative: a separate `--mode e2e` build, which would break the claim that the matrix ran against the production preview.

### 4. Save construction and injection (`e2e/helpers/`)

`build-save.ts` (Node side): fold real engine dispatch over authored `(action, now)` envelopes to reach a target state, then `encodeSave`. Inputs: seed (short-deadline or seed one), a scenario name (`mid-mission`, `expired`, `finale-unlocked`), and a `baseNow` so `endsAt` lands where the spec needs it relative to wall clock at page load (engine purity means `now` is always supplied, so expired states are just folds with an old base). Reuse the engine walkthrough fixtures for the finale-unlocked state; do not re-author mission playthroughs.

`inject.ts`: `page.addInitScript` writers for `wargames.save.primary` (import the key constants from the engine save module) and for `window.__WARGAMES_E2E__` with the short-deadline seed. Injection always happens before navigation.

### 5. Per-spec mechanics worth pinning

- Activation-once assertions: count terminal mounts or listen for the activation cue dispatch; two input events in quick succession must yield one.
- `page.clock` interacts with `Date.now`, which is exactly what the shell feeds the engine as `now`; install the clock before navigation in `catchup-clock.spec.ts` so the persisted deadline math sees the controlled clock throughout.
- Reduced motion comes from the Playwright context option, which sets `prefers-reduced-motion`; the shell's motion preference hook honors it.
- `subpath-assets.spec.ts` uses `page.on('request')` collection; filter to same-origin requests.
- Keep selectors on accessible roles and the exact authored copy (the menu text and spacing are reproduced verbatim by the shell; they are stable anchors).

### 6. CI gate tightening

In `.github/workflows/deploy.yml`, remove `continue-on-error: true` from the Playwright job. The job (after build): checkout, setup-node with npm cache, `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, and an upload-artifact step for `playwright-report/` and `test-results/` on failure. Action versions stay pinned to full releases per section-01's conventions. From this change on, a red spec blocks deploy; that is the point.

## Constraints and Reminders

- No em-dashes anywhere: specs, comments, helper code, workflow edits.
- No new wall-clock sleeps; the three sanctioned time tools are the short-deadline seed, injected `baseNow` saves, and `page.clock`.
- One definition of the preview port, owned by section-01; this section only imports it.
- The matrix must pass locally (`npm run test:e2e`) and in CI against the same config; no CI-only skips except the webkit project exclusion described above.
- Flag honestly in the eventual README (section-03) that listening quality is a manual device pass; this section automates muted startup, unlock, captions, and subpath loading only.

## Definition of Done

All eleven spec files pass under `npm run test:e2e` against the production preview on port 4173 at both viewports; the short-deadline seed validation and catalog-exactness tests pass under `npm test`; the deploy workflow's Playwright job gates hard and one CI run shows typecheck, unit and mission suites, build, and Playwright green together; `tsc --noEmit` clean; no test seed bytes in the production bundle (verify by grepping `dist/` for a marker string unique to the short-deadline seed).