import { describe, expect, it } from 'vitest'
import { materializeSchedule } from '@engine/time'
import { flightsSchedule } from '@engine/missions/flights/module'
import {
  flightsContext,
  flightsSub,
  drive,
  start,
  FLIGHTS_T0,
  FLIGHTS_DURATION_MS,
  FIXTURE_PAYLOAD,
} from './fixtures'

const ctx = flightsContext()

// The spec's key testable property: the forecast-update for a corridor or
// hub a flight must decide on fires at least leadMarginSeconds before the
// storm step that makes it unsafe. The storm close is the affected flight's
// last-safe-decision: once the corridor shuts, that flight can no longer
// route across it, so the warning has to land leadMargin ahead of the close.
describe('forecast lead time (the leadMarginSeconds property)', () => {
  const leadMs = FIXTURE_PAYLOAD.leadMarginSeconds * 1000

  it('every hazard forecast fires >= leadMarginSeconds before its storm close', () => {
    const { queue } = materializeSchedule(
      [...flightsSchedule(FIXTURE_PAYLOAD)],
      FLIGHTS_T0,
      'standard',
      FLIGHTS_DURATION_MS,
    )
    const byId = new Map(queue.map((e) => [e.id, e]))
    // Storm step 0 CLOSES C-MS at +40s; it is a hazard, so a forecast was
    // authored for it. Step 1 closes CASCADE at +80s; also a hazard.
    FIXTURE_PAYLOAD.stormTrack.forEach((step, index) => {
      const closes =
        step.closeCorridors.length > 0 || step.closeHubs.length > 0
      const forecast = byId.get(`flights-forecast-${index}`)
      const storm = byId.get(`flights-storm-${index}`)!
      if (!closes) {
        // A pure-open step gets no lead forecast.
        expect(forecast).toBeUndefined()
        return
      }
      expect(forecast).toBeDefined()
      const observedLead = storm.scheduledAt - forecast!.scheduledAt
      expect(observedLead).toBeGreaterThanOrEqual(leadMs)
    })
  })

  it('the forecast for C-MS precedes WX102 losing its corridor by >= leadMargin', () => {
    // WX102 (MERIDIAN -> SABLE) departs at +10s and flies the C-MS corridor.
    // Storm step 0 CLOSES C-MS at +40s: that close is WX102's last-safe
    // decision to land across C-MS. Prove, through the real engine, that the
    // forecast for C-MS fired while WX102 was still airborne with C-MS open,
    // and that the observed lead between forecast and close is >= leadMargin.
    const { queue } = materializeSchedule(
      [...flightsSchedule(FIXTURE_PAYLOAD)],
      FLIGHTS_T0,
      'standard',
      FLIGHTS_DURATION_MS,
    )
    const byId = new Map(queue.map((e) => [e.id, e]))
    const forecastAt = byId.get('flights-forecast-0')!.scheduledAt
    const closeAt = byId.get('flights-storm-0')!.scheduledAt
    const observedLead = closeAt - forecastAt
    expect(observedLead).toBeGreaterThanOrEqual(leadMs)

    // At the instant the forecast fires, WX102 is airborne and C-MS is open:
    // the warning genuinely precedes the hazard for the affected flight.
    const atForecast = drive(ctx, [start()], forecastAt)
    const sForecast = flightsSub(atForecast.state)
    expect(sForecast.flights['WX102']!.status).toBe('airborne')
    expect(sForecast.closedCorridors).not.toContain('C-MS')
    const forecastFired = atForecast.emitted.some(
      (e) => e.type === 'scheduledEventFired' && e.id === 'flights-forecast-0',
    )
    expect(forecastFired).toBe(true)
    // The close has NOT fired yet: the decision window is still open.
    const closeFiredEarly = atForecast.emitted.some(
      (e) => e.type === 'scheduledEventFired' && e.id === 'flights-storm-0',
    )
    expect(closeFiredEarly).toBe(false)

    // Drive to the close: now C-MS is shut and WX102 has lost that corridor.
    const atClose = drive(ctx, [start()], closeAt)
    expect(flightsSub(atClose.state).closedCorridors).toContain('C-MS')
  })

  it('a pure-open storm step posts no lead forecast event', () => {
    const { emitted } = drive(ctx, [start()], FLIGHTS_T0 + 85_000)
    // Two hazard steps (close C-MS, close CASCADE) -> exactly two forecasts.
    const forecasts = emitted.filter(
      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsForecast',
    )
    expect(forecasts.length).toBe(2)
  })
})
