import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { PauseDialog, ScreenRouter, getOverlay } from '@app/screens'
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
  cleanup()
  vi.restoreAllMocks()
})

describe('PauseDialog', () => {
  it('opening dispatches nothing and the copy says the clock keeps running', () => {
    const before = getState()
    render(<PauseDialog open={true} onClose={() => {}} />)
    expect(screen.getByTestId('pause-dialog')).toHaveAttribute(
      'aria-labelledby',
      'pause-heading',
    )
    expect(screen.getByText(/CLOCK KEEPS RUNNING/)).toBeInTheDocument()
    // No engine pause exists: opening changes no state.
    expect(getState()).toBe(before)
  })

  it('Resume requests close without dispatching', () => {
    const onClose = vi.fn()
    render(<PauseDialog open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pause-resume'))
    expect(onClose).toHaveBeenCalled()
  })

  it('End Mission requires the typed confirmation word before forfeiting', () => {
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    render(<PauseDialog open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('pause-end'))
    const confirm = screen.getByTestId('pause-confirm-button')
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByTestId('pause-confirm-input'), {
      target: { value: 'end' },
    })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(getState().settled.some((s) => s.cause === 'forfeit')).toBe(true)
  })

  it('opens from Escape and from the MENU control during a mission', () => {
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    render(<ScreenRouter />)
    fireEvent.keyDown(screen.getByTestId('screen-root'), { key: 'Escape' })
    expect(getOverlay()).toBe('pause')
  })
})
