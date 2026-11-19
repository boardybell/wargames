// The cue manifest: the single file the media split edits to swap synth
// recipes for recorded files. Validation runs at load and in a unit test:
// transcript required unless the cue is a whitelisted sub-100ms mechanical
// tick, preload required, bus and policy from the unions. Effects cues are
// eager; voice cues lazy (decode on first play, then cached) to bound PCM
// memory on phones.
import type { RecipeId } from './recipes'
import { urlFor } from '../urlFor'

export type BusName = 'effects' | 'voice' | 'ambience'
export type CuePolicy = 'exclusive-on-bus' | 'queue' | 'drop-if-stale'
export type Preload = 'eager' | 'lazy'

export type CueSource =
  | { readonly kind: 'synth'; readonly recipe: RecipeId }
  | { readonly kind: 'file'; readonly url: string }

export interface CueDefinition {
  readonly id: string
  readonly source: CueSource
  readonly bus: BusName
  readonly gain: number
  readonly transcript: string | null
  readonly policy: CuePolicy
  readonly preload: Preload
  // Caption this cue even when it is not on the voice bus. Timer warnings live
  // on the effects bus but must still read out; setting this keeps the caption
  // rule a manifest fact rather than an id-prefix guess.
  readonly caption?: boolean
}

// Cues allowed a null transcript: sub-100ms mechanical ticks only.
export const SILENT_TICK_IDS: ReadonlySet<string> = new Set(['key-tick', 'menu-blip'])

export type CueId =
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
  | 'voice-greeting'

const synth = (recipe: RecipeId): CueSource => ({ kind: 'synth', recipe })
const file = (path: string): CueSource => ({ kind: 'file', url: urlFor(path) })

export const CUE_MANIFEST: Readonly<Record<CueId, CueDefinition>> = {
  'key-tick': { id: 'key-tick', source: synth('key-tick'), bus: 'effects', gain: 0.25, transcript: null, policy: 'drop-if-stale', preload: 'eager' },
  activation: { id: 'activation', source: synth('activation'), bus: 'effects', gain: 0.5, transcript: 'TERMINAL ACTIVATED', policy: 'queue', preload: 'eager' },
  'menu-blip': { id: 'menu-blip', source: synth('menu-blip'), bus: 'effects', gain: 0.3, transcript: null, policy: 'drop-if-stale', preload: 'eager' },
  confirm: { id: 'confirm', source: synth('confirm'), bus: 'effects', gain: 0.4, transcript: 'CONFIRMED', policy: 'queue', preload: 'eager' },
  reject: { id: 'reject', source: synth('reject'), bus: 'effects', gain: 0.4, transcript: 'REJECTED', policy: 'queue', preload: 'eager' },
  'warn-30': { id: 'warn-30', source: synth('warn-30'), bus: 'effects', gain: 0.5, transcript: 'THIRTY SECONDS REMAIN', policy: 'queue', preload: 'eager', caption: true },
  'warn-10': { id: 'warn-10', source: synth('warn-10'), bus: 'effects', gain: 0.6, transcript: 'TEN SECONDS REMAIN', policy: 'queue', preload: 'eager', caption: true },
  'settle-good': { id: 'settle-good', source: synth('settle-good'), bus: 'effects', gain: 0.5, transcript: 'MISSION RESOLVED', policy: 'queue', preload: 'eager' },
  'settle-bad': { id: 'settle-bad', source: synth('settle-bad'), bus: 'effects', gain: 0.5, transcript: 'MISSION LOST', policy: 'queue', preload: 'eager' },
  // Room-tone loop: the one bounced audio file (loops need a seamless rendered
  // join). Shipped as opus primary with an AAC sibling and a seam-continuous
  // WAV the loop-join CI gate decodes. Gain 0.2 holds it under the voice lines;
  // ducking is handled by the shell duck node, not here.
  'ambience-hum': { id: 'ambience-hum', source: file('audio/ambience/room-loop.opus'), bus: 'ambience', gain: 0.2, transcript: 'ROOM TONE', policy: 'exclusive-on-bus', preload: 'eager' },
  'static-burst': { id: 'static-burst', source: synth('static-burst'), bus: 'effects', gain: 0.35, transcript: 'STATIC', policy: 'queue', preload: 'eager' },
  // Voice cue, preload lazy. The rendered WOPR greeting clip ships under
  // public/audio/voice/voice-greeting.{opus,aac} (espeak-ng formant, film
  // register) alongside the catalog clips, but the manifest source stays the
  // synth placeholder: the committed shell player loads a file cue only once its
  // decode lands (a later split wires real fetch+decode), and the shell tests
  // require this cue to be synchronously playable. Swapping the source here now
  // would break shell playback and its tests without the player work. Source is
  // the only field held back; the shipped clip is ready for that swap.
  'voice-greeting': { id: 'voice-greeting', source: synth('voice-placeholder'), bus: 'voice', gain: 0.9, transcript: 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME?', policy: 'exclusive-on-bus', preload: 'lazy' },
}

export interface ManifestError {
  readonly id: string
  readonly reason: string
}

const BUSES: ReadonlySet<string> = new Set(['effects', 'voice', 'ambience'])
const POLICIES: ReadonlySet<string> = new Set([
  'exclusive-on-bus',
  'queue',
  'drop-if-stale',
])
const PRELOADS: ReadonlySet<string> = new Set(['eager', 'lazy'])

/** Validate every cue. Returns the list of violations (empty when valid). */
export function validateManifest(
  manifest: Readonly<Record<string, CueDefinition>>,
): ManifestError[] {
  const errors: ManifestError[] = []
  for (const cue of Object.values(manifest)) {
    if (cue.transcript === null && !SILENT_TICK_IDS.has(cue.id)) {
      errors.push({ id: cue.id, reason: 'null transcript on a non-tick cue' })
    }
    if (!PRELOADS.has(cue.preload)) {
      errors.push({ id: cue.id, reason: 'missing or invalid preload' })
    }
    if (!BUSES.has(cue.bus)) {
      errors.push({ id: cue.id, reason: 'invalid bus' })
    }
    if (!POLICIES.has(cue.policy)) {
      errors.push({ id: cue.id, reason: 'invalid policy' })
    }
    if (cue.source.kind === 'file' && !cue.source.url) {
      errors.push({ id: cue.id, reason: 'file cue missing url' })
    }
  }
  return errors
}

/** The engine events that must each have a cue. */
export const REQUIRED_CUE_IDS: readonly CueId[] = [
  'key-tick',
  'activation',
  'menu-blip',
  'confirm',
  'reject',
  'warn-30',
  'warn-10',
  'settle-good',
  'settle-bad',
  'ambience-hum',
  'static-burst',
  'voice-greeting',
]
