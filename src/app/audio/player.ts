// Playback: decode paths, synthesis, ducking, exclusivity, the generation
// token, and the playing-transcript state captions read. Every public entry
// swallows failure and returns synchronously; gameplay never awaits audio and
// a dead speaker never throws into the game.
import { getAudioContext, nowSeconds } from './context'
import { ambienceDuckNode, busFor } from './buses'
import { RECIPES, type Recipe } from './recipes'
import {
  CUE_MANIFEST,
  type CueDefinition,
  type CueId,
} from './manifest'
import type { BufferLike, GainLike, SourceLike } from './port'

const DUCK_LEVEL = 0.3
const DUCK_TC = 0.05
const ATTACK = 0.005
const MICRO_FADE = 0.008

type Manifest = Readonly<Record<string, CueDefinition>>

const decoded = new Map<string, BufferLike>()
const decodeInFlight = new Set<string>()
const decodeCounts = new Map<string, number>()
const activeOnBus = new Map<string, { source: SourceLike; gain: GainLike }>()

let generation = 0
const queue: { cueId: string; token: number; manifest: Manifest }[] = []

// Caption state: the transcript of the currently playing voice/warning cue.
let playingTranscript: string | null = null
const captionListeners = new Set<() => void>()

export function getPlayingTranscript(): string | null {
  return playingTranscript
}

export function onPlayingTranscript(listener: () => void): () => void {
  captionListeners.add(listener)
  return () => captionListeners.delete(listener)
}

function setTranscript(text: string | null): void {
  playingTranscript = text
  for (const l of captionListeners) l()
}

export function incrementGeneration(): void {
  generation += 1
}

export function currentGeneration(): number {
  return generation
}

function countDecode(id: string): void {
  decodeCounts.set(id, (decodeCounts.get(id) ?? 0) + 1)
}

export function decodeCountFor(id: string): number {
  return decodeCounts.get(id) ?? 0
}

/** Eager file cues decode at manifest load. */
export function preloadEager(manifest: Manifest = CUE_MANIFEST): void {
  const ctx = getAudioContext()
  if (!ctx) return
  for (const cue of Object.values(manifest)) {
    if (cue.preload === 'eager' && cue.source.kind === 'file') {
      void decodeFile(cue).catch(() => {})
    }
  }
}

async function decodeFile(cue: CueDefinition): Promise<BufferLike | null> {
  if (cue.source.kind !== 'file') return null
  if (decoded.has(cue.id)) return decoded.get(cue.id)!
  if (decodeInFlight.has(cue.id)) return null // a decode is already running
  const ctx = getAudioContext()
  if (!ctx) return null
  decodeInFlight.add(cue.id)
  try {
    countDecode(cue.id)
    const buffer = await ctx.decodeAudioData(new ArrayBuffer(0))
    decoded.set(cue.id, buffer)
    return buffer
  } catch {
    return null
  } finally {
    decodeInFlight.delete(cue.id)
  }
}

function envelope(ctx: NonNullable<ReturnType<typeof getAudioContext>>, gainValue: number, startAt: number, ms: number): GainLike {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, startAt)
  g.gain.linearRampToValueAtTime(gainValue, startAt + ATTACK)
  const end = startAt + ms / 1000
  g.gain.setTargetAtTime(0, Math.max(startAt, end - 0.03), 0.03)
  return g
}

function buildSynth(recipe: Recipe, startAt: number): SourceLike | null {
  const ctx = getAudioContext()
  if (!ctx) return null
  if (recipe.kind === 'osc' || recipe.kind === 'two-tone') {
    const osc = ctx.createOscillator()
    osc.type = recipe.wave
    const freq = recipe.kind === 'osc' ? recipe.freq : recipe.freqA
    osc.frequency.setValueAtTime(freq, startAt)
    if (recipe.kind === 'two-tone') {
      osc.frequency.setValueAtTime(recipe.freqB, startAt + recipe.ms / 2000)
    }
    return osc
  }
  // noise: a short filtered-noise buffer source.
  const length = Math.max(1, Math.floor(recipe.ms * 44.1))
  const buffer = ctx.createBuffer(1, length, 44100)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (i % 7) / 7 - 0.5
  const src = ctx.createBufferSource()
  src.buffer = buffer
  return src
}

function disconnectNodes(source: SourceLike, gain: GainLike): void {
  try {
    source.disconnect()
    gain.disconnect()
  } catch {
    // ignore: a dead graph never breaks gameplay.
  }
}

