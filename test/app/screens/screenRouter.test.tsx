import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter, registerMissionScreen } from '@app/screens'
import { setTypeIn } from '@app/screens/inputStack'
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

const deliver = () =>
  send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })

describe('ScreenRouter phase mapping', () => {
  it('renders menu, then mission, then debrief as the engine phase changes', () => {
    render(<ScreenRouter />)
    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    expect(screen.getByTestId('mission-frame')).toBeInTheDocument()
    act(() => {
      deliver()
      deliver()
      deliver()
    })
    expect(screen.getByTestId('debrief-screen')).toBeInTheDocument()
  })

  it('renders the fallback frame for an unregistered mission', () => {
    render(<ScreenRouter />)
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    expect(screen.getByTestId('mission-frame')).toBeInTheDocument()
  })

  it('mounts a registered mission screen keyed by its id', () => {
    registerMissionScreen('alpha', ({ missionId }) => (
      <div data-testid="custom-mission">{`CUSTOM ${missionId}`}</div>
    ))
    render(<ScreenRouter />)
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    expect(screen.getByTestId('custom-mission')).toHaveTextContent(
      'CUSTOM alpha',
    )
  })

  it('moves focus to the new screen root', () => {
    render(<ScreenRouter />)
    expect(document.activeElement).toBe(screen.getByTestId('screen-root'))
  })

  it('a running type-in swallows a menu key: 1 completes it, no row selected', () => {
    // The precedence stack is wired live: the capture handler at the screen
    // root resolves precedence before MenuRows can act.
    const complete = vi.fn()
    setTypeIn(true, complete)
    render(<ScreenRouter />)
    fireEvent.keyDown(screen.getByTestId('screen-root'), { key: '1' })
    expect(complete).toHaveBeenCalledTimes(1)
    // The menu row was not selected, so no mission started.
    expect(getState().activeMission).toBeNull()
  })
})
