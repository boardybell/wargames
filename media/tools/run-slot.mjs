// Per-slot pipeline runner: generate -> critique (up to 3 rounds, regenerating
// on REVISE) -> export within the byte ceiling. Emits a JSON record of the loop
// (rounds, final verdict/disposition, export stats) to stdout as the last line,
// prefixed RESULT: so a caller can parse it. Review rounds are the caller's to
// append to REVIEWS.md (it knows the real exported filename).
//
// Three-round cap honored: after round 3 a still-REVISE loop is locked with
// known findings (disposition locked-with-known-findings, findings non-empty).
//
// No heredocs. Usage: node media/tools/run-slot.mjs <slot>
import { fileURLToPath } from 'node:url'
import { generateSlot } from './generate-slot.mjs'
import { critiqueSlot } from './critique-slot.mjs'
import { exportSlot } from './export-slot.mjs'

const MAX_ROUNDS = 3

export async function runSlot(slot) {
  const rounds = []
  let lastFile = null
  let disposition = 'revise'
  let finalFindings = ''

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const gen = await generateSlot(slot)
    if (!gen.ok) {
      return { ok: false, slot, reason: `generation failed: ${gen.reason}`, rounds }
    }
    lastFile = gen.file
    const crit = critiqueSlot(slot, gen.file)
    if (!crit.ok) {
      // Critique lane unavailable: record the round with an honest note and stop.
      rounds.push({ round, verdict: 'unknown', findings: crit.reason })
      finalFindings = crit.reason
      disposition = 'locked-with-known-findings'
      break
    }
    rounds.push({ round, verdict: crit.verdict, findings: crit.findings })
    if (crit.verdict === 'PASS') {
      disposition = 'accepted'
      finalFindings = ''
      break
    }
    finalFindings = crit.findings
    if (round === MAX_ROUNDS) {
      disposition = 'locked-with-known-findings'
    }
  }

  const exp = await exportSlot(slot, lastFile)
  // Fail loudly if the AVIF could not be brought under its byte ceiling, rather
  // than leaning on the committed-file CI gate to catch an over-ceiling asset.
  if (exp && exp.cleared === false) {
    return {
      ok: false,
      slot,
      rounds,
      disposition,
      finalFindings,
      sourceFile: lastFile,
      export: exp,
      reason: `export over byte ceiling for ${slot}`,
    }
  }
  return {
    ok: true,
    slot,
    rounds,
    disposition,
    finalFindings,
    sourceFile: lastFile,
    export: exp,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slot = process.argv[2]
  if (!slot) {
    console.error('usage: run-slot.mjs <slot>')
    process.exit(1)
  }
  runSlot(slot)
    .then((r) => {
      console.log('RESULT: ' + JSON.stringify(r))
      if (!r.ok) process.exit(2)
    })
    .catch((e) => {
      console.error('run-slot failed:', e.message)
      process.exit(1)
    })
}
