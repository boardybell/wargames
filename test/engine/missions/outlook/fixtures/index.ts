// The section-04 fixtures directory. The walkthrough and adversarial
// scripts already live in test/engine/missions/outlook/fixtures.ts (section
// 02 authored them and solvability.test.ts drives them). This directory
// re-exports those exact scripts keyed by seed id, per the section-04
// file layout, rather than forking them: one source of truth for the
// solvability proofs that both the solvability suite and the CI fixture
// matrix replay.
//
// A fixture script is a deterministic ordered list of [CampaignAction, now]
// envelopes replayed through the real engine lifecycle (START_MISSION, then
// interleaved dispatch/advance). The loaders below take a seed id so a
// describe.each matrix can pull the right script per seed; today every seed
// shares the same structural payload, so the scripts are seed-agnostic
// except where they read the live payload (the trust-the-hints variant).
import type { Envelope } from '../fixtures'
import {
  outlookAdversarialEnvelopes,
  outlookBackupWalkthroughEnvelopes,
  outlookTrustHintsEnvelopes,
  outlookWalkthroughEnvelopes,
  OUTLOOK_T0,
} from '../fixtures'

export type { Envelope } from '../fixtures'
export {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  driveOutlook,
  outlookContextForSeed,
  outlookSub,
} from '../fixtures'

/** The intended-solution script for a seed: read the three required
 *  messages (audit first so the clue test can piggyback), route each to
 *  its correct desk on the primary channel while it is up, and leave the
 *  whole backup capacity spare. Keyed by seed id for the CI matrix. */
export function walkthroughScript(_seedId: string, t0 = OUTLOOK_T0): Envelope[] {
  return outlookWalkthroughEnvelopes(t0)
}

/** A backup-spending walkthrough that keeps the spare-slot margin
 *  load-bearing: weather and payroll on primary, the audit late over
 *  backup, so backupRemaining lands strictly between 1 and 5. */
export function backupWalkthroughScript(
  _seedId: string,
  t0 = OUTLOOK_T0,
): Envelope[] {
  return outlookBackupWalkthroughEnvelopes(t0)
}

/** The send-everything adversarial for a seed: spray SEND at every message
 *  to a single desk and burn the backup on duplicates and decoys. Only one
 *  required kind can satisfy, so the run ends below tier full. */
export function adversarialScript(_seedId: string, t0 = OUTLOOK_T0): Envelope[] {
  return outlookAdversarialEnvelopes(t0)
}

/** The naive trust-the-hints adversarial for a seed: route every message
 *  to the desk its visible recipient hint names, never reading a body. The
 *  live payroll head carries no hint, so this never satisfies all three. */
export function trustHintsScript(seedId: string, t0 = OUTLOOK_T0): Envelope[] {
  return outlookTrustHintsEnvelopes(seedId, t0)
}
