import { vi } from 'vitest'
import { __resetAudio } from '@app/audio'
import { __resetPushIn } from '@app/hero'
import { __resetInputStack } from '@app/screens/inputStack'
import { installMockAudio } from '../audio/harness'

/** Install a mock audio context and return the spy its resume() routes to. */
export function spyResume(): ReturnType<typeof vi.fn> {
  const { ctx } = installMockAudio('suspended')
  return ctx.resumeSpy
}

export function resetHero(): void {
  __resetAudio()
  __resetPushIn()
  __resetInputStack()
}

interface MockedAnim {
  el: HTMLElement
  keyframes: Keyframe[]
  opts: KeyframeAnimationOptions
  anim: { addEventListener: (e: string, cb: () => void) => void; finish: () => void }
}

/** Replace element.animate with a capturing mock; returns the recorded calls
 *  and a restore function. */
export function mockAnimate(): { anims: MockedAnim[]; restore: () => void } {
  const anims: MockedAnim[] = []
  const original = HTMLElement.prototype.animate
  HTMLElement.prototype.animate = function (
    this: HTMLElement,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    opts?: number | KeyframeAnimationOptions,
  ) {
    const listeners: Record<string, () => void> = {}
    const anim = {
      addEventListener: (e: string, cb: () => void) => {
        listeners[e] = cb
      },
      finish: () => listeners['finish']?.(),
      finished: Promise.resolve(),
      cancel: () => {},
    }
    anims.push({
      el: this,
      keyframes: (keyframes ?? []) as Keyframe[],
      opts: (typeof opts === 'number' ? { duration: opts } : (opts ?? {})),
      anim,
    })
    return anim as unknown as Animation
  } as typeof HTMLElement.prototype.animate
  return {
    anims,
    restore: () => {
      HTMLElement.prototype.animate = original
    },
  }
}
