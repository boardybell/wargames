import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAudioContext, resumeAudio } from '@app/audio'
import { installMockAudio, resetAudio, type MockContext } from './harness'

let ctx: MockContext

beforeEach(() => {
  resetAudio()
  ctx = installMockAudio('suspended').ctx
})

afterEach(resetAudio)

describe('audio context lifecycle', () => {
  it('is created suspended with no resume before activation', () => {
    const created = getAudioContext()
    expect(created?.state).toBe('suspended')
    expect(ctx.resumeSpy).not.toHaveBeenCalled()
  })

  it('resumeAudio resumes synchronously', () => {
    getAudioContext()
    resumeAudio()
    expect(ctx.resumeSpy).toHaveBeenCalledTimes(1)
  })

  it('re-resumes after an interruption on the next user gesture', () => {
    getAudioContext() // registers the statechange listener
    ctx.setState('suspended')
    ctx.fire('statechange') // arms the one-shot gesture resume
    expect(ctx.resumeSpy).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('pointerdown'))
    expect(ctx.resumeSpy).toHaveBeenCalledTimes(1)
  })
})
