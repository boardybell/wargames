import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runPushIn, PUSH_IN_MS, CROSSFADE_AT_MS, REDUCED_MS } from '@app/hero'
import { mockAnimate, resetHero } from './harness'

let animCtl: ReturnType<typeof mockAnimate>

beforeEach(() => {
  resetHero()
  vi.useFakeTimers()
  animCtl = mockAnimate()
})

afterEach(() => {
  animCtl.restore()
  vi.useRealTimers()
})

function handles() {
  return {
    photoEl: document.createElement('div'),
    terminalEl: document.createElement('div'),
    glass: { x: 100, y: 100, w: 200, h: 150 },
    viewport: { w: 1000, h: 700 },
  }
}

describe('push-in default path', () => {
  it('dollies the photo with a transform keyframe over 700 ms, crossfades at 450 ms, then finishes', () => {
    const h = handles()
    const onFinish = vi.fn()
    runPushIn(h, { reducedMotion: false, onFinish })

    const dolly = animCtl.anims.find(
      (a) =>
        a.el === h.photoEl &&
        typeof a.keyframes[1]?.transform === 'string' &&
        (a.keyframes[1].transform as string).includes('scale'),
    )
    expect(dolly).toBeTruthy()
    expect(dolly!.opts.duration).toBe(PUSH_IN_MS)
    expect(h.photoEl.style.willChange).toBe('transform')

    // The terminal crossfade is scheduled, not immediate.
    expect(animCtl.anims.filter((a) => a.el === h.terminalEl)).toHaveLength(0)
    vi.advanceTimersByTime(CROSSFADE_AT_MS - 1)
    expect(animCtl.anims.filter((a) => a.el === h.terminalEl)).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(animCtl.anims.filter((a) => a.el === h.terminalEl)).toHaveLength(1)

    dolly!.anim.finish()
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(h.photoEl.style.willChange).toBe('')
  })
})

describe('push-in reduced motion', () => {
  it('replaces the dolly with a short crossfade, no transform will-change', () => {
    const h = handles()
    const onFinish = vi.fn()
    runPushIn(h, { reducedMotion: true, onFinish })
    const fade = animCtl.anims.find((a) => a.el === h.photoEl)
    expect(fade!.opts.duration).toBe(REDUCED_MS)
    expect(h.photoEl.style.willChange).not.toBe('transform')
    fade!.anim.finish()
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})

describe('push-in re-entry guard', () => {
  it('a second invocation is a no-op', () => {
    const h = handles()
    runPushIn(h, { reducedMotion: true, onFinish: () => {} })
    const count = animCtl.anims.length
    runPushIn(h, { reducedMotion: true, onFinish: () => {} })
    expect(animCtl.anims.length).toBe(count)
  })
})
