// The section-04 GROUND ALL FLIGHTS fixtures directory. The walkthrough,
// alternate full-tier, adversarial, and blanket-grounding scripts already live
// in test/engine/missions/flights/fixtures.ts (section 02 authored them and
// solvability.test.ts drives them). This directory re-exports those EXACT
// scripts and helpers, per the section-04 file layout, rather than forking
// them: one source of truth for the solvability proofs that both the
// solvability suite and the CI fixture matrix replay. If a fixture fails, the
// fix belongs in the seed or the rules, never a fixture-local patch.
//
// A fixture script is a deterministic ordered list of [CampaignAction, now]
// envelopes replayed through the real engine lifecycle (START_MISSION, then
// interleaved dispatch/advance). The loaders below take a seed name so a
// describe.each matrix over SEED_NAMES pulls the right script per seed; the
// scripts read the live authored payload, so they move with the three seeds.
export type { Envelope, RunResult } from '../fixtures'
export {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  adversarialGroundAllFor,
  alternateFor,
  driveFlightsSeed,
  flightsContextForSeed,
  flightsPayloadFor,
  flightsSub,
  groundAllAtStartFor,
  lastArrivalOffsetSeconds,
  scriptArrivals,
  walkthroughFor,
  withMaxConsequences,
} from '../fixtures'

export { runScript } from '../helpers/runScript'
