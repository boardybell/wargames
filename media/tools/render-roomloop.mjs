// Stage F room-tone ambience loop. The one bounced audio file in the section:
// loops benefit from a rendered file with a seamless join, one-shots do not.
//
// The shipped seam test decodes public/audio/ambience/room-loop.wav (16-bit PCM
// WAV, first channel) and asserts the first sample and the last sample differ by
// less than 0.02 of full scale, so the wrap has no click. We guarantee that by
// construction: every tonal component has an integer number of cycles across the
// loop length, so the waveform value at the final sample flows straight into the
// value at the first sample. We then also emit opus and AAC siblings for the
// shipped site; the WAV is the deterministic decode target for CI.
//
// Local only: pure math synthesis, no samples pulled from anywhere, no network.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { encode, verifyDecode } from './audio-postproc.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const outDir = join(repoRoot, 'public/audio/ambience')
mkdirSync(outDir, { recursive: true })

const SAMPLE_RATE = 48000
const LOOP_SECONDS = 4
const N = SAMPLE_RATE * LOOP_SECONDS // exact integer sample count

// A low electrical room hum: a 60 Hz fundamental with a few harmonics, all with
// integer cycle counts across the loop so the seam is continuous. 60 Hz over 4 s
// is 240 whole cycles; 120 and 180 Hz are likewise whole. A slow 0.5 Hz tremor
// (2 whole cycles) gives the tone a little life without breaking the seam.
const partials = [
  { freq: 60, amp: 0.5 },
  { freq: 120, amp: 0.18 },
  { freq: 180, amp: 0.08 },
  { freq: 50, amp: 0.1 }, // a second mains-ish tone, 200 whole cycles
]
const TREMOR_HZ = 0.5 // 2 whole cycles across 4 s
const TREMOR_DEPTH = 0.15

// Confirm every period divides the loop exactly (integer cycles): this is the
// seam guarantee. Throw loudly if an edit ever breaks it.
for (const p of [...partials.map((p) => p.freq), TREMOR_HZ]) {
  const cycles = (p * N) / SAMPLE_RATE
  if (Math.abs(cycles - Math.round(cycles)) > 1e-9) {
    throw new Error(`frequency ${p} Hz is not seam-continuous over ${LOOP_SECONDS}s`)
  }
}

const float = new Float64Array(N)
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE
  let s = 0
  for (const p of partials) s += p.amp * Math.sin(2 * Math.PI * p.freq * t)
  // Tremor is a cosine so it starts and ends at the same phase (value 1 at both
  // t=0 and t=LOOP_SECONDS), preserving the seam.
  const tremor = 1 - TREMOR_DEPTH + TREMOR_DEPTH * Math.cos(2 * Math.PI * TREMOR_HZ * t)
  s *= tremor
  float[i] = s
  if (Math.abs(s) > peak) peak = Math.abs(s)
}

// Normalize to a calm standing level (room tone sits well under the voices).
const target = 0.22
const gain = peak > 0 ? target / peak : 1
const pcm = new Int16Array(N)
for (let i = 0; i < N; i++) {
  pcm[i] = Math.max(-32768, Math.min(32767, Math.round(float[i] * gain * 32767)))
}

// Report the seam delta we are about to ship.
const seam = Math.abs(pcm[0] / 32768 - pcm[N - 1] / 32768)
console.log(`seam delta (first vs last sample): ${seam.toFixed(6)} (tolerance 0.02)`)

// Write a canonical 48kHz mono 16-bit PCM WAV.
function writeWav(path, int16, sampleRate) {
  const dataLen = int16.length * 2
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16) // fmt chunk size
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataLen, 40)
  for (let i = 0; i < int16.length; i++) buf.writeInt16LE(int16[i], 44 + i * 2)
  writeFileSync(path, buf)
}

const wavPath = join(outDir, 'room-loop.wav')
writeWav(wavPath, pcm, SAMPLE_RATE)

// Opus + AAC siblings for the shipped site (the WAV is the CI decode target).
encode(wavPath, join(outDir, 'room-loop'))
verifyDecode(join(outDir, 'room-loop.opus'), 'opus')
verifyDecode(join(outDir, 'room-loop.aac'), 'aac')

console.log(`room-loop.wav written: ${N} samples, ${LOOP_SECONDS}s @ ${SAMPLE_RATE}Hz`)
