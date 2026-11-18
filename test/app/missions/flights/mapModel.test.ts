// Pure map-model tests. No DOM. Every FlightsState comes from the REAL engine
// (createCampaign + dispatch + advanceCampaign over the fixture), never a
// hand-mutated object, so the drained/undrained separation is tested against
// the engine's own folding, not a stub.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine'
import type { CampaignState } from '@engine'
import { buildMapModel, CELL, flightMarkerCells } from '@app/missions/flights/mapModel'
import type { FlightsState } from '@engine/missions/flights/types'
import type { FlightsPayload } from '@engine/missions/flights/content'
import {
  FLIGHTS_FIXTURE_PAYLOAD,
  makeFlightsCtx,
  flightsSub,
} from './fixture'

const T0 = 1_000_000

function started(ctx: EngineContext, at = T0): CampaignState {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, at).state
  return state
}

/** All class hooks appearing in a cell matrix. */
function hooksIn(cells: ReadonlyArray<ReadonlyArray<{ classHook?: string }>>): Set<string> {
  const set = new Set<string>()
  for (const row of cells) for (const cell of row) if (cell.classHook) set.add(cell.classHook)
  return set
}

describe('mapModel projection', () => {
  it('snapshots the cell matrix per state fixture: hubs bracketed, corridors as line characters, flight markers placed', () => {
    const ctx = makeFlightsCtx()
    const state = started(ctx)
    const model = buildMapModel(flightsSub(state), FLIGHTS_FIXTURE_PAYLOAD, null)
    const rendered = model.cells.map((row) => row.map((c) => c.char).join(''))
    expect(rendered).toMatchSnapshot()
    // Hubs are bracketed; corridors use line characters; markers are placed.
    const hooks = hooksIn(model.cells)
    expect(hooks.has(CELL.hubOpen)).toBe(true)
    expect(hooks.has(CELL.corridorOpen)).toBe(true)
    expect(hooks.has(CELL.flight)).toBe(true)
  })

  it('renders current weather solid and projection hatched, visually distinct cell kinds in the model output', () => {
    const ctx = makeFlightsCtx()
    // At mission start, before the correction at 50s is applied, the Meridian
    // Sable corridor (C-MS, changedId of the pending correction) is hatched.
    const atStart = buildMapModel(flightsSub(started(ctx)), FLIGHTS_FIXTURE_PAYLOAD, null)
    expect(hooksIn(atStart.cells).has(CELL.corridorProjection)).toBe(true)

    // Drive to 45s: the storm closed C-MS at 40s (current weather, SOLID) but
    // the correction at 50s has NOT yet applied, so some corridor renders solid
    // storm-closed. Solid and hatched are distinct cell kinds.
    let state = started(ctx)
    state = advanceCampaign(ctx, state, T0 + 45_000).state
    const at45 = buildMapModel(flightsSub(state), FLIGHTS_FIXTURE_PAYLOAD, null)
    const hooks = hooksIn(at45.cells)
    expect(hooks.has(CELL.corridorStorm)).toBe(true)
    // The two kinds are not the same class hook (distinct, not color alone).
    expect(CELL.corridorStorm).not.toEqual(CELL.corridorProjection)
  })

  it('a single storm-closed hub does NOT light the all-hubs restriction marker', () => {
    const ctx = makeFlightsCtx()
    let state = started(ctx)
    // The storm closes CASCADE at 80s: exactly one hub is closed, which is a
    // weather closure the hub bracket shows, NOT the blanket all-hubs order. The
    // restriction marker must stay dark (tighter semantics than any-hub-closed).
    state = advanceCampaign(ctx, state, T0 + 85_000).state
    const sub = flightsSub(state)
    expect(sub.closedHubs).toEqual(['CASCADE'])
    const model = buildMapModel(sub, FLIGHTS_FIXTURE_PAYLOAD, null)
    const hooks = hooksIn(model.cells)
    // One hub is closed (CASCADE), but the restriction glyph does not appear.
    expect(hooks.has(CELL.hubClosed)).toBe(true)
    expect(hooks.has(CELL.restriction)).toBe(false)
  })

  it('lights the all-hubs restriction marker only when EVERY hub is closed, distinct from both weather kinds', () => {
    // A variant payload whose storm closes all four hubs at once is the actual
    // blanket all-hubs restriction (the F06/D-83 fiction). Driven through the
    // REAL engine, same as every other case here.
    const allHubsPayload: FlightsPayload = {
      ...FLIGHTS_FIXTURE_PAYLOAD,
      stormTrack: [
        {
          offsetSeconds: 40,
          closeHubs: ['MERIDIAN', 'CASCADE', 'SABLE', 'VERDANT'],
          openHubs: [],
          closeCorridors: [],
          openCorridors: [],
          warningLine: 'ALL HUBS RESTRICTED. FIELD BLANKET CLOSED.',
          cueId: 'tone-storm-1',
        },
      ],
      corrections: [],
    }
    const ctx = makeFlightsCtx(allHubsPayload)
    let state = started(ctx)
    // Before the storm at 40s, not every hub is closed: the marker is dark.
    const before = buildMapModel(flightsSub(state), allHubsPayload, null)
    expect(hooksIn(before.cells).has(CELL.restriction)).toBe(false)
    // After 45s the storm has closed every hub: the blanket restriction lights.
    state = advanceCampaign(ctx, state, T0 + 45_000).state
    const sub = flightsSub(state)
    expect(sub.closedHubs.slice().sort()).toEqual([
      'CASCADE',
      'MERIDIAN',
      'SABLE',
      'VERDANT',
    ])
    const model = buildMapModel(sub, allHubsPayload, null)
    const hooks = hooksIn(model.cells)
    expect(hooks.has(CELL.restriction)).toBe(true)
    expect(hooks.has(CELL.hubClosed)).toBe(true)
    expect(CELL.restriction).not.toEqual(CELL.corridorStorm)
    expect(CELL.restriction).not.toEqual(CELL.corridorProjection)
  })

  it('marks the selected flight marker with the selection classHook and no other cell', () => {
    const ctx = makeFlightsCtx()
    const state = started(ctx)
    const sub = flightsSub(state)
    const model = buildMapModel(sub, FLIGHTS_FIXTURE_PAYLOAD, 'WX101')
    let selectedCount = 0
    for (const row of model.cells) {
      for (const cell of row) {
        if (cell.classHook === CELL.flightSelected) selectedCount += 1
      }
    }
    expect(selectedCount).toBe(1)
    // Unselected view has zero selection hooks.
    const none = buildMapModel(sub, FLIGHTS_FIXTURE_PAYLOAD, null)
    expect(hooksIn(none.cells).has(CELL.flightSelected)).toBe(false)
  })

  it('produces the legend from payload data alone', () => {
    const ctx = makeFlightsCtx()
    const model = buildMapModel(flightsSub(started(ctx)), FLIGHTS_FIXTURE_PAYLOAD, null)
    const labels = model.legend.map((e) => e.label)
    expect(labels).toContain('ALL-HUBS RESTRICTION')
    expect(labels.some((l) => l.includes('CURRENT'))).toBe(true)
    expect(labels.some((l) => l.includes('HATCHED'))).toBe(true)
    // Every legend entry carries a distinct class hook and a glyph.
    expect(new Set(model.legend.map((e) => e.classHook)).size).toBeGreaterThan(1)
    for (const entry of model.legend) expect(entry.glyph.length).toBeGreaterThan(0)
  })

  it('reads only drained state plus payload: a pending (undrained) storm event does not change output versus the drained-state snapshot', () => {
    const ctx = makeFlightsCtx()
    // Drained to exactly 35s: the storm step at 40s has NOT fired, so it sits
    // undrained in the queue. The map must look identical to the pristine
    // just-started map for the corridors the storm will later touch, because
    // the model never reads the undrained event.
    let stateUndrained = started(ctx)
    stateUndrained = advanceCampaign(ctx, stateUndrained, T0 + 35_000).state
    const undrained: FlightsState = flightsSub(stateUndrained)

    const pristine: FlightsState = flightsSub(started(ctx))

    const a = buildMapModel(undrained, FLIGHTS_FIXTURE_PAYLOAD, null).cells.map((r) =>
      r.map((c) => `${c.char}|${c.classHook}`).join(','),
    )
    const b = buildMapModel(pristine, FLIGHTS_FIXTURE_PAYLOAD, null).cells.map((r) =>
      r.map((c) => `${c.char}|${c.classHook}`).join(','),
    )
    // Flight statuses differ (departures at 10/20/30s have fired by 35s), but
    // the storm-driven weather cells are unchanged, because no storm event has
    // folded yet. Prove it by comparing the corridor/hub cells only.
    expect(undrained.closedCorridors).toEqual([])
    expect(undrained.closedHubs).toEqual([])
    expect(pristine.closedCorridors).toEqual([])
    // The full matrices may differ only in flight glyphs; weather is identical.
    const weatherOnly = (
      grid: string[],
    ): string[] => grid.map((r) => r.replace(/[o*H=x?]/g, '.'))
    expect(weatherOnly(a)).toEqual(weatherOnly(b))
  })
})

describe('flightMarkerCells', () => {
  it('lists marker positions in reading order (row-major)', () => {
    const ctx = makeFlightsCtx()
    const cells = flightMarkerCells(flightsSub(started(ctx)), FLIGHTS_FIXTURE_PAYLOAD)
    expect(cells.length).toBe(FLIGHTS_FIXTURE_PAYLOAD.flights.length)
    for (let i = 1; i < cells.length; i += 1) {
      const prev = cells[i - 1]!
      const cur = cells[i]!
      const prevKey = prev.row * 1000 + prev.col
      const curKey = cur.row * 1000 + cur.col
      expect(curKey).toBeGreaterThanOrEqual(prevKey)
    }
  })
})
