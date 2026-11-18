// The local FREEZE BANK ACCOUNTS glossary: the five local terms register
// without collision, the global provenance terms (OBSERVED/EXERCISE/DERIVED)
// are present but NOT re-registered by the mission, and re-registering a global
// id would trip the uniqueness guard. Terms open their definition on focus and
// close on Escape, matching the shell glossary conventions (focusable,
// Escape-closable).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
} from '@app/a11y/glossary'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import { BANK_LOCAL_GLOSSARY_IDS as LOCAL_IDS } from '@app/missions/bank/glossary'
import { makeBankCtx } from './fixture'

const T0 = 1_000_000

let teardown: () => void

beforeEach(() => {
  resetAll()
  __resetBankView()
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerBankScreen()
  teardown = init({
    ctx: makeBankCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  teardown()
  __resetBankView()
  vi.restoreAllMocks()
  cleanup()
})

describe('BankScreen glossary', () => {
  it('registers only the five local terms without collision and does not re-register OBSERVED/EXERCISE/DERIVED', () => {
    for (const id of LOCAL_IDS) {
      expect(hasGlossaryEntry(id)).toBe(true)
    }
    expect(hasGlossaryEntry('observed')).toBe(true)
    expect(hasGlossaryEntry('exercise')).toBe(true)
    expect(hasGlossaryEntry('derived')).toBe(true)
    expect(LOCAL_IDS).not.toContain('observed')
    expect(LOCAL_IDS).not.toContain('exercise')
    expect(LOCAL_IDS).not.toContain('derived')
  })

  it('re-registering a global id trips the glossary uniqueness guard', () => {
    expect(() =>
      registerGlossaryTerms([
        { id: 'observed', term: 'OBSERVED', definition: 'DUP' },
      ]),
    ).toThrow(/duplicate/)
  })

  it('a local term opens its definition on focus and Escape closes it', () => {
    act(() => {
      send({ type: 'START_MISSION', missionId: 'bank' })
    })
    render(<ScreenRouter />)
    // LIQUIDITY renders in the pinned status area.
    const status = screen.getByTestId('bank-status')
    const term = within(status)
      .getAllByTestId('glossary-term')
      .find((t) => t.textContent === 'LIQUIDITY')!
    expect(term).toBeDefined()
    const wrap = term.closest('.glossary-wrap') as HTMLElement
    act(() => {
      fireEvent.focus(term)
    })
    expect(within(wrap).getByTestId('glossary-popup')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(term, { key: 'Escape' })
    })
    expect(within(wrap).queryByTestId('glossary-popup')).toBeNull()
  })
})
