// Intake watcher. Watches media/intake/ for arrivals named by the request
// convention (NN-slot.ext), moves each match into media/src/<slot>/, and
// prints a running checklist of outstanding requests. fs.watch with a short
// debounce is enough; the watcher is a convenience, not a correctness surface.
// Section 02 drives it continuously. The matching and move logic is exported
// pure so a test can plant a file and assert it moves without starting a
// long-lived watch.
import { watch, mkdirSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename, extname } from 'node:path'
import { SLOT_ORDER } from './request-writer.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')
const intakeDir = join(mediaDir, 'intake')
const srcDir = join(mediaDir, 'src')

const VALID_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])

/** Parse an arrival filename of the form NN-slot.ext. Returns { nn, slot, ext }
 *  for a valid name, or null. The slot must be a known slot id; the extension
 *  must be a raster we accept. */
export function parseArrival(name) {
  const ext = extname(name).toLowerCase()
  if (!VALID_EXT.has(ext)) return null
  const stem = basename(name, extname(name))
  const m = /^(\d{2})-(.+)$/.exec(stem)
  if (!m) return null
  const [, nn, slot] = m
  if (!SLOT_ORDER.includes(slot)) return null
  return { nn, slot, ext }
}

/** Move one arrival from intake to media/src/<slot>/. Returns the destination
 *  path, or null if the name does not match. Pure enough to unit test: give it
 *  real dirs and a planted file. */
export function fileArrival(name, fromDir = intakeDir, toRoot = srcDir) {
  const parsed = parseArrival(name)
  if (!parsed) return null
  const destDir = join(toRoot, parsed.slot)
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, `${parsed.nn}-${parsed.slot}${parsed.ext}`)
  renameSync(join(fromDir, name), dest)
  return dest
}

/** The outstanding checklist: slot ids that have no filed source yet. */
export function outstanding(toRoot = srcDir) {
  return SLOT_ORDER.filter((slot) => {
    const d = join(toRoot, slot)
    return !existsSync(d) || readdirSync(d).length === 0
  })
}

function printChecklist() {
  const left = outstanding()
  if (left.length === 0) {
    console.log('intake: all slots filed.')
  } else {
    console.log(`intake: ${left.length} outstanding -> ${left.join(', ')}`)
  }
}

// Long-lived watch mode: node intake-watch.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(intakeDir, { recursive: true })
  mkdirSync(srcDir, { recursive: true })
  console.log(`intake: watching ${intakeDir}`)
  printChecklist()
  let timer = null
  const pending = new Set()
  watch(intakeDir, (_event, filename) => {
    if (!filename) return
    pending.add(filename)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      for (const name of pending) {
        if (!existsSync(join(intakeDir, name))) continue
        const dest = fileArrival(name)
        if (dest) console.log(`intake: filed ${name} -> ${dest}`)
      }
      pending.clear()
      printChecklist()
    }, 300)
  })
}
