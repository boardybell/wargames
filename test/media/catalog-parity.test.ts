// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { JOSHUA_LINES } from '../../src/engine/joshua/lines'

// Parity: every catalog voiceClipId must have a rendered clip under public/, or
// appear on the rung-gated missing-voice-clips exception list. Section 03
// shrinks the list as it renders clips; an empty list means every id must have
// a file. Importing the REAL catalog keeps this honest: a new line added to the
// catalog is immediately a parity obligation.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)
const missingVoiceClips: string[] = discovery.exceptions.missingVoiceClips

function clipExists(voiceClipId: string): boolean {
  // Rendered voice clips land under public/audio/voice/<id>.opus (section 03).
  return existsSync(join(repoRoot, 'public/audio/voice', `${voiceClipId}.opus`))
}

describe('catalog-to-clip parity (gated)', () => {
  it('every catalog voiceClipId is either rendered or on the exception list', () => {
    const gaps: string[] = []
    for (const line of JOSHUA_LINES) {
      const rendered = clipExists(line.voiceClipId)
      const excepted = missingVoiceClips.includes(line.voiceClipId)
      // Gate: neither rendered nor excepted is a failure.
      if (!rendered && !excepted) gaps.push(line.voiceClipId)
    }
    expect(gaps).toEqual([])
  })

  it('the exception list names only real catalog voiceClipIds (no stale ids)', () => {
    const catalogIds = new Set(JOSHUA_LINES.map((l) => l.voiceClipId))
    for (const id of missingVoiceClips) {
      expect(catalogIds.has(id), `stale exception: ${id}`).toBe(true)
    }
  })
})
