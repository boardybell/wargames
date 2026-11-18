import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as state from '@app/state'
import { init, send, getState, wake } from '@app/state'
import { parseCommand } from '@app/terminal'
import { registerDefaultVerbs } from '@app/terminal'
import { ScreenRouter } from '@app/screens'
import { resetAll } from '../../screens/harness'
import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
import {
  makeReadAction,
  makeFlagAction,
  makeQueueAction,
  makeSendAction,
  makeTraceAction,
  makeCheckSourceAction,
} from '@app/missions/outlook/verbs'
import { makeOutlookCtx } from './fixture'
import { getContext } from '@app/state'

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

const SCREEN = 'mission:outlook'

function parsedAction(command: string): unknown {
  const result = parseCommand(command, SCREEN)
  expect(result.kind).toBe('action')
  return result.kind === 'action' ? result.action : null
}

describe('OutlookScreen command-button identity', () => {
  it('each verb parses to the exact same action object the ActionBar button dispatches', () => {
    // Mounting the screen registers the mission verbs into the grammar.
    render(<OutlookScreen missionId="outlook" />)
    expect(parsedAction('READ M01')).toEqual(makeReadAction('M01'))
    expect(parsedAction('FLAG M01')).toEqual(makeFlagAction('M01'))
    expect(parsedAction('QUEUE M01 PRIMARY')).toEqual(makeQueueAction('M01', 'primary'))
    expect(parsedAction('QUEUE M01 BACKUP')).toEqual(makeQueueAction('M01', 'backup'))
    expect(parsedAction('SEND M01 PRIMARY WEATHER_DESK')).toEqual(
      makeSendAction('M01', 'primary', 'WEATHER_DESK'),
    )
    expect(parsedAction('TRACE W02')).toEqual(makeTraceAction('W02'))
    expect(parsedAction('CHECK SOURCE W02')).toEqual(makeCheckSourceAction('W02'))
  })

  it('the MessageView READ/FLAG/SEND buttons dispatch the exact action their verbs build', () => {
    // Action identity is asserted by what the button actually dispatches (the
    // production markup carries no test-only data-action attribute).
    const sendSpy = vi.spyOn(state, 'send')
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M01'))

    sendSpy.mockClear()
    fireEvent.click(screen.getByTestId('action-READ'))
    expect(sendSpy).toHaveBeenCalledWith(makeReadAction('M01'))

    sendSpy.mockClear()
    fireEvent.click(screen.getByTestId('action-FLAG'))
    expect(sendSpy).toHaveBeenCalledWith(makeFlagAction('M01'))

    // The SEND button dispatches the desk the PLAYER chose through the picker,
    // never the authored correctRecipient. Choose WEATHER_DESK, then send.
    fireEvent.click(screen.getByTestId('desk-choice-WEATHER_DESK'))
    sendSpy.mockClear()
    const send1 = screen.getByTestId('action-SEND')
    // A valid send on the live substate is enabled.
    const module = getContext().missions['outlook']!
    const substate = getState().activeMission?.substate
    expect(
      module.validate(substate, makeSendAction('M01', 'primary', 'WEATHER_DESK').payload).valid,
    ).toBe(true)
    expect(send1).not.toBeDisabled()
    fireEvent.click(send1)
    expect(sendSpy).toHaveBeenCalledWith(makeSendAction('M01', 'primary', 'WEATHER_DESK'))
  })

  it('a SEND with no desk chosen defaults to NO DESK, never the authored correctRecipient', () => {
    const sendSpy = vi.spyOn(state, 'send')
    render(<OutlookScreen missionId="outlook" />)
    // M01 is the weather required head; its authored answer is WEATHER_DESK.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    sendSpy.mockClear()
    // No desk chosen: the button must route null (NO DESK), not auto-fill the
    // authored recipient.
    fireEvent.click(screen.getByTestId('action-SEND'))
    expect(sendSpy).toHaveBeenCalledWith(makeSendAction('M01', 'primary', null))
    const call = sendSpy.mock.calls.find(
      (c) => (c[0] as { payload?: { kind?: string } }).payload?.kind === 'SEND',
    )
    expect(
      (call![0] as { payload: { recipient: unknown } }).payload.recipient,
    ).toBeNull()
  })

  it('FLAG toggles the flag mark shown in the inbox list row', () => {
    render(<OutlookScreen missionId="outlook" />)
    // No flag mark initially.
    expect(screen.getByTestId('inbox-row-M01')).toHaveAttribute('data-flagged', 'false')
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    fireEvent.click(screen.getByTestId('action-FLAG'))
    expect(screen.getByTestId('inbox-row-M01')).toHaveAttribute('data-flagged', 'true')
    // Toggle off.
    fireEvent.click(screen.getByTestId('action-FLAG'))
    expect(screen.getByTestId('inbox-row-M01')).toHaveAttribute('data-flagged', 'false')
  })

  it('an invalid send on a dark primary renders disabled with the engine reason inline, visible before any attempt', () => {
    // Advance the engine clock past the stage-2 (dark) milestone at 120s by
    // mocking the wall clock send() samples, then dispatching a harmless READ
    // (always valid) which advances the campaign and fires the stage events.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 130_000)
    act(() => {
      send(makeReadAction('M04'))
    })
    const sub = getState().activeMission?.substate as { primaryStage: number }
    expect(sub.primaryStage).toBe(2)
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    const sendBtn = screen.getByTestId('action-SEND')
    expect(sendBtn).toBeDisabled()
    // The engine rejection reason is rendered inline, verbatim, next to the control.
    expect(screen.getByTestId('action-SEND-reason')).toHaveTextContent(
      'PRIMARY LINK DARK. ROUTE OVER BACKUP.',
    )
  })

  it('an invalid backup send renders disabled with the exhausted-capacity reason once backupRemaining hits zero', () => {
    // Drive backupRemaining to zero through five real backup SENDs.
    act(() => {
      send(makeSendAction('M05', 'backup', null))
      send(makeSendAction('M05', 'backup', null))
      send(makeSendAction('M05', 'backup', null))
      send(makeSendAction('M05', 'backup', null))
      send(makeSendAction('M05', 'backup', null))
    })
    const sub = getState().activeMission?.substate as { backupRemaining: number }
    expect(sub.backupRemaining).toBe(0)
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    const backupBtn = screen.getByTestId('action-SEND-backup')
    expect(backupBtn).toBeDisabled()
    expect(screen.getByTestId('action-SEND-backup-reason')).toHaveTextContent(
      'BACKUP CAPACITY EXHAUSTED.',
    )
  })
})

