# Section 01: Repo, Workflow, Pages, and First Deploy

## Purpose and Context

This section ships the early skeleton of split 08 for SHALL WE PLAY A GAME?, the WOPR-styled browser game living at `/Users/darkpool/wargames`. It lands as soon as splits 01 (simulation core) and 02 (terminal shell) implement, which means the tree already builds: `npm run typecheck`, `npm test` (vitest), and `npm run build` (Vite) all pass locally before any work here begins. The deliverable is a public GitHub repo at `boardybell/wargames`, a hardened GitHub Actions workflow deploying to GitHub Pages, the Pages source flipped to Actions, a local preview service registered per house rules, and a first-deploy smoke proving the placeholder-art site loads live at `https://boardybell.github.io/wargames/` with base-aware assets.

Done for this section means a green CI run on the early gate and the live URL serving the site. Continuous deployment runs from this point forward through the rest of the project.

Dependencies: none within this split. Blocks section-02-playwright-matrix (which reuses the preview port constant and the workflow's Playwright job slot) and section-03-review-readme.

## Tests First

Write these before the artifacts they validate. All paths are under `/Users/darkpool/wargames`.

### 1. Workflow lint test

File: `tests/deploy/workflow-lint.test.ts` (vitest, runs in the normal `npm test` suite). Parses `.github/workflows/deploy.yml` with a YAML loader and asserts structure, not behavior:

```ts
describe("deploy.yml hardening", () => {
  it("triggers on push to main and workflow_dispatch");
  it("declares concurrency group 'pages' with cancel-in-progress false");
  it("sets top-level permissions to contents: read only");
  it("scopes pages: write and id-token: write to the deploy job alone");
  it("pins every action to a full released version (owner/repo@vX.Y.Z, no bare major tags)");
  it("derives VITE_BASE from the expression /${{ github.event.repository.name }}/");
  it("deploy job needs build and targets the github-pages environment");
});
```

### 2. Built-dist .nojekyll test

Same file or a sibling `tests/deploy/dist-nojekyll.test.ts`: after `npm run build`, assert `dist/.nojekyll` exists. Implement as a test that runs conditionally when `dist/` is present (CI runs it after the build step), or have the build itself emit the file via a small Vite plugin or a postbuild script and assert the script is wired in `package.json`.

### 3. First-deploy smoke script

File: `scripts/smoke-live.mjs`. Executable check against the live origin, run by hand after the first deploy and re-runnable any time:

```js
// Fetches https://boardybell.github.io/wargames/, confirms 200 and
// that the HTML references assets under /wargames/. Then fetches every
// hashed asset URL it finds (JS, CSS, font, audio) and asserts network
// 200 on each. Exits nonzero with a per-URL report on any failure.
```

No raw-absolute asset requests is section 02's Playwright concern; this script only proves the hashed subpath assets resolve at the live origin.

### 4. Pre-publish hygiene scan

File: `scripts/hygiene-scan.mjs`. Runs BEFORE the repo flips public and blocks publication on any hit:

```js
// Scans the working tree, generated media directories, and full git
// history (git log -p / git rev-list piped through the same matchers) for:
// - secret and key patterns (AWS keys, PEM headers, bearer tokens,
//   sk- style API keys, password= assignments)
// - any reference to ~/.secrets or .secrets paths
// - non-fictional PII: real emails beyond the public boardybell
//   identity, phone numbers, street addresses, in text AND in media
//   file names and any embedded metadata (exiftool-style strip or check)
// Exits nonzero with file:line findings. Zero findings is the gate.
```

Add a tiny vitest around its matcher functions (`tests/deploy/hygiene-scan.test.ts`) with one positive fixture per pattern class so the scanner itself is proven to catch what it claims.

### 5. services.json and shared port constant

File: `tests/deploy/preview-port.test.ts`:

```ts
it("exports PREVIEW_PORT = 4173 from the single shared constant module");
it("~/mainframe/services.json contains a wargames-preview entry whose port equals PREVIEW_PORT");
```

The shared constant lives at `scripts/preview-port.mjs` (something like `export const PREVIEW_PORT = 4173;`). Section 02's `playwright.config.ts` webServer imports this same module; nothing anywhere hardcodes 4173 a second time.

## Implementation

### Step 1: git init and house commit

From `/Users/darkpool/wargames`: `git init` with `main` as the default branch. `.gitignore` covers node (`node_modules/`, `dist/`) and the media workspaces, but generated media that ships (final art and audio under the public asset path) is committed. First commit in house style: a cinematic one-liner, no em-dashes anywhere in the message or in any committed content.

### Step 2: hygiene scan, then publish

Run `node scripts/hygiene-scan.mjs` and get a clean exit BEFORE creating the public repo. This ordering is binding because the next command pushes immediately. Then:

```
gh repo create boardybell/wargames --public --source . --push
```

### Step 3: the workflow

Create `.github/workflows/deploy.yml`. Shape, in prose:

- Triggers: `push` on `main`, plus `workflow_dispatch`.
- `concurrency: { group: pages, cancel-in-progress: false }`.
- Top-level `permissions: { contents: read }`.
- Job `build`: `actions/checkout`, `actions/setup-node` with npm cache, `npm ci`, `npm run typecheck`, `npm test`, `npm run build` with env `VITE_BASE: "/${{ github.event.repository.name }}/"`, ensure `.nojekyll` lands in `dist` (postbuild step or an explicit `touch dist/.nojekyll` before upload), then `actions/upload-pages-artifact` on `dist`.
- Job `deploy`: `needs: build`, `environment: github-pages`, job-scoped `permissions: { pages: write, id-token: write }`, `actions/deploy-pages`.
- Every action pinned to a full released version string (resolve the current latest full release of each action at implementation time; no bare `@v4` tags). The workflow lint test enforces the shape.
- Phased gating: at this early stage the workflow runs typecheck, build, and whatever tests exist. Include the `playwright` job slot now (after build, artifacts on failure for traces and screenshots) with `continue-on-error: true` and a comment stating it tightens to a hard gate once split 06 lands. Section 02 flips that flag. Deploys run throughout both phases.
- The site has exactly one entry URL, no deep routes, so no 404.html fallback is needed. State this in a workflow comment so nobody adds one later.

The Vite config reads `VITE_BASE` for its `base` (wired in split 02's scaffold; verify it honors the env var, and note that base `/` also builds, with the root-domain one-liner documented later in the README by section 03).

### Step 4: Pages source via gh api

```
gh api -X POST repos/boardybell/wargames/pages -f build_type=workflow
```

If the Pages resource already exists, use `-X PUT .../pages -f build_type=workflow` instead. Documented fallback for the README: Settings, then Pages, then Source set to GitHub Actions. The live URL appears on that same settings page.

### Step 5: services.json registration

House rule: all new local services register in `~/mainframe/services.json`, no exceptions. Add a `wargames-preview` entry matching the existing entries' schema in that file (read the file first and mirror its field names): command is the vite preview invocation (`npm run preview -- --port 4173 --strictPort` from `/Users/darkpool/wargames`), port 4173, manual-start, not a LaunchAgent. Before registering, verify 4173 is actually free on this machine (`lsof -i :4173` returns nothing and no other services.json entry claims it). The port value in the entry and `PREVIEW_PORT` in `scripts/preview-port.mjs` must agree; the test from Tests First holds them together.

### Step 6: first-deploy smoke

After the first green deploy, run `node scripts/smoke-live.mjs`. It must report 200s on the hashed JS, CSS, font, and audio URLs under `/wargames/` at `https://boardybell.github.io/wargames/`, and the placeholder-art site must load by eye at that URL with the hero visible. Record the result; section 03's README reports it.

## Files Created or Modified

- `/Users/darkpool/wargames/.github/workflows/deploy.yml` (new)
- `/Users/darkpool/wargames/.gitignore` (new or extended)
- `/Users/darkpool/wargames/scripts/hygiene-scan.mjs` (new)
- `/Users/darkpool/wargames/scripts/smoke-live.mjs` (new)
- `/Users/darkpool/wargames/scripts/preview-port.mjs` (new, the single 4173 constant)
- `/Users/darkpool/wargames/tests/deploy/workflow-lint.test.ts` (new)
- `/Users/darkpool/wargames/tests/deploy/dist-nojekyll.test.ts` (new)
- `/Users/darkpool/wargames/tests/deploy/hygiene-scan.test.ts` (new)
- `/Users/darkpool/wargames/tests/deploy/preview-port.test.ts` (new)
- `/Users/darkpool/wargames/package.json` (postbuild .nojekyll wiring if chosen over a workflow step)
- `~/mainframe/services.json` (wargames-preview entry)

## Acceptance for This Section

Hygiene scan clean before publish. Repo public at boardybell/wargames. One CI run green on the early gate (typecheck, existing tests, build) with the deploy job succeeding. Pages source set to GitHub Actions. `wargames-preview` registered on 4173 with the shared constant test passing. Live smoke green: hashed subpath assets all 200, placeholder site rendering at the live URL.