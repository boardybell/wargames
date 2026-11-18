import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init } from '@app/state'
import { CorruptSaveNotice } from '@app/screens'
import { handleCapturedKey } from '@app/screens/inputStack'
import { encodeSave, createCampaign, PRIMARY_KEY, BACKUP_KEY } from '@engine'
import { buildCtx, memoryPort, resetAll } from './harness'

function freshSave(): string {
  return encodeSave(
    createCampaign(buildCtx(), 'test-seed', { extendedTime: false }, 1_000_000),
  )
}

let teardown: (() => void) | null = null

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
})

afterEach(() => {
  teardown?.()
  teardown = null
  cleanup()
  vi.restoreAllMocks()
})

function boot(seed: Record<string, string>): void {
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort(seed) })
}

describe('CorruptSaveNotice', () => {
  it('renders nothing on a clean load', () => {
    boot({ [PRIMARY_KEY]: freshSave() })
    render(<CorruptSaveNotice />)
    expect(screen.queryByTestId('corrupt-save-notice')).toBeNull()
  })

  it('recovered-backup shows the backup-restored copy', () => {
    boot({ [PRIMARY_KEY]: 'garbage', [BACKUP_KEY]: freshSave() })
    render(<CorruptSaveNotice />)
    expect(screen.getByTestId('corrupt-copy').textContent).toMatch(/BACKUP/)
  })

  it('reset shows the fresh-campaign copy and dismissal closes it', () => {
    boot({ [PRIMARY_KEY]: 'garbage', [BACKUP_KEY]: 'also garbage' })
    render(<CorruptSaveNotice />)
    expect(screen.getByTestId('corrupt-copy').textContent).toMatch(
      /FRESH CAMPAIGN/,
    )
    const dialog = screen.getByTestId('corrupt-save-notice') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    fireEvent.click(screen.getByTestId('corrupt-dismiss'))
    // Kept mounted but closed, so the precedence stack is released.
    expect(dialog.open).toBe(false)
  })

  it('dismissing releases the key-precedence stack (no app-wide lockup)', () => {
    boot({ [PRIMARY_KEY]: 'garbage', [BACKUP_KEY]: 'also garbage' })
    render(<CorruptSaveNotice />)
    // Open dialog consumes keys.
    expect(
      handleCapturedKey(new KeyboardEvent('keydown', { key: '1' })),
    ).toBe('consumed')
    fireEvent.click(screen.getByTestId('corrupt-dismiss'))
    // After dismissal keys pass through again.
    expect(
      handleCapturedKey(new KeyboardEvent('keydown', { key: '1' })),
    ).toBe('pass')
  })
})
