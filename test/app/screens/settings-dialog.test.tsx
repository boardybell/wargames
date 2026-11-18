import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { SettingsDialog, getOverlay } from '@app/screens'
import { getAudioPrefs, setSoundPreference } from '@app/audio'
import { buildCtx, memoryPort, resetAll } from './harness'

let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  cleanup()
  vi.restoreAllMocks()
})

describe('SettingsDialog', () => {
  it('renders the four sound toggles, with the AI-generated voice label', () => {
    render(<SettingsDialog open={true} onClose={() => {}} />)
    for (const id of [
      'toggle-master',
      'toggle-effects',
      'toggle-voice',
      'toggle-ambience',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    expect(screen.getByText(/AI-GENERATED/)).toBeInTheDocument()
  })

  it('the master switch and the diegetic prompt share one backing value', () => {
    setSoundPreference('on') // as the hero prompt would
    render(<SettingsDialog open={true} onClose={() => {}} />)
    const master = screen.getByTestId('toggle-master') as HTMLInputElement
    expect(master.checked).toBe(true)
    fireEvent.click(master)
    expect(getAudioPrefs().master).toBe(false)
  })

  it('the reduce-glow toggle applies and removes the single class hook', () => {
    render(<SettingsDialog open={true} onClose={() => {}} />)
    const toggle = screen.getByTestId('toggle-reduce-glow')
    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('crt-reduce-glow')).toBe(
      true,
    )
    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('crt-reduce-glow')).toBe(
      false,
    )
  })

  it('extended time is editable before a mission and locks once one has started', () => {
    const { rerender } = render(
      <SettingsDialog open={true} onClose={() => {}} />,
    )
    const toggle = screen.getByTestId('toggle-extended-time') as HTMLInputElement
    expect(toggle).toBeEnabled()
    fireEvent.click(toggle)
    expect(getState().preferences.extendedTime).toBe(true)

    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    rerender(<SettingsDialog open={true} onClose={() => {}} />)
    expect(screen.getByTestId('toggle-extended-time')).toBeDisabled()
    expect(screen.getByTestId('extended-time-lock')).toBeInTheDocument()
  })

  it('New Campaign opens the New Campaign dialog, never resets directly', () => {
    const before = getState()
    render(<SettingsDialog open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-new-campaign'))
    expect(getOverlay()).toBe('newCampaign')
    expect(getState()).toBe(before) // nothing dispatched
  })
})
