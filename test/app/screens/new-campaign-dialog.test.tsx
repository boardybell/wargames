import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, getState } from '@app/state'
import { NewCampaignDialog } from '@app/screens'
import { SEED_NAMES } from '@engine'
import { SEED_CATALOG } from '@engine/seeds/catalog'
import { buildCtx, memoryPort, resetAll } from './harness'

let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  // The dialog lists the real catalog seeds; give the ctx those seeds so a
  // confirm can create one (the real app ctx is built from the same catalog).
  const base = buildCtx()
  const ctx = { ...base, seeds: { ...base.seeds, ...SEED_CATALOG } }
  teardown = init({ ctx, seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  cleanup()
  vi.restoreAllMocks()
})

describe('NewCampaignDialog', () => {
  it('lists exactly the three catalog seeds and has no free-text seed input', () => {
    render(<NewCampaignDialog open={true} onClose={() => {}} />)
    const list = screen.getByTestId('seed-list')
    expect(list.querySelectorAll('li')).toHaveLength(3)
    expect(SEED_NAMES).toHaveLength(3)
    // Only radio inputs, no free text entry.
    expect(
      screen.queryByRole('textbox'),
    ).toBeNull()
  })

  it('selecting a seed dispatches nothing; confirming dispatches NEW_CAMPAIGN once', () => {
    const before = getState()
    render(<NewCampaignDialog open={true} onClose={() => {}} />)
    const firstSeed = SEED_NAMES[0]!
    fireEvent.click(screen.getByTestId(`seed-${firstSeed}`))
    expect(getState()).toBe(before) // selection alone changes nothing
    fireEvent.click(screen.getByTestId('new-campaign-confirm'))
    expect(getState().seedName).toBe(firstSeed)
  })

  it('cancel closes without dispatch', () => {
    const before = getState()
    const onClose = vi.fn()
    render(<NewCampaignDialog open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('new-campaign-cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(getState()).toBe(before)
  })
})
