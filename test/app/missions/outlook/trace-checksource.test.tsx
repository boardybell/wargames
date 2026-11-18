import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState, wake } from '@app/state'
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

describe('OutlookScreen TRACE', () => {
  it('TRACE on a message with a recordId dispatches INSPECT_RECORD and renders the record detail', () => {
    render(<OutlookScreen missionId="outlook" />)
    // M04 (audit) carries record C17.
    fireEvent.click(screen.getByTestId('menu-row-M04'))
    fireEvent.click(screen.getByTestId('action-TRACE'))
    // The engine recorded the inspection.
    expect(getState().inspectedRecords).toContain('C17')
    // The record detail renders through the shared record affordances.
    const detail = screen.getByTestId('record-detail')
    expect(detail).toHaveAttribute('data-record-id', 'C17')
    expect(detail.textContent).toContain('EXERCISE')
    expect(detail.textContent).toContain('R04')
  })

  it('a message with no recordId exposes no TRACE control', () => {
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M05'))
    expect(screen.queryByTestId('action-TRACE')).toBeNull()
  })
})

describe('OutlookScreen CHECK SOURCE', () => {
  it('dispatches REQUEST_SOURCE_CHECK, shows a pending state, then renders the resolved result from the emitted event', () => {
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M04'))
    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
    // Pending until the engine reply fires.
    expect(screen.getByTestId('source-check-pending')).toBeInTheDocument()
    expect(screen.queryByTestId('source-check-result')).toBeNull()

    // Advance the clock past the desk delay (5s) and wake so the reply fires.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10_000)
    act(() => {
      wake()
    })
    const result = screen.getByTestId('source-check-result')
    expect(result).toHaveAttribute('data-outcome', 'CONTRADICTED')
  })

  it('CONTRADICTED on the bulletin and CONFIRMED on the weather correction render distinctly (text or marker, not color alone)', () => {
    render(<OutlookScreen missionId="outlook" />)
    // Bulletin (M04 -> C17) resolves CONTRADICTED.
    fireEvent.click(screen.getByTestId('menu-row-M04'))
    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10_000)
    act(() => {
      wake()
    })
    const contradicted = screen.getByTestId('source-check-result')
    expect(contradicted).toHaveAttribute('data-outcome', 'CONTRADICTED')
    const contradictedText = contradicted.textContent ?? ''
    expect(contradictedText).toContain('CONTRADICTED')

    // Weather correction (M01 -> W02) resolves CONFIRMED.
    fireEvent.click(screen.getByTestId('menu-row-M01'))
    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 20_000)
    act(() => {
      wake()
    })
    const confirmed = screen.getByTestId('source-check-result')
    expect(confirmed).toHaveAttribute('data-outcome', 'CONFIRMED')
    const confirmedText = confirmed.textContent ?? ''
    expect(confirmedText).toContain('CONFIRMED')
    // Distinct text, not color alone.
    expect(confirmedText).not.toEqual(contradictedText)
  })

  it('a sourceCheckResolved event with arrivedAfterSettlement set still renders without crashing', () => {
    // Request the check during the mission, forfeit so the mission settles
    // BEFORE the desk reply lands, then resolve the reply. The engine stamps
    // arrivedAfterSettlement true.
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M04'))
    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
    act(() => {
      send({ type: 'FORFEIT_MISSION' })
    })
    // Advance past the desk delay (5s) so the reply resolves after settlement.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10_000)
    act(() => {
      wake()
    })
    const check = getState().sourceChecks.find((c) => c.recordId === 'C17')
    expect(check?.arrivedAfterSettlement).toBe(true)
  })

  it('a message with no recordId exposes no CHECK SOURCE control', () => {
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M05'))
    expect(screen.queryByTestId('action-CHECK SOURCE')).toBeNull()
  })
})
