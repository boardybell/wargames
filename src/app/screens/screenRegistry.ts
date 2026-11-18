// Mission screens and titles are registered by mission splits (03 to 06).
// Until one lands, resolveMissionScreen returns the plain fallback frame and
// resolveMissionTitle falls back to the upper-cased id, so this split is fully
// testable against the engine's test-double mission.
import type { ComponentType } from 'react'

export interface MissionScreenProps {
  readonly missionId: string
}

export type MissionScreen = ComponentType<MissionScreenProps>

const missionScreens = new Map<string, MissionScreen>()
const missionTitles = new Map<string, string>()

export function registerMissionScreen(
  missionId: string,
  component: MissionScreen,
): void {
  missionScreens.set(missionId, component)
}

export function hasMissionScreen(missionId: string): boolean {
  return missionScreens.has(missionId)
}

export function resolveMissionScreen(
  missionId: string,
): MissionScreen | null {
  return missionScreens.get(missionId) ?? null
}

export function registerMissionTitle(missionId: string, title: string): void {
  missionTitles.set(missionId, title)
}

export function resolveMissionTitle(missionId: string): string {
  return missionTitles.get(missionId) ?? missionId.toUpperCase()
}

/** Test-only. */
export function __resetScreenRegistry(): void {
  missionScreens.clear()
  missionTitles.clear()
}
