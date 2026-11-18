import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  play,
  enqueue,
  drainQueue,
  incrementGeneration,
  preloadEager,
  decodeCountFor,
  masterBus,
  resumeAudio,
  setAudioPref,
  type CueDefinition,
} from '@app/audio'
import { installMockAudio, resetAudio, type MockContext } from './harness'

const fileManifest: Readonly<Record<string, CueDefinition>> = {
  eagerFx: {
    id: 'eagerFx',
    source: { kind: 'file', url: '/wargames/audio/fx.wav' },
    bus: 'effects',
    gain: 0.5,
    transcript: 'FX',
    policy: 'queue',
    preload: 'eager',
  },
  lazyVoice: {
    id: 'lazyVoice',
    source: { kind: 'file', url: '/wargames/audio/v.wav' },
    bus: 'voice',
    gain: 0.9,
    transcript: 'V',
    policy: 'exclusive-on-bus',
    preload: 'lazy',
  },
}

describe('decode paths', () => {
  let ctx: MockContext
  beforeEach(() => {
    resetAudio()
    ctx = installMockAudio('running').ctx
  })
  afterEach(resetAudio)

  it('eager file cues decode at manifest load', () => {
    preloadEager(fileManifest)
    expect(decodeCountFor('eagerFx')).toBe(1)
  })

  it('a lazy cue played twice decodes once', () => {
    play('lazyVoice', fileManifest)
    play('lazyVoice', fileManifest)
    expect(decodeCountFor('lazyVoice')).toBe(1)
  })

  it('master gain is 0 until audio is enabled', () => {
    play('confirm')
    expect(masterBus()?.gain.value).toBe(0)
    void ctx
  })

  it('enabling audio lifts the master gain', () => {
    play('confirm')
    setAudioPref('master', true)
    expect(masterBus()?.gain.value).toBe(1)
  })
})

describe('exclusivity and generation token', () => {
  let ctx: MockContext
  beforeEach(() => {
    resetAudio()
    ctx = installMockAudio('running').ctx
  })
  afterEach(resetAudio)

  it('a new voice cue kills the prior voice line', () => {
    play('voice-greeting')
    const first = ctx.sources[0]!
    play('voice-greeting')
    expect(first.stopped).toBe(true)
  })

  it('a queued cue with a stale generation token drops on drain', () => {
    enqueue('confirm')
    incrementGeneration() // screen change or catch-up wake
    const before = ctx.sources.length
    drainQueue()
    expect(ctx.sources.length).toBe(before) // dropped silently
  })

  it('a queued cue with a current token plays on drain', () => {
    const before = ctx.sources.length
    enqueue('confirm')
    drainQueue()
    expect(ctx.sources.length).toBeGreaterThan(before)
  })
})

describe('resilience', () => {
  beforeEach(resetAudio)
  afterEach(resetAudio)

  it('every entry point swallows a missing context without throwing', () => {
    // No mock installed: jsdom has no Web Audio, so there is no context.
    expect(() => play('confirm')).not.toThrow()
    expect(() => resumeAudio()).not.toThrow()
    expect(() => drainQueue()).not.toThrow()
  })
})
