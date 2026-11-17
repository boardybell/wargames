# TDD Plan: 08-deploy-and-review

Companion to claude-plan.md revision 2. This split's tests ARE the
product; the TDD discipline orders them.

## Workflow and repo

- Workflow file lint: concurrency group pages (cancel-in-progress
  false); top-level contents: read; job-scoped pages and id-token;
  pinned full action versions; manual dispatch present; VITE_BASE
  expression correct; .nojekyll emitted (assert in the built dist).
- First-deploy smoke script: network 200s on hashed JS, CSS, font, and
  audio URLs under /wargames/ at the live origin.
- Pre-publish hygiene scan: secret and key patterns, .secrets
  references, and non-fictional PII across the tree, media, and history
  before the repo flips public.
- services.json: wargames-preview registered on 4173 after a
  free-port check; one shared constant with the Playwright webServer.

## Playwright matrix (production preview, /wargames/ base)

- hero-activation.spec: fresh load shows the hero, greeting, visible
  entry action; mouse, tap, Enter, Space each activate exactly once;
  exactly three choices; focus lands in the terminal; type-in skip.
- reload-resume.spec (short-deadline fixture seed via @engine/testing):
  mid-mission reload restores the mission with the timer correct;
  menu-state reload shows the hero and returns with state.
- expired-session.spec (short-deadline fixture): deadline passes while
  closed; arrival settles exactly once; debrief renders.
- catchup-clock.spec (page.clock): backgrounding plus fastForward past
  milestones delivers each exactly once; the double-apply guard holds;
  a backward clock jump never increases displayed remaining time.
- keyboard-campaign.spec: a complete campaign keyboard-only on the
  fixture seed (menus, one mission flow per mission, debriefs, finale
  case, commit, ending).
- finale-validation.spec: a receipt-order case rejected through the
  case builder UI with the right slot highlight; corrected case
  accepted.
- reduced-motion.spec: push-in replaced by fade; type-ins instant;
  grid traces instant.
- sound.spec: muted startup; diegetic prompt Y enables; captions render
  with sound off; audio files load from the subpath.
- glossary.spec: a term opens on hover and focus, closes on Escape.
- mobile.spec (390x844): hero portrait crop, menu, compact flight list
  with full action rows, ledger single-pane flow, finale stacked
  columns.
- subpath-assets.spec: no raw-absolute asset requests; everything under
  the base (plus the note that base "/" builds).

## Capture and review

- capture-review script: deterministic walk on the fixture seed at both
  widths; the numbered list from the requirements plus the compact
  flight list, reduced-motion hero and terminal, open glossary state;
  push-in frames via WAAPI currentTime seeking; sidecar
  intended-interaction notes; re-runnable with identical output names.
- Review loop: codex exec -i batches; findings fixed in owning splits;
  final pass; the codex-outage handoff-bundle branch exercised in dry
  run (bundle builder works even when unused).

## README and acceptance

- README content checks: all command lines execute as written (smoke
  script runs them); walkthrough references the shipped fixture seed;
  the verification mapping table lists every requirements bullet with
  its owning suite or spec; audio checks split automated vs manual;
  honest lane rungs from media/discovery.json; save-resume phrasing for
  the cache rule; single-tab limitation.
- Acceptance: one CI run green end to end (engine, shell, missions,
  finale, media validation, build, Playwright); live URL smoke by hand;
  final report delivered with launch command, results, URL.
