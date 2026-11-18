diff --git a/index.html b/index.html
new file mode 100644
index 0000000..28f2ec7
--- /dev/null
+++ b/index.html
@@ -0,0 +1,13 @@
+<!doctype html>
+<html lang="en">
+  <head>
+    <meta charset="utf-8" />
+    <meta name="viewport" content="width=device-width, initial-scale=1" />
+    <meta name="color-scheme" content="dark" />
+    <title>SHALL WE PLAY A GAME?</title>
+  </head>
+  <body>
+    <div id="root"></div>
+    <script type="module" src="/src/app/main.tsx"></script>
+  </body>
+</html>
diff --git a/src/app/App.tsx b/src/app/App.tsx
new file mode 100644
index 0000000..9fb1301
--- /dev/null
+++ b/src/app/App.tsx
@@ -0,0 +1,43 @@
+// The root layout. A stable structure later sections fill rather than
+// rearrange: a screen root (gets focus management in section 09), a dialog
+// host sibling (native <dialog> overlays from section 06 mount here), and a
+// reserved live-region slot (section 09 inserts aria-live regions there, so
+// it is an insertion, not a refactor). No styling beyond structure, no key
+// handling, no engine imports: this is scaffolding.
+import { useState } from 'react'
+import {
+  FallbackFrame,
+  resolveScreen,
+  type RouterState,
+  type ScreenRegistry,
+} from './router'
+
+export interface AppProps {
+  readonly registry?: ScreenRegistry
+  readonly initial?: RouterState
+}
+
+export function App({ registry = {}, initial }: AppProps) {
+  // Defaults to the hero screen with a bare placeholder until section 02
+  // wires engine state and section 04 derives the screen from phase.
+  const [router] = useState<RouterState>(
+    initial ?? { base: 'hero', overlay: null },
+  )
+  const Screen = resolveScreen(registry, router.base) ?? FallbackFrame
+
+  return (
+    <div className="app-root">
+      <main
+        className="screen-root"
+        data-testid="screen-root"
+        data-active-screen={router.base}
+      >
+        <Screen screenId={router.base} />
+      </main>
+      {/* Reserved for section 09 live regions: a sibling of the dialog host,
+          outside any screen root. Keep the position; do not restructure. */}
+      <div data-testid="live-region-slot" hidden />
+      <div className="dialog-host" data-testid="dialog-host" />
+    </div>
+  )
+}
diff --git a/src/app/env.d.ts b/src/app/env.d.ts
new file mode 100644
index 0000000..11f02fe
--- /dev/null
+++ b/src/app/env.d.ts
@@ -0,0 +1 @@
+/// <reference types="vite/client" />
diff --git a/src/app/index.ts b/src/app/index.ts
new file mode 100644
index 0000000..e317067
--- /dev/null
+++ b/src/app/index.ts
@@ -0,0 +1,18 @@
+// The @app barrel. Later sections widen this; for now it exposes the shell
+// root, the router seam, and the base-aware URL helper.
+export { App } from './App'
+export type { AppProps } from './App'
+export {
+  registerScreen,
+  resolveScreen,
+  FallbackFrame,
+} from './router'
+export type {
+  ScreenId,
+  BaseScreenId,
+  OverlayId,
+  RouterState,
+  ScreenRegistry,
+  ScreenComponent,
+} from './router'
+export { urlFor } from './urlFor'
diff --git a/src/app/main.tsx b/src/app/main.tsx
new file mode 100644
index 0000000..c60ffc3
--- /dev/null
+++ b/src/app/main.tsx
@@ -0,0 +1,14 @@
+// The only side-effectful module: mounts the App into #root. Everything
+// else in src/app is pure or render-pure so the shell stays testable.
+import { StrictMode } from 'react'
+import { createRoot } from 'react-dom/client'
+import { App } from './App'
+
+const container = document.getElementById('root')
+if (container) {
+  createRoot(container).render(
+    <StrictMode>
+      <App />
+    </StrictMode>,
+  )
+}
diff --git a/src/app/router.tsx b/src/app/router.tsx
new file mode 100644
index 0000000..773112d
--- /dev/null
+++ b/src/app/router.tsx
@@ -0,0 +1,57 @@
+// The screen model for the shell. Base screens map to engine phases (wired
+// in section 02; derived from phase in section 04). settings and help are
+// OVERLAYS, not engine phases, so the router state keeps an active base
+// screen plus an optional overlay rather than treating all ids as exclusive.
+import type { ComponentType } from 'react'
+
+export type BaseScreenId =
+  | 'hero'
+  | 'menu'
+  | `mission:${string}`
+  | 'debrief'
+  | 'finale'
+
+export type OverlayId = 'settings' | 'help'
+
+export type ScreenId = BaseScreenId | OverlayId
+
+export interface RouterState {
+  readonly base: BaseScreenId
+  readonly overlay: OverlayId | null
+}
+
+export type ScreenComponent = ComponentType<{ readonly screenId: ScreenId }>
+
+export type ScreenRegistry = Partial<Record<string, ScreenComponent>>
+
+/** Register a component for a screen id. Mission splits register by mission
+ *  id (`mission:<id>`) later; this is the stub seam. Returns a new registry
+ *  rather than mutating, so registration stays pure and testable. */
+export function registerScreen(
+  registry: ScreenRegistry,
+  id: ScreenId,
+  component: ScreenComponent,
+): ScreenRegistry {
+  return { ...registry, [id]: component }
+}
+
+/** A plain, unstyled terminal-ish frame used until section 04 lands real
+ *  screens. Renders the screen id so the shell is testable against the
+ *  engine's test-double mission before the terminal framework exists. */
+export function FallbackFrame({ screenId }: { screenId: ScreenId }) {
+  return (
+    <pre data-testid="fallback-frame" data-screen-id={screenId}>
+      {`[ ${screenId} ]`}
+    </pre>
+  )
+}
+
+/** Resolve the component for the active base screen, falling back to the
+ *  plain frame for an unregistered id. Overlay rendering is section 06; the
+ *  router only exposes the state shape for it now. */
+export function resolveScreen(
+  registry: ScreenRegistry,
+  id: ScreenId,
+): ScreenComponent {
+  return registry[id] ?? FallbackFrame
+}
diff --git a/src/app/urlFor.ts b/src/app/urlFor.ts
new file mode 100644
index 0000000..e85ae01
--- /dev/null
+++ b/src/app/urlFor.ts
@@ -0,0 +1,12 @@
+/** Joins a project-relative asset path onto import.meta.env.BASE_URL.
+ *  The ONLY sanctioned way to reference anything under public/. Handles
+ *  leading-slash and no-slash inputs; never emits a double slash; pure
+ *  string function with no DOM access. The no-raw-paths scanner is the
+ *  mechanical teeth that keeps every asset URL flowing through here, so a
+ *  subpath deployment (/wargames/) cannot silently break. */
+export function urlFor(path: string): string {
+  const base = import.meta.env.BASE_URL
+  const baseNoTrailing = base.endsWith('/') ? base.slice(0, -1) : base
+  const rel = path.startsWith('/') ? path.slice(1) : path
+  return `${baseNoTrailing}/${rel}`
+}
diff --git a/test/app/build/built-html.test.ts b/test/app/build/built-html.test.ts
new file mode 100644
index 0000000..714aeec
--- /dev/null
+++ b/test/app/build/built-html.test.ts
@@ -0,0 +1,38 @@
+// @vitest-environment node
+import { afterAll, describe, expect, it } from 'vitest'
+import { build } from 'vite'
+import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
+import { tmpdir } from 'node:os'
+import { join } from 'node:path'
+import { fileURLToPath } from 'node:url'
+
+const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
+const outDir = mkdtempSync(join(tmpdir(), 'wargames-build-'))
+
+afterAll(() => {
+  rmSync(outDir, { recursive: true, force: true })
+})
+
+// Slow relative to unit tests (it runs a real Vite build), but it is the
+// smoke that proves subpath deployment cannot silently break.
+describe('built HTML base-prefixing', () => {
+  it('every local asset reference in index.html is base-prefixed', async () => {
+    await build({
+      root: repoRoot,
+      base: '/wargames/',
+      logLevel: 'silent',
+      build: { outDir, emptyOutDir: true },
+    })
+    const html = readFileSync(join(outDir, 'index.html'), 'utf8')
+    const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map(
+      (m) => m[1]!,
+    )
+    const local = refs.filter(
+      (r) => !/^(?:https?:)?\/\//.test(r) && !r.startsWith('data:'),
+    )
+    expect(local.length).toBeGreaterThan(0)
+    for (const ref of local) {
+      expect(ref.startsWith('/wargames/')).toBe(true)
+    }
+  }, 60_000)
+})
diff --git a/test/app/build/no-raw-paths.test.ts b/test/app/build/no-raw-paths.test.ts
new file mode 100644
index 0000000..8811f1d
--- /dev/null
+++ b/test/app/build/no-raw-paths.test.ts
@@ -0,0 +1,79 @@
+// @vitest-environment node
+import { describe, expect, it } from 'vitest'
+import { readdirSync, readFileSync, statSync } from 'node:fs'
+import { join } from 'node:path'
+import { fileURLToPath } from 'node:url'
+
+const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
+const appDir = join(repoRoot, 'src/app')
+const fontsDir = join(repoRoot, 'public/fonts')
+
+function walk(dir: string): string[] {
+  const out: string[] = []
+  for (const entry of readdirSync(dir)) {
+    const full = join(dir, entry)
+    if (statSync(full).isDirectory()) out.push(...walk(full))
+    else out.push(full)
+  }
+  return out
+}
+
+// A deliberately dumb and loud scanner: the only sanctioned path to an
+// asset URL is urlFor. A hit is fixed by rewriting the source through
+// urlFor, never by widening this list.
+const RAW_PATTERNS: readonly { label: string; re: RegExp }[] = [
+  { label: 'src="/', re: /src\s*=\s*"\// },
+  { label: 'href="/', re: /href\s*=\s*"\// },
+  { label: 'url(/', re: /url\(\s*\// },
+  { label: "fetch('/", re: /fetch\(\s*['"]\// },
+  { label: "new URL('/", re: /new URL\(\s*['"]\// },
+  { label: 'literal /fonts|/audio|/art|/assets', re: /['"]\/(?:fonts|audio|art|assets)\// },
+]
+
+const EXTERNAL_ORIGINS = [
+  'fonts.googleapis.com',
+  'fonts.gstatic.com',
+  '://', // any scheme-based absolute origin in app source is suspect
+]
+
+describe('no raw asset paths under src/app', () => {
+  const files = walk(appDir).filter((f) => /\.(ts|tsx|css)$/.test(f))
+
+  it('every source file references assets only through urlFor', () => {
+    const violations: string[] = []
+    for (const file of files) {
+      const text = readFileSync(file, 'utf8')
+      for (const { label, re } of RAW_PATTERNS) {
+        if (re.test(text)) violations.push(`${file}: ${label}`)
+      }
+    }
+    expect(violations).toEqual([])
+  })
+
+  it('no app source references an external font or asset origin', () => {
+    const violations: string[] = []
+    for (const file of files) {
+      const text = readFileSync(file, 'utf8')
+      for (const origin of EXTERNAL_ORIGINS) {
+        if (text.includes(origin)) violations.push(`${file}: ${origin}`)
+      }
+    }
+    expect(violations).toEqual([])
+  })
+})
+
+describe('self-hosted fonts are present', () => {
+  it('both woff2 faces exist under public/fonts', () => {
+    const names = readdirSync(fontsDir)
+    expect(names).toContain('glass-tty-vt220.woff2')
+    expect(names).toContain('vt323.woff2')
+  })
+
+  it('index.html references no external origin', () => {
+    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8')
+    expect(html).not.toContain('fonts.googleapis.com')
+    expect(html).not.toContain('fonts.gstatic.com')
+    expect(html).not.toContain('http://')
+    expect(html).not.toContain('https://')
+  })
+})
diff --git a/test/app/build/urlFor.test.ts b/test/app/build/urlFor.test.ts
new file mode 100644
index 0000000..facad96
--- /dev/null
+++ b/test/app/build/urlFor.test.ts
@@ -0,0 +1,23 @@
+import { describe, expect, it } from 'vitest'
+import { urlFor } from '@app/urlFor'
+
+// import.meta.env.BASE_URL is '/' under the test runner; the join logic is
+// what matters here (the subpath smoke lives in built-html.test.ts).
+describe('urlFor', () => {
+  it('joins without a double slash whether or not the input leads with /', () => {
+    expect(urlFor('fonts/glass-tty.woff2')).toBe('/fonts/glass-tty.woff2')
+    expect(urlFor('/fonts/glass-tty.woff2')).toBe('/fonts/glass-tty.woff2')
+  })
+
+  it('returns base-relative URLs for nested paths', () => {
+    expect(urlFor('audio/cue.wav')).toBe('/audio/cue.wav')
+    expect(urlFor('art/wopr/frame-01.png')).toBe('/art/wopr/frame-01.png')
+  })
+
+  it('is a pure string function (no DOM)', () => {
+    const before = urlFor('fonts/x.woff2')
+    const after = urlFor('fonts/x.woff2')
+    expect(after).toBe(before)
+    expect(typeof urlFor('x')).toBe('string')
+  })
+})
diff --git a/test/app/router.test.tsx b/test/app/router.test.tsx
new file mode 100644
index 0000000..649e1c2
--- /dev/null
+++ b/test/app/router.test.tsx
@@ -0,0 +1,46 @@
+import { describe, expect, it } from 'vitest'
+import { render, screen } from '@testing-library/react'
+import { App } from '@app'
+import {
+  registerScreen,
+  resolveScreen,
+  FallbackFrame,
+  type RouterState,
+  type ScreenRegistry,
+} from '@app/router'
+
+describe('screen router skeleton', () => {
+  it('renders the component registered for the active screen', () => {
+    const Menu = () => <div data-testid="menu-screen">MENU</div>
+    const registry = registerScreen({}, 'menu', Menu)
+    render(<App registry={registry} initial={{ base: 'menu', overlay: null }} />)
+    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
+  })
+
+  it('renders the plain fallback frame for an unregistered id', () => {
+    render(<App initial={{ base: 'debrief', overlay: null }} />)
+    const frame = screen.getByTestId('fallback-frame')
+    expect(frame).toHaveAttribute('data-screen-id', 'debrief')
+  })
+
+  it('resolveScreen returns the fallback for an unknown id', () => {
+    expect(resolveScreen({}, 'finale')).toBe(FallbackFrame)
+  })
+
+  it('models settings and help as overlays, not exclusive base screens', () => {
+    // A base screen plus an optional overlay: the state shape keeps them
+    // distinct so an overlay can sit over any base screen (behavior is
+    // section 06; this is a shape-level assertion).
+    const state: RouterState = { base: 'menu', overlay: 'settings' }
+    expect(state.base).toBe('menu')
+    expect(state.overlay).toBe('settings')
+    // Overlays are not valid base screens.
+    const registry: ScreenRegistry = registerScreen(
+      {},
+      'help',
+      () => <div>HELP</div>,
+    )
+    // The base screen still resolves independently of any overlay.
+    expect(resolveScreen(registry, 'menu')).toBe(FallbackFrame)
+  })
+})
diff --git a/test/app/setup.ts b/test/app/setup.ts
new file mode 100644
index 0000000..312e5ae
--- /dev/null
+++ b/test/app/setup.ts
@@ -0,0 +1,7 @@
+import '@testing-library/jest-dom/vitest'
+import { afterEach } from 'vitest'
+import { cleanup } from '@testing-library/react'
+
+// Vitest globals are off, so Testing Library's auto-cleanup does not run on
+// its own. Unmount between tests to keep one render per test in the DOM.
+afterEach(cleanup)
diff --git a/test/app/smoke.test.tsx b/test/app/smoke.test.tsx
new file mode 100644
index 0000000..244e39e
--- /dev/null
+++ b/test/app/smoke.test.tsx
@@ -0,0 +1,21 @@
+import { describe, expect, it } from 'vitest'
+import { render, screen } from '@testing-library/react'
+import { App } from '@app'
+
+describe('app smoke', () => {
+  it('mounts with a screen root and a dialog host', () => {
+    render(<App />)
+    expect(screen.getByTestId('screen-root')).toBeInTheDocument()
+    expect(screen.getByTestId('dialog-host')).toBeInTheDocument()
+    // The reserved live-region position exists so section 09 is an insertion.
+    expect(screen.getByTestId('live-region-slot')).toBeInTheDocument()
+  })
+
+  it('defaults to the hero base screen', () => {
+    render(<App />)
+    expect(screen.getByTestId('screen-root')).toHaveAttribute(
+      'data-active-screen',
+      'hero',
+    )
+  })
+})
diff --git a/tsconfig.json b/tsconfig.json
index 437b5d9..63f65c5 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -3,7 +3,8 @@
     "target": "ES2022",
     "module": "ESNext",
     "moduleResolution": "bundler",
-    "lib": ["ES2022"],
+    "lib": ["ES2022", "DOM", "DOM.Iterable"],
+    "jsx": "react-jsx",
     "strict": true,
     "noUncheckedIndexedAccess": true,
     "noImplicitOverride": true,
@@ -11,12 +12,14 @@
     "skipLibCheck": true,
     "isolatedModules": true,
     "forceConsistentCasingInFileNames": true,
-    "types": ["node"],
+    "types": ["node", "vite/client"],
     "baseUrl": ".",
     "paths": {
       "@engine": ["src/engine/index.ts"],
       "@engine/testing": ["src/engine/testing/index.ts"],
-      "@engine/*": ["src/engine/*"]
+      "@engine/*": ["src/engine/*"],
+      "@app": ["src/app/index.ts"],
+      "@app/*": ["src/app/*"]
     }
   },
   "include": ["src", "test"]
diff --git a/vite.config.ts b/vite.config.ts
new file mode 100644
index 0000000..7163eaf
--- /dev/null
+++ b/vite.config.ts
@@ -0,0 +1,19 @@
+import { defineConfig } from 'vite'
+import react from '@vitejs/plugin-react'
+import { fileURLToPath } from 'node:url'
+
+// Project site deploys under /wargames/; subpath parity is the default
+// posture so a wrong base can never silently ship. Split 08's CI overrides
+// VITE_BASE for the real target.
+const base = process.env.VITE_BASE ?? '/wargames/'
+
+export default defineConfig({
+  base,
+  plugins: [react()],
+  resolve: {
+    alias: {
+      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
+      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
+    },
+  },
+})
diff --git a/vitest.config.ts b/vitest.config.ts
index 656288d..5305c20 100644
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -1,9 +1,13 @@
 import { defineConfig } from 'vitest/config'
+import react from '@vitejs/plugin-react'
 import { fileURLToPath } from 'node:url'
 
 const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
 
 export default defineConfig({
+  // The React plugin gives the app project JSX/TSX transforms. The engine
+  // project is plain .ts in a node environment, so it is unaffected.
+  plugins: [react()],
   resolve: {
     // Regex finds: string aliases are prefix matches, which would rewrite
     // a deep import like @engine/rng to <index.ts>/rng. Order matters.
@@ -11,6 +15,8 @@ export default defineConfig({
       { find: /^@engine\/testing$/, replacement: r('./src/engine/testing/index.ts') },
       { find: /^@engine$/, replacement: r('./src/engine/index.ts') },
       { find: /^@engine\/(.+)$/, replacement: r('./src/engine') + '/$1' },
+      { find: /^@app$/, replacement: r('./src/app/index.ts') },
+      { find: /^@app\/(.+)$/, replacement: r('./src/app') + '/$1' },
     ],
   },
   test: {
@@ -28,6 +34,15 @@ export default defineConfig({
           include: ['test/engine/**/*.test.ts'],
         },
       },
+      {
+        extends: true,
+        test: {
+          name: 'app',
+          environment: 'jsdom',
+          include: ['test/app/**/*.test.{ts,tsx}'],
+          setupFiles: ['test/app/setup.ts'],
+        },
+      },
     ],
   },
 })
