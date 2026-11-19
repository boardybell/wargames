// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// REVIEWS.md link check. Every round record names assets that must exist on
// disk; the three-round cap is enforced per loop; a loop locked with known
// findings must carry a non-empty findings list. Vacuously true over the
// seeded empty file; bites as sections 02/03 append real round records.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const reviews = readFileSync(join(repoRoot, 'media/REVIEWS.md'), 'utf8')

// Round record grammar (authored by sections 02/03):
//   ### Loop <slot-or-clip> round <n>
//   - assets: <name> [, <name> ...]
//   - findings: <text> | none
//   - disposition: <accepted | locked-with-known-findings | revise>
interface RoundRecord {
  loop: string
  round: number
  assets: string[]
  findings: string
  disposition: string
}

function parseRounds(md: string): RoundRecord[] {
  const out: RoundRecord[] = []
  const blocks = md.split(/^###\s+/m).slice(1)
  for (const block of blocks) {
    const header = block.split('\n')[0] ?? ''
    const m = /Loop\s+(\S+)\s+round\s+(\d+)/i.exec(header)
    if (!m || !m[1] || !m[2]) continue
    const assets = (/- assets:\s*(.+)/i.exec(block)?.[1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== 'none')
    const findings = /- findings:\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    const disposition = /- disposition:\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    out.push({ loop: m[1], round: Number(m[2]), assets, findings, disposition })
  }
  return out
}

function assetExists(name: string): boolean {
  for (const dir of ['public/art', 'public/audio/voice', 'public/audio/ambience']) {
    if (existsSync(join(repoRoot, dir, name))) return true
  }
  return false
}

describe('REVIEWS.md round records (vacuous over the seeded empty file)', () => {
  const rounds = parseRounds(reviews)

  it('every referenced asset exists on disk', () => {
    for (const r of rounds) {
      for (const a of r.assets) {
        expect(assetExists(a), `${r.loop} round ${r.round}: missing asset ${a}`).toBe(
          true,
        )
      }
    }
    expect(Array.isArray(rounds)).toBe(true)
  })

  it('no loop exceeds the three-round cap', () => {
    const maxByLoop = new Map<string, number>()
    for (const r of rounds) {
      maxByLoop.set(r.loop, Math.max(maxByLoop.get(r.loop) || 0, r.round))
    }
    for (const [loop, max] of maxByLoop) {
      expect(max, `${loop} exceeded three rounds`).toBeLessThanOrEqual(3)
    }
  })

  it('a locked-with-known-findings escape carries a non-empty findings list', () => {
    for (const r of rounds) {
      if (/locked-with-known-findings/i.test(r.disposition)) {
        expect(r.findings.length, `${r.loop} round ${r.round} findings`).toBeGreaterThan(
          0,
        )
      }
    }
  })
})
