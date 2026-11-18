import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { MenuScreen, registerMissionTitle } from '@app/screens'
import { buildCtx, memoryPort, resetAll } from './harness'

let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  registerMissionTitle('alpha', 'CRASH OUTLOOK')
  registerMissionTitle('beta', 'GROUND ALL FLIGHTS')
  registerMissionTitle('gamma', 'FREEZE BANK ACCOUNTS')
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
  cleanup()
})

function settleAndAck(missionId: string): void {
  act(() => {
    send({ type: 'START_MISSION', missionId })
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId })
  })
}

describe('MenuScreen', () => {
  it('renders the greeting and the three mission rows', () => {
    render(<MenuScreen />)
    const text = screen.getByTestId('menu-screen').textContent ?? ''
    expect(text).toContain('GREETINGS PROFESSOR FALKEN')
    expect(text).toContain('SHALL WE PLAY A GAME?')
    expect(text).toContain('1. CRASH OUTLOOK')
    expect(text).toContain('2. GROUND ALL FLIGHTS')
    expect(text).toContain('3. FREEZE BANK ACCOUNTS')
  })

  it('selecting an unsettled mission dispatches START_MISSION', () => {
    render(<MenuScreen />)
    fireEvent.click(screen.getByTestId('menu-row-alpha'))
    expect(getState().activeMission?.missionId).toBe('alpha')
  })

  it('the fourth row is absent until all three debriefs are acknowledged', () => {
    render(<MenuScreen />)
    expect(screen.queryByTestId('menu-row-finale')).toBeNull()
    settleAndAck('alpha')
    settleAndAck('beta')
    expect(screen.queryByTestId('menu-row-finale')).toBeNull()
    settleAndAck('gamma')
    expect(screen.getByTestId('menu-row-finale')).toBeInTheDocument()
  })

  it('selecting a settled mission opens its record view', () => {
    settleAndAck('alpha')
    render(<MenuScreen />)
    fireEvent.click(screen.getByTestId('menu-row-alpha'))
    expect(screen.getByTestId('record-view')).toHaveAttribute(
      'data-mission-id',
      'alpha',
    )
  })
})
