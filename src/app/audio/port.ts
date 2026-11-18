// A thin Web Audio seam. jsdom has no Web Audio, so production code consumes
// this port and tests replace it with a recording mock. It is a seam, not an
// abstraction layer: the shapes mirror the real API closely.

export interface ParamLike {
  value: number
  setValueAtTime(value: number, when: number): void
  setTargetAtTime(target: number, when: number, timeConstant: number): void
  linearRampToValueAtTime(value: number, when: number): void
  cancelScheduledValues(when: number): void
}

export interface GainLike {
  readonly gain: ParamLike
  connect(destination: unknown): void
  disconnect(): void
}

export interface SourceLike {
  connect(destination: unknown): void
  disconnect(): void
  start(when?: number): void
  stop(when?: number): void
  onended: (() => void) | null
  buffer?: unknown
}

export interface OscillatorLike extends SourceLike {
  readonly frequency: ParamLike
  type: string
}

export interface BufferLike {
  readonly length: number
  getChannelData(channel: number): Float32Array
}

export type ContextState =
  | 'suspended'
  | 'running'
  | 'closed'
  | 'interrupted'

export interface ContextLike {
  readonly state: ContextState
  readonly currentTime: number
  readonly destination: unknown
  resume(): Promise<void>
  suspend(): Promise<void>
  createGain(): GainLike
  createBufferSource(): SourceLike
  createOscillator(): OscillatorLike
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

export interface WebAudioPort {
  /** Create a context, or null where Web Audio is unavailable. */
  create(): ContextLike | null
  /** The port's notion of "now" in seconds, for scheduling. */
  now(context: ContextLike): number
}

// The real-browser port. Returns null when the constructor is missing.
export const browserAudioPort: WebAudioPort = {
  create() {
    if (typeof window === 'undefined') return null
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return null
    try {
      return new Ctor() as unknown as ContextLike
    } catch {
      return null
    }
  },
  now(context) {
    return context.currentTime
  },
}
