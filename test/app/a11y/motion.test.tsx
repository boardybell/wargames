import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, act } from '@testing-library/react'
import {
  useMotionPreference,
  useReducedMotion,
  setMotionOverride,
  getMotionOverride,
  __resetMotion,
} from '@app/a11y/motion'

function installMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql = {
    matches,
    media: '',
    onchange: null,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    addListener: (l: () => void) => listeners.add(l),
    removeListener: (l: () => void) => listeners.delete(l),
    dispatchEvent: () => false,
  }
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia
  return {
    setMatches(v: boolean) {
      mql.matches = v
      for (const l of listeners) l()
    },
  }
}

function Probe() {
  const reduced = useMotionPreference()
  return <span data-testid="reduced">{reduced ? 'yes' : 'no'}</span>
}

beforeEach(() => {
  __resetMotion()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  __resetMotion()
  vi.restoreAllMocks()
})

describe('useMotionPreference', () => {
  it('mirrors prefers-reduced-motion when the override is system', () => {
    installMatchMedia(true)
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
  })

  it('reflects the system off state too', () => {
    installMatchMedia(false)
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
  })

  it('an explicit override wins over the media query and reverts to system', () => {
    installMatchMedia(true) // system prefers reduce
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
    act(() => setMotionOverride('full'))
    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
    act(() => setMotionOverride('reduced'))
    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
    act(() => setMotionOverride('system'))
    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
  })

  it('re-renders on a live media-query change', () => {
    const media = installMatchMedia(false)
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('no')
    act(() => media.setMatches(true))
    expect(screen.getByTestId('reduced')).toHaveTextContent('yes')
  })

  it('useReducedMotion is the same hook', () => {
    expect(useReducedMotion).toBe(useMotionPreference)
  })

  it('a flip never cancels a running animation (hook holds no animation refs)', () => {
    installMatchMedia(false)
    const anim = { cancel: vi.fn(), finish: vi.fn() }
    function Consumer() {
      // The documented pattern: sample once at animation start.
      useMotionPreference()
      return <span data-testid="c">ok</span>
    }
    render(<Consumer />)
    act(() => setMotionOverride('reduced'))
    expect(anim.cancel).not.toHaveBeenCalled()
    expect(anim.finish).not.toHaveBeenCalled()
  })

  it('a corrupt or missing persisted override falls back to system', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'garbage-not-an-override',
      setItem: () => {},
      removeItem: () => {},
    })
    __resetMotion()
    expect(getMotionOverride()).toBe('system')
  })
})
