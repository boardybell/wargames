// The drained-state replay helper for the section-04 fixtures. runScript
// replays a scripted sequence of timed [CampaignAction, now] envelopes through
// the REAL engine lifecycle, ALWAYS advancing to each step's time before the
// dispatch, so every decision lands against drained state exactly as real play
// does (the drain-then-reduce ordering the rules were tested with in section
// 01). It returns the final campaign state plus every emitted event, so a
// fixture can assert settlement causes, clue events, and scheduled fires
// without re-deriving them.
//
// A script envelope IS already [action, now]; advancing to `now` first before
// dispatching mirrors dispatch's own advance-then-reduce, but makes the drain
// explicit and lets a fixture insert a bare advance step by repeating a time.
// Do NOT batch dispatches at a single time unless the script explicitly encodes
// a same-call race; the solvability scripts never do.
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { EngineEvent } from '@engine/campaign/types'
import { FLIGHTS_T0, withMaxConsequences } from '../fixtures'
import type { Envelope, RunResult } from '../fixtures'

export interface RunScriptOptions {
  /** Advance past this absolute ms after the last envelope, so unrouted
   *  airborne flights strand and the mission settles. Null leaves the mission
   *  live at the last envelope's time (used to sample mid-run substate). */
  readonly settleAt?: number | null
  /** Seed the folded inbound consequences that remove one runway slot at the
   *  pinned hub and widen the projection divergence, driving the max-penalty
   *  fixtures. */
  readonly maxConsequences?: boolean
  /** The mission-start wall time the campaign is created at. Integer. */
  readonly t0?: number
}

/** Replay a script over an authored seed with drained-state discipline:
 *  advance to each envelope's time, then dispatch there. Returns the final
 *  state and all emitted events. */
export function runScript(
  ctx: EngineContext,
  seedName: string,
  envelopes: Envelope[],
  options: RunScriptOptions = {},
): RunResult {
  const t0 = options.t0 ?? FLIGHTS_T0
  const settleAt = options.settleAt === undefined ? null : options.settleAt
  let state: CampaignState = createCampaign(
    ctx,
    seedName,
    { extendedTime: false },
    t0,
  )
  if (options.maxConsequences) state = withMaxConsequences(state)
  const emitted: EngineEvent[] = []
  for (const [action, now] of envelopes) {
    // Drain to this step's time first so the decision lands against drained
    // state, then reduce the action at the same time. dispatch itself advances
    // to `now` before reducing, so a bare advance here is redundant for the
    // common case; it only matters when a prior envelope settled the mission
    // (advance keeps the lifecycle moving) or a fixture repeats a time to force
    // an explicit drain. Keeping it explicit documents the discipline.
    const drained = advanceCampaign(ctx, state, now)
    state = drained.state
    emitted.push(...drained.emitted)
    const result = dispatch(ctx, state, action, now)
    state = result.state
    emitted.push(...result.emitted)
  }
  if (settleAt !== null) {
    const advanced = advanceCampaign(ctx, state, settleAt)
    state = advanced.state
    emitted.push(...advanced.emitted)
  }
  return { state, emitted }
}
