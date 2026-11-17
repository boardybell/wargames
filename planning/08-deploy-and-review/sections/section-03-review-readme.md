# Section 03: Review Loop, README, and Final Verification

Closes the project. By the time this section runs, the repo deploys on every push (section-01-repo-workflow), the full Playwright matrix is green with the CI gate tightened (section-02-playwright-matrix), and splits 01 through 07 are implemented. This section captures the running site, runs the codex vision critique loop, fixes what it finds, writes the honest README, hand-smokes the live URL, and delivers the final report to Bond. Done means playing at https://boardybell.github.io/wargames/ and saying so without hedging.

## Dependencies

- section-01-repo-workflow: live Pages deploy, hardened workflow, services.json wargames-preview entry on port 4173, first-deploy smoke script.
- section-02-playwright-matrix: the full spec matrix against vite preview at the /wargames/ base, the short-deadline fixture seed exported from @engine/testing, the shared 4173 port constant, Playwright installed with Chromium.
- Splits 01 to 07 of the wider project supply the game itself, the mission walkthrough scripts, the fixture seed, and media/discovery.json (the split 07 media lane rung record).

## Background you need

The game is SHALL WE PLAY A GAME?, a browser WarGames campaign: an idle hero (operator CRT with the WOPR cabinet behind it), an activation push-in animation into the glass, a revealed menu and settings, four missions (Crash Outlook, Ground All Flights, Freeze Bank Accounts, Global Failsafe), debriefs, a finale case builder with three zero-player branch result columns, and three endings (recovery, containment, repeated order). Viewports under review are 1280x800 desktop and 390x844 mobile. The production preview serves at the /wargames/ base on port 4173. A known fixture seed with deterministic walkthrough scripts exists from the mission splits; the short-deadline variant lives in @engine/testing. The push-in is a WAAPI animation, which is how mid-frames are captured deterministically. The project-wide glossary rule means financial and technical terms define themselves on hover and focus with Escape to close; the capture set includes one open definition. House style everywhere: no em-dashes, sentence case, cinematic sentences in prose.

## Tests first

Write these before the implementation they gate. Stubs and intent are enough; fully specify only where the assertion is the product.

1. Capture determinism test (`scripts/__tests__/capture-review.test.ts` or equivalent): running the capture script twice on the fixture seed produces the identical set of output filenames, numbered and stable. Asserts the manifest lists every required state (enumerated below), that every entry carries a non-empty intended-interaction note, and that both viewport widths appear for every state that has both.

2. Push-in frame test: asserts the three push-in frames were produced by seeking the WAAPI animation currentTime via page.evaluate, never by wall-clock waits. Practically: the capture script exposes the seek positions it used, and the test asserts three distinct currentTime values and zero sleep-based waits in that code path (a lint-level or structural check is fine).

3. Handoff bundle dry run: the bundle builder runs even when codex is available and produces a contact sheet plus a paste-ready critique prompt containing the full critique brief. This proves the outage branch works before it is needed.

4. README command smoke (`scripts/readme-smoke.ts` or a test that shells out): every command line printed in the README executes as written from a clean checkout context: install, dev, build, test, preview. The test extracts fenced command blocks from README.md and runs them (dev and preview may be start-then-kill with a port probe).

5. README content checks (string-level assertions against README.md):
   - The walkthrough section references the shipped fixture seed by its actual exported name.
   - The verification mapping table lists every requirements verification bullet with its owning suite or spec file name: activation paths, timer resume, mission success and timeout paths, decoys and capacity, forecast update timing, confidence-driven surge, settlement permanence and idempotent catch-up, six-order chronology, case validator cases, branch determinism, three reachable endings, keyboard-only playability, mobile playability.
   - Audio checks appear split into automated (muted startup, activation unlock, subpath audio loading) and manual listening quality (device pass).
   - The media lane rung reported matches media/discovery.json, read at test time, not hardcoded.
   - The web-output-cache rule is phrased as save-resume only; no invented "computed at" freshness line appears.
   - The single-active-tab limitation is stated.
   - No em-dash characters anywhere in the file.

6. Acceptance (not a unit test, a checklist executed and recorded): one CI run green end to end on the same commit (engine, shell, mission, finale, media validation suites, typecheck, build, full Playwright matrix); the live URL smoke-tested by hand; the final report delivered with the local launch command, verification results, and live URL.

## Implementation

### 1. scripts/capture-review.ts

A Playwright script, run against the production preview on 4173 (reuse the shared port constant and the /wargames/ base from the Playwright config). It walks a complete campaign on the fixture seed using the deterministic walkthrough scripts the mission splits export, at both 1280x800 and 390x844, saving numbered screenshots with stable names (re-running produces identical filenames, so diffs between rounds are trivial).

Required shots, in walk order:

- Idle hero.
- Push-in mid-frame as three timed frames, captured by seeking the WAAPI animation currentTime through page.evaluate. Never wall-clock waits.
- Revealed menu.
- Settings.
- Each of the four missions in play: Crash Outlook, Ground All Flights, Freeze Bank Accounts, Global Failsafe.
- Each mission debrief.
- The finale case builder.
- The three zero-player branch result columns.
- Each ending: recovery, containment, repeated order.
- The mobile compact flight list (390x844 only).
- The reduced-motion hero and reduced-motion terminal (emulate prefers-reduced-motion).
- One open glossary definition.

