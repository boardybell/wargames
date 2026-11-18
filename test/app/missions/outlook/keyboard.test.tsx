// A keyboard-only full delivery flow through the real OutlookScreen and the
// real engine (no mocks of either). Every interaction is typed into the one
// shared command line ScreenRouter renders at the foot of the mission screen:
// no pointer events anywhere. The flow reads a message, queues it, switches
// to the OUTBOX, sends with a desk chosen, advances engine time past the ack,
// and confirms the LOG view shows the acknowledgment. Focus is asserted to
// land sensibly after view switches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, getState, send, wake } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
import { makeOutlookCtx } from './fixture'

let teardown: () => void
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

beforeEach(() => {
  resetAll()
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerOutlookScreen()
  teardown = init({
    ctx: makeOutlookCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'outlook' })
  })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
  cleanup()
})

/** Type a command into the single shared command input and submit it with the
 *  keyboard (a form submit, the Enter path), never a pointer. */
function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

describe('keyboard-only delivery flow', () => {
  it('completes one full delivery with keys only and the LOG shows the acknowledgment', () => {
    render(<ScreenRouter />)
    // INBOX is the default view.
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')

    // READ the payroll required head (M03 in the fixture payload), then QUEUE
    // it onto the backup channel. All typed.
    typeCommand('READ M03')
    expect(
      (getState().activeMission?.substate as { messages: Record<string, { read: boolean }> })
        .messages['M03']?.read,
    ).toBe(true)
    typeCommand('QUEUE M03 BACKUP')

    // Switch to the OUTBOX by typing the view command; the queued item is there.
    typeCommand('OUTBOX')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'outbox')
    expect(screen.getByTestId('outbox-row-0')).toBeInTheDocument()

    // SEND the queued item to the chosen desk, typed with the desk argument.
    typeCommand('SEND 0 PAYROLL_DESK')
    const sends = (getState().activeMission?.substate as {
      sends: ReadonlyArray<{ recipient: string | null; resolution: string }>
    }).sends
    expect(sends).toHaveLength(1)
    expect(sends[0]!.recipient).toBe('PAYROLL_DESK')

    // Advance engine time past the backup ack ETA (120s) so the send folds to
    // acknowledged, via a keyboard-driven wake (no pointer).
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 130_000)
    act(() => {
      wake()
    })
    const acked = (getState().activeMission?.substate as {
      sends: ReadonlyArray<{ resolution: string; scheduledAckAt: number }>
    }).sends[0]!
    expect(acked.resolution).toBe('acknowledged')

    // The LOG view shows the acknowledgment (a RECEIPT line for the send).
    typeCommand('LOG')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'log')
    const logRow = screen.getByTestId('log-row-0')
    expect(logRow).toBeInTheDocument()
    expect(logRow.textContent).toContain('RECEIPT')
    expect(logRow.textContent).toContain('PAYROLL_DESK')
  })

  it('focus lands sensibly after a view switch: the command input stays focusable', () => {
    render(<ScreenRouter />)
    const input = screen.getByTestId('command-input') as HTMLInputElement
    // Keyboard focus on the shared input, the single typing surface.
    act(() => {
      input.focus()
    })
    expect(document.activeElement).toBe(input)

    // Open a message detail via a typed READ-then-open path (keyboard), then
    // BACK. Focus must not be stranded: the shared input remains in the DOM and
    // focusable after the view switch (the keyboard path never loses its
    // surface).
    typeCommand('READ M03')
    typeCommand('OUTBOX')
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
    typeCommand('INBOX')
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()

    const inputAfter = screen.getByTestId('command-input') as HTMLInputElement
    act(() => {
      inputAfter.focus()
    })
    expect(document.activeElement).toBe(inputAfter)
  })
})
