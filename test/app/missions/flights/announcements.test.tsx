// Announcements and cues, with fake timers throughout to prove the shell sets
// NO timers of its own: the projection correction announces exactly once
// (coalesced, naming the changed corridor), politely, with the two-tone cue;
// probe results announce politely and reveal the OBSERVED report; and advancing
// jsdom fake timers without advancing the engine clock fires nothing. Every cue
// and announcement is driven by an emitted event, never a wall clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, wake } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { onAnnounce } from '@app/a11y/announce'
import * as audio from '@app/audio'
import { resetAll } from '../../screens/harness'
import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
import { __resetFlightsView } from '@app/missions/flights/selectors'
import { makeFlightsCtx } from './fixture'

const T0 = 1_000_000

function setNarrow(narrow: boolean): void {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('max-width') ? narrow : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

let teardown: () => void
let announced: Array<{ text: string; channel: string }>
let unAnnounce: () => void

beforeEach(() => {
  resetAll()
  __resetFlightsView()
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerFlightsScreen()
  announced = []
  unAnnounce = onAnnounce((text, channel) => announced.push({ text, channel }))
  teardown = init({
    ctx: makeFlightsCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'flights' })
  })
})

afterEach(() => {
  unAnnounce()
  teardown()
  __resetFlightsView()
  vi.restoreAllMocks()
  cleanup()
})

describe('announcements and cues', () => {
  it('the projection correction announces exactly once, coalesced, naming the changed corridor, politely, with the two-tone cue', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    // Advance the ENGINE clock past the correction at 50s (and the storm at 40s)
    // so the single material-change event fires.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 55_000)
    act(() => {
      wake()
    })
    // The correction warning names the changed corridor (MERIDIAN SABLE) and
    // announces politely EXACTLY once (the raw sink sees one call for it).
    const corrections = announced.filter(
      (a) => a.channel === 'polite' && a.text.includes('MERIDIAN SABLE CLEARS SOONER'),
    )
    expect(corrections).toHaveLength(1)
    // The two-tone correction cue played.
    expect(playSpy).toHaveBeenCalledWith('tone-correct-1')
  })

  it('the forecast LEAD reaches the player: advancing just past the forecast offset but before the storm fires the early warning + its DISTINCT advance cue, and NOT the at-closure storm warning', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    // The first storm step closes C-MS at 40s; its forecast lead fires
    // leadMarginSeconds (30s) earlier, at 10s. Advance the ENGINE clock to 15s:
    // the forecast lead has fired but the storm step at 40s has NOT.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 15_000)
    act(() => {
      wake()
    })
    // The advance-warning line reached the announcer, politely, prefixed as a
    // FORECAST so it is distinct from the identical at-closure storm line.
    const forecast = announced.filter(
      (a) =>
        a.channel === 'polite' &&
        a.text === 'FORECAST: STORM CLOSING THE MERIDIAN SABLE CORRIDOR.',
    )
    expect(forecast).toHaveLength(1)
    // The DISTINCT two-tone forecast-change cue played, NOT the at-closure storm
    // cue (that fires only when the corridor actually closes, later).
    expect(playSpy).toHaveBeenCalledWith('tone-storm-1-forecast')
    expect(playSpy).not.toHaveBeenCalledWith('tone-storm-1')
    // The bare at-closure storm line has not been announced yet.
    expect(
      announced.some(
        (a) => a.text === 'STORM CLOSING THE MERIDIAN SABLE CORRIDOR.',
      ),
    ).toBe(false)

    // Advancing the engine past the storm at 40s now fires the at-closure storm
    // warning and its own cue: the lead preceded the closure, as designed.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 45_000)
    act(() => {
      wake()
    })
    expect(playSpy).toHaveBeenCalledWith('tone-storm-1')
    expect(
      announced.some(
        (a) => a.text === 'STORM CLOSING THE MERIDIAN SABLE CORRIDOR.',
      ),
    ).toBe(true)
  })

  it('probe results (sourceCheckResolved) announce politely and reveal the OBSERVED report in the corridor readout', () => {
    render(<ScreenRouter />)
    const input = screen.getByTestId('command-input') as HTMLInputElement
    const type = (text: string) => {
      act(() => {
        fireEvent.change(input, { target: { value: text } })
        fireEvent.submit(screen.getByTestId('command-form'))
      })
    }
    // Select WX101 (its corridor C-MC maps to field report W02), then PROBE.
    type('SELECT WX101')
    fireEvent.click(screen.getByTestId('probe-button'))
    // No reveal yet: the desk reply is pending.
    expect(screen.queryByTestId('corridor-report')).toBeNull()
    // Advance past the desk delay (5s) so the reply resolves as an emitted
    // event; the shell reveals the OBSERVED report and announces it.
    announced.length = 0
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 10_000)
    act(() => {
      wake()
    })
    const report = screen.getByTestId('corridor-report')
    expect(report).toHaveAttribute('data-outcome', 'CONFIRMED')
    expect(
      announced.some((a) => a.channel === 'polite' && /W02|CONFIRMED|FIELD REPORT/.test(a.text)),
    ).toBe(true)
  })

  it('scope tick and two-tone cues fire only in response to emitted events; with fake timers advanced and no events, nothing fires', () => {
    vi.useFakeTimers()
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    // Advance jsdom fake timers WITHOUT advancing the engine clock: no emitted
    // event, so no cue and no announcement.
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(playSpy).not.toHaveBeenCalledWith('tone-storm-1')
    expect(playSpy).not.toHaveBeenCalledWith('tone-correct-1')
    expect(announced.some((a) => a.text.includes('MERIDIAN SABLE'))).toBe(false)
    vi.useRealTimers()

    // Advancing the engine clock fires the storm cue (an emitted event).
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 45_000)
    act(() => {
      wake()
    })
    expect(playSpy).toHaveBeenCalledWith('tone-storm-1')
  })
})
