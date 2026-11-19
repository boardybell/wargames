// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Authoring guard: the request files for the two slots that sit under live game
// numbers must carry the dark-readout constraint, so the generated art leaves
// those readout zones dark. The visual composite check stays on the manual
// checklist; this guards the authoring text.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const requestsDir = join(repoRoot, 'media/requests')

const DARK_READOUT_SIGNAL = /DARK READOUT CONSTRAINT/
const DARK_READOUT_INTENT = /leave every readout surface DARK and EMPTY/

describe('dark-readout constraint in the required request files', () => {
  for (const file of ['06-countdown-insert.md', '10-failsafe-wall.md']) {
    it(`${file} carries the dark-readout constraint text`, () => {
      const text = readFileSync(join(requestsDir, file), 'utf8')
      expect(text).toMatch(DARK_READOUT_SIGNAL)
      expect(text).toMatch(DARK_READOUT_INTENT)
    })
  }

  it('the consolidated paste file carries the constraint for both slots', () => {
    const all = readFileSync(join(requestsDir, 'ALL-REQUESTS.md'), 'utf8')
    const hits = all.match(/DARK READOUT CONSTRAINT/g) || []
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })
})
