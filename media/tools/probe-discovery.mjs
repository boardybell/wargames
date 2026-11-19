// The lane discovery probe. Empirically tests whether the codex CLI can emit
// image files directly, per media class, and records the rung where machines
// can read it (media/discovery.json) with a human mirror in DISCOVERY.md.
//
// Usage: node media/tools/probe-discovery.mjs --class image-generate
//        node media/tools/probe-discovery.mjs --class image-critique
//        node media/tools/probe-discovery.mjs --class audio-critique
//
// Three outcomes per probe: a file appears (candidate rung 1), codex reports
// no image tool (rung 2), an error (retry once, then rung 2). A file alone
// does NOT grant rung 1: the provenance checklist in provenance.mjs must pass
// first (decodes as a raster, dimensions nontrivial, a critique-lane sanity
// verdict of pass). Only then is rung 1 written.
//
// No heredocs. The shipped site never runs this; it needs zero credentials.
// When a rung-2 result is written, modelTierPinned goes false and the probe
// records that rung 2 cannot pin the model tier.
import { execFileSync } from 'node:child_process'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { checkProvenance, provenanceBlock } from './provenance.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')
const discoveryJson = join(mediaDir, 'discovery.json')
const discoveryMd = join(mediaDir, 'DISCOVERY.md')
const probeDir = join(mediaDir, 'src', '_probe')

const CLASSES = new Set(['image-generate', 'image-critique', 'audio-critique'])
const CODEX_TIMEOUT_MS = 180000

function parseArgs(argv) {
  const i = argv.indexOf('--class')
  const cls = i >= 0 ? argv[i + 1] : undefined
  const stage = argv.includes('--stage') ? argv[argv.indexOf('--stage') + 1] : 'A'
  return { cls, stage }
}

/** Run codex exec with a prompt in media/, workspace-write sandbox. Returns
 *  { ok, stdout } or { ok: false, error }. Never throws out of the probe. When
 *  an image is attached with -i, this codex build reads the prompt from stdin
 *  rather than the positional arg, so critique calls pass the prompt as input.
 */
