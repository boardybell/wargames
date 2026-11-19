// Slot generation driver. Runs `codex exec` (gpt-6-astra at xhigh per
// ~/.codex/config.toml) to produce ONE image file for a slot, from that slot's
// request body (media/requests/NN-slot.md), at the slot-dimensions 2x target.
// The output lands under media/src/<slot>/<slot>.png (gitignored). This is the
// rung-1 codex-direct lane: codex emits the raster itself; no local image
// model is ever used.
//
// No heredocs: the prompt is assembled from the committed request file plus a
// short delivery instruction. The shipped site never runs this.
//
// Usage: node media/tools/generate-slot.mjs <slot> [--variant N]
import { execFileSync } from 'node:child_process'
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')
const requestsDir = join(mediaDir, 'requests')
const dims = JSON.parse(readFileSync(join(mediaDir, 'slot-dimensions.json'), 'utf8'))

const CODEX_TIMEOUT_MS = 600000

// Map slot id -> request file number (paste order from request-writer SLOT_ORDER
// is the on-disk numbering).
const NN = {
  'hero-desktop': '01',
  'hero-portrait': '02',
  'hero-return': '03',
  'menu-rack': '04',
  'bezel-texture': '05',
  'countdown-insert': '06',
  'briefing-outlook': '07',
  'briefing-flights': '08',
  'briefing-bank': '09',
  'failsafe-wall': '10',
  'ending-recovery': '11',
  'ending-containment': '12',
  'ending-failure': '13',
}

function requestBody(slot) {
  const nn = NN[slot]
  const path = join(requestsDir, `${nn}-${slot}.md`)
  return readFileSync(path, 'utf8')
}

/** Build the codex prompt: the committed request body plus a terse delivery
 *  instruction naming the exact output path and target pixels. */
function buildPrompt(slot, outRel) {
  const d = dims.slots[slot]
  const body = requestBody(slot)
  return [
    body,
    '',
    'DELIVERY FOR THIS RUN (overrides the intake note above):',
    `Generate ONE image with your built-in image generation and save it as a PNG`,
    `at exactly this path: ${outRel}`,
    `Target size ${d.targetW} by ${d.targetH} pixels. If your generator emits a`,
    `smaller raster, upscale it to at least ${d.targetW} by ${d.targetH} before`,
    `saving so the longer side is not below target. The glass or readout surfaces`,
    `stay DARK and EMPTY per the art direction. Do not bake any menu text, digits,`,
    `captions, titles, or watermarks onto the image. Save the file and reply with`,
    `the saved path. If you have no image generation tool, reply with the exact`,
    `words NO IMAGE TOOL and create no file.`,
  ].join('\n')
}

function runCodex(prompt) {
  try {
    const stdout = execFileSync(
      'codex',
      ['exec', '--sandbox', 'workspace-write', '-C', mediaDir, prompt],
      { cwd: mediaDir, timeout: CODEX_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { ok: true, stdout: String(stdout) }
  } catch (err) {
    return { ok: false, error: err.message || String(err), stdout: String(err.stdout || '') }
  }
}

export async function generateSlot(slot, variant) {
  if (!dims.slots[slot]) throw new Error(`generate: unknown slot "${slot}"`)
  const slotDir = join(mediaDir, 'src', slot)
  mkdirSync(slotDir, { recursive: true })
  const name = variant ? `${slot}-cand${variant}.png` : `${slot}.png`
  const outRel = join('src', slot, name)
  const outAbs = join(mediaDir, outRel)
  rmSync(outAbs, { force: true })

  const prompt = buildPrompt(slot, outRel)
  const res = runCodex(prompt)
  const combined = (res.stdout || '') + (res.error || '')
  if (/NO IMAGE TOOL/i.test(combined)) {
    return { ok: false, reason: 'codex reports no image tool', slot }
  }

  // codex may save under a slightly different name; accept the newest png in
  // the slot dir created by this run.
  let file = outAbs
  if (!existsSync(file) || statSync(file).size === 0) {
    const pngs = readdirSync(slotDir)
      .filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('_'))
      .map((f) => ({ f, t: statSync(join(slotDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    if (pngs.length === 0) {
      return { ok: false, reason: 'no raster produced', slot, stdout: res.stdout }
    }
    const found = join(slotDir, pngs[0].f)
    if (found !== outAbs) copyFileSync(found, outAbs)
    file = outAbs
  }

  let meta
  try {
    meta = await sharp(file).metadata()
  } catch {
    return { ok: false, reason: 'produced file did not decode as a raster', slot }
  }
  return { ok: true, slot, file, width: meta.width, height: meta.height, format: meta.format }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slot = process.argv[2]
  const vi = process.argv.indexOf('--variant')
  const variant = vi >= 0 ? process.argv[vi + 1] : undefined
  if (!slot) {
    console.error('usage: generate-slot.mjs <slot> [--variant N]')
    process.exit(1)
  }
  generateSlot(slot, variant)
    .then((r) => {
      if (!r.ok) {
        console.error(`generate ${slot}: FAILED (${r.reason})`)
        process.exit(2)
      }
      console.log(`generate ${slot}: ${r.width}x${r.height} ${r.format} -> ${r.file}`)
    })
    .catch((e) => {
      console.error('generate failed:', e.message)
      process.exit(1)
    })
}
