import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAudioPrefs,
  setAudioPref,
  getSoundPreference,
  setSoundPreference,
} from '@app/audio'
import { resetAudio } from './harness'

beforeEach(resetAudio)
afterEach(() => {
  resetAudio()
  vi.restoreAllMocks()
})

describe('audio preferences', () => {
  it('toggles round-trip through the single backing store', () => {
    expect(getAudioPrefs().effects).toBe(true)
    setAudioPref('effects', false)
    expect(getAudioPrefs().effects).toBe(false)
    setAudioPref('ambience', false)
    expect(getAudioPrefs().ambience).toBe(false)
  })

  it('defaults to muted master', () => {
    expect(getAudioPrefs().master).toBe(false)
    expect(getSoundPreference()).toBeNull()
  })

  it('a corrupt stored value falls back to muted defaults without throwing', () => {
    // A localStorage that returns garbage for the prefs key.
    vi.stubGlobal('window', {
      ...globalThis.window,
      localStorage: {
        getItem: () => '{ not json',
        setItem: () => {},
        removeItem: () => {},
      },
    })
    resetAudio()
    expect(() => getAudioPrefs()).not.toThrow()
    expect(getAudioPrefs().master).toBe(false)
  })

  it('one master value backs both the prompt and the settings switch', () => {
    setSoundPreference('on') // the diegetic hero prompt path
    expect(getAudioPrefs().master).toBe(true)
    setAudioPref('master', false) // the settings switch path
    expect(getSoundPreference()).toBe('off')
  })
})
