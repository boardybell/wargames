import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Readouts, ReadoutsPanel } from '@app/cabinet'
import { init, send, getState } from '@app/state'
import { buildCtx, memoryPort, resetAll } from '../state/harness'

describe('Readouts (pure)', () => {
  afterEach(cleanup)

  it('renders both labeled values so the divergence reads', () => {
    render(<Readouts openExceptions={9} serviceOutcomes={30} />)
    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('9')
    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('30')
    // OPEN EXCEPTIONS is a glossary term.
    expect(screen.getByTestId('glossary-term')).toHaveTextContent(
      'OPEN EXCEPTIONS',
    )
  })
})

describe('ReadoutsPanel (real engine, selectors diverge)', () => {
  let teardown: () => void
  beforeEach(() => {
    resetAll()
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
  })
  afterEach(() => {
    teardown()
    vi.restoreAllMocks()
    cleanup()
  })

  it('shows forced-inactivity resolutions diverging from real service cost', () => {
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    const endsAt = getState().activeMission!.endsAt
    // Let the deadline pass with no delivery: alpha settles by timeout, so WOPR
    // counts the forced-inactivity resolution while real service cost climbs.
    vi.spyOn(Date, 'now').mockReturnValue(endsAt + 60_000)
    act(() => {
      send({ type: 'START_MISSION', missionId: 'beta' }) // rejected; pre-advance settles alpha
    })
    render(<ReadoutsPanel />)
    const open = screen.getByTestId('readout-open-exceptions')
    const service = screen.getByTestId('readout-service-outcomes')
    // Baseline 12 minus 3 resolved = 9; service cost 3 * 10 = 30. They diverge.
    expect(open).toHaveTextContent('9')
    expect(service).toHaveTextContent('30')
  })

  it('re-renders live when the campaign state changes after mount', () => {
    render(<ReadoutsPanel />)
    // Baseline before any settlement: 12 open exceptions, 0 service cost.
    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('12')
    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('0')
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    const endsAt = getState().activeMission!.endsAt
    vi.spyOn(Date, 'now').mockReturnValue(endsAt + 60_000)
    act(() => {
      send({ type: 'START_MISSION', missionId: 'beta' })
    })
    // useCampaign is a live store subscription, so the panel updates without a
    // re-mount: open exceptions fall to 9 and service cost climbs to 30.
    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('9')
    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('30')
  })
})
