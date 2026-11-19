// The four local GLOBAL FAILSAFE glossary terms register without collision; the
// global provenance and commit terms are present but NOT re-registered; a local
// term opens its definition on focus and Escape closes it (focusable, tap-
// friendly, Escape-closable), matching the shell glossary conventions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
} from '@app/a11y/glossary'
import { resetAll } from '../../screens/harness'
import { registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import { __resetFinaleView } from '@app/missions/finale/selectors'
import { FINALE_LOCAL_GLOSSARY_IDS as LOCAL_IDS } from '@app/missions/finale/glossary'
import { makeFinaleCtx, startFinaleViaSend } from './fixture'

let teardown: () => void
let clock = 1_000_000
const advanceTo = (ms: number): void => {
  clock = ms
}

beforeEach(() => {
  resetAll()
  __resetFinaleView()
  clock = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  registerDefaultVerbs()
  registerFinaleScreen()
  teardown = init({
    ctx: makeFinaleCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  teardown()
  __resetFinaleView()
  vi.restoreAllMocks()
  cleanup()
})

describe('FinaleScreen glossary', () => {
  it('registers the four local terms without collision and does not re-register the globals', () => {
    for (const id of LOCAL_IDS) {
      expect(hasGlossaryEntry(id)).toBe(true)
    }
    // Global provenance and commit terms are present (registered by the shell).
    expect(hasGlossaryEntry('observed')).toBe(true)
    expect(hasGlossaryEntry('staged-recovery')).toBe(true)
    expect(hasGlossaryEntry('repeat-d-83')).toBe(true)
    // The locals do not shadow any global id.
    for (const global of ['observed', 'exercise', 'derived', 'staged-recovery']) {
      expect(LOCAL_IDS).not.toContain(global)
    }
  })

  it('re-registering a global id trips the glossary uniqueness guard', () => {
    expect(() =>
      registerGlossaryTerms([
        { id: 'observed', term: 'OBSERVED', definition: 'DUP' },
      ]),
    ).toThrow(/duplicate/)
  })

  it('a local term opens its definition on focus and Escape closes it', () => {
    startFinaleViaSend(advanceTo)
    render(<ScreenRouter />)
    // CASE renders in the case-builder legend.
    const terms = screen.getAllByTestId('glossary-term')
    const caseTerm = terms.find((t) => t.textContent === 'CASE')!
    expect(caseTerm).toBeDefined()
    const wrap = caseTerm.closest('.glossary-wrap') as HTMLElement
    act(() => {
      fireEvent.focus(caseTerm)
    })
    expect(within(wrap).getByTestId('glossary-popup')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(caseTerm, { key: 'Escape' })
    })
    expect(within(wrap).queryByTestId('glossary-popup')).toBeNull()
  })
})