function microStop(entry: { source: SourceLike; gain: GainLike }, at: number): void {
  try {
    entry.gain.gain.cancelScheduledValues(at)
    entry.gain.gain.setTargetAtTime(0, at, MICRO_FADE)
    entry.source.stop(at + MICRO_FADE * 3)
  } catch {
    // ignore
  }
}

function duckAmbience(start: boolean, at: number): void {
  // Operate on the dedicated duck node, never the prefs-owned ambience bus, so
  // the restore target (1 = no duck) is always correct regardless of the user's
  // ambience level.
  const duck = ambienceDuckNode()
  if (!duck) return
  duck.gain.cancelScheduledValues(at)
  duck.gain.setTargetAtTime(start ? DUCK_LEVEL : 1, at, DUCK_TC)
}

/** Play a cue now. Returns synchronously; failure resolves to silence. */
export function play(cueId: string, manifest: Manifest = CUE_MANIFEST): void {
  try {
    const cue = manifest[cueId]
    if (!cue) return
    // Captions render even when audio is off or absent. Which cues caption is
    // a manifest fact (voice lines and flagged warnings), not an id-prefix guess.
    if (cue.caption === true || cue.bus === 'voice') {
      setTranscript(cue.transcript)
    }
    const ctx = getAudioContext()
    const bus = busFor(cue.bus)
    if (!ctx || !bus) return
    const at = nowSeconds()

    // Exclusive-on-bus: micro-fade and stop any prior source on this bus.
    if (cue.policy === 'exclusive-on-bus') {
      const prior = activeOnBus.get(cue.bus)
      if (prior) microStop(prior, at)
    }

    const source =
      cue.source.kind === 'synth'
        ? buildSynth(RECIPES[cue.source.recipe], at)
        : (() => {
            const cached = decoded.get(cue.id)
            if (!cached) {
              void decodeFile(cue).catch(() => {})
              return null
            }
            const s = ctx.createBufferSource()
            s.buffer = cached
            return s
          })()
    if (!source) return

    const durationMs = 240
    const gain = envelope(ctx, cue.gain, at, durationMs)
    source.connect(gain)
    gain.connect(bus)

    if (cue.bus === 'voice') duckAmbience(true, at)
    source.onended = (): void => {
      if (cue.bus === 'voice') duckAmbience(false, nowSeconds())
      if (activeOnBus.get(cue.bus)?.source === source) {
        activeOnBus.delete(cue.bus)
      }
      // Release the per-play nodes so they do not accumulate on the graph. A
      // key-tick fires per keystroke; without this, a mission leaks thousands
      // of live GainNodes.
      disconnectNodes(source, gain)
    }
    // Only exclusive-on-bus cues are tracked for eviction and stopBus. Tracking
    // every cue by bus would overwrite the single slot each keystroke and make
    // bookkeeping meaningless for the many concurrent one-shots on the effects bus.
    if (cue.policy === 'exclusive-on-bus') {
      activeOnBus.set(cue.bus, { source, gain })
    }
    source.start(at)
    // Every source gets an explicit stop so oscillators (which run forever
    // otherwise) terminate and fire onended for cleanup. The envelope has long
    // since faded to silence by then.
    try {
      source.stop(at + durationMs / 1000 + 0.05)
    } catch {
      // A source already stopped (exclusive eviction) throws; ignore.
    }
  } catch {
    // Silence, never an exception into gameplay.
  }
}

/** Enqueue a cue with the current generation token; stale ones drop on drain. */
export function enqueue(cueId: string, manifest: Manifest = CUE_MANIFEST): void {
  queue.push({ cueId, token: generation, manifest })
}

export function drainQueue(): void {
  const pending = queue.splice(0, queue.length)
  for (const item of pending) {
    if (item.token !== generation) continue // stale: drop silently
    play(item.cueId, item.manifest)
  }
}

export function stopBus(busName: CueDefinition['bus']): void {
  const entry = activeOnBus.get(busName)
  if (entry) {
    microStop(entry, nowSeconds())
    activeOnBus.delete(busName)
  }
}

export const KNOWN_CUES: readonly CueId[] = Object.keys(CUE_MANIFEST) as CueId[]

/** Test-only. */
export function __resetPlayer(): void {
  decoded.clear()
  decodeInFlight.clear()
  decodeCounts.clear()
  activeOnBus.clear()
  queue.length = 0
  generation = 0
  playingTranscript = null
  captionListeners.clear()
}
