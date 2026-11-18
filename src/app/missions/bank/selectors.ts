// Read-only selectors over the active campaign for the FREEZE BANK ACCOUNTS
// screen, plus the persisted LEDGER/FEED/PAYMENTS view preference. Authored
// truth (account names, request reasons, the prediction series, the floor and
// target) lives in the immutable seed payload; live truth (balances, hold and
// limit flags, confidence, request outcomes) lives in the mission substate.
// These pull both from the running context and state so the views render
// whatever payload is active, never a hardcoded one. NO reason strings, clue
// logic, or settlement logic here: the engine owns all three.
import { useSyncExternalStore } from 'react'
import type { CampaignState, MissionModule } from '@engine'
import { getContext } from '../../state'
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState } from '@engine/missions/bank/types'

const BANK = 'bank'

/** The immutable authored payload for the active bank mission, or undefined
 *  when no bank payload is present on the active seed. Callers guard undefined. */
export function bankPayload(state: CampaignState): BankPayload | undefined {
  const seed = getContext().seeds[state.seedName]
  return seed?.missionPayloads[BANK] as BankPayload | undefined
}

/** The live bank substate, or null before the mission starts. */
export function bankSubstate(state: CampaignState): BankState | null {
  if (state.activeMission?.missionId !== BANK) return null
  return (state.activeMission.substate as BankState) ?? null
}

/** The bank mission module from the context: its validate() is the single
 *  source of truth for whether an action is currently legal. */
export function bankModule(): MissionModule<BankState> {
  return getContext().missions[BANK] as MissionModule<BankState>
}

// ---- Persisted LEDGER/FEED/PAYMENTS view preference --------------------
// The player's explicit view choice persists across reloads and restores on a
// remount. In-memory is the session source of truth (works where localStorage
// is blocked, e.g. a headless test env); localStorage persists across reloads
// and a corrupt read falls to no-preference without throwing. Mirrors the
// flights view-preference store exactly.
export type BankView = 'ledger' | 'feed' | 'payments'

const BANK_VIEWS: readonly BankView[] = ['ledger', 'feed', 'payments']

function isBankView(value: unknown): value is BankView {
  return typeof value === 'string' && BANK_VIEWS.includes(value as BankView)
}

const VIEW_KEY = 'wargames.bank.view'

let viewPref: BankView | null | undefined
const listeners = new Set<() => void>()

function load(): BankView | null {
  if (viewPref !== undefined) return viewPref
  try {
    const raw = window.localStorage.getItem(VIEW_KEY)
    viewPref = isBankView(raw) ? raw : null
  } catch {
    viewPref = null
  }
  return viewPref
}

/** The stored explicit preference, or null when the player has never chosen. */
export function getBankView(): BankView | null {
  return load()
}

/** Store the player's explicit view choice. Persists and notifies. */
export function setBankView(view: BankView): void {
  viewPref = view
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // In-memory still backs the session.
  }
  for (const listener of listeners) listener()
}

export function onBankView(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The stored view preference as a useSyncExternalStore hook, matching the
 *  flights view-preference store. One subscribe + one snapshot getter closes
 *  the tearing/stale-read window a manual useState + useEffect pair leaves open. */
export function useBankView(): BankView | null {
  return useSyncExternalStore(onBankView, getBankView, getBankView)
}

/** Test-only: forget the stored preference. */
export function __resetBankView(): void {
  viewPref = undefined
  try {
    window.localStorage.removeItem(VIEW_KEY)
  } catch {
    // ignore
  }
  listeners.clear()
}
