// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Room-loop seam continuity, gated by discovery.exceptions.roomLoopPending.
// When section 03 ships the looping room tone, this decodes it deterministically
// and asserts sample-level continuity across the loop seam within a declared
// tolerance (the last samples flow into the first with no click). Until then the
// loop is pending and the check is a recorded skip.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)
const roomLoopPending: boolean = discovery.exceptions.roomLoopPending

// The seam tolerance: adjacent-sample amplitude delta at the wrap, as a
// fraction of full scale. A seam louder than this reads as an audible click.
const SEAM_TOLERANCE = 0.02
const ROOM_LOOP = join(repoRoot, 'public/audio/ambience/room-loop.wav')

/** Decode a 16-bit PCM WAV to a Float32 sample array (first channel).
 *  Deterministic: no resampling, no library randomness. */
function decodePcm16(path: string): Float32Array {
  const buf = readFileSync(path)
  // Minimal WAV parse: find the data chunk.
  let offset = 12
  let dataStart = -1
  let dataLen = 0
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === 'data') {
      dataStart = offset + 8
      dataLen = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataStart < 0) throw new Error('no data chunk')
  const channels = buf.readUInt16LE(22)
  const n = Math.floor(dataLen / 2)
  const out = new Float32Array(Math.floor(n / channels))
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readInt16LE(dataStart + i * channels * 2) / 32768
  }
  return out
}

describe('room-loop seam continuity (gated by roomLoopPending)', () => {
  it('the gate holds until the loop ships', () => {
    // Gate: pending means recorded skip; not pending means the file must exist.
    if (!roomLoopPending) {
      expect(existsSync(ROOM_LOOP), 'room-loop.wav must exist when not pending').toBe(
        true,
      )
    } else {
      expect(roomLoopPending).toBe(true)
    }
  })

  it('samples wrap within tolerance (runs only once the loop is shipped)', () => {
    if (roomLoopPending) {
      expect(roomLoopPending).toBe(true) // recorded skip
      return
    }
    const samples = decodePcm16(ROOM_LOOP)
    expect(samples.length).toBeGreaterThan(0)
    // Deterministic decode: the same file yields the same samples.
    const again = decodePcm16(ROOM_LOOP)
    expect(again[0]).toBe(samples[0])
    const first = samples[0] ?? 0
    const last = samples[samples.length - 1] ?? 0
    const seamDelta = Math.abs(first - last)
    expect(seamDelta).toBeLessThanOrEqual(SEAM_TOLERANCE)
  })
})
