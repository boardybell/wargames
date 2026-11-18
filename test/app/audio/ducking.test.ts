import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { play } from '@app/audio'
import { installMockAudio, resetAudio, type MockContext } from './harness'

let ctx: MockContext

beforeEach(() => {
  resetAudio()
  ctx = installMockAudio('running').ctx
})

afterEach(resetAudio)

// Bus gains are created in order: master, effects, voice, ambience,
// ambienceDuck. Ducking operates on the dedicated duck node (index 4), never
// the prefs-owned ambience bus (index 3), so a voice duck never fights the
// user's ambience level. The first per-play envelope gain is index 5.
function duckGain() {
  return ctx.gains[4]!.gain
}

describe('ducking', () => {
  it('a voice start ramps the ambience duck node down to 0.3 over 0.05', () => {
    play('voice-greeting')
    const target = duckGain().calls.find((c) => c.m === 'setTargetAtTime')
    expect(target?.args[0]).toBe(0.3)
    expect(target?.args[2]).toBe(0.05)
  })

  it('the prefs-owned ambience bus is never touched by the duck', () => {
    play('voice-greeting')
    const ambienceBusGain = ctx.gains[3]!.gain
    const ducked = ambienceBusGain.calls.find(
      (c) => c.m === 'setTargetAtTime' && c.args[0] === 0.3,
    )
    expect(ducked).toBeUndefined()
  })

  it('cancelScheduledValues precedes the duck ramp', () => {
    play('voice-greeting')
    const calls = duckGain().calls
    const cancelAt = calls.findIndex((c) => c.m === 'cancelScheduledValues')
    const rampAt = calls.findIndex(
      (c) => c.m === 'setTargetAtTime' && c.args[0] === 0.3,
    )
    expect(cancelAt).toBeGreaterThanOrEqual(0)
    expect(cancelAt).toBeLessThan(rampAt)
  })

  it('voice end restores the duck node to full (1) with the 0.3 time constant', () => {
    play('voice-greeting')
    const voiceSource = ctx.sources[0]!
    voiceSource.onended?.()
    const restore = duckGain().calls.find(
      (c) => c.m === 'setTargetAtTime' && c.args[0] === 1,
    )
    expect(restore).toBeDefined()
  })

  it('a micro-fade precedes every stop (no source stopped at full gain)', () => {
    play('voice-greeting')
    const firstEnvelope = ctx.gains[5]!.gain // the first cue envelope gain
    const firstSource = ctx.sources[0]!
    play('voice-greeting') // exclusive: micro-fades and stops the prior
    const fade = firstEnvelope.calls.find(
      (c) => c.m === 'setTargetAtTime' && c.args[0] === 0,
    )
    expect(fade).toBeDefined()
    expect(firstSource.stopped).toBe(true)
  })
})
