import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useReducer } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LampBanks, useLampController } from '@app/cabinet'
import { relayEvents, __resetConsumers } from '@app/state/events'

function Harness() {
  const controller = useLampController()
  const [, force] = useReducer((n: number) => n + 1, 0)
  return (
    <div>
      <button data-testid="force" onClick={force}>
        force
      </button>
      <LampBanks controller={controller} />
    </div>
  )
}

beforeEach(() => {
  __resetConsumers()
})
afterEach(() => {
  cleanup()
  __resetConsumers()
})

describe('useLampController stable instance', () => {
  it('survives parent re-renders and keeps lamp state', () => {
    render(<Harness />)
    act(() => {
      relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
    })
    expect(screen.getByTestId('lamp-bank-phase')).toHaveAttribute(
      'data-phase',
      'mission',
    )
    // A parent re-render must not reset the controller or its lamp state.
    fireEvent.click(screen.getByTestId('force'))
    expect(screen.getByTestId('lamp-bank-phase')).toHaveAttribute(
      'data-phase',
      'mission',
    )
  })

  it('raises the alarm with a paired text label only on finaleFinalPhase', () => {
    render(<Harness />)
    expect(screen.queryByTestId('lamp-alarm')).toBeNull()
    act(() => {
      relayEvents([{ type: 'finaleFinalPhase' }])
    })
    const alarm = screen.getByTestId('lamp-alarm')
    expect(alarm).toHaveTextContent('DEFCON 1')
  })
})
