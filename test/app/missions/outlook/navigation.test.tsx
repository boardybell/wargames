import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, getState, send } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
import { makeOutlookCtx } from './fixture'

let teardown: () => void

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
  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'outlook' })
  })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
  cleanup()
})

/** Type a command into the single shared command input that ScreenRouter
 *  renders at the foot of the active mission screen (the production path). */
function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

describe('OutlookScreen navigation', () => {
  it('registers under mission id outlook', () => {
    render(<OutlookScreen missionId="outlook" />)
    expect(screen.getByTestId('outlook-screen')).toBeInTheDocument()
  })

  it('THROUGH ScreenRouter there is exactly one command input, and typed INBOX/OUTBOX/LOG/BACK switch the view', () => {
    render(<ScreenRouter />)
    // The production path renders exactly one shared command input: the
    // screen no longer renders its own form that would collide with it.
    expect(screen.getAllByTestId('command-input')).toHaveLength(1)
    expect(screen.getAllByTestId('command-form')).toHaveLength(1)

    // Default view is inbox.
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()

    typeCommand('OUTBOX')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'outbox')
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()

    typeCommand('LOG')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'log')
    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()

    typeCommand('INBOX')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')

    // Open a message detail from the list, then BACK returns to the list.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    expect(screen.getByTestId('message-view')).toHaveAttribute('data-message-id', 'M01')
    setNarrow(true)
    typeCommand('BACK')
    expect(screen.queryByTestId('message-view')).toBeNull()
  })

  it('typed engine-action verbs dispatch through the single shared input (READ marks the message read)', () => {
    render(<ScreenRouter />)
    typeCommand('READ M03')
    const sub = getState().activeMission?.substate as {
      messages: Record<string, { read: boolean }>
    }
    expect(sub.messages['M03']?.read).toBe(true)
  })

  it('all four views are reachable: detail opens from a list selection', () => {
    render(<OutlookScreen missionId="outlook" />)
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('outlook-tab-outbox'))
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('outlook-tab-log'))
    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('outlook-tab-inbox'))
    // Message detail opens from inbox list selection.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    expect(screen.getByTestId('message-view')).toHaveAttribute('data-message-id', 'M01')
  })

  it('the inbox receipt time is the record real receiptTime, and a recordless message shows a neutral placeholder', () => {
    render(<OutlookScreen missionId="outlook" />)
    // M04 -> C17 (receiptTime 76445 = 21:14:05); M01 -> W02 (76460 = 21:14:20).
    // These are record-sourced, NOT a monotonic row-index clock.
    expect(screen.getByTestId('inbox-row-M04').textContent).toContain('21:14:05')
    expect(screen.getByTestId('inbox-row-M01').textContent).toContain('21:14:20')
    // M05 is a decoy with no record: neutral placeholder, never a fabricated time.
    expect(screen.getByTestId('inbox-row-M05').textContent).toContain('--:--:--')
  })

  it('desktop shows persistent tabs for the three list views and renders inbox beside detail (two panes)', () => {
    setNarrow(false)
    render(<OutlookScreen missionId="outlook" />)
    expect(screen.getByTestId('outlook-tab-inbox')).toBeInTheDocument()
    expect(screen.getByTestId('outlook-tab-outbox')).toBeInTheDocument()
    expect(screen.getByTestId('outlook-tab-log')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('menu-row-M01'))
    // Desktop: both the inbox list and the detail are present (two panes).
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'two')
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
    expect(screen.getByTestId('message-view')).toBeInTheDocument()
  })

  it('narrow viewport: single-pane router state, opening a message replaces the list, and a back affordance returns to the list', () => {
    setNarrow(true)
    render(<OutlookScreen missionId="outlook" />)
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'single')

    fireEvent.click(screen.getByTestId('menu-row-M01'))
    // Single-pane: the detail replaces the list.
    expect(screen.getByTestId('message-view')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()

    fireEvent.click(screen.getByTestId('message-back'))
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
    expect(screen.queryByTestId('message-view')).toBeNull()
  })

  it('mobile keyboard-only pass: a full delivery flow via the shared command line completes and lands a log entry', () => {
    setNarrow(true)
    render(<ScreenRouter />)
    // Navigate the inbox, open a message, QUEUE it, switch to OUTBOX, SEND,
    // confirm the log entry. All through typed commands (the keyboard path).
    typeCommand('READ M03')
    typeCommand('QUEUE M03 PRIMARY')
    expect(getState().activeMission?.missionId).toBe('outlook')

    typeCommand('OUTBOX')
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
    // The queued item is present.
    expect(screen.getByTestId('outbox-row-0')).toBeInTheDocument()

    typeCommand('SEND 0 PAYROLL_DESK')
    typeCommand('LOG')
    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
    expect(screen.getByTestId('log-row-0')).toBeInTheDocument()
  })
})
