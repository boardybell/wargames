// Shared fixtures and folds for the cross-cutting property suites. Every
// suite replays envelopes identically through this fold so determinism is
// compared on one code path. Scoped to the permanent test-double mission:
// the real seed missions land in splits 03-06, which bring their own
// walkthrough fixtures; here the three test-double missions (alpha, beta,
// gamma) carry the determinism story at the engine-core level.
import { buildTestContext } from '@engine/testing'
import { dispatch } from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type { CampaignState } from '@engine/campaign/state'
import { FIXTURE_RECORDS } from '../records/fixtures'

export interface Envelope {
  readonly action: CampaignAction
  readonly now: number
}

export const T0 = 1_000_000
export const MISSION_IDS = ['alpha', 'beta', 'gamma'] as const

export function buildCtx(): EngineContext {
  return buildTestContext(FIXTURE_RECORDS)
}

export interface FoldResult {
  readonly state: CampaignState
  readonly emitted: readonly EngineEvent[]
  /** State after each envelope, including the initial, for replay slicing. */
  readonly trail: readonly CampaignState[]
}

export function foldEnvelopes(
  ctx: EngineContext,
  initial: CampaignState,
  log: readonly Envelope[],
): FoldResult {
  let state = initial
  const emitted: EngineEvent[] = []
  const trail: CampaignState[] = [state]
  for (const { action, now } of log) {
    const result = dispatch(ctx, state, action, now)
    state = result.state
    emitted.push(...result.emitted)
    trail.push(state)
  }
  return { state, emitted, trail }
}

/** A full three-mission walkthrough over the test double: each mission
 *  started, delivered to completion, and its debrief acknowledged, so the
 *  finale gate unlocks. now values strictly increase. */
export function walkthroughLog(
  order: readonly string[] = MISSION_IDS,
): Envelope[] {
  const log: Envelope[] = []
  let now = T0 + 1_000
  for (const missionId of order) {
    log.push({ action: { type: 'START_MISSION', missionId }, now })
    now += 1_000
    for (let i = 0; i < 3; i++) {
      log.push({
        action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
        now,
      })
      now += 1_000
    }
    log.push({
      action: { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
      now,
    })
    now += 1_000
  }
  return log
}

/** A walkthrough whose first mission is allowed to time out: start alpha,
 *  then let the deadline pass before any delivery completes. Exercises the
 *  expiry settlement path under replay. */
export function timeoutLog(): Envelope[] {
  const start = T0 + 1_000
  // Mission duration is 240_000 ms; cross it with a wide margin.
  const pastDeadline = start + 240_000 + 60_000
  return [
    { action: { type: 'START_MISSION', missionId: 'alpha' }, now: start },
    { action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, now: start + 1_000 },
    // This envelope's now is past the deadline: advance settles the mission
    // by timeout before the action is considered.
    { action: { type: 'INSPECT_RECORD', recordId: 'C17' }, now: pastDeadline },
  ]
}

const DISALLOWED = new Set(['[object Map]', '[object Set]', '[object Date]'])

/** Walk a value asserting it is JSON-safe: finite numbers only, no
 *  undefined, NaN, Infinity, Map, Set, Date. Returns a list of violations
 *  (empty when clean) with their paths. */
export function jsonSafetyViolations(value: unknown, path = '$'): string[] {
  const out: string[] = []
  const visit = (v: unknown, p: string): void => {
    if (v === null) return
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) out.push(`${p}: non-finite number`)
      return
    }
    if (typeof v === 'undefined') {
      out.push(`${p}: undefined`)
      return
    }
    if (typeof v === 'string' || typeof v === 'boolean') return
    if (Array.isArray(v)) {
      v.forEach((el, i) => visit(el, `${p}[${i}]`))
      return
    }
    if (typeof v === 'object') {
      const tag = Object.prototype.toString.call(v)
      if (DISALLOWED.has(tag)) {
        out.push(`${p}: ${tag}`)
        return
      }
      for (const key of Object.keys(v as Record<string, unknown>)) {
        visit((v as Record<string, unknown>)[key], `${p}.${key}`)
      }
      return
    }
    out.push(`${p}: ${typeof v}`)
  }
  visit(value, path)
  return out
}
