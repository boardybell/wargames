import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HeroScene } from '@app/hero'
import { resetHero, spyResume } from './harness'

beforeEach(resetHero)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HeroScene activation', () => {
  it('is single-use across click, pointer, Enter, and Space', () => {
    const onActivate = vi.fn()
    render(<HeroScene onActivate={onActivate} />)
    const button = screen.getByTestId('hero-button')
    fireEvent.click(button)
    fireEvent.pointerUp(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('resumes audio synchronously in every activation handler', () => {
    const resume = spyResume()
    render(<HeroScene onActivate={() => {}} />)
    const button = screen.getByTestId('hero-button')
    fireEvent.click(button)
    fireEvent.pointerUp(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    // Resume fires on each gesture, before the single-use guard.
    expect(resume).toHaveBeenCalledTimes(4)
  })

  it('takes its accessible name from ACTIVATE TERMINAL; the image is decorative', () => {
    render(<HeroScene onActivate={() => {}} />)
    expect(
      screen.getByRole('button', { name: 'ACTIVATE TERMINAL' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('hero-img')).toHaveAttribute('alt', '')
  })

  it('renders the sound control outside the activation button', () => {
    render(<HeroScene onActivate={() => {}} />)
    const control = screen.getByTestId('hero-sound-control')
    const button = screen.getByTestId('hero-button')
    expect(button.contains(control)).toBe(false)
  })

  it('positions the greeting over the computed glass point', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 675,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 675,
      toJSON: () => ({}),
    } as DOMRect)
    render(<HeroScene onActivate={() => {}} />)
    // natural falls back to 1600x900; cover scale 0.75; rendered 1200x675. The
    // greeting anchor is the calibrated hero-desktop value (0.3203, 0.2222) from
    // heroCrop.ts: (0.3203*1200, 0.2222*675) = (384.36, 149.985).
    const greeting = screen.getByTestId('hero-greeting')
    expect(greeting.style.left).toBe('384.36px')
    expect(greeting.style.top).toBe('149.985px')
  })
})
