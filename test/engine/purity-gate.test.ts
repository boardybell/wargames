import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

// The gate is config, so the test lints synthetic sources AS IF they lived
// under src/engine/ and asserts the bans fire there and only there.

const violatingSource = [
  'export function leak() {',
  '  const a = Math.random()',
  '  const b = Date.now()',
  '  const c = performance.now()',
  '  const d = window',
  '  return [a, b, c, d]',
  '}',
  '',
].join('\n')

const cleanSource = [
  'export function pure(now: number, roll: number): number {',
  '  return now + roll',
  '}',
  '',
].join('\n')

const repoRoot = process.cwd()

async function lintAs(relativePath: string, source: string) {
  const eslint = new ESLint({ cwd: repoRoot })
  const [result] = await eslint.lintText(source, {
    filePath: `${repoRoot}/${relativePath}`,
  })
  return result
}

describe('engine purity gate', () => {
  it('flags ambient time, randomness, and DOM under src/engine/', async () => {
    const result = await lintAs(
      'src/engine/fixture-violation.ts',
      violatingSource,
    )
    const rules = (result?.messages ?? []).map((m) => m.ruleId)
    expect(rules).toContain('no-restricted-properties')
    expect(rules).toContain('no-restricted-globals')
    const properties = (result?.messages ?? []).filter(
      (m) => m.ruleId === 'no-restricted-properties',
    )
    expect(properties.length).toBeGreaterThanOrEqual(3)
  })

  it('passes clean engine code', async () => {
    const result = await lintAs(
      'src/engine/fixture-clean.ts',
      cleanSource,
    )
    const bans = (result?.messages ?? []).filter(
      (m) =>
        m.ruleId === 'no-restricted-properties' ||
        m.ruleId === 'no-restricted-globals',
    )
    expect(bans).toHaveLength(0)
  })

  it('does not ban the same usage outside src/engine/', async () => {
    const result = await lintAs(
      'test/fixture-outside.ts',
      violatingSource,
    )
    const bans = (result?.messages ?? []).filter(
      (m) =>
        m.ruleId === 'no-restricted-properties' ||
        m.ruleId === 'no-restricted-globals',
    )
    expect(bans).toHaveLength(0)
  })
})