function runCodex(args, input) {
  try {
    const stdout = execFileSync('codex', args, {
      cwd: mediaDir,
      timeout: CODEX_TIMEOUT_MS,
      encoding: 'utf8',
      input: input ?? undefined,
      stdio: [input != null ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })
    return { ok: true, stdout: String(stdout) }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

/** Decode a candidate file into a provenance record (without the sanity
 *  verdict, which the critique lane fills in). */
async function decode(file) {
  try {
    const meta = await sharp(file).metadata()
    return {
      decoded: true,
      format: meta.format || '',
      width: meta.width || 0,
      height: meta.height || 0,
    }
  } catch {
    return { decoded: false, format: '', width: 0, height: 0 }
  }
}

/** The critique-lane sanity pass: ask codex whether the file is a real
 *  photographic generation or improvised pixels. Returns 'pass' | 'fail' |
 *  null (null when the lane is unavailable). */
function sanityPass(file) {
  const prompt =
    'Look at the attached image. Answer with exactly PASS if it is a real ' +
    'photographic or rendered raster generation, or FAIL if it is improvised ' +
    'noise, a blank, or not a real image. One word only.'
  const res = runCodex(
    ['exec', '--sandbox', 'read-only', '-i', file, '-'],
    prompt,
  )
  if (!res.ok) return null
  // Exact-token match, not a substring scan: a reply that merely contains PASS
  // (e.g. "I cannot bypass safety") must not false-pass. Accept only when the
  // trimmed reply equals PASS or its last whitespace-separated token is PASS;
  // same for FAIL. Anything else is an unusable verdict (null).
  const text = res.stdout.trim().toUpperCase()
  const lastToken = text.split(/\s+/).filter(Boolean).pop() || ''
  if (text === 'PASS' || lastToken === 'PASS') return 'pass'
  if (text === 'FAIL' || lastToken === 'FAIL') return 'fail'
  return null
}

function loadDiscovery() {
  return JSON.parse(readFileSync(discoveryJson, 'utf8'))
}

function saveDiscovery(d) {
  writeFileSync(discoveryJson, JSON.stringify(d, null, 2) + '\n', 'utf8')
}

function appendMd(entry) {
  const prior = readFileSync(discoveryMd, 'utf8')
  const block = [
    '',
    `### ${entry.timestamp} - ${entry.mediaClass} (stage ${entry.stage})`,
    '',
    `- Rung recorded: ${entry.rung}`,
    `- Notes: ${entry.notes}`,
    entry.provenance
      ? `- Provenance: ${entry.provenance.format} ${entry.provenance.width}x${entry.provenance.height}, sanity ${entry.provenance.sanityVerdict}`
      : '- Provenance: none (rung 2 cannot pin the model tier)',
    '',
  ].join('\n')
  writeFileSync(discoveryMd, prior.trimEnd() + '\n' + block, 'utf8')
}

/** Probe the image-generate lane. */
async function probeImageGenerate(stage) {
  rmSync(probeDir, { recursive: true, force: true })
  mkdirSync(probeDir, { recursive: true })
  const target = join('src', '_probe', 'probe.png')
  const absTarget = join(mediaDir, target)
  const prompt =
    'Generate a simple 1983 NORAD-style control-room test image, a dark room ' +
    'with a glowing blue CRT, and save it as a PNG file at the path ' +
    target +
    ' . If you do not have an image generation tool available, reply with the ' +
    'exact words NO IMAGE TOOL and do not create any file.'
  let res = runCodex([
    'exec',
    '--sandbox',
    'workspace-write',
    '-C',
    mediaDir,
    prompt,
  ])
  if (!res.ok) {
    // Error: retry once.
    res = runCodex(['exec', '--sandbox', 'workspace-write', '-C', mediaDir, prompt])
  }

  if (!res.ok) {
    return rung2(stage, 'image-generate', `codex errored twice: ${res.error}`)
  }
  if (/NO IMAGE TOOL/i.test(res.stdout)) {
    return rung2(stage, 'image-generate', 'codex reports no image tool available')
  }
  if (!existsSync(absTarget) || statSync(absTarget).size === 0) {
    return rung2(
      stage,
      'image-generate',
      'codex returned but no raster file appeared (a file alone would not be rung 1 regardless)',
    )
  }
  // A file appeared. Provenance gate before rung 1 is granted.
  const base = await decode(absTarget)
  const verdict = base.decoded ? sanityPass(absTarget) : null
  const record = { ...base, sanityVerdict: verdict }
  const check = checkProvenance(record)
  if (!check.ok) {
    return rung2(
      stage,
      'image-generate',
      `file appeared but provenance failed: ${check.failures.join('; ')}`,
    )
  }
  return rung1(stage, 'image-generate', provenanceBlock(record))
}

/** Probe image-critique or audio-critique: does the lane accept an attachment
 *  and return a usable verdict. */
async function probeCritique(cls, stage) {
  rmSync(probeDir, { recursive: true, force: true })
  mkdirSync(probeDir, { recursive: true })
  let attachment
  if (cls === 'image-critique') {
    attachment = join(probeDir, 'tone.png')
    await sharp({
      create: { width: 640, height: 640, channels: 3, background: { r: 10, g: 14, b: 20 } },
    })
      .png()
      .toFile(attachment)
  } else {
    // audio-critique: attach a trivial generated tone file and record whether
    // the lane accepted it.
    attachment = join(probeDir, 'tone.wav')
    writeFileSync(attachment, makeTrivialWav())
  }
  const res = runCodex(
    ['exec', '--sandbox', 'read-only', '-i', attachment, '-'],
    'Confirm you can read the attached file by replying with exactly ACCEPTED, ' +
      'or NO ATTACHMENT SUPPORT if you cannot.',
  )
  if (!res.ok) {
    return rung2(stage, cls, `codex errored: ${res.error}`)
  }
  if (/ACCEPTED/i.test(res.stdout)) {
    return rung1(stage, cls, null, 'critique lane accepted the attachment')
  }
  return rung2(stage, cls, 'critique lane did not accept the attachment')
}

/** A 16-byte silent PCM WAV, enough to test attachment acceptance. */
function makeTrivialWav() {
  const dataLen = 16
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(8000, 24)
  buf.writeUInt32LE(8000, 28)
  buf.writeUInt16LE(1, 32)
  buf.writeUInt16LE(8, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  return buf
}

function record(stage, cls, rung, notes, provenance) {
  const d = loadDiscovery()
  const entry = {
    stage,
    mediaClass: cls,
    rung,
    timestamp: new Date().toISOString(),
    provenance: provenance || null,
    notes,
  }
  d.probes.push(entry)
  d.rungByClass[cls] = rung === 1 ? 1 : 2
  if (rung !== 1) d.modelTierPinned = false
  saveDiscovery(d)
  appendMd(entry)
  console.log(`probe: ${cls} -> rung ${rung} (${notes})`)
  return entry
}

function rung1(stage, cls, provenance, notes = 'rung 1 confirmed via codex-direct') {
  return record(stage, cls, 1, notes, provenance)
}

function rung2(stage, cls, notes) {
  return record(
    stage,
    cls,
    2,
    notes + '. Rung 2 cannot pin the model tier.',
    null,
  )
}

async function main() {
  const { cls, stage } = parseArgs(process.argv)
  if (!cls || !CLASSES.has(cls)) {
    console.error('usage: probe-discovery.mjs --class image-generate|image-critique|audio-critique')
    process.exit(1)
  }
  if (cls === 'image-generate') await probeImageGenerate(stage)
  else await probeCritique(cls, stage)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('probe failed:', err)
    process.exit(1)
  })
}
