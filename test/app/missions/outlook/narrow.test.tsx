// The narrow-width single-pane pass through the real OutlookScreen and the
// real engine. At narrow width the screen renders one pane at a time, every
// non-inbox view carries a back affordance, back returns to the prior view
// with router state agreeing, and the StatusLine stays visible in every view.
// Narrow width is driven by the same matchMedia mock the other outlook app
// tests use (the shell's useNarrowViewport helper), not a second mechanism.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
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
  // Narrow for the whole suite: the single-pane layout is under test.
  setNarrow(true)
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
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

function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

describe('narrow-width single-pane', () => {
  it('renders single-pane at narrow width with back affordances on message detail, OUTBOX, and LOG', () => {
    render(<ScreenRouter />)
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'single')

    // Message detail: opening a message replaces the list (single pane) and
    // carries a back affordance.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    expect(screen.getByTestId('message-view')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
    expect(screen.getByTestId('message-back')).toBeInTheDocument()

    // OUTBOX: single pane, back affordance present.
    typeCommand('OUTBOX')
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
    expect(screen.getByTestId('outbox-back')).toBeInTheDocument()

    // LOG: single pane, back affordance present.
    typeCommand('LOG')
    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
    expect(screen.getByTestId('log-back')).toBeInTheDocument()
  })

  it('back affordance returns to the prior view and router state agrees', () => {
    render(<ScreenRouter />)

    // From message detail, BACK returns to the inbox list.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    expect(screen.getByTestId('message-view')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('message-back'))
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
    expect(screen.queryByTestId('message-view')).toBeNull()
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')

    // From OUTBOX, BACK returns to the inbox view and the router agrees.
    typeCommand('OUTBOX')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'outbox')
    fireEvent.click(screen.getByTestId('outbox-back'))
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')

    // From LOG, BACK returns to the inbox view and the router agrees.
    typeCommand('LOG')
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'log')
    fireEvent.click(screen.getByTestId('log-back'))
    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
  })

  it('OUTBOX and LOG back affordances are ABSENT at desktop width (narrow gating holds both ways)', () => {
    // Re-drive the shell at DESKTOP width using the same matchMedia helper:
    // the back affordances are narrow-gated, so dropping the `narrow ?` guard
    // would surface them here. Tear down the narrow shell first, flip the
    // mock OFF, then re-init desktop-wide.
    teardown()
    cleanup()
    setNarrow(false)
    teardown = init({
      ctx: makeOutlookCtx(),
      seedName: 'test-seed',
      port: { read: () => null, write: () => {}, remove: () => {} },
    })
    act(() => {
      send({ type: 'START_MISSION', missionId: 'outlook' })
    })
    render(<ScreenRouter />)
    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'two')

    // OUTBOX at desktop width: no back affordance.
    typeCommand('OUTBOX')
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
    expect(screen.queryByTestId('outbox-back')).toBeNull()

    // LOG at desktop width: no back affordance.
    typeCommand('LOG')
    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
    expect(screen.queryByTestId('log-back')).toBeNull()
  })

  it('StatusLine remains visible in every view at narrow width', () => {
    render(<ScreenRouter />)

    // Inbox.
    expect(screen.getByTestId('status-line')).toBeInTheDocument()

    // Message detail.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    expect(screen.getByTestId('message-view')).toBeInTheDocument()
    expect(screen.getByTestId('status-line')).toBeInTheDocument()

    // Back to inbox, then OUTBOX.
    fireEvent.click(screen.getByTestId('message-back'))
    typeCommand('OUTBOX')
    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
    expect(screen.getByTestId('status-line')).toBeInTheDocument()

    // LOG.
    typeCommand('LOG')
    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
    expect(screen.getByTestId('status-line')).toBeInTheDocument()
  })
})
