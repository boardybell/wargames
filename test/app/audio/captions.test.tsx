import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Captions, play } from '@app/audio'
import { resetAudio } from './harness'

beforeEach(resetAudio)
afterEach(() => {
  cleanup()
  resetAudio()
})

describe('Captions', () => {
  it('renders the transcript of a playing voice cue even with no audio context', () => {
    // No mock audio installed: jsdom has no Web Audio, so there is no context,
    // yet a muted player must still read the line.
    render(<Captions />)
    // The live region is persistent but empty when idle (never unmounted).
    expect(screen.getByTestId('caption').textContent).toBe('')
    expect(screen.getByTestId('caption')).toHaveAttribute('data-empty', 'true')
    act(() => {
      play('voice-greeting')
    })
    expect(screen.getByTestId('caption').textContent).toMatch(
      /GREETINGS PROFESSOR FALKEN/,
    )
  })

  it('renders a warning cue transcript', () => {
    render(<Captions />)
    act(() => {
      play('warn-10')
    })
    expect(screen.getByTestId('caption').textContent).toMatch(/TEN SECONDS/)
  })
})
