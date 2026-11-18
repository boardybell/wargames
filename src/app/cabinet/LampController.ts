// Maps engine events to lamp-bank states. Pure mapping, no timers, no wall
// clock: the only input is the section-02 emitted relay, which delivers each
// EngineEvent exactly once in order, so exactly-once bank changes are
// structural. Every event kind not listed below is ignored and leaves bank
// state untouched. The red alarm keys exclusively to finaleFinalPhase.
import { onEngineEvent } from '../state/events'
import type { CampaignPhase, EngineEvent, OutcomeTier } from '@engine'

export type PhaseLamp = CampaignPhase | 'idle'
export type SettlementLamp = 'good' | 'bad' | null

export interface LampBanksState {
  readonly phase: PhaseLamp
  readonly settlement: SettlementLamp
  readonly branchComplete: boolean
  readonly alarm: boolean
}

export const INITIAL_LAMP_STATE: LampBanksState = {
  phase: 'idle',
  settlement: null,
  branchComplete: false,
  alarm: false,
}

// A failed or poor outcome lights the bad lamp; a full or partial one the good
// lamp. The bad settlement never touches the alarm; only the finale does.
function settlementLampFor(tier: OutcomeTier): SettlementLamp {
  return tier === 'failed' || tier === 'poor' ? 'bad' : 'good'
}

export class LampController {
  private state: LampBanksState = INITIAL_LAMP_STATE
  private readonly listeners = new Set<() => void>()
  private unsubscribe: (() => void) | null = null

  getState = (): LampBanksState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Subscribe to the engine relay. Returns a teardown that also disposes.
   *  Disposes any prior subscription first so a double register (React 18
   *  StrictMode double-invoke, or a re-mount) never double-applies events. */
  register(): () => void {
    this.dispose()
    this.unsubscribe = onEngineEvent((event) => this.apply(event))
    return () => this.dispose()
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private set(next: LampBanksState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  private apply(event: EngineEvent): void {
    switch (event.type) {
      case 'phaseChanged':
        this.set({ ...this.state, phase: event.to })
        break
      case 'settlement':
        this.set({ ...this.state, settlement: settlementLampFor(event.tier) })
        break
      case 'branchRunCompleted':
        this.set({ ...this.state, branchComplete: true })
        break
      case 'finaleFinalPhase':
        this.set({ ...this.state, alarm: true })
        break
      default:
        // Every other event kind leaves bank state untouched.
        break
    }
  }
}
