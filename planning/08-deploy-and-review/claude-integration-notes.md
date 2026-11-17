# Integration Notes: Opus review of 08-deploy-and-review plan

All findings integrated; the plan gains a Review Integrations section
(revision 2). Decisions:

1. Timer determinism: the no-clock-mocks stance is dropped. Two
   mechanisms adopted: a SHORT-DEADLINE TEST FIXTURE seed exported via
   @engine/testing (missions about 20 seconds, finale about 15; never in
   the shipped catalog) for reload-resume and expired-session specs, and
   Playwright page.clock (install plus fastForward) for the
   background-catch-up and clock-jump specs, including the double-apply
   guard. Both named in the spec files.
2. Base derivation pinned: VITE_BASE="/${{ github.event.repository.name
   }}/" in the workflow; the README documents the one-line change for a
   root or custom domain; the subpath spec carries a note asserting base
   "/" also builds.
3. Workflow hygiene: concurrency group "pages" with cancel-in-progress
   false; top-level permissions contents: read with job-scoped pages and
   id-token writes; actions pinned to full released versions (no floating
   majors); .nojekyll emitted into dist (cheap certainty); the app has
   exactly one entry URL and no deep routes, so no 404 SPA fallback
   (stated).
4. Preview port pinned: 4173 verified free against services.json at
   registration; one constant shared by the Playwright webServer config
   and the services.json entry.
5. Captures extended: the mobile compact flight list, reduced-motion hero
   and terminal states, and an open glossary definition join the numbered
   set; push-in mid-frames captured by seeking the WAAPI animation
   (page.evaluate on currentTime), never by wall-clock waits. A glossary
   Playwright spec (open on hover and focus, Escape closes) joins the
   matrix per the global rule.
6. Phasing encoded: the early workflow runs typecheck, build, and the
   tests that exist; the Playwright job rides continue-on-error until
   split 06 lands, then the full gate tightens for final verification.
   "Every push deploys" holds throughout; the full-matrix green claim
   applies to the end state only.
7. Verification mapping table added: unit-level bullets (mission
   mechanics, case-validator classes, branch idempotence, settlement
   permanence) are delegated to the engine, mission, and finale suites
   running green in the SAME CI run; UI-level additions: one finale
   case-builder spec driving a receipt-order rejection and a corrected
   acceptance through the browser; the catch-up double-apply spec via
   page.clock. Audio checks split explicitly: automated (muted startup,
   activation unlock, subpath audio loading) vs manual listening quality
   (device pass), both in acceptance, reported per the requirements.
8. codex outage branch: if the vision lane is unavailable at review time,
   produce the requirements' handoff bundle (contact sheet plus
   paste-ready critique prompt) and state what ran; the final pass is
   then manual-only and says so.
9. Public-repo hygiene: a pre-publish scan of the tree and history for
   secrets, key material, and non-fictional PII in media and screenshots
   before the repo flips public.
10. First-deploy smoke asserts network 200s on hashed JS, CSS, font, and
    audio URLs under the subpath, not just a non-blank page.
11. The README phrases the web-output-cache rule mapping as save-resume
    only (no invented freshness line).
