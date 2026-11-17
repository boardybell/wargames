# Complete Specification: 08-deploy-and-review

Synthesis of spec.md, claude-research.md, and claude-interview.md
(self-answered under Bond's autonomy directive). 2026-11-17. Done means
playing at https://boardybell.github.io/wargames/.

## Scope

- Repo: gh repo create boardybell/wargames --public as soon as splits 01
  and 02 implement (continuous deployment from then on); main default;
  .gitignore for node and media workspaces; generated media committed.
- Workflow: .github/workflows/deploy.yml per the requirements: push to
  main plus workflow_dispatch; npm ci, typecheck, vitest run, vite build
  with base derived from the repository name, upload-pages-artifact,
  deploy-pages with github-pages environment and pages plus id-token
  permissions scoped to the deploy job; current maintained action
  versions.
- Pages: source GitHub Actions set via gh api; the README documents the
  Settings path and where the URL appears; live smoke test after first
  deploy.
- Local verification: vite preview under /wargames/ base; registered as
  wargames-preview in ~/mainframe/services.json (manual-start).
- Playwright: Chromium project in CI against the production preview;
  WebKit in the manual checklist; viewports 1280x800 and 390x844;
  spec files mapping one-to-one to the requirements' browser-level
  bullets: fresh-load hero and activation by mouse, tap, keyboard with
  exactly three choices; menu and controls by tap and command; mid-
  mission reload resumes the timer; expired session resolves; keyboard-
  only campaign; reduced motion; sound-off; mobile widths; audio unlock
  smoke; subpath asset loading.
- Screenshot review: a Playwright capture script walks a complete
  campaign on the fixture seed at both widths, numbered screenshots per
  the requirements list plus a three-frame push-in sequence; codex exec
  -i batches with intended-interaction notes; findings fixed; final
  codex pass; all recorded.
- README: install, dev, build, test, preview commands; the known-seed
  walkthrough; Pages setup; final art file names; states and viewports
  reviewed; material changes after critique; which reviews actually ran
  (including the split 07 rung); the single-active-tab limitation; the
  web-output-cache rule mapping.
- Final report to Bond: local launch command, verification results, live
  URL.

## Acceptance

Everything in the requirements' final verification list green in one CI
run; the live URL smoke-tested (hero, activation, mission start, reload
resume, assets and audio from the subpath); the README complete and
honest.
