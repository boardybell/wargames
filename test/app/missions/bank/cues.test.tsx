// Cues and announcements, driven through the REAL engine and the REAL screen
// (neither is mocked). The relay click plays on a HOLD and on a RELEASE action.
// The threshold cue and the contagion announcement fire off the DISTINCT
// bankThresholdCrossed engine event, keyed on its arrival and identity, exactly
// as flights keys its forecast cue off its own distinct event: never off a
// state diff and never per plain tick. The mechanism is proven, not merely the
// absence of a crossing: (a) after a crossing has fired, several more plain
// ticks with injectedThresholds UNCHANGED fire nothing again; (b) a SECOND
// independent crossing fires its OWN cue; (c) a run that crosses nothing stays
// silent. Fake timers advanced without an engine wake fire nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, wake, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { onAnnounce } from '@app/a11y/announce'
import * as audio from '@app/audio'
import type { BankPayload } from '@engine/missions/bank/content'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import { BANK_FIXTURE_PAYLOAD, makeBankCtx, bankSub } from './fixture'

const T0 = 1_000_000
const RELAY_CUE = 'bank-relay'
const THRESHOLD_CUE = 'bank-threshold'

/** A payload with TWO confidence thresholds so two independent downward
 *  crossings can be driven in one run. Confidence starts at 70 and each tick
 *  under a full hold drops it by 21 (four held accounts at -4, plus -5 for cash
 *  below the floor): tick 1 (+30s) lands at 49 and crosses 50; tick 2 (+60s)
 *  lands at 28 and crosses 40. Each threshold injects its own draw. */
const TWO_THRESHOLD_PAYLOAD: BankPayload = {
  ...BANK_FIXTURE_PAYLOAD,
  thresholds: [
    {
      value: 50,
      injected: [
        { id: 'INJ-50', accountId: 'A-OPS', baseAmount: 1_000, reason: 'CONTAGION DRAW FIFTY.' },
      ],
    },
    {
      value: 40,
      injected: [
        { id: 'INJ-40', accountId: 'A-VEND', baseAmount: 1_000, reason: 'CONTAGION DRAW FORTY.' },
      ],
    },
  ],
}

let teardown: () => void
let announced: Array<{ text: string; channel: string }>
let unAnnounce: () => void

function boot(payload: BankPayload = BANK_FIXTURE_PAYLOAD): void {
  resetAll()
  __resetBankView()
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerBankScreen()
  announced = []
  unAnnounce = onAnnounce((text, channel) => announced.push({ text, channel }))
  teardown = init({
    ctx: makeBankCtx(payload),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'bank' })
  })
}

function advanceEngine(toMs: number): void {
  vi.spyOn(Date, 'now').mockReturnValue(toMs)
  act(() => {
    wake()
  })
}

afterEach(() => {
  unAnnounce()
  teardown()
  __resetBankView()
  vi.restoreAllMocks()
  cleanup()
})

describe('cues and announcements fire from events and actions only', () => {
  beforeEach(() => {
    boot()
  })

  it('the relay click plays on HOLD and on RELEASE', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    expect(playSpy).toHaveBeenCalledWith(RELAY_CUE)
    playSpy.mockClear()
    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-OPS'))
    expect(playSpy).toHaveBeenCalledWith(RELAY_CUE)
  })

  it('a payment outcome announces politely when a payment clears', () => {
    render(<ScreenRouter />)
    // PAY P-PAY from A-PAY (open, sufficient balance): it clears, announcing.
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    fireEvent.click(screen.getByTestId('payment-PAY-P-PAY'))
    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
    const polite = announced.filter(
      (a) => a.channel === 'polite' && /P-PAY|CLEARED/.test(a.text),
    )
    expect(polite.length).toBeGreaterThan(0)
  })

  it('a confidence threshold crossing plays the low two-note and announces politely off the distinct event', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    // Crater confidence by holding every account, then advance across the tick
    // schedule so confidence crosses 50 and the crossing event fires once.
    for (const id of ['A-OPS', 'A-VEND', 'A-MUNI', 'A-PAY']) {
      fireEvent.click(screen.getByTestId(`ledger-HOLD-${id}`))
    }
    playSpy.mockClear()
    announced.length = 0
    advanceEngine(T0 + 35_000)
    expect(bankSub(getState()).injectedThresholds).toContain(50)
    expect(playSpy).toHaveBeenCalledWith(THRESHOLD_CUE)
    // The announcement carries the crossed value from the event, not a hardcoded
    // app-tree string, and reads as terminal chrome.
    expect(
      announced.some(
        (a) => a.channel === 'polite' && /THRESHOLD 50 CROSSED/.test(a.text),
      ),
    ).toBe(true)
  })

  it('nothing fires per bare tick: several plain confidence ticks that cross no threshold are silent', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    // No holds, no actions: confidence never falls toward the 50 threshold.
    playSpy.mockClear()
    announced.length = 0
    advanceEngine(T0 + 30_000)
    advanceEngine(T0 + 60_000)
    advanceEngine(T0 + 90_000)
    expect(bankSub(getState()).injectedThresholds).not.toContain(50)
    expect(playSpy).not.toHaveBeenCalledWith(RELAY_CUE)
    expect(playSpy).not.toHaveBeenCalledWith(THRESHOLD_CUE)
    expect(announced.some((a) => /THRESHOLD/.test(a.text))).toBe(false)
    expect(announced.some((a) => /CLEARED/.test(a.text))).toBe(false)
  })

  it('fake timers advanced without an engine wake fire nothing', () => {
    vi.useFakeTimers()
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    act(() => {
      vi.advanceTimersByTime(300_000)
    })
    expect(playSpy).not.toHaveBeenCalledWith(RELAY_CUE)
    expect(playSpy).not.toHaveBeenCalledWith(THRESHOLD_CUE)
    expect(announced.some((a) => /THRESHOLD/.test(a.text))).toBe(false)
    vi.useRealTimers()
  })
})

