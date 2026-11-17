# Spec: 08-deploy-and-review

Context: ../requirements.md sections "GitHub Pages deployment", "Implementation and
verification", and "Use ChatGPT to review the artwork and the running website" items
2 to 4; ../decisions.md; ../project-manifest.md.

## Purpose

Take the finished game public and prove it works: repository, CI, Pages, the codex
website review loop, automated test gate, and the honest README. Done means playing
at https://boardybell.github.io/wargames/.

## In scope

1. Repository. Public repo boardybell/wargames via gh CLI, default branch main,
   sensible .gitignore, art sources organized, generated media committed so CI and
   players need zero model credentials.
2. Workflow. .github/workflows/ on the default branch plus manual dispatch: install
   from lockfile, type check, gameplay tests, production build, upload Pages
   artifact, deploy with the official Pages action, github-pages environment, Pages
   and id-token permissions scoped to the deploy job, maintained official action
   versions. Vite base derived from the repo name for the project site, with the
   root-serving case documented.
3. Pages setup. Select GitHub Actions in Settings and document it plus where the
   deployment URL appears; configure via gh api where permitted. Smoke-test the live
   URL: hero, activation, a mission start, reload resume, asset and audio loading
   from the subpath. Report the exact remaining step if anything stays pending.
4. Local verification. Serve the production build under a repository-style subpath
   locally and verify hero, assets, mission transitions, and reload behavior.
   Register the local preview in ~/mainframe/services.json (house rule).
5. Test gate. The full automated coverage list from requirements.md verification
   bullets runs green before done: activation paths, timer resume, mission success
   and timeout paths, decoys and capacity, forecast update timing, confidence-driven
   surge, settlement permanence and idempotent catch-up, six-order chronology, case
   validator cases, branch determinism, three reachable endings, keyboard-only and
   mobile playability. Unit and simulation tests in Node; browser-level checks via
   Playwright against the production preview.
6. Website review. Play a complete campaign in the production preview on a known
   seed with stable clock fixtures where helpful. Numbered screenshots at desktop
   and mobile widths: idle hero, push-in mid-frame, revealed menu, settings, all
   four missions, debriefs, each ending, plus a short sequence for the transition.
   Codex vision critique with intended-interaction notes per state: foreground reads
   as operator station with separate cabinet, activation affordance, hero-terminal
   alignment, CRT sharpness, phone hierarchy, observed vs projected vs derived
   distinguishable at a glance, case builder and branch results included, clutter
   and bloom and clipped text and tap targets flagged by filename, viewport, and
   region. Independent inspection of the same screens in the browser: interaction,
   responsive layout, keyboard focus, reduced motion. Fix material findings, rerun
   a final codex pass.
7. README. Exact install, launch, build, test commands; known-seed walkthrough;
   Pages setup; final art file names; states and viewports reviewed; material
   changes made after critique; which reviews actually completed. Final report to
   Bond includes the local launch command, verification results, and the live URL.

## Out of scope

Game features, media generation (07), anything requiring model credentials at
runtime.

## Needs

Everything: 01 through 07 complete. The workflow skeleton may land right after 02 so
pushes deploy continuously; final verification runs last.

## Decisions and acceptance anchors

Public repo under boardybell (confirmed). Done means working in Bond's hands at the
live URL, stated without hedging, failures reported with output. Commit messages
follow house git rules. No em-dashes.
