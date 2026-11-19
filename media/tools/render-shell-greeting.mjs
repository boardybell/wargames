// The shell cue manifest carries one voice cue, voice-greeting, distinct from
// the catalog lines (the shell plays it at boot before the campaign catalog is
// consulted). Stage F swaps it from a synth placeholder to a shipped file. Its
// transcript is the manifest's own text; render a clip to back it so the file
// cue points at real bytes. Same WOPR chain as the catalog clips.
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  postProcess,
  encode,
  verifyDecode,
  synthEspeak,
} from './audio-postproc.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const voiceDir = join(repoRoot, 'public/audio/voice')
const workDir = join(repoRoot, 'media/src/voice')
mkdirSync(voiceDir, { recursive: true })
mkdirSync(workDir, { recursive: true })

const id = 'voice-greeting'
// Display/transcript text for the shell cue (matches the manifest entry).
const DISPLAY = 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME?'
// espeak input: drop the query lilt, keep the WOPR monotone.
const INPUT = 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME.'

const raw = join(workDir, `${id}.raw.wav`)
const proc = join(workDir, `${id}.wav`)
const base = join(voiceDir, id)
synthEspeak(INPUT, raw)
postProcess(raw, proc)
encode(proc, base)
verifyDecode(`${base}.opus`, 'opus')
verifyDecode(`${base}.aac`, 'aac')
writeFileSync(`${base}.txt`, DISPLAY + '\n', 'utf8')

const bytes = statSync(`${base}.opus`).size + statSync(`${base}.aac`).size
console.log(`rendered shell greeting ${id}: ${bytes} bytes (opus+aac)`)