Alongside the images, write a sidecar manifest (JSON or markdown, one entry per shot) with the filename, viewport, and a short intended-interaction note: what the player is supposed to see and do on that screen. The notes feed the critique prompt verbatim.

### 2. The codex review loop

Review runs as `codex exec -i` per batch of screenshots, each batch accompanied by the manifest notes and the critique brief. The brief, verbatim intent from the requirements:

- Does the foreground read as an operator station with a separate WOPR cabinet behind it?
- Is the activation affordance clear?
- Do the hero and terminal align through the push-in?
- Does CRT text stay sharp?
- Does the hierarchy hold at phone size?
- Are observed, projected, and derived records distinguishable at a glance across the flight map and the finale?
- Flag clutter, washed-out bloom, clipped text, weak crops, and confusing tap targets, by filename, viewport, and screen region.

The live case builder and the three branch results are explicitly in scope. Material findings get fixed in the owning split's code, not patched locally in this split. Then re-capture (identical filenames make the delta obvious) and run a final codex pass on the updated set. Record every round: what was flagged, what changed, what was accepted as-is.

Outage branch: if the codex vision lane is unavailable at review time, build the handoff bundle instead: a labeled contact sheet of all screenshots plus a paste-ready critique prompt containing the brief and the per-shot notes. The final pass is then manual-only and the README says so plainly. The bundle builder is exercised in dry run regardless (test 3), so the branch works even when unused.

### 3. Independent manual inspection

Run the same screens by hand in the browser, separate from codex: interaction, responsive layout, keyboard focus order, reduced motion behavior, and a VoiceOver spot check, per the manual checklist. WebKit gets its manual pass here (it is listed in the Playwright config but runs locally, not in CI). The manual audio device pass also lands here: hero transition, each mission's distinguishing cue, the failsafe 30- and 10-second warnings, the ending cues, at desktop and phone playback levels; spoken words clear over ambience, tones distinguishable, loops joining cleanly, peaks comfortable. The automated side of audio (muted startup, activation unlock, subpath loading) is already covered by the sound spec from section-02.

### 4. README.md

Written at the repo root. Contents, all honest, none aspirational:

- Project summary in a few sentences.
- Exact commands, as fenced blocks that execute as written: install, dev, build, test, preview (the exact npm invocations; the README smoke test keeps these from drifting).
- The known-seed walkthrough for an achievable successful run, referencing the shipped fixture seed by name.
- Pages setup: source is GitHub Actions, the Settings then Pages then Source fallback path, where the deployment URL appears, and the one-line VITE_BASE change for serving at a root or custom domain. Note that base "/" also builds.
- Final art file names, organized by use.
- The review record: states and viewports reviewed, how many critique rounds ran, the material changes made after critique, which reviews actually completed (codex vision or the handoff bundle branch), and the split 07 media lane rung read from media/discovery.json.
- The verification mapping table: every requirements verification bullet mapped to its owning suite or Playwright spec, all green in the same CI run. Unit-level bullets (mission mechanics, case validator classes, branch idempotence, settlement permanence) delegate to the engine, mission, and finale suites; UI-level bullets name their spec files, including the finale receipt-order rejection spec and the page.clock catch-up double-apply guard spec.
- Audio checks split automated vs manual, both reported.
- Limitations, stated plainly: single active tab, anything that stayed rung-gated, and anything else known-imperfect. The web-output-cache house rule maps to this project as save-resume only; say that and nothing more.
- No em-dashes anywhere.

### 5. Live URL hand smoke and acceptance

At https://boardybell.github.io/wargames/ by hand: hero renders, activation works, a mission starts, a mid-mission reload resumes with the timer correct, and assets plus audio load from the subpath (network panel shows 200s on hashed URLs, consistent with the first-deploy smoke script from section-01). Confirm one CI run on the final commit is green across typecheck, every unit and mission suite, media validation, build, and the full Playwright matrix. If anything stays pending (for example a Pages setting the token could not flip), report the exact remaining step.

### 6. Final report to Bond

The closing chat message contains the local launch command, the verification results (what ran, what passed, what was manual), and the live URL. Done means working in Bond's hands at that URL. Failures are reported loudly with output, not buried. Update the activity log with what shipped and the key decisions.

## Files created or modified

- /Users/darkpool/wargames/scripts/capture-review.ts (new)
- /Users/darkpool/wargames/scripts/handoff-bundle.ts or equivalent bundle builder (new)
- /Users/darkpool/wargames/scripts/readme-smoke.ts or a test file covering tests 4 and 5 (new)
- /Users/darkpool/wargames/review/ for screenshots, the sidecar manifest, and the round-by-round critique record (new)
- /Users/darkpool/wargames/README.md (new)
- Fixes from critique findings land in the owning splits' source files, wherever the finding points.