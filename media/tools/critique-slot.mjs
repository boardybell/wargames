// Slot critique driver (Stage C). Attaches a slot's generated raster to the
// image-critique lane (codex exec -i, rung 1 per discovery) with a critique
// brief and parses a verdict. The brief asks for: period accuracy (plausible
// 1983 hardware, nothing modern), crop quality, and, for the two constrained
// slots, dark-readout compliance. The reply must end with a VERDICT line of the
// form "VERDICT: PASS" or "VERDICT: REVISE" followed by findings.
//
// No heredocs. The shipped site never runs this. Usage:
//   node media/tools/critique-slot.mjs <slot> <image-path> [--dark]
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')

const DARK_SLOTS = new Set(['countdown-insert', 'failsafe-wall'])
const CODEX_TIMEOUT_MS = 240000

function brief(slot) {
  const lines = [
    `You are reviewing a generated art asset for the slot "${slot}" in a 1983`,
    `WarGames-inspired browser game. The aesthetic target is a DEC-raster 1983`,
    `CRT NORAD command room: deep navy-black shadow, cold electric-blue CRT glow,`,
    `amber and green indicator lamps, faint scanlines, period-accurate hardware.`,
    ``,
    `Judge the attached image on: (1) period accuracy, flag any contemporary or`,
    `implausible-for-1983 hardware, modern UI, flat panels, or anachronisms;`,
    `(2) composition and crop, flag awkward framing or a subject that will crop`,
    `badly in a full-bleed box; (3) baked-in text, flag any menu text, digits,`,
    `captions, titles, or watermarks that should not be on the art.`,
  ]
  if (DARK_SLOTS.has(slot)) {
    lines.push(
      ``,
      `DARK-READOUT CHECK (critical for this slot): the live game draws numbers`,
      `and status text over this art. Every readout surface, screen, or counter`,
      `band MUST be dark and empty. Flag any lit readout, baked digits, or bright`,
      `screen fill that would fight the live overlay.`,
    )
  }
  lines.push(
    ``,
    `Reply with a short findings list, then a final line in EXACTLY this form:`,
    `VERDICT: PASS   (if the asset is acceptable to ship as is)`,
    `VERDICT: REVISE (if material findings remain)`,
    `Use PASS only when there are no material findings.`,
  )
  return lines.join('\n')
}

function runCodex(image, prompt) {
  try {
    const stdout = execFileSync(
      'codex',
      ['exec', '--sandbox', 'read-only', '-i', image, '-'],
      { cwd: mediaDir, timeout: CODEX_TIMEOUT_MS, encoding: 'utf8', input: prompt, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return { ok: true, stdout: String(stdout) }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function critiqueSlot(slot, imagePath) {
  const res = runCodex(imagePath, brief(slot))
  if (!res.ok) return { ok: false, reason: `critique lane errored: ${res.error}`, slot }
  const text = res.stdout
  const m = /VERDICT:\s*(PASS|REVISE)/i.exec(text)
  if (!m) return { ok: false, reason: 'no verdict parsed', slot, raw: text }
  const verdict = m[1].toUpperCase()
  // Findings: everything before the verdict line, trimmed to the bullet-ish body.
  const before = text.slice(0, m.index).trim()
  return { ok: true, slot, verdict, findings: before, raw: text }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slot = process.argv[2]
  const image = process.argv[3]
  if (!slot || !image) {
    console.error('usage: critique-slot.mjs <slot> <image-path>')
    process.exit(1)
  }
  const r = critiqueSlot(slot, image)
  if (!r.ok) {
    console.error(`critique ${slot}: ${r.reason}`)
    process.exit(2)
  }
  console.log(`critique ${slot}: VERDICT ${r.verdict}`)
  if (r.findings) console.log(r.findings)
}
