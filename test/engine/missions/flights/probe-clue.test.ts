import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { advanceCampaign, createCampaign, dispatch } from '@engine/campaign/engine'
import { buildTargetRecordId } from '@engine/missions/flights/rules'
import {
  flightsContext,
  flightsSub,
  start,
  FLIGHTS_T0,
  FIXTURE_PAYLOAD,
  FLIGHTS_CLUE_ID,
  RESTRICTION_RECORD_ID,
} from './fixtures'

const ctx = flightsContext()

describe('PROBE', () => {
  it('maps a corridor to its authored field-report record id', () => {
    expect(buildTargetRecordId(FIXTURE_PAYLOAD, 'C-MC')).toBe('W02')
  })

  it('a mission PROBE marks the corridor and writes nothing to the mission queue', () => {
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    const idsBefore = new Set(state.missionQueue.map((e) => e.id))
    const result = dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'PROBE', corridorId: 'C-MC' } },
      FLIGHTS_T0 + 1_000,
    )
    expect(result.rejection).toBeNull()
    // No NEW mission-scheduled event id appears from a PROBE: the queue may
    // only shrink as time drains it. Every surviving id was already present;
    // the PROBE scheduled nothing.
    const idsAfter = result.state.missionQueue.map((e) => e.id)
    for (const id of idsAfter) {
      expect(idsBefore.has(id)).toBe(true)
    }
    expect(flightsSub(result.state).probed).toContain('C-MC')
  })

  it('the shell path: REQUEST_SOURCE_CHECK on the mapped record resolves via the shared deskChecks', () => {
    const recordId = buildTargetRecordId(FIXTURE_PAYLOAD, 'C-MC')!
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    const req = dispatch(
      ctx,
      state,
      { type: 'REQUEST_SOURCE_CHECK', recordId },
      FLIGHTS_T0 + 1_000,
    )
    expect(req.rejection).toBeNull()
    // Advance past the desk delay to resolve the reply.
    const resolved = advanceCampaign(ctx, req.state, FLIGHTS_T0 + 30_000)
    const reply = resolved.emitted.find((e) => e.type === 'sourceCheckResolved')
    expect(reply).toMatchObject({ recordId: 'W02', outcome: 'CONFIRMED' })
  })
})

describe('the D-83 clue is engine-owned, not mission-owned', () => {
  it('inspecting the restriction record logs the clue exactly once through clueRecords', () => {
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    const first = dispatch(
      ctx,
      state,
      { type: 'INSPECT_RECORD', recordId: RESTRICTION_RECORD_ID },
      FLIGHTS_T0 + 1_000,
    )
    const clues = first.emitted.filter((e) => e.type === 'clueFound')
    expect(clues).toEqual([{ type: 'clueFound', clueId: FLIGHTS_CLUE_ID }])
    // A second inspect logs nothing new.
    const second = dispatch(
      ctx,
      first.state,
      { type: 'INSPECT_RECORD', recordId: RESTRICTION_RECORD_ID },
      FLIGHTS_T0 + 2_000,
    )
    expect(second.emitted.filter((e) => e.type === 'clueFound')).toEqual([])
    expect(first.state.cluesFound).toEqual([FLIGHTS_CLUE_ID])
  })

  it('the flights module source carries no clue code (no clues(), no inspection flag)', () => {
    const modulePath = fileURLToPath(
      new URL('../../../../src/engine/missions/flights/module.ts', import.meta.url),
    )
    const source = readFileSync(modulePath, 'utf8')
    // No clues() method implementation (a `clues(state` signature) and no
    // inspection flag. Comments may mention the word; the live module
    // surface is the real guarantee asserted below.
    expect(source).not.toMatch(/clues\s*\(\s*state/)
    expect(source).not.toMatch(/restrictionInspected/)
    const module = ctx.missions['flights']!
    expect(module.clues).toBeUndefined()
  })
})
