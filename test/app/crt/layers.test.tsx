import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { GlassContainer } from '@app/crt'
import { Cursor } from '@app/crt'

afterEach(cleanup)

describe('GlassContainer layer stack', () => {
  it('renders the text layer with aria-hidden overlay siblings', () => {
    render(
      <GlassContainer reduceGlow={false}>
        <span>GREETINGS PROFESSOR FALKEN</span>
      </GlassContainer>,
    )
    const text = screen.getByTestId('crt-text')
    expect(text).toHaveTextContent('GREETINGS PROFESSOR FALKEN')
    for (const id of ['crt-scanlines', 'crt-vignette']) {
      const overlay = screen.getByTestId(id)
      expect(overlay).toHaveAttribute('aria-hidden', 'true')
      // Overlays are siblings of the text, never parents of it.
      expect(overlay.contains(text)).toBe(false)
    }
  })

  it('reduce-glow toggles the class and drops the breathing layer', () => {
    const { rerender } = render(
      <GlassContainer reduceGlow={false}>
        <span>x</span>
      </GlassContainer>,
    )
    expect(screen.getByTestId('crt-glass').className).not.toContain(
      'crt-reduce-glow',
    )
    expect(screen.queryByTestId('crt-breathe')).not.toBeNull()

    rerender(
      <GlassContainer reduceGlow={true}>
        <span>x</span>
      </GlassContainer>,
    )
    expect(screen.getByTestId('crt-glass').className).toContain(
      'crt-reduce-glow',
    )
    // The breathing layer is absent when reduce-glow is active.
    expect(screen.queryByTestId('crt-breathe')).toBeNull()
  })
})

describe('Cursor', () => {
  it('is decorative: aria-hidden and pointer-events none', () => {
    render(<Cursor />)
    const cursor = screen.getByTestId('crt-cursor')
    expect(cursor).toHaveAttribute('aria-hidden', 'true')
    expect(cursor.style.pointerEvents).toBe('none')
  })
})
