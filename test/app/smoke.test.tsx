import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '@app'

describe('app smoke', () => {
  it('mounts with a screen root and a dialog host', () => {
    render(<App />)
    expect(screen.getByTestId('screen-root')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-host')).toBeInTheDocument()
    // The reserved live-region position exists so section 09 is an insertion.
    expect(screen.getByTestId('live-region-slot')).toBeInTheDocument()
  })

  it('defaults to the hero base screen', () => {
    render(<App />)
    expect(screen.getByTestId('screen-root')).toHaveAttribute(
      'data-active-screen',
      'hero',
    )
  })
})
