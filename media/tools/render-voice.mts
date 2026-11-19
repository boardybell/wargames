// Stage E full render: every voiceClipId in the FROZEN Joshua catalog becomes
// a shipped clip under public/audio/voice/<id>.{opus,aac} plus a <id>.txt
// transcript sidecar that strict-equals the catalog display text.
//
// The catalog is imported directly, so the transcript cannot drift from the
// display text: the sidecar is written from line.text verbatim. Phonetic hints
// live ONLY in the per-id synthesis-input override below and never reach the
// sidecar, the manifest, or the display. This is the phonetic-leak guard the CI
// strict-equals test enforces.
//
// Winning chain: espeak-ng formant synthesis (film WOPR register). Every clip
// gets the identical WOPR post chain from audio-postproc.mjs.
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  postProcess,
  encode,
  verifyDecode,
  synthEspeak,
} from './audio-postproc.mjs'
import { JOSHUA_LINES } from '../../src/engine/joshua/lines.ts'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const voiceDir = join(repoRoot, 'public/audio/voice')
const workDir = join(repoRoot, 'media/src/voice') // gitignored working space
mkdirSync(voiceDir, { recursive: true })
mkdirSync(workDir, { recursive: true })

// Per-id synthesis-input overrides. The KEY is voiceClipId; the VALUE is the
// text handed to espeak-ng when the engine mangles a word. The display text and
// the shipped transcript always come from line.text, never from here. Entries
// only exist where the formant engine needs a nudge; most lines render clean
// from the raw display text. Question marks are dropped from espeak input (they
// bend the pitch into a query lilt that fights the WOPR monotone).
const PHONETIC_INPUT: Record<string, string> = {
  'vo-greeting-boot': 'GREETINGS PROFESSOR. SHALL WE PLAY A GAME.',
  'vo-recognition': 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.',
  'vo-ending-recovery': 'WHAT A CLEAN GAME. HOW ABOUT A NICE GAME OF CHESS.',
}

/** The espeak input for a line: the per-id override if present, otherwise the
 *  display text with the trailing question mark softened to a period so the
 *  formant voice holds its flat WOPR cadence. */
function synthInput(voiceClipId: string, displayText: string): string {
  if (PHONETIC_INPUT[voiceClipId]) return PHONETIC_INPUT[voiceClipId]
  return displayText.replace(/\?/g, '.')
}

let shipped = 0
let totalBytes = 0
for (const line of JOSHUA_LINES) {
  const id = line.voiceClipId
  const raw = join(workDir, `${id}.raw.wav`)
  const proc = join(workDir, `${id}.wav`)
  const base = join(voiceDir, id)

  synthEspeak(synthInput(id, line.text), raw)
  postProcess(raw, proc)
  encode(proc, base)

  // Verify both encodings decode as the expected codec.
  verifyDecode(`${base}.opus`, 'opus')
  verifyDecode(`${base}.aac`, 'aac')

  // Transcript sidecar: EXACTLY the catalog display text, no trailing newline
  // beyond a single one. The CI test trimEnd()s then strict-equals line.text.
  writeFileSync(`${base}.txt`, line.text + '\n', 'utf8')

  totalBytes += statSync(`${base}.opus`).size + statSync(`${base}.aac`).size
  shipped += 1
}

console.log(`rendered ${shipped} voice clips to public/audio/voice/`)
console.log(`total shipped voice bytes (opus+aac): ${totalBytes}`)
