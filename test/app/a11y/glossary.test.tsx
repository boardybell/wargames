import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GlossaryTerm } from '@app/a11y/GlossaryTerm'
import {
  allGlossaryEntries,
  getGlossaryEntry,
  registerGlossaryTerms,
  __resetGlossary,
} from '@app/a11y/glossary'

beforeEach(() => {
  __resetGlossary()
})
afterEach(() => {
  cleanup()
  __resetGlossary()
})

describe('GlossaryTerm interaction', () => {
  it('opens on hover, focus, and click; Escape closes', () => {
    render(<GlossaryTerm id="open-exceptions" />)
    const term = screen.getByTestId('glossary-term')
    expect(term).toHaveTextContent('OPEN EXCEPTIONS')
    expect(term).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('glossary-popup')).toBeNull()

    fireEvent.mouseEnter(term)
    expect(term).toHaveAttribute('aria-expanded', 'true')
    const popup = screen.getByTestId('glossary-popup')
    expect(term.getAttribute('aria-describedby')).toBe(popup.id)
    fireEvent.mouseLeave(term)
    expect(screen.queryByTestId('glossary-popup')).toBeNull()

    fireEvent.focus(term)
    expect(screen.getByTestId('glossary-popup')).toBeInTheDocument()
    fireEvent.keyDown(term, { key: 'Escape' })
    expect(screen.queryByTestId('glossary-popup')).toBeNull()

    // Click opens (idempotent with focus) so a tap never nets to closed; close
    // is via blur/leave/Escape.
    fireEvent.click(term)
    expect(term).toHaveAttribute('aria-expanded', 'true')
    fireEvent.blur(term)
    expect(term).toHaveAttribute('aria-expanded', 'false')
  })

  it('is focusable and labeled (reachable as a button carrying the term)', () => {
    render(<GlossaryTerm term="EXTENDED TIME" definition="A calmer pace." />)
    const term = screen.getByRole('button', { name: 'EXTENDED TIME' })
    expect(term).toBeInTheDocument()
  })

  it('renders an inline term and definition without the registry', () => {
    render(<GlossaryTerm term="WOPR" definition="War Operation Plan Response." />)
    fireEvent.focus(screen.getByTestId('glossary-term'))
    expect(screen.getByTestId('glossary-popup')).toHaveTextContent(
      'War Operation Plan Response.',
    )
  })

  it('fails loudly when rendered for an unregistered id', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<GlossaryTerm id="no-such-term" />)).toThrow()
    spy.mockRestore()
  })
})

describe('glossary registry', () => {
  it('every registered term has a non-empty definition', () => {
    for (const entry of allGlossaryEntries()) {
      expect(entry.definition.trim().length).toBeGreaterThan(0)
    }
  })

  it('ships the initial terms', () => {
    const terms = allGlossaryEntries().map((e) => e.term)
    for (const expected of [
      'OPEN EXCEPTIONS',
      'TRACE',
      'CHECK SOURCE',
      'OBSERVED',
      'EXERCISE',
      'DERIVED',
      'independent corroboration',
      'REPEAT D-83',
      'HOLD AND VERIFY',
      'STAGED RECOVERY',
    ]) {
      expect(terms).toContain(expected)
    }
  })

  it('registerGlossaryTerms adds mission terms', () => {
    registerGlossaryTerms([
      { id: 'decoy-run', term: 'DECOY RUN', definition: 'A feint to draw attention.' },
    ])
    expect(getGlossaryEntry('decoy-run').term).toBe('DECOY RUN')
  })

  it('a colliding term id throws', () => {
    expect(() =>
      registerGlossaryTerms([
        { id: 'trace', term: 'TRACE', definition: 'duplicate' },
      ]),
    ).toThrow()
  })
})
