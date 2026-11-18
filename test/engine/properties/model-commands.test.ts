import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type { CampaignState } from '@engine/campaign/state'
import { buildCtx, jsonSafetyViolations, T0 } from './helpers'
import { canonicalStringify, stateHash } from '../harness/canonical'

// The model tracks only enough to be informational; the system under test is
// the public dispatch over the test-double mission, and the INVARIANTS do the
// heavy lifting, not model-vs-real output equality.
interface Model {
  lastNow: number
}

// The real holder carries cross-command accumulators so suite-wide invariants
// (settlement exactly once, clue firing once, timeout reachability) can be
// checked as the sequence runs.
interface Real {
  ctx: EngineContext
  state: CampaignState
  settleCounts: Map<string, number>
  cluesSeen: Set<string>
}

const MISSION_IDS = ['alpha', 'beta', 'gamma'] as const
const RECORD_IDS = ['C17', 'F06', 'B04', 'W02'] as const
const MAX_DELTA = 400_000 // wider than the 240_000 deadline so timeouts fire

function everyNumberIsInteger(value: unknown): boolean {
  let ok = true
  const visit = (v: unknown): void => {
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) ok = false
      return
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        visit((v as Record<string, unknown>)[k])
      }
    }
  }
  visit(value)
  return ok
}

function queueSorted(
  queue: readonly { scheduledAt: number; id: string }[],
): boolean {
  for (let i = 1; i < queue.length; i++) {
    const a = queue[i - 1]!
    const b = queue[i]!
    if (
      a.scheduledAt > b.scheduledAt ||
      (a.scheduledAt === b.scheduledAt && a.id > b.id)
    ) {
      return false
    }
  }
  return true
}

function applyAndCheck(
  real: Real,
  model: Model,
  action: CampaignAction,
  delta: number,
): void {
  const before = real.state
  const now = before.lastNow + delta
  const beforeHash = stateHash(before)
  const result = dispatch(real.ctx, before, action, now)
  const after = result.state
  real.state = after
  model.lastNow = after.lastNow

  // lastNow never decreases.
  expect(after.lastNow).toBeGreaterThanOrEqual(before.lastNow)
  // A rejected action changes nothing BEYOND the clock advance that dispatch
  // always performs first. Compare against a pure advance to the same now:
  // the rejected action must add no effect of its own.
  if (result.rejection) {
    const advancedOnly = advanceCampaign(real.ctx, before, now)
    expect(stateHash(after)).toBe(stateHash(advancedOnly.state))
    // The rejected action also adds no emitted event beyond the advance's own.
    expect(canonicalStringify(result.emitted)).toBe(
      canonicalStringify(advancedOnly.emitted),
    )
  }
  void beforeHash
  // Both queues stay sorted by (scheduledAt, id).
  expect(queueSorted(after.missionQueue)).toBe(true)
  expect(queueSorted(after.campaignQueue)).toBe(true)
  // State stays JSON-safe and integer-valued.
  expect(jsonSafetyViolations(after)).toEqual([])
  expect(everyNumberIsInteger(after)).toBe(true)
  // NEW_CAMPAIGN deliberately starts a fresh campaign, so the within-campaign
  // monotonicity invariants (settled immutable, clues only grow, each mission
  // settles once) are reset at that boundary rather than asserted across it.
  const isReset = action.type === 'NEW_CAMPAIGN'
  if (!isReset) {
    // Settled outcomes are immutable once written.
    for (const prior of before.settled) {
      const now2 = after.settled.find((s) => s.missionId === prior.missionId)
      expect(now2).toBeDefined()
      expect(canonicalStringify(now2)).toBe(canonicalStringify(prior))
    }
    // cluesFound grows monotonically.
    expect(after.cluesFound.length).toBeGreaterThanOrEqual(
      before.cluesFound.length,
    )
  }
  // Emitted-event invariants: settlement and clueFound fire at most once per id.
  for (const event of result.emitted as EngineEvent[]) {
    if (event.type === 'settlement') {
      const n = (real.settleCounts.get(event.missionId) ?? 0) + 1
      real.settleCounts.set(event.missionId, n)
      expect(n).toBe(1)
    }
    if (event.type === 'clueFound') {
      expect(real.cluesSeen.has(event.clueId)).toBe(false)
      real.cluesSeen.add(event.clueId)
    }
  }
  // Fresh campaign: positively assert the reset produced a clean slate
  // (this is the regression the exemption would otherwise mask), then clear
  // the cross-command accumulators so the next campaign's first settlement
  // of a mission is not seen as a second one.
  if (isReset) {
    expect(after.settled).toHaveLength(0)
    expect(after.cluesFound).toHaveLength(0)
    expect(after.appliedConsequences).toHaveLength(0)
    expect(after.activeMission).toBeNull()
    real.settleCounts.clear()
    real.cluesSeen.clear()
  }
}

