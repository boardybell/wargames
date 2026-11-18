import { describe, expect, it } from 'vitest'
import {
  CUE_MANIFEST,
  REQUIRED_CUE_IDS,
  validateManifest,
  type CueDefinition,
} from '@app/audio'

const base: CueDefinition = {
  id: 'x',
  source: { kind: 'synth', recipe: 'confirm' },
  bus: 'effects',
  gain: 0.5,
  transcript: 'OK',
  policy: 'queue',
  preload: 'eager',
}

describe('manifest validation', () => {
  it('rejects a null transcript on a non-tick cue', () => {
    const errors = validateManifest({ x: { ...base, transcript: null } })
    expect(errors.some((e) => e.reason.includes('transcript'))).toBe(true)
  })

  it('accepts a null transcript on a whitelisted sub-100ms tick', () => {
    const errors = validateManifest({
      'key-tick': { ...base, id: 'key-tick', transcript: null },
    })
    expect(errors).toEqual([])
  })

  it('rejects a missing preload field', () => {
    // Build without preload rather than deleting a readonly field.
    const { preload: _preload, ...withoutPreload } = base
    const errors = validateManifest({ x: withoutPreload as CueDefinition })
    expect(errors.some((e) => e.reason.includes('preload'))).toBe(true)
  })

  it('the shipped manifest validates clean', () => {
    expect(validateManifest(CUE_MANIFEST)).toEqual([])
  })

  it('every required event has a cue', () => {
    for (const id of REQUIRED_CUE_IDS) {
      expect(CUE_MANIFEST[id]).toBeDefined()
    }
  })

  it('effects cues are eager and voice cues are lazy', () => {
    for (const cue of Object.values(CUE_MANIFEST)) {
      if (cue.bus === 'effects') expect(cue.preload).toBe('eager')
      if (cue.bus === 'voice') expect(cue.preload).toBe('lazy')
    }
  })
})
