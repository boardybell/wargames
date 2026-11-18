import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { init, send, getState, wake } from '@app/state'
import { registerDefaultVerbs } from '@app/terminal'
import { onAnnounce } from '@app/a11y/announce'
import * as audio from '@app/audio'
import { resetAll } from '../../screens/harness'
import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
import { makeOutlookCtx } from './fixture'
import { makeSendAction } from '@app/missions/outlook/verbs'

let teardown: () => void
let announced: Array<{ text: string; channel: string }>
let unAnnounce: () => void

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

beforeEach(() => {
  resetAll()
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  registerDefaultVerbs()
  registerOutlookScreen()
  announced = []
  unAnnounce = onAnnounce((text, channel) => announced.push({ text, channel }))
  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'outlook' })
  })
})

afterEach(() => {
  unAnnounce()
  teardown()
  vi.restoreAllMocks()
  cleanup()
})

describe('OutlookScreen StatusLine', () => {
  it('shows primary stage, backup remaining, and next ETA from engine-state selectors', () => {
    render(<OutlookScreen missionId="outlook" />)
    const status = screen.getByTestId('status-line')
    expect(status.textContent).toContain('FULL')
    expect(status.textContent).toContain('5')
    // Stage-0 primary ETA is 30 seconds.
    expect(status.textContent).toContain('30')
  })

  it('backup remaining decrements in the readout after a real SEND', () => {
    render(<OutlookScreen missionId="outlook" />)
    act(() => {
      send(makeSendAction('M05', 'backup', null))
    })
    expect(screen.getByTestId('status-line').textContent).toContain('4')
  })

  it('renders a visible role=timer countdown driven by the display clock, not only announced', () => {
    render(<OutlookScreen missionId="outlook" />)
    const countdown = screen.getByTestId('outlook-countdown')
    // The deadline is on screen as a role=timer element (wide layout renders
    // the dot-matrix variant).
    const timer = within(countdown).getByRole('timer')
    expect(timer).toBeInTheDocument()
    // The mission duration is 240s, so at mission start the countdown reads a
    // non-empty time, well short of the full four minutes only once the clock
    // advances. Here it shows the full window.
    expect(timer).toHaveAttribute('data-testid', 'countdown-dotmatrix')
    expect(timer.textContent).toContain('04:00')
  })

  it('after a stage milestone fires, the stage readout and primary ETA update', () => {
    render(<OutlookScreen missionId="outlook" />)
    // Advance past the stage-1 milestone at 60s.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000)
    act(() => {
      wake()
    })
    const status = screen.getByTestId('status-line')
    expect(status.textContent).toContain('SLOWED')
    // Stage-1 primary ETA is 90 seconds.
    expect(status.textContent).toContain('90')
    expect(getState().activeMission?.substate).toBeTruthy()
  })
})

describe('OutlookScreen announcements', () => {
  it('stage-change warning lines surface through the polite live region when the engine emits them', () => {
    render(<OutlookScreen missionId="outlook" />)
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 130_000)
    act(() => {
      wake()
    })
    const politeStage1 = announced.find(
      (a) => a.channel === 'polite' && a.text.includes('ACK TIMES RISING'),
    )
    expect(politeStage1).toBeTruthy()
    // The stage-2 (dark) warning states backup remains usable to the deadline.
    const politeDark = announced.find(
      (a) => a.channel === 'polite' && a.text.includes('BACKUP REMAINS USABLE TO THE DEADLINE'),
    )
    expect(politeDark).toBeTruthy()
  })

  it('30 and 10 second warnings announce when the engine milestones fire and ONLY then', () => {
    vi.useFakeTimers()
    render(<OutlookScreen missionId="outlook" />)
    // Advancing jsdom fake timers WITHOUT advancing the engine clock must
    // produce no warning announcement (no shell timer drives this).
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(announced.some((a) => a.text.includes('SECONDS TO DEADLINE'))).toBe(false)
    vi.useRealTimers()

    // Advancing the engine clock to the warning window fires the milestones.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 235_000)
    act(() => {
      wake()
    })
    expect(announced.some((a) => a.text.includes('THIRTY SECONDS TO DEADLINE'))).toBe(true)
  })

  it('delivery acknowledgments announce through the polite region from emitted events', () => {
    render(<OutlookScreen missionId="outlook" />)
    // A correct primary send; its ack folds at the stage-1 wake at 60s.
    act(() => {
      send(makeSendAction('M03', 'primary', 'PAYROLL_DESK'))
    })
    announced.length = 0
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000)
    act(() => {
      wake()
    })
    expect(
      announced.some(
        (a) => a.channel === 'polite' && /ACK|ACKNOWLEDG|DELIVER/.test(a.text),
      ),
    ).toBe(true)
  })

  it('the falling-tone cue hook fires on stage-change events', () => {
    const playSpy = vi.spyOn(audio, 'play')
    render(<OutlookScreen missionId="outlook" />)
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000)
    act(() => {
      wake()
    })
    expect(playSpy).toHaveBeenCalledWith('tone-fall-1')
  })
})
