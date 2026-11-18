diff --git a/eslint.config.js b/eslint.config.js
new file mode 100644
index 0000000..d9cebf7
--- /dev/null
+++ b/eslint.config.js
@@ -0,0 +1,48 @@
+import tseslint from 'typescript-eslint'
+
+// The purity gate: the engine never touches ambient time, randomness, or
+// the DOM. Time enters as logged input; randomness is state.
+const bannedEngineGlobals = [
+  'window',
+  'document',
+  'navigator',
+  'localStorage',
+  'performance',
+]
+
+export default tseslint.config(
+  {
+    ignores: ['dist/', 'node_modules/', 'planning/', 'coverage/'],
+  },
+  ...tseslint.configs.recommended,
+  {
+    files: ['src/engine/**'],
+    rules: {
+      'no-restricted-properties': [
+        'error',
+        {
+          object: 'Math',
+          property: 'random',
+          message: 'Engine randomness is RngState threaded through reducers.',
+        },
+        {
+          object: 'Date',
+          property: 'now',
+          message: 'Engine time arrives as the now field of dispatched envelopes.',
+        },
+        {
+          object: 'performance',
+          property: 'now',
+          message: 'Engine time arrives as the now field of dispatched envelopes.',
+        },
+      ],
+      'no-restricted-globals': [
+        'error',
+        ...bannedEngineGlobals.map((name) => ({
+          name,
+          message: 'The engine is headless: no DOM or ambient browser state.',
+        })),
+      ],
+    },
+  },
+)
diff --git a/package.json b/package.json
new file mode 100644
index 0000000..02633de
--- /dev/null
+++ b/package.json
@@ -0,0 +1,26 @@
+{
+  "name": "wargames",
+  "private": true,
+  "version": "0.1.0",
+  "type": "module",
+  "description": "SHALL WE PLAY A GAME? A WarGames-inspired browser campaign.",
+  "scripts": {
+    "test": "vitest run",
+    "typecheck": "tsc --noEmit",
+    "lint": "eslint ."
+  },
+  "dependencies": {
+    "pure-rand": "^8.4.0",
+    "valibot": "^1.0.0"
+  },
+  "devDependencies": {
+    "@fast-check/vitest": "^0.2.0",
+    "@types/node": "^24.0.0",
+    "@vitest/coverage-v8": "^4.0.0",
+    "eslint": "^9.0.0",
+    "fast-check": "^4.0.0",
+    "typescript": "^5.7.0",
+    "typescript-eslint": "^8.0.0",
+    "vitest": "^4.0.0"
+  }
+}
diff --git a/planning/01-simulation-core/implementation/deep_implement_config.json b/planning/01-simulation-core/implementation/deep_implement_config.json
new file mode 100644
index 0000000..d2b27f3
--- /dev/null
+++ b/planning/01-simulation-core/implementation/deep_implement_config.json
@@ -0,0 +1,31 @@
+{
+  "plugin_root": "/Users/darkpool/.claude/plugins/cache/piercelamb-plugins/deep-implement/0.2.1",
+  "sections_dir": "/Users/darkpool/wargames/planning/01-simulation-core/sections",
+  "target_dir": "/Users/darkpool/wargames",
+  "state_dir": "/Users/darkpool/wargames/planning/01-simulation-core/implementation",
+  "git_root": "/Users/darkpool/wargames",
+  "commit_style": "simple",
+  "test_command": "uv run pytest",
+  "sections": [
+    "section-01-foundation",
+    "section-02-rng",
+    "section-03-records",
+    "section-04-time",
+    "section-05-campaign",
+    "section-06-mission-interface",
+    "section-07-seeds",
+    "section-08-save",
+    "section-09-branch",
+    "section-10-properties-and-api"
+  ],
+  "sections_state": {},
+  "pre_commit": {
+    "present": false,
+    "type": "none",
+    "config_file": null,
+    "native_hook": null,
+    "may_modify_files": false,
+    "detected_formatters": []
+  },
+  "created_at": "2026-11-17T23:58:19.861586+00:00"
+}
\ No newline at end of file
diff --git a/src/engine/index.ts b/src/engine/index.ts
new file mode 100644
index 0000000..45de203
--- /dev/null
+++ b/src/engine/index.ts
@@ -0,0 +1,3 @@
+// Public engine surface. Section 10 finalizes this; until then it carries
+// the version marker the foundation smoke test imports.
+export const ENGINE_VERSION = '0.1.0'
diff --git a/test/engine/harness/canonical.test.ts b/test/engine/harness/canonical.test.ts
new file mode 100644
index 0000000..a4c5af8
--- /dev/null
+++ b/test/engine/harness/canonical.test.ts
@@ -0,0 +1,37 @@
+import { describe, expect, it } from 'vitest'
+import { assertJsonSafe, canonicalStringify, stateHash } from './canonical'
+
+describe('canonical stringify', () => {
+  it('sorts keys recursively so insertion order cannot matter', () => {
+    const a = { outer: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }] }
+    const b = { list: [{ x: 1, y: 2 }], outer: { a: 1, b: 2 } }
+    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
+    expect(stateHash(a)).toBe(stateHash(b))
+  })
+
+  it('normalizes minus zero to zero', () => {
+    expect(canonicalStringify({ n: -0 })).toBe(canonicalStringify({ n: 0 }))
+    expect(canonicalStringify({ n: -0 })).not.toContain('-0')
+  })
+
+  it('hashes a fixed fixture deterministically', () => {
+    const fixture = { seed: 'one', values: [3, 1, 2], flags: { live: true } }
+    expect(stateHash(fixture)).toBe(stateHash(fixture))
+  })
+
+  it('throws loudly on JSON-unsafe values with a path', () => {
+    expect(() => canonicalStringify({ a: { b: NaN } })).toThrow(/\.a\.b/)
+    expect(() => canonicalStringify({ n: Infinity })).toThrow(/non-finite/)
+    expect(() => canonicalStringify({ u: undefined })).toThrow(/undefined/)
+    expect(() => canonicalStringify(new Map())).toThrow(/non-plain/)
+    expect(() => canonicalStringify(new Set())).toThrow(/non-plain/)
+    expect(() => canonicalStringify(new Date(0))).toThrow(/non-plain/)
+    expect(() => assertJsonSafe({ deep: [{ bad: () => 1 }] })).toThrow(/function/)
+  })
+
+  it('accepts plain JSON-safe state', () => {
+    expect(() =>
+      assertJsonSafe({ a: [1, 'two', true, null], b: { c: 0 } }),
+    ).not.toThrow()
+  })
+})
diff --git a/test/engine/harness/canonical.ts b/test/engine/harness/canonical.ts
new file mode 100644
index 0000000..b027380
--- /dev/null
+++ b/test/engine/harness/canonical.ts
@@ -0,0 +1,63 @@
+// Deterministic test harness: canonical serialization and hashing for
+// run-twice and permutation suites. Test-tree code; the engine itself
+// never hashes state.
+
+type Plain = null | boolean | number | string | Plain[] | { [k: string]: Plain }
+
+function fail(path: string, why: string): never {
+  throw new Error(`canonicalStringify: ${why} at ${path || '<root>'}`)
+}
+
+function canonicalize(value: unknown, path: string): Plain {
+  if (value === null) return null
+  const t = typeof value
+  if (t === 'boolean') return value as boolean
+  if (t === 'number') {
+    const n = value as number
+    if (!Number.isFinite(n)) fail(path, `non-finite number ${n}`)
+    return Object.is(n, -0) ? 0 : n
+  }
+  if (t === 'string') return value as string
+  if (t === 'undefined') fail(path, 'undefined value')
+  if (t === 'function') fail(path, 'function value')
+  if (t === 'bigint') fail(path, 'bigint value')
+  if (t === 'symbol') fail(path, 'symbol value')
+  if (Array.isArray(value)) {
+    return value.map((v, i) => canonicalize(v, `${path}[${i}]`))
+  }
+  const proto = Object.getPrototypeOf(value)
+  if (proto !== Object.prototype && proto !== null) {
+    fail(path, `non-plain object (${value?.constructor?.name ?? 'unknown'})`)
+  }
+  const out: { [k: string]: Plain } = {}
+  const keys = Object.keys(value as object).sort()
+  for (const k of keys) {
+    out[k] = canonicalize((value as Record<string, unknown>)[k], `${path}.${k}`)
+  }
+  return out
+}
+
+/** Deterministic stringify: plain data only, keys recursively sorted,
+ *  minus-zero normalized to zero. Throws loudly on NaN, Infinity,
+ *  undefined, functions, Map, Set, Date, or any non-plain object. */
+export function canonicalStringify(value: unknown): string {
+  return JSON.stringify(canonicalize(value, ''))
+}
+
+/** FNV-1a over the canonical string. Deterministic; collision rarity is
+ *  all tests need, not cryptographic strength. */
+export function stateHash(value: unknown): string {
+  const s = canonicalStringify(value)
+  let h = 0x811c9dc5
+  for (let i = 0; i < s.length; i++) {
+    h ^= s.charCodeAt(i)
+    h = Math.imul(h, 0x01000193)
+  }
+  return (h >>> 0).toString(16).padStart(8, '0')
+}
+
+/** Walks a value and throws with a path-bearing message on the first
+ *  JSON-unsafe leaf. Shared by the property suites. */
+export function assertJsonSafe(value: unknown): void {
+  canonicalize(value, '')
+}
diff --git a/test/engine/purity-gate.test.ts b/test/engine/purity-gate.test.ts
new file mode 100644
index 0000000..ea41353
--- /dev/null
+++ b/test/engine/purity-gate.test.ts
@@ -0,0 +1,71 @@
+import { describe, expect, it } from 'vitest'
+import { ESLint } from 'eslint'
+
+// The gate is config, so the test lints synthetic sources AS IF they lived
+// under src/engine/ and asserts the bans fire there and only there.
+
+const violatingSource = [
+  'export function leak() {',
+  '  const a = Math.random()',
+  '  const b = Date.now()',
+  '  const c = performance.now()',
+  '  const d = window',
+  '  return [a, b, c, d]',
+  '}',
+  '',
+].join('\n')
+
+const cleanSource = [
+  'export function pure(now: number, roll: number): number {',
+  '  return now + roll',
+  '}',
+  '',
+].join('\n')
+
+async function lintAs(path: string, source: string) {
+  const eslint = new ESLint({ cwd: '/Users/darkpool/wargames' })
+  const [result] = await eslint.lintText(source, { filePath: path })
+  return result
+}
+
+describe('engine purity gate', () => {
+  it('flags ambient time, randomness, and DOM under src/engine/', async () => {
+    const result = await lintAs(
+      '/Users/darkpool/wargames/src/engine/fixture-violation.ts',
+      violatingSource,
+    )
+    const rules = (result?.messages ?? []).map((m) => m.ruleId)
+    expect(rules).toContain('no-restricted-properties')
+    expect(rules).toContain('no-restricted-globals')
+    const properties = (result?.messages ?? []).filter(
+      (m) => m.ruleId === 'no-restricted-properties',
+    )
+    expect(properties.length).toBeGreaterThanOrEqual(3)
+  })
+
+  it('passes clean engine code', async () => {
+    const result = await lintAs(
+      '/Users/darkpool/wargames/src/engine/fixture-clean.ts',
+      cleanSource,
+    )
+    const bans = (result?.messages ?? []).filter(
+      (m) =>
+        m.ruleId === 'no-restricted-properties' ||
+        m.ruleId === 'no-restricted-globals',
+    )
+    expect(bans).toHaveLength(0)
+  })
+
+  it('does not ban the same usage outside src/engine/', async () => {
+    const result = await lintAs(
+      '/Users/darkpool/wargames/test/fixture-outside.ts',
+      violatingSource,
+    )
+    const bans = (result?.messages ?? []).filter(
+      (m) =>
+        m.ruleId === 'no-restricted-properties' ||
+        m.ruleId === 'no-restricted-globals',
+    )
+    expect(bans).toHaveLength(0)
+  })
+})
diff --git a/test/engine/smoke.test.ts b/test/engine/smoke.test.ts
new file mode 100644
index 0000000..979c724
--- /dev/null
+++ b/test/engine/smoke.test.ts
@@ -0,0 +1,9 @@
+import { describe, expect, it } from 'vitest'
+import { ENGINE_VERSION } from '@engine'
+
+describe('foundation smoke', () => {
+  it('imports the engine through the @engine alias in the node project', () => {
+    expect(ENGINE_VERSION).toBe('0.1.0')
+    expect('window' in globalThis).toBe(false)
+  })
+})
diff --git a/tsconfig.json b/tsconfig.json
new file mode 100644
index 0000000..437b5d9
--- /dev/null
+++ b/tsconfig.json
@@ -0,0 +1,23 @@
+{
+  "compilerOptions": {
+    "target": "ES2022",
+    "module": "ESNext",
+    "moduleResolution": "bundler",
+    "lib": ["ES2022"],
+    "strict": true,
+    "noUncheckedIndexedAccess": true,
+    "noImplicitOverride": true,
+    "noEmit": true,
+    "skipLibCheck": true,
+    "isolatedModules": true,
+    "forceConsistentCasingInFileNames": true,
+    "types": ["node"],
+    "baseUrl": ".",
+    "paths": {
+      "@engine": ["src/engine/index.ts"],
+      "@engine/testing": ["src/engine/testing/index.ts"],
+      "@engine/*": ["src/engine/*"]
+    }
+  },
+  "include": ["src", "test"]
+}
diff --git a/vitest.config.ts b/vitest.config.ts
new file mode 100644
index 0000000..44f1d4f
--- /dev/null
+++ b/vitest.config.ts
@@ -0,0 +1,30 @@
+import { defineConfig } from 'vitest/config'
+import { fileURLToPath } from 'node:url'
+
+const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
+
+export default defineConfig({
+  resolve: {
+    alias: {
+      '@engine/testing': r('./src/engine/testing/index.ts'),
+      '@engine': r('./src/engine/index.ts'),
+    },
+  },
+  test: {
+    coverage: {
+      provider: 'v8',
+      include: ['src/engine/**'],
+      thresholds: { lines: 80, branches: 75 },
+    },
+    projects: [
+      {
+        extends: true,
+        test: {
+          name: 'engine',
+          environment: 'node',
+          include: ['test/engine/**/*.test.ts'],
+        },
+      },
+    ],
+  },
+})
