// Read-only selectors over the active campaign for the GROUND ALL FLIGHTS
// screen, plus the persisted grid/list view preference. Authored truth (hub
// names, passenger counts, the projection, corridor labels) lives in the
// immutable seed payload; live status lives in the mission substate. These pull
// both from the running context and state so the views render whatever payload
// is active, never a hardcoded one.
import { useSyncExternalStore } from 'react'
import type { CampaignState } from '@engine'
import type { MissionModule } from '@engine'
import { getContext } from '../../state'
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'

const FLIGHTS = 'flights'

/** The immutable authored payload for the active flights mission, or undefined
 *  when no flights payload is present on the active seed. Callers guard the
 *  undefined case. */
export function flightsPayload(state: CampaignState): FlightsPayload | undefined {
  const seed = getContext().seeds[state.seedName]
  return seed?.missionPayloads[FLIGHTS] as FlightsPayload | undefined
}

/** The live flights substate, or null before the mission starts. */
export function flightsSubstate(state: CampaignState): FlightsState | null {
  if (state.activeMission?.missionId !== FLIGHTS) return null
  return (state.activeMission.substate as FlightsState) ?? null
}

/** The flights mission module from the context: its validate() is the single
 *  source of truth for whether an action is currently legal. */
export function flightsModule(): MissionModule<FlightsState> {
  return getContext().missions[FLIGHTS] as MissionModule<FlightsState>
}

// ---- Persisted grid/list view preference -------------------------------
// The user's explicit grid/list choice persists across reloads and wins over
// the viewport-derived default thereafter. In-memory is the session source of
// truth (works where localStorage is blocked, e.g. a headless test env);
// localStorage persists across reloads and a corrupt read falls to no-preference
// without throwing. Mirrors the audio-prefs persistence pattern.
export type FlightsView = 'grid' | 'list'

const VIEW_KEY = 'wargames.flights.view'

let viewPref: FlightsView | null | undefined
const listeners = new Set<() => void>()

function load(): FlightsView | null {
  if (viewPref !== undefined) return viewPref
  try {
    const raw = window.localStorage.getItem(VIEW_KEY)
    viewPref = raw === 'grid' || raw === 'list' ? raw : null
  } catch {
    viewPref = null
  }
  return viewPref
}

/** The stored explicit preference, or null when the user has never chosen. */
export function getViewPreference(): FlightsView | null {
  return load()
}

/** Store the user's explicit grid/list choice. Persists and notifies. */
export function setViewPreference(view: FlightsView): void {
  viewPref = view
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // In-memory still backs the session.
  }
  for (const listener of listeners) listener()
}

export function onViewPreference(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The stored grid/list preference as a useSyncExternalStore hook, matching the
 *  audio-prefs store pattern. One subscribe + one snapshot getter closes the
 *  tearing/stale-read window a manual useState + useEffect pair leaves open. */
export function useViewPreference(): FlightsView | null {
  return useSyncExternalStore(
    onViewPreference,
    getViewPreference,
    getViewPreference,
  )
}

/** Test-only: forget the stored preference. */
export function __resetFlightsView(): void {
  viewPref = undefined
  try {
    window.localStorage.removeItem(VIEW_KEY)
  } catch {
    // ignore
  }
  listeners.clear()
}