type Cmd = fc.Command<Model, Real>

function cmd(
  name: string,
  action: (missionOrRecord: string) => CampaignAction,
  arg: string,
  delta: number,
): Cmd {
  return {
    check: () => true, // run invalid actions too; rejection-is-a-no-op is an invariant
    run: (model, real) => applyAndCheck(real, model, action(arg), delta),
    toString: () => `${name}(${arg}, +${delta})`,
  }
}

const missionArb = fc.constantFrom(...MISSION_IDS)
const recordArb = fc.constantFrom(...RECORD_IDS)
const deltaArb = fc.nat({ max: MAX_DELTA })

const commandArb = fc.commands(
  [
    fc
      .tuple(missionArb, deltaArb)
      .map(([m, d]) =>
        cmd('Start', (id) => ({ type: 'START_MISSION', missionId: id }), m, d),
      ),
    fc
      .tuple(fc.constantFrom('DELIVER', 'DECOY', 'READ_AUDIT', 'POISON'), deltaArb)
      .map(([k, d]) =>
        cmd(
          'Mission',
          () => ({ type: 'MISSION_ACTION', payload: { kind: k } }),
          k,
          d,
        ),
      ),
    deltaArb.map((d) =>
      cmd('Forfeit', () => ({ type: 'FORFEIT_MISSION' }), '', d),
    ),
    fc
      .tuple(missionArb, deltaArb)
      .map(([m, d]) =>
        cmd(
          'Ack',
          (id) => ({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: id }),
          m,
          d,
        ),
      ),
    fc
      .tuple(recordArb, deltaArb)
      .map(([r, d]) =>
        cmd('Inspect', (id) => ({ type: 'INSPECT_RECORD', recordId: id }), r, d),
      ),
    fc
      .tuple(recordArb, deltaArb)
      .map(([r, d]) =>
        cmd(
          'SourceCheck',
          (id) => ({ type: 'REQUEST_SOURCE_CHECK', recordId: id }),
          r,
          d,
        ),
      ),
    fc
      .tuple(fc.boolean(), deltaArb)
      .map(([v, d]) =>
        cmd(
          'SetPref',
          () => ({ type: 'SET_PREFERENCE', preference: 'extendedTime', value: v }),
          String(v),
          d,
        ),
      ),
    deltaArb.map((d) =>
      cmd('New', () => ({ type: 'NEW_CAMPAIGN', seedName: 'test-seed' }), '', d),
    ),
    // A deadline-crossing advance: a benign action with a delta guaranteed
    // to exceed the 240_000 ms mission duration, so expiry is reliably
    // reachable (not left to the chance of a large nat).
    fc
      .integer({ min: 241_000, max: MAX_DELTA })
      .map((d) =>
        cmd(
          'CrossDeadline',
          () => ({
            type: 'SET_PREFERENCE',
            preference: 'extendedTime',
            value: false,
          }),
          'tick',
          d,
        ),
      ),
  ],
  { maxCommands: 40 },
)

describe('model-based command suite', () => {
  it('upholds every invariant across generated command sequences', () => {
    fc.assert(
      fc.property(commandArb, (cmds) => {
        const setup = () => {
          const ctx = buildCtx()
          const real: Real = {
            ctx,
            state: createCampaign(
              ctx,
              'test-seed',
              { extendedTime: false },
              T0,
            ),
            settleCounts: new Map(),
            cluesSeen: new Set(),
          }
          return { model: { lastNow: T0 }, real }
        }
        fc.modelRun(setup, cmds)
      }),
      { numRuns: 200 },
    )
  })

  it('a deadline-crossing clock settles the active mission by timeout, once', () => {
    // Targeted precondition for timeout reachability (the plan permits this
    // over purely-random reachability): start a mission, then advance past
    // its deadline. The expiry must settle it as 'timeout' and emit exactly
    // one settlement event for it.
    const ctx = buildCtx()
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
    state = dispatch(
      ctx,
      state,
      { type: 'START_MISSION', missionId: 'alpha' },
      T0 + 1_000,
    ).state
    const endsAt = state.activeMission!.endsAt
    const crossed = dispatch(
      ctx,
      state,
      { type: 'SET_PREFERENCE', preference: 'extendedTime', value: false },
      endsAt + 60_000,
    )
    const settlements = crossed.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(crossed.state.settled.some((s) => s.cause === 'timeout')).toBe(true)
  })
})
