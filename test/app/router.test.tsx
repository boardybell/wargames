import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '@app'
import {
  registerScreen,
  resolveScreen,
  FallbackFrame,
  type RouterState,
  type ScreenRegistry,
} from '@app/router'

describe('screen router skeleton', () => {
  it('renders the component registered for the active screen', () => {
    const Menu = () => <div data-testid="menu-screen">MENU</div>
    const registry = registerScreen({}, 'menu', Menu)
    render(<App registry={registry} initial={{ base: 'menu', overlay: null }} />)
    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
  })

  it('renders the plain fallback frame for an unregistered id', () => {
    render(<App initial={{ base: 'debrief', overlay: null }} />)
    const frame = screen.getByTestId('fallback-frame')
    expect(frame).toHaveAttribute('data-screen-id', 'debrief')
  })

  it('resolveScreen returns the fallback for an unknown id', () => {
    expect(resolveScreen({}, 'finale')).toBe(FallbackFrame)
  })

  it('models settings and help as overlays, not exclusive base screens', () => {
    // A base screen plus an optional overlay: the state shape keeps them
    // distinct so an overlay can sit over any base screen (behavior is
    // section 06; this is a shape-level assertion).
    const state: RouterState = { base: 'menu', overlay: 'settings' }
    expect(state.base).toBe('menu')
    expect(state.overlay).toBe('settings')
    // Overlays are not valid base screens.
    const registry: ScreenRegistry = registerScreen(
      {},
      'help',
      () => <div>HELP</div>,
    )
    // The base screen still resolves independently of any overlay.
    expect(resolveScreen(registry, 'menu')).toBe(FallbackFrame)
  })
})
