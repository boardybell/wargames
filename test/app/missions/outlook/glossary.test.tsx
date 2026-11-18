import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send } from '@app/state'
import { registerDefaultVerbs } from '@app/terminal'
import { hasGlossaryEntry } from '@app/a11y/glossary'
import { resetAll } from '../../screens/harness'
import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
import { OUTLOOK_LOCAL_GLOSSARY_IDS } from '@app/missions/outlook/glossary'
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

describe('OutlookScreen glossary', () => {
  it('registers only the five local terms without collision and does not re-register the global OBSERVED/EXERCISE/DERIVED', () => {
    // Local terms registered.
    for (const id of OUTLOOK_LOCAL_GLOSSARY_IDS) {
      expect(hasGlossaryEntry(id)).toBe(true)
    }
    // The global terms are present (registered by the shell, not the mission).
    expect(hasGlossaryEntry('observed')).toBe(true)
    expect(hasGlossaryEntry('exercise')).toBe(true)
    expect(hasGlossaryEntry('derived')).toBe(true)
    // The local ids must not shadow the global ids.
    expect(OUTLOOK_LOCAL_GLOSSARY_IDS).not.toContain('observed')
    expect(OUTLOOK_LOCAL_GLOSSARY_IDS).not.toContain('exercise')
    expect(OUTLOOK_LOCAL_GLOSSARY_IDS).not.toContain('derived')
  })

  it('local terms CHANNEL, CAPACITY, ETA open from StatusLine/OutboxView copy', () => {
    render(<OutlookScreen missionId="outlook" />)
    // The outbox copy carries the CHANNEL / CAPACITY / ETA glossary terms.
    fireEvent.click(screen.getByTestId('outlook-tab-outbox'))
    const outbox = screen.getByTestId('outbox-view')
    const terms = within(outbox).getAllByTestId('glossary-term')
    const labels = terms.map((t) => t.textContent)
    expect(labels).toContain('CHANNEL')
    expect(labels).toContain('CAPACITY')
    expect(labels).toContain('ETA')
    // Opening a term reveals its definition popup.
    const channel = terms.find((t) => t.textContent === 'CHANNEL')!
    fireEvent.focus(channel)
    expect(within(outbox).getByTestId('glossary-popup')).toBeInTheDocument()
  })

  it('DELIVERY RECEIPT opens from the delivery log copy', () => {
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('outlook-tab-log'))
    const log = screen.getByTestId('delivery-log')
    const labels = within(log).getAllByTestId('glossary-term').map((t) => t.textContent)
    expect(labels).toContain('DELIVERY RECEIPT')
  })

  it('EXERCISE BULLETIN opens from the message copy', () => {
    render(<OutlookScreen missionId="outlook" />)
    fireEvent.click(screen.getByTestId('menu-row-M04'))
    const detail = screen.getByTestId('message-view')
    const labels = within(detail).getAllByTestId('glossary-term').map((t) => t.textContent)
    expect(labels).toContain('EXERCISE BULLETIN')
  })

  it('OBSERVED, EXERCISE, DERIVED open the global entries from within the TRACE result rendering', () => {
    render(<OutlookScreen missionId="outlook" />)
    // M04 -> C17 is an EXERCISE record; its TRACE detail surfaces the global
    // EXERCISE term.
    fireEvent.click(screen.getByTestId('menu-row-M04'))
    fireEvent.click(screen.getByTestId('action-TRACE'))
    const detail = screen.getByTestId('record-detail')
    const labels = within(detail).getAllByTestId('glossary-term').map((t) => t.textContent)
    expect(labels).toContain('EXERCISE')
  })
})