describe('the crossing cue is event-driven, not a per-tick state diff', () => {
  beforeEach(() => {
    boot(TWO_THRESHOLD_PAYLOAD)
  })

  it('a consumed crossing does NOT re-fire on later plain ticks, and a SECOND crossing fires its OWN cue', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    // Hold every account so confidence falls hard across both thresholds.
    for (const id of ['A-OPS', 'A-VEND', 'A-MUNI', 'A-PAY']) {
      fireEvent.click(screen.getByTestId(`ledger-HOLD-${id}`))
    }

    // Tick 1 (+30s): confidence 70 -> 49, crossing the 50 threshold once.
    playSpy.mockClear()
    announced.length = 0
    advanceEngine(T0 + 35_000)
    expect(bankSub(getState()).injectedThresholds).toContain(50)
    const cuesAfterFirst = playSpy.mock.calls.filter(
      (c) => c[0] === THRESHOLD_CUE,
    ).length
    expect(cuesAfterFirst).toBe(1)
    expect(
      announced.filter((a) => /THRESHOLD 50 CROSSED/.test(a.text)).length,
    ).toBe(1)

    // Advance SEVERAL more wakes that fold plain ticks. The 50 threshold is
    // already consumed (injectedThresholds unchanged across these), so the cue
    // must NOT re-fire for 50. Tick 2 (+60s) crosses the 40 threshold: a NEW,
    // independent crossing that fires its OWN cue exactly once.
    playSpy.mockClear()
    announced.length = 0
    const before = bankSub(getState()).injectedThresholds
    expect(before).toContain(50)
    advanceEngine(T0 + 65_000)
    const after = bankSub(getState()).injectedThresholds

    // The 50 crossing never re-announced on the later ticks.
    expect(
      announced.some((a) => /THRESHOLD 50 CROSSED/.test(a.text)),
    ).toBe(false)
    // The SECOND independent crossing (40) fired its own cue and announcement.
    expect(after).toContain(40)
    const forty = playSpy.mock.calls.filter((c) => c[0] === THRESHOLD_CUE).length
    expect(forty).toBe(1)
    expect(
      announced.filter((a) => /THRESHOLD 40 CROSSED/.test(a.text)).length,
    ).toBe(1)
  })

  it('once BOTH thresholds are consumed, further plain ticks fire no crossing cue', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<ScreenRouter />)
    for (const id of ['A-OPS', 'A-VEND', 'A-MUNI', 'A-PAY']) {
      fireEvent.click(screen.getByTestId(`ledger-HOLD-${id}`))
    }
    // Drive both crossings (50 at +30s, 40 at +60s): both thresholds consumed.
    advanceEngine(T0 + 65_000)
    expect(bankSub(getState()).injectedThresholds).toEqual([40, 50])

    // Now advance one MORE plain tick (+90s): no threshold remains to cross, so
    // no crossing event is emitted and no crossing cue fires.
    playSpy.mockClear()
    announced.length = 0
    advanceEngine(T0 + 95_000)
    expect(bankSub(getState()).injectedThresholds).toEqual([40, 50])
    expect(playSpy).not.toHaveBeenCalledWith(THRESHOLD_CUE)
    expect(announced.some((a) => /THRESHOLD/.test(a.text))).toBe(false)
  })
})
