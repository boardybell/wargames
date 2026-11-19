// Slot exporter. Takes a selected source raster under media/src/<slot>/ and
// exports it to public/art/<slot>.avif (primary) plus public/art/<slot>.jpg
// (fallback), resized to the slot-dimensions 2x target with a cover fit so the
// output lands on target within the dimension tolerance. The AVIF is quality
// searched down until it clears its per-slot byte ceiling (300 KB hero, 160 KB
// others); the JPEG is a fixed-quality fallback and never counts toward the
// 2.4 MB wire budget.
//
// No heredocs: this is a committed Node file. The shipped site never runs it;
// only the exported public/ files ship. Usage:
//   node media/tools/export-slot.mjs <slot> <source-path>
import { readFileSync, statSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')
const repoRoot = join(mediaDir, '..')
const dims = JSON.parse(readFileSync(join(mediaDir, 'slot-dimensions.json'), 'utf8'))

const HERO_SLOTS = new Set(['hero-desktop', 'hero-portrait', 'hero-return'])
const HERO_CEIL = 300 * 1024
const OTHER_CEIL = 160 * 1024

/** Resize+cover a source buffer to the slot target, then AVIF-encode at a given
 *  quality. Returns the encoded buffer. */
async function encodeAvif(src, targetW, targetH, quality) {
  return sharp(src)
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .avif({ quality, effort: 6 })
    .toBuffer()
}

/** Binary-search AVIF quality down until the encoded size clears the ceiling.
 *  Returns { buffer, quality, bytes } for the best clearing result, or the
 *  smallest encoding tried if none clears (caller decides whether to fail). */
async function fitAvif(src, targetW, targetH, ceil) {
  let lo = 18
  let hi = 72
  let best = null
  // Try the high end first; if it already clears we keep quality high.
  for (let i = 0; i < 9; i++) {
    const q = Math.round((lo + hi) / 2)
    const buf = await encodeAvif(src, targetW, targetH, q)
    const bytes = buf.length
    if (bytes <= ceil) {
      best = { buffer: buf, quality: q, bytes }
      lo = q + 1 // push quality up while we still clear
    } else {
      hi = q - 1
    }
    if (lo > hi) break
  }
  if (best) return best
  // Nothing cleared: return the lowest-quality encoding as the smallest option.
  const buf = await encodeAvif(src, targetW, targetH, 18)
  return { buffer: buf, quality: 18, bytes: buf.length }
}

export async function exportSlot(slot, sourcePath) {
  const d = dims.slots[slot]
  if (!d) throw new Error(`export: unknown slot "${slot}"`)
  const src = readFileSync(sourcePath)
  const ceil = HERO_SLOTS.has(slot) ? HERO_CEIL : OTHER_CEIL
  const outDir = join(repoRoot, 'public', 'art')
  mkdirSync(outDir, { recursive: true })

  const avif = await fitAvif(src, d.targetW, d.targetH, ceil)
  const avifPath = join(outDir, `${slot}.avif`)
  await sharp(avif.buffer).toFile(avifPath)

  const jpgPath = join(outDir, `${slot}.jpg`)
  await sharp(src)
    .resize(d.targetW, d.targetH, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(jpgPath)

  const meta = await sharp(avifPath).metadata()
  const cleared = avif.bytes <= ceil
  const result = {
    slot,
    avif: avifPath,
    jpg: jpgPath,
    width: meta.width,
    height: meta.height,
    targetW: d.targetW,
    targetH: d.targetH,
    avifBytes: statSync(avifPath).size,
    jpgBytes: statSync(jpgPath).size,
    quality: avif.quality,
    ceil,
    cleared,
  }
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slot = process.argv[2]
  const source = process.argv[3]
  if (!slot || !source) {
    console.error('usage: export-slot.mjs <slot> <source-path>')
    process.exit(1)
  }
  exportSlot(slot, source)
    .then((r) => {
      const kb = (n) => (n / 1024).toFixed(1)
      console.log(
        `export ${r.slot}: ${r.width}x${r.height} avif ${kb(r.avifBytes)}KB (q${r.quality}, ceil ${kb(r.ceil)}KB, ${r.cleared ? 'OK' : 'OVER'}) jpg ${kb(r.jpgBytes)}KB`,
      )
      if (!r.cleared) process.exit(3)
    })
    .catch((e) => {
      console.error('export failed:', e.message)
      process.exit(1)
    })
}
