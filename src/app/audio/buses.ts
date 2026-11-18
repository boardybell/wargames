// Three mix buses (effects, voice, ambience) into a master gain into the
// destination. Master gain stays at 0 until the prefs say enabled, and each
// bus gain follows its own pref, so resuming the context is always safe
// regardless of mute state.
import { getAudioContext } from './context'
import { getAudioPrefs, onAudioPrefs } from './prefs'
import type { GainLike } from './port'

export type BusName = 'effects' | 'voice' | 'ambience'

interface Buses {
  readonly master: GainLike
  readonly effects: GainLike
  readonly voice: GainLike
  readonly ambience: GainLike
  // A ducking node in series after the ambience bus. Preferences own the
  // ambience bus gain; ducking owns this node. Two writers, two params, so a
  // voice duck never fights the user's ambience level and a prefs change never
  // stomps an active duck ramp.
  readonly ambienceDuck: GainLike
}

let buses: Buses | null = null
let unsubscribe: (() => void) | null = null

function applyPrefs(): void {
  if (!buses) return
  const prefs = getAudioPrefs()
  buses.master.gain.value = prefs.master ? 1 : 0
  buses.effects.gain.value = prefs.effects ? 1 : 0
  buses.voice.gain.value = prefs.voice ? 1 : 0
  buses.ambience.gain.value = prefs.ambience ? 1 : 0
  // Never touch ambienceDuck here: it belongs to the player's ducking automation.
}

export function getBuses(): Buses | null {
  if (buses) return buses
  const ctx = getAudioContext()
  if (!ctx) return null
  const master = ctx.createGain()
  master.connect(ctx.destination)
  const toMaster = (): GainLike => {
    const g = ctx.createGain()
    g.connect(master)
    return g
  }
  const effects = toMaster()
  const voice = toMaster()
  const ambience = ctx.createGain()
  const ambienceDuck = ctx.createGain()
  ambience.connect(ambienceDuck)
  ambienceDuck.connect(master)
  buses = { master, effects, voice, ambience, ambienceDuck }
  applyPrefs()
  unsubscribe = onAudioPrefs(applyPrefs)
  return buses
}

export function busFor(name: BusName): GainLike | null {
  const b = getBuses()
  return b ? b[name] : null
}

export function masterBus(): GainLike | null {
  const b = getBuses()
  return b ? b.master : null
}

export function ambienceBus(): GainLike | null {
  const b = getBuses()
  return b ? b.ambience : null
}

/** The ducking node in series after the ambience bus (owned by the player). */
export function ambienceDuckNode(): GainLike | null {
  const b = getBuses()
  return b ? b.ambienceDuck : null
}

/** Test-only. */
export function __resetBuses(): void {
  unsubscribe?.()
  unsubscribe = null
  buses = null
}
