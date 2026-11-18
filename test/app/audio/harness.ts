import { vi } from 'vitest'
import { setAudioPort, __resetAudio } from '@app/audio'
import type {
  ContextLike,
  ContextState,
  GainLike,
  ParamLike,
  SourceLike,
  WebAudioPort,
} from '@app/audio'

export interface RecordedParam extends ParamLike {
  value: number
  calls: { m: string; args: number[] }[]
}

export function makeParam(): RecordedParam {
  const calls: { m: string; args: number[] }[] = []
  return {
    value: 1,
    calls,
    setValueAtTime(v, t) {
      this.value = v
      calls.push({ m: 'setValueAtTime', args: [v, t] })
    },
    setTargetAtTime(target, t, tc) {
      calls.push({ m: 'setTargetAtTime', args: [target, t, tc] })
    },
    linearRampToValueAtTime(v, t) {
      this.value = v
      calls.push({ m: 'linearRampToValueAtTime', args: [v, t] })
    },
    cancelScheduledValues(t) {
      calls.push({ m: 'cancelScheduledValues', args: [t] })
    },
  }
}

export interface RecordedGain extends GainLike {
  gain: RecordedParam
}

export interface RecordedSource extends SourceLike {
  started: boolean
  stopped: boolean
}

export interface MockContext extends ContextLike {
  gains: RecordedGain[]
  sources: RecordedSource[]
  resumeSpy: ReturnType<typeof vi.fn>
  decodeSpy: ReturnType<typeof vi.fn>
  fire(type: string): void
  setState(state: ContextState): void
}

export function makeMockContext(initial: ContextState = 'suspended'): MockContext {
  const gains: RecordedGain[] = []
  const sources: RecordedSource[] = []
  const listeners: Record<string, () => void> = {}
  const resumeSpy = vi.fn(() => Promise.resolve())
  const decodeSpy = vi.fn(() =>
    Promise.resolve({ length: 1, getChannelData: () => new Float32Array(1) }),
  )
  let state = initial
  const makeGain = (): RecordedGain => {
    const g: RecordedGain = { gain: makeParam(), connect: () => {}, disconnect: () => {} }
    gains.push(g)
    return g
  }
  const makeSource = (): RecordedSource => {
    const s: RecordedSource = {
      onended: null,
      started: false,
      stopped: false,
      connect: () => {},
      disconnect: () => {},
      start: () => {
        s.started = true
      },
      stop: () => {
        s.stopped = true
      },
    }
    sources.push(s)
    return s
  }
  const ctx: MockContext = {
    get state() {
      return state
    },
    currentTime: 0,
    destination: {},
    resume: resumeSpy,
    suspend: () => Promise.resolve(),
    createGain: makeGain,
    createBufferSource: makeSource,
    createOscillator: () =>
      Object.assign(makeSource(), { frequency: makeParam(), type: 'sine' }),
    createBuffer: (_c, length) => ({
      length,
      getChannelData: () => new Float32Array(length),
    }),
    decodeAudioData: decodeSpy as unknown as ContextLike['decodeAudioData'],
    addEventListener: (type, cb) => {
      listeners[type] = cb
    },
    removeEventListener: (type) => {
      delete listeners[type]
    },
    gains,
    sources,
    resumeSpy,
    decodeSpy,
    fire: (type) => listeners[type]?.(),
    setState: (s) => {
      state = s
    },
  }
  return ctx
}

export function installMockAudio(
  initial: ContextState = 'suspended',
): { ctx: MockContext; port: WebAudioPort } {
  const ctx = makeMockContext(initial)
  const port: WebAudioPort = {
    create: () => ctx,
    now: (c) => c.currentTime,
  }
  setAudioPort(port)
  return { ctx, port }
}

export function resetAudio(): void {
  __resetAudio()
}
