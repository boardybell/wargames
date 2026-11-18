// Typed synth recipes. Provisional sounds for every event: square and
// triangle oscillators for taps, blips, and two-tone cues; filtered noise for
// hum and static. The media split later swaps file sources in; these keep
// every call site sounding without a single recording.

export type RecipeId =
  | 'key-tick'
  | 'activation'
  | 'menu-blip'
  | 'confirm'
  | 'reject'
  | 'warn-30'
  | 'warn-10'
  | 'settle-good'
  | 'settle-bad'
  | 'ambience-hum'
  | 'static-burst'
  | 'voice-placeholder'

export type Recipe =
  | { readonly kind: 'osc'; readonly wave: OscillatorType; readonly freq: number; readonly ms: number }
  | {
      readonly kind: 'two-tone'
      readonly wave: OscillatorType
      readonly freqA: number
      readonly freqB: number
      readonly ms: number
    }
  | { readonly kind: 'noise'; readonly ms: number; readonly lowpass: number }

export const RECIPES: Readonly<Record<RecipeId, Recipe>> = {
  'key-tick': { kind: 'osc', wave: 'square', freq: 1800, ms: 18 },
  activation: { kind: 'two-tone', wave: 'triangle', freqA: 220, freqB: 660, ms: 320 },
  'menu-blip': { kind: 'osc', wave: 'square', freq: 880, ms: 60 },
  confirm: { kind: 'two-tone', wave: 'triangle', freqA: 660, freqB: 990, ms: 160 },
  reject: { kind: 'two-tone', wave: 'square', freqA: 330, freqB: 180, ms: 200 },
  'warn-30': { kind: 'osc', wave: 'triangle', freq: 440, ms: 260 },
  'warn-10': { kind: 'osc', wave: 'triangle', freq: 620, ms: 320 },
  'settle-good': { kind: 'two-tone', wave: 'triangle', freqA: 523, freqB: 784, ms: 400 },
  'settle-bad': { kind: 'two-tone', wave: 'square', freqA: 196, freqB: 131, ms: 420 },
  'ambience-hum': { kind: 'noise', ms: 1600, lowpass: 220 },
  'static-burst': { kind: 'noise', ms: 180, lowpass: 6000 },
  'voice-placeholder': { kind: 'osc', wave: 'square', freq: 300, ms: 260 },
}