describe('OutlookScreen desk picker (the puzzle cannot be clicked without reading)', () => {
  it('a WRONG-desk SEND via the button spends capacity and does NOT satisfy the required delivery', () => {
    render(<ScreenRouter />)
    // M01 is the weather required head; its authored answer is WEATHER_DESK.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    // The picker offers every candidate desk; it never reveals or defaults to
    // the authored WEATHER_DESK answer.
    expect(screen.getByTestId('desk-choice-WEATHER_DESK')).toHaveAttribute('data-chosen', 'false')
    expect(screen.getByTestId('desk-choice-PAYROLL_DESK')).toHaveAttribute('data-chosen', 'false')
    expect(screen.getByTestId('desk-choice-AUDIT_DESK')).toHaveAttribute('data-chosen', 'false')

    // The player clicks the WRONG desk and sends over backup (which spends
    // capacity, proving the engine processed a real send).
    fireEvent.click(screen.getByTestId('desk-choice-PAYROLL_DESK'))
    const before = (getState().activeMission?.substate as { backupRemaining: number })
      .backupRemaining
    act(() => {
      fireEvent.click(screen.getByTestId('action-SEND-backup'))
    })
    const after = (getState().activeMission?.substate as { backupRemaining: number })
      .backupRemaining
    // Capacity was spent: the wrong send is a real, logged dispatch.
    expect(after).toBe(before - 1)

    // Advance past the backup ack ETA (120s) so the ack folds, then confirm the
    // weather required kind is NOT satisfied (wrong desk never counts).
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 130_000)
    act(() => {
      wake()
    })
    const sub = getState().activeMission?.substate as {
      sends: ReadonlyArray<{ recipient: string | null; resolution: string }>
      deliveredRequired: { weather: { delivered: boolean; correct: boolean } }
    }
    // The send acknowledged (it was a real dispatch) but routed to PAYROLL_DESK.
    const ack = sub.sends.find((s) => s.resolution === 'acknowledged')
    expect(ack?.recipient).toBe('PAYROLL_DESK')
    // Weather was delivered to the WRONG desk: delivered yes, correct no.
    expect(sub.deliveredRequired.weather.correct).toBe(false)
    // The mission is not completable from this click: no satisfied delivery.
    expect(getState().activeMission).toBeTruthy()
  })

  it('the outbox SEND routes the player-chosen desk, not the authored answer, and can route wrong', () => {
    const sendSpy = vi.spyOn(state, 'send')
    render(<ScreenRouter />)
    // Queue the weather head (M01 -> WEATHER_DESK is the authored answer).
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    fireEvent.click(screen.getByTestId('action-QUEUE BACKUP'))
    fireEvent.click(screen.getByTestId('outlook-tab-outbox'))
    expect(screen.getByTestId('outbox-row-0')).toBeInTheDocument()

    // With no desk chosen, the outbox SEND routes NO DESK, never the authored
    // WEATHER_DESK answer.
    sendSpy.mockClear()
    act(() => {
      fireEvent.click(screen.getByTestId('outbox-send-0'))
    })
    const noneCall = sendSpy.mock.calls.find(
      (c) => (c[0] as { payload?: { kind?: string } }).payload?.kind === 'SEND_QUEUED',
    )
    expect(
      (noneCall![0] as { payload: { recipient: unknown } }).payload.recipient,
    ).toBeNull()
  })
})
