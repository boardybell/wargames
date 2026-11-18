import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SoundPrompt } from '@app/hero'
import { getSoundPreference, hasSoundPreference } from '@app/audio'
import { handleCapturedKey, setTypeIn } from '@app/screens/inputStack'
import { resetHero } from './harness'

beforeEach(resetHero)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SoundPrompt', () => {
  it('Y enables sound and persists the single master preference', () => {
    const onAnswered = vi.fn()
    render(<SoundPrompt onAnswered={onAnswered} />)
    fireEvent.click(screen.getByTestId('sound-yes'))
    expect(getSoundPreference()).toBe('on')
    expect(hasSoundPreference()).toBe(true)
    expect(onAnswered).toHaveBeenCalledWith(true)
  })

  it('N declines and persists off', () => {
    render(<SoundPrompt />)
    fireEvent.click(screen.getByTestId('sound-no'))
    expect(getSoundPreference()).toBe('off')
    expect(hasSoundPreference()).toBe(true)
  })

  it('Y during the prompt answers it and does not complete a running type-in', () => {
    const typeInComplete = vi.fn()
    setTypeIn(true, typeInComplete)
    render(<SoundPrompt />)
    const result = handleCapturedKey(
      new KeyboardEvent('keydown', { key: 'Y' }),
    )
    expect(result).toBe('consumed')
    expect(getSoundPreference()).toBe('on')
    // The prompt layer is above the type-in: Y never reached it.
    expect(typeInComplete).not.toHaveBeenCalled()
  })

  it('an unrelated key during the prompt falls through (not consumed by the prompt)', () => {
    render(<SoundPrompt />)
    // 'X' is not an answer key; with no type-in it falls to the screen layer.
    const result = handleCapturedKey(
      new KeyboardEvent('keydown', { key: 'X' }),
    )
    expect(result).toBe('pass')
    expect(getSoundPreference()).toBeNull()
  })
})
