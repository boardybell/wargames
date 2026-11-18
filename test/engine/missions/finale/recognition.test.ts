import { describe, expect, it } from 'vitest'
import type { CampaignState } from '@engine/campaign/state'
import {
  FIELD_REPORT_ID,
  act,
  advanceCampaign,
  caseFileFrom,
  dispatch,
  finaleState,
  startedFinale,
} from './fixtures'

/** Fill the five slots correctly and corroborate the observation via the
 *  field report desk, returning the live state poised to validate true. */
function fillCorrectCase(
  ctx: ReturnType<typeof startedFinale>['ctx'],
  state: CampaignState,
  startedAt: number,
): CampaignState {
  let current = state
  // Corroborate the observation: request + resolve the field report desk.
  current = dispatch(
    ctx,
    current,
    { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
    startedAt + 500,
  ).state
  current = advanceCampaign(ctx, current, startedAt + 25_000).state
  const fills: Array<[string, string]> = [
    ['outlook', 'C17'],
    ['flights', 'F06'],
    ['bank', 'B04'],
    ['root', 'C17'],
    ['observation', FIELD_REPORT_ID],
  ]
  let now = startedAt + 26_000
  for (const [slot, recordId] of fills) {
    current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
    now += 1_000
  }
  current = act(
    ctx,
    current,
    { kind: 'REORDER', ordering: ['C17', 'F06', 'B04'] },
    now,
  ).state
  return current
}

/** The recognition beat is DERIVED, not persisted: it is the caseValid
 *  false-to-true transition itself. Fired on a reduce means caseValid was false
 *  before and is true after. */
function recognitionFired(before: CampaignState, after: CampaignState): boolean {
  return !finaleState(before).caseValid && finaleState(after).caseValid
}

describe('finale recognition beat', () => {
  it('keys on the caseValid false-to-true transition and fires exactly once', () => {
    const { ctx, state, startedAt } = startedFinale()
    const ready = fillCorrectCase(ctx, state, startedAt)
    const cf = caseFileFrom(ready)
    let now = startedAt + 40_000

    // First validate: false -> true. The recognition beat fires on THIS reduce.
    const first = act(ctx, ready, { kind: 'VALIDATE', caseFile: cf }, now)
    expect(finaleState(first.state).caseValid).toBe(true)
    expect(recognitionFired(ready, first.state)).toBe(true)

    // Break it (clear a slot), validate again (now false): caseValid goes
    // false; this is not a false-to-true transition, so no beat.
    now += 1_000
    const broken = act(
      ctx,
      first.state,
      { kind: 'CLEAR', slot: 'observation' },
      now,
    ).state
    now += 1_000
    const invalid = act(
      ctx,
      broken,
      { kind: 'VALIDATE', caseFile: caseFileFrom(broken) },
      now,
    )
    expect(finaleState(invalid.state).caseValid).toBe(false)
    expect(recognitionFired(broken, invalid.state)).toBe(false)

    // Fix it and re-validate true: a false-to-true transition fires the beat
    // again ONLY because the case had gone invalid in between. A reload between
    // the first validate and this one cannot wrongly re-permit or suppress the
    // beat: the beat is a pure function of the persisted caseValid before/after
    // this reduce, and caseValid round-trips through the saveSchema.
    now += 1_000
    const refixed = act(
      ctx,
      invalid.state,
      { kind: 'SELECT', slot: 'observation', recordId: FIELD_REPORT_ID },
      now,
    ).state
    now += 1_000
    const revalid = act(
      ctx,
      refixed,
      { kind: 'VALIDATE', caseFile: caseFileFrom(refixed) },
      now,
    )
    expect(finaleState(revalid.state).caseValid).toBe(true)
    expect(recognitionFired(refixed, revalid.state)).toBe(true)
  })

  it('a later re-validation of an already-valid case does not re-fire', () => {
    const { ctx, state, startedAt } = startedFinale()
    const ready = fillCorrectCase(ctx, state, startedAt)
    let now = startedAt + 40_000
    const first = act(
      ctx,
      ready,
      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
      now,
    )
    expect(recognitionFired(ready, first.state)).toBe(true)
    // Re-validate an already-valid case: caseValid stays true, so there is no
    // false-to-true transition and the beat does not fire again.
    now += 1_000
    const second = act(
      ctx,
      first.state,
      { kind: 'VALIDATE', caseFile: caseFileFrom(first.state) },
      now,
    )
    expect(finaleState(second.state).caseValid).toBe(true)
    expect(recognitionFired(first.state, second.state)).toBe(false)
  })

  it('no new EngineEvent kind is emitted on validation; emitted stays closed', () => {
    const { ctx, state, startedAt } = startedFinale()
    const ready = fillCorrectCase(ctx, state, startedAt)
    const result = act(
      ctx,
      ready,
      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
      startedAt + 40_000,
    )
    // The only known kinds are the engine's closed union; no 'recognition'
    // event exists.
    for (const e of result.emitted) {
      expect(e.type).not.toBe('recognition')
    }
  })
})
