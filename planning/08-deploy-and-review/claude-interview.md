# Interview: 08-deploy-and-review

2026-11-17. Mode: autonomous (Bond: "no more questions just build it and
do what you think is best"). Prior decisions bind: public repo
boardybell/wargames, live at https://boardybell.github.io/wargames/
before done; done means working in Bond's hands.

Q1: Repo creation timing?
A: The repo is created and the workflow lands as soon as implementation
starts producing a buildable tree (after splits 01 and 02 implement), so
every push deploys and regressions surface continuously; final
verification and the review loop run last. gh repo create
boardybell/wargames --public; Pages source set to GitHub Actions via
gh api; the Actions workflow follows the requirements verbatim
(lockfile install, typecheck, tests, build, Pages artifact, official
deploy action, github-pages environment, pages and id-token permissions
scoped to the deploy job, current maintained action versions, manual
dispatch included).

Q2: Playwright scope?
A: One browser project (Chromium) in CI for speed plus a WebKit local
pass in the manual checklist; viewports 1280x800 and 390x844; tests run
against vite preview serving the production build under /wargames/;
deterministic known-seed fixtures with the engine's clock discipline
(no clock mocking needed beyond page reload timing). The requirements'
browser-level bullets map one-to-one to spec files.

Q3: Screenshot review mechanics?
A: A Playwright capture script walks a complete campaign on the fixture
seed at both widths, numbering screenshots per the requirements list
(idle hero, push-in mid-frame, menu, settings, all four missions,
debriefs, endings, a three-frame transition sequence); codex exec -i
per batch with intended-interaction notes; findings fixed; a final
codex pass; everything recorded in the README (states, viewports,
material changes, which reviews actually ran).

Q4: services.json registration?
A: The vite preview invocation for local verification registers as
wargames-preview in ~/mainframe/services.json with its port, per the
house rule, marked manual-start.
