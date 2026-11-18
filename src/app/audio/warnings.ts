// Timer warnings. The only trigger is a relayed timerMilestone engine event;
// nothing here reads Date.now, performance.now, or the repaint ticker. The
// relay delivers each materialized event exactly once, so exactly-once is
// structural, but a per-id guard still blocks a defensive double-delivery.
// The guard clears on a mission boundary (clearWarningGuard) so the same
// milestone id fires again next mission.
import { onEngineEvent } from '../state/events'
import { play } from './player'
import type { EngineEvent } from '@engine'

const MILESTONE_CUE: Readonly<Record<string, string>> = {
  'warn-30': 'warn-30',
  'warn-10': 'warn-10',
}

const fired = new Set<string>()

export function registerWarnings(): () => void {
  return onEngineEvent((event: EngineEvent) => {
    // A phase change is a mission boundary: clear the per-id guard so the next
    // mission's warn-30/warn-10 (the engine reuses those literal ids) fire
    // again instead of being suppressed for the life of the page.
    if (event.type === 'phaseChanged') {
      fired.clear()
      return
    }
    if (event.type !== 'timerMilestone') return
    const cueId = MILESTONE_CUE[event.id]
    if (!cueId || fired.has(event.id)) return
    fired.add(event.id)
    play(cueId)
  })
}

/** Clear the per-id guard at a mission boundary so a recurring milestone id
 *  warns again. */
export function clearWarningGuard(): void {
  fired.clear()
}

/** Test-only. */
export function __resetWarnings(): void {
  fired.clear()
}
