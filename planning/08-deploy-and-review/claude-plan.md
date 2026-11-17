# Implementation Plan: 08-deploy-and-review

Ship and verify SHALL WE PLAY A GAME?. Self-contained prose; companion
spec in this directory. Two phases: the early skeleton (repo, workflow,
Pages) that lands as soon as the tree builds, and the closing
verification (Playwright matrix, codex screenshot review, README, live
smoke) that runs after splits 03 to 07.

## 1. Early skeleton (after splits 01 and 02 implement)

- gh repo create boardybell/wargames --public --source . --push from the
  initialized working tree (git init, main branch, house commit style).
- .github/workflows/deploy.yml: on push to main and workflow_dispatch;
  jobs build (actions/checkout, actions/setup-node with npm cache, npm
  ci, npm run typecheck, npm test, npm run build with VITE_BASE derived
  from the repo name, actions/upload-pages-artifact on dist) and deploy
  (needs build, environment github-pages, permissions pages: write and
  id-token: write, actions/deploy-pages). Current major versions pinned.
- Pages source set to GitHub Actions via gh api (documented fallback:
  Settings then Pages then Source).
- services.json registration: wargames-preview entry (vite preview,
  port chosen at registration, manual-start) per the house rule.
- First-deploy smoke: the placeholder-art site loads at the live URL
  with base-aware assets.

## 2. Playwright layer

Dev-dependency @playwright/test with the Chromium project in CI (webkit
listed for the local manual pass). Config: webServer runs vite preview
with the /wargames/ base; baseURL matches; projects for 1280x800 and
390x844. Spec files (names indicative): hero-activation.spec.ts,
reload-resume.spec.ts, keyboard-campaign.spec.ts, reduced-motion.spec.ts,
mobile.spec.ts, audio-unlock.spec.ts, subpath-assets.spec.ts. Fixtures
drive the known seed with deterministic walkthrough scripts exported by
the mission splits; timer-sensitive specs use short authored waits and
the engine's persisted-deadline reload behavior rather than clock mocks.
CI gains a playwright job after build (artifacts on failure:traces and
screenshots).

## 3. Screenshot review loop

scripts/capture-review.ts (Playwright): walks a complete campaign on the
fixture seed at both widths, saving numbered screenshots (idle hero,
push-in mid-frame via three timed frames, menu, settings, each mission
in play, each debrief, the finale case builder, the three branch
columns, each ending) with an intended-interaction note per shot in a
sidecar manifest. Review: codex exec -i per batch with the requirements'
critique brief (operator-station read, activation affordance, push-in
register, CRT sharpness, phone hierarchy, observed vs projected vs
derived distinguishable, clutter, bloom, clipped text, tap targets),
findings fixed in the owning split's code, re-capture, final pass.
Independent inspection runs the same screens by hand (keyboard, reduced
motion, VoiceOver spot check) per the manual checklist.

## 4. README and final report

README.md: project summary, install/dev/build/test/preview commands with
the exact npm invocations, the known-seed walkthrough, Pages setup and
URL location, art file names, review record (states, viewports, rounds,
material changes, which reviews ran, the split 07 lane rung), honest
limitations (single active tab, anything rung-gated). The final chat
report to Bond: local launch command, verification results, live URL.

## 5. Acceptance

One CI run green across typecheck, unit and mission suites, build, and
Playwright; the live URL smoke-tested by hand; README complete; the
requirements' final-response items delivered.

## 6. Review integrations (revision 2, 2026-11-17)

From reviews/iteration-1-opus.md; dispositions in
claude-integration-notes.md. Binding deltas:

1. Timer determinism: a short-deadline test fixture seed (about 20
   second missions, 15 second finale) ships via @engine/testing for
   reload-resume and expired-session specs, and Playwright
   page.clock drives the background-catch-up, clock-jump, and
   double-apply-guard specs. The no-clock-mocks stance is dropped.
2. Base: VITE_BASE="/${{ github.event.repository.name }}/"; the
   README documents the root-domain one-liner; the subpath spec
   notes base "/" also builds.
3. Workflow: concurrency group pages (cancel-in-progress false);
   top-level permissions contents: read; actions pinned to full
   released versions; .nojekyll emitted into dist; exactly one
   entry URL, no deep routes, no 404 fallback needed (stated).
4. Preview port 4173 verified free and shared as one constant by
   the Playwright webServer and the services.json entry.
5. Captures add the mobile compact flight list, reduced-motion hero
   and terminal, and an open glossary definition; push-in frames
   captured by seeking the WAAPI animation currentTime, never by
   waits. A glossary spec (hover, focus, Escape) joins the matrix.
6. Phasing: the early workflow runs typecheck, build, and existing
   tests with the Playwright job on continue-on-error until split
   06 lands; the full gate tightens for final verification;
   deploys run throughout.
7. A verification mapping table delegates unit-level bullets to the
   engine, mission, and finale suites (green in the same CI run)
   and adds two UI-level specs: a finale case-builder
   receipt-order rejection and corrected acceptance, and the
   page.clock catch-up double-apply guard. Audio checks split
   automated (muted startup, activation unlock, subpath loading)
   vs manual listening quality (device pass); both appear in
   acceptance and the README report.
8. codex outage branch: the review loop falls to the requirements'
   handoff bundle and the README states what actually ran.
9. Pre-publish hygiene scan (secrets, key material, non-fictional
   PII in media, screenshots, and history) before the repo flips
   public. First-deploy smoke asserts network 200s on hashed
   subpath assets. The README phrases the web-output-cache mapping
   as save-resume only.
