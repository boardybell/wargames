import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelpOverlay } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from './harness'

beforeEach(() => {
  resetAll()
  registerDefaultVerbs()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HelpOverlay', () => {
  it('is context-sensitive: idle lists LIST GAMES, a mission does not', () => {
    const { rerender } = render(
      <HelpOverlay open={true} activeScreen="menu" onClose={() => {}} />,
    )
    expect(screen.getByTestId('help-LIST')).toBeInTheDocument()
    expect(screen.getByTestId('help-HELP')).toBeInTheDocument()

    rerender(
      <HelpOverlay
        open={true}
        activeScreen="mission:alpha"
        onClose={() => {}}
      />,
    )
    expect(screen.queryByTestId('help-LIST')).toBeNull()
  })

  it('carries aria-labelledby and closes on its control', () => {
    const onClose = vi.fn()
    render(<HelpOverlay open={true} activeScreen="menu" onClose={onClose} />)
    expect(screen.getByTestId('help-overlay')).toHaveAttribute(
      'aria-labelledby',
      'help-heading',
    )
    fireEvent.click(screen.getByTestId('help-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the help overlay', () => {
    const onClose = vi.fn()
    render(<HelpOverlay open={true} activeScreen="menu" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
