// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const outDir = mkdtempSync(join(tmpdir(), 'wargames-build-'))

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

// Slow relative to unit tests (it runs a real Vite build), but it is the
// smoke that proves subpath deployment cannot silently break.
describe('built HTML base-prefixing', () => {
  it('every local asset reference in index.html is base-prefixed', async () => {
    await build({
      root: repoRoot,
      base: '/wargames/',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    })
    const html = readFileSync(join(outDir, 'index.html'), 'utf8')
    const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map(
      (m) => m[1]!,
    )
    const local = refs.filter(
      (r) => !/^(?:https?:)?\/\//.test(r) && !r.startsWith('data:'),
    )
    expect(local.length).toBeGreaterThan(0)
    for (const ref of local) {
      expect(ref.startsWith('/wargames/')).toBe(true)
    }
  }, 60_000)
})
