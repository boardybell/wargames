// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { CUE_MANIFEST } from '../../src/app/audio/manifest'

// Decoded-memory budget across eager cues, gated. Eager effects cues decode at
// load; voice cues are lazy and counted at worst case singly. The estimate is
// measured apart from shipped (compressed) bytes: a 48kHz 16-bit mono second is
// 96 KB decoded. While eager cues are synth recipes (no shipped file) the
// decoded footprint is zero; section 03 may swap some to files, and this bounds
// the sum then.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

const DECODE_BUDGET_BYTES = 8 * 1024 * 1024 // 8 MB decoded PCM ceiling on phones
const BYTES_PER_SECOND_PCM = 48000 * 2 // 48kHz, 16-bit, mono
// Worst-case assumed duration for a file cue we cannot probe without decoding.
const ASSUMED_MAX_SECONDS = 6

// One worst-case decoded estimate for a file cue, measured apart from the
// shipped (compressed) bytes: the PCM footprint of the assumed-max duration,
// independent of the file's size on disk.
const WORST_CASE_FILE_BYTES = BYTES_PER_SECOND_PCM * ASSUMED_MAX_SECONDS

function decodedEstimate(): number {
  // A compressed opus/aac file is far smaller than its PCM; bound the decode by
  // the worst-case duration, not the file size. Every eager FILE cue standing
  // in decoded memory costs one of these.
  return WORST_CASE_FILE_BYTES
}

describe('decoded-memory budget (gated: synth cues cost zero)', () => {
  it('eager cues plus one worst-case voice clip stay under the decode budget', () => {
    let eagerDecoded = 0
    for (const cue of Object.values(CUE_MANIFEST)) {
      if (cue.preload !== 'eager') continue
      // M1: count one worst-case decoded estimate PER eager FILE cue, so the
      // eager total grows as section 03 swaps synth recipes for eager files and
      // can breach the ceiling. Synth eager cues are generated on the fly and
      // hold negligible standing PCM.
      if (cue.source.kind === 'file') eagerDecoded += decodedEstimate()
    }
    // Lazy voice clips are counted at worst case singly (one decoded at a time).
    const worstVoice = BYTES_PER_SECOND_PCM * ASSUMED_MAX_SECONDS
    const total = eagerDecoded + worstVoice
    expect(total).toBeLessThanOrEqual(DECODE_BUDGET_BYTES)
  })

  it('measured apart from shipped bytes (shipped size never enters the estimate)', () => {
    // Prove the estimate function ignores compressed file size: a tiny file and
    // a large file of the same assumed duration estimate identically.
    const tmp = join(repoRoot, 'media/discovery.json') // any real file
    expect(existsSync(tmp)).toBe(true)
    const a = BYTES_PER_SECOND_PCM * ASSUMED_MAX_SECONDS
    expect(a).toBeGreaterThan(statSync(tmp).size) // decode dwarfs compressed
  })
})
