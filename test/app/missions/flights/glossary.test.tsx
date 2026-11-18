// The local GROUND ALL FLIGHTS glossary: the six local terms register without
// collision, the global OBSERVED/EXERCISE/DERIVED are present but NOT
// re-registered by the mission, and re-registering a global id would trip the
// uniqueness guard. Terms open their definition on hover/focus, matching the
// shell's glossary conventions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send } from '@app/state'
import { registerDefaultVerbs } from '@app/terminal'
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
} from '@app/a11y/glossary'
import { resetAll } from '../../screens/harness'
import { FlightsScreen, registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
import { FLIGHTS_LOCAL_GLOSSARY_IDS } from '@app/missions/flights/glossary'
import { __resetFlightsView } from '@app/missions/flights/selectors'
import { makeFlightsCtx } from './fixture'

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

let teardown: () => void

beforeEach(() => {
  resetAll()
  __resetFlightsView()
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  registerDefaultVerbs()
  registerFlightsScreen()
  teardown = init({
    ctx: makeFlightsCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  teardown()
  __resetFlightsView()
  vi.restoreAllMocks()
  cleanup()
})

describe('FlightsScreen glossary', () => {
  it('registers only the six local terms without collision and does not re-register the global OBSERVED/EXERCISE/DERIVED', () => {
    for (const id of FLIGHTS_LOCAL_GLOSSARY_IDS) {
      expect(hasGlossaryEntry(id)).toBe(true)
    }
    expect(hasGlossaryEntry('observed')).toBe(true)
    expect(hasGlossaryEntry('exercise')).toBe(true)
    expect(hasGlossaryEntry('derived')).toBe(true)
    // The local ids must not shadow the global ids.
    expect(FLIGHTS_LOCAL_GLOSSARY_IDS).not.toContain('observed')
    expect(FLIGHTS_LOCAL_GLOSSARY_IDS).not.toContain('exercise')
    expect(FLIGHTS_LOCAL_GLOSSARY_IDS).not.toContain('derived')
  })

  it('re-registering a global id trips the glossary uniqueness guard', () => {
    // The guard throws in dev on a duplicate id, which is how the shell proves
    // OBSERVED/EXERCISE/DERIVED are single-sourced globally.
    expect(() =>
      registerGlossaryTerms([
        { id: 'observed', term: 'OBSERVED', definition: 'DUP' },
      ]),
    ).toThrow(/duplicate/)
  })

  it('local terms CORRIDOR / RUNWAY SLOT open their definition on focus from the list copy', () => {
    act(() => {
      send({ type: 'START_MISSION', missionId: 'flights' })
    })
    setNarrow(true)
    render(<FlightsScreen missionId="flights" />)
    const list = screen.getByTestId('flight-list-view')
    const terms = within(list).getAllByTestId('glossary-term')
    const labels = terms.map((t) => t.textContent)
    expect(labels).toContain('CORRIDOR')
    expect(labels).toContain('RUNWAY SLOT')
    const corridor = terms.find((t) => t.textContent === 'CORRIDOR')!
    fireEvent.focus(corridor)
    expect(within(list).getByTestId('glossary-popup')).toBeInTheDocument()
  })
})
