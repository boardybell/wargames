// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  CUE_MANIFEST,
  REQUIRED_CUE_IDS,
  SILENT_TICK_IDS,
  validateManifest,
} from '../../src/app/audio/manifest'
import { JOSHUA_LINES } from '../../src/engine/joshua/lines'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)
const missingVoiceClips = new Set<string>(discovery.exceptions.missingVoiceClips)

// Rendered voice clips land under public/audio/voice/<id>.opus (opus primary),
// with a sibling <id>.aac fallback and a <id>.txt transcript sidecar carrying
// the exact shipped caption text (section 03). These helpers resolve those real
// on-disk artifacts so a de-excepted clip with nothing shipped fails.
function voicePath(voiceClipId: string, ext: string): string {
  return join(repoRoot, 'public/audio/voice', `${voiceClipId}.${ext}`)
}

// The catalog-minus-exceptions set: the same source catalog-parity gates on.
// Every voiceClipId NOT excepted is a shipped obligation.
const renderedClipIds = JOSHUA_LINES.map((l) => l.voiceClipId).filter(
  (id) => !missingVoiceClips.has(id),
)

describe('cue manifest integrity (live now)', () => {
  it('validates with no errors', () => {
    expect(validateManifest(CUE_MANIFEST)).toEqual([])
  })

  it('every required cue id resolves', () => {
    for (const id of REQUIRED_CUE_IDS) {
      expect(CUE_MANIFEST[id as keyof typeof CUE_MANIFEST]).toBeDefined()
    }
  })

  it('transcripts present on every non-tick cue', () => {
    for (const cue of Object.values(CUE_MANIFEST)) {
      if (SILENT_TICK_IDS.has(cue.id)) continue
      expect(cue.transcript, cue.id).not.toBeNull()
      expect((cue.transcript || '').length, cue.id).toBeGreaterThan(0)
    }
  })

  it('preload: effects eager, voice lazy', () => {
    for (const cue of Object.values(CUE_MANIFEST)) {
      if (cue.bus === 'voice') expect(cue.preload, cue.id).toBe('lazy')
      if (cue.bus === 'effects') expect(cue.preload, cue.id).toBe('eager')
    }
  })

  it('every de-excepted voice clip ships a real .opus primary and a sibling .aac on disk', () => {
    // H3: drive off the catalog-minus-exceptions set (same source as
    // catalog-parity), NOT the manifest. For each rendered (de-excepted) voice
    // clip require a real .opus primary AND assert the sibling .aac exists on
    // disk. With section 01 shipping no clips, every id is excepted and this is
    // a recorded skip; pulling an id off the exception list with no file fails.
    for (const voiceClipId of renderedClipIds) {
      const opus = voicePath(voiceClipId, 'opus')
      const aac = voicePath(voiceClipId, 'aac')
      expect(existsSync(opus), `${voiceClipId}: .opus primary missing on disk`).toBe(
        true,
      )
      expect(existsSync(aac), `${voiceClipId}: sibling .aac fallback missing on disk`).toBe(
        true,
      )
    }
  })
})

describe('phonetic-leak guard: shipped transcript strict-equals catalog text (gated)', () => {
  it('every rendered voiceClipId transcript matches the catalog display text', () => {
    // H2: the catalog is the source of truth for voice text. For every
    // voiceClipId NOT on the exception list, a rendered clip must ship a
    // transcript sidecar that strict-equals the catalog line (no phonetic
    // spelling leaking into captions). A de-excepted id with no shipped
    // transcript throws (existsSync false then readFileSync raises). With
    // section 01 shipping no clips, every id is excepted, so this is a recorded
    // skip; it bites as section 03 shrinks the exception list.
    for (const line of JOSHUA_LINES) {
      if (missingVoiceClips.has(line.voiceClipId)) continue
      const transcriptPath = voicePath(line.voiceClipId, 'txt')
      // No shipped transcript for a de-excepted id is a hard failure: reading a
      // missing file throws, which the gate requires.
      const shipped = readFileSync(transcriptPath, 'utf8').trimEnd()
      expect(shipped, line.voiceClipId).toBe(line.text)
    }
  })
})
