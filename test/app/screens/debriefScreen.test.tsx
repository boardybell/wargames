import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { DebriefScreen, MenuScreen, ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { buildCtx, memoryPort, resetAll } from './harness'

let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  registerDefaultVerbs()
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
  cleanup()
})

function settle(missionId: string): void {
  act(() => {
    send({ type: 'START_MISSION', missionId })
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
  })
}

describe('DebriefScreen', () => {
  it('the ACKNOWLEDGE button dispatches ACKNOWLEDGE_DEBRIEF and returns to menu', () => {
    settle('alpha')
    expect(getState().phase).toBe('debrief')
    render(<DebriefScreen />)
    fireEvent.click(screen.getByTestId('acknowledge-button'))
    expect(getState().acknowledgedDebriefs).toContain('alpha')
    expect(getState().phase).toBe('menu')
  })

  it('the ACKNOWLEDGE command also acknowledges the debrief', () => {
    settle('alpha')
    render(<ScreenRouter />)
    expect(screen.getByTestId('debrief-screen')).toBeInTheDocument()
    const input = screen.getByTestId('command-input')
    fireEvent.change(input, { target: { value: 'acknowledge' } })
    fireEvent.submit(screen.getByTestId('command-form'))
    expect(getState().acknowledgedDebriefs).toContain('alpha')
  })

  it('after the third acknowledgment the menu shows the fourth row', () => {
    for (const missionId of ['alpha', 'beta', 'gamma']) {
      settle(missionId)
      act(() => {
        send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId })
      })
    }
    render(<MenuScreen />)
    expect(screen.getByTestId('menu-row-finale')).toBeInTheDocument()
  })
})
