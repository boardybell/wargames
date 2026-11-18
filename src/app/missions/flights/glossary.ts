// The six local GROUND ALL FLIGHTS glossary terms. OBSERVED, EXERCISE, and
// DERIVED are GLOBAL (registered by the shell) and must not be re-registered
// here. Definitions are plain language for a smart layperson; rendered labels
// are uppercase terminal diction with no em-dashes. Registration is idempotent
// so a screen remount never trips the duplicate-id guard.
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
  type GlossaryEntry,
} from '../../a11y/glossary'

export const FLIGHTS_LOCAL_GLOSSARY_IDS = [
  'flights-corridor',
  'flights-runway-slot',
  'flights-arrival-queue',
  'flights-projection',
  'flights-field-report',
  'flights-all-hubs-restriction',
] as const

const ENTRIES: readonly GlossaryEntry[] = [
  {
    id: 'flights-corridor',
    term: 'CORRIDOR',
    definition:
      'A protected air lane between two hubs. A flight can only use the corridor that joins its position to the hub it is heading for; if the storm closes that lane, the flight cannot take it.',
  },
  {
    id: 'flights-runway-slot',
    term: 'RUNWAY SLOT',
    definition:
      'One landing space at a hub. A hub has a fixed number; once they are all taken, no more flights can land there until one clears.',
  },
  {
    id: 'flights-arrival-queue',
    term: 'ARRIVAL QUEUE',
    definition:
      'The line of flights waiting to land at a hub. Diverting into a busy hub adds queue delay, so the flight arrives later than a direct landing would.',
  },
  {
    id: 'flights-projection',
    term: 'PROJECTION',
    definition:
      'The forecast of where the storm is expected to go, drawn hatched on the map. It is a prediction, not the current truth, and a mid-mission correction can replace it.',
  },
  {
    id: 'flights-field-report',
    term: 'FIELD REPORT',
    definition:
      'A ground observation of actual conditions on a corridor. A PROBE asks the desk to verify one, and the answer comes back as OBSERVED or disputed.',
  },
  {
    id: 'flights-all-hubs-restriction',
    term: 'ALL-HUBS RESTRICTION',
    definition:
      'A blanket order marking every hub restricted at once. On the map it reads as a single distinct marker, separate from any one storm closure.',
  },
]

/** Register the six local terms, once. Idempotent across remounts: already
 *  present ids are skipped so the duplicate-id guard never throws. */
export function registerFlightsGlossary(): void {
  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
  if (fresh.length > 0) registerGlossaryTerms(fresh)
}
