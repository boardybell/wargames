import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send } from '@app/state'
import { HeroStage } from '@app/hero'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll as resetScreens, buildCtx, memoryPort } from '../screens/harness'
import { mockAnimate, resetHero } from './harness'

let teardown: () => void
let animCtl: ReturnType<typeof mockAnimate>

beforeEach(() => {
  resetScreens()
  resetHero()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  animCtl = mockAnimate()
  registerDefaultVerbs()
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  animCtl.restore()
  cleanup()
  vi.restoreAllMocks()
})

describe('HeroStage integration', () => {
  it('a fresh campaign shows the hero with the terminal mounted beneath', () => {
    render(<HeroStage />)
    expect(screen.getByTestId('hero-button')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-beneath')).toBeInTheDocument()
    // The menu is rendered beneath, ready to be revealed.
    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
  })

  it('an active-mission save skips the hero and shows the mission directly', () => {
    act(() => {
      send({ type: 'START_MISSION', missionId: 'alpha' })
    })
    render(<HeroStage />)
    expect(screen.queryByTestId('hero-button')).toBeNull()
    expect(screen.getByTestId('mission-frame')).toBeInTheDocument()
  })

  it('activation runs the push-in and reveals the terminal, then the sound prompt', () => {
    render(<HeroStage />)
    act(() => {
      fireEvent.click(screen.getByTestId('hero-button'))
    })
    // Finish the photo dolly to complete the push-in.
    const dolly = animCtl.anims.find(
      (a) =>
        typeof a.keyframes[1]?.transform === 'string' &&
        (a.keyframes[1].transform as string).includes('scale'),
    )
    expect(dolly).toBeTruthy()
    act(() => {
      dolly!.anim.finish()
    })
    // Hero gone, terminal (menu) shown, and the fresh-campaign sound prompt up.
    expect(screen.queryByTestId('hero-button')).toBeNull()
    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
    expect(screen.getByTestId('sound-prompt')).toBeInTheDocument()
  })
})
