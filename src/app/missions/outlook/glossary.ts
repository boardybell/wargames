// The five local CRASH OUTLOOK glossary terms. OBSERVED, EXERCISE, and
// DERIVED are GLOBAL (registered by the shell) and must not be re-registered
// here. Definitions are plain language for a smart layperson; rendered labels
// are uppercase terminal diction with no em-dashes. Registration is idempotent
// so a screen remount never trips the duplicate-id guard.
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
  type GlossaryEntry,
} from '../../a11y/glossary'

export const OUTLOOK_LOCAL_GLOSSARY_IDS = [
  'outlook-channel',
  'outlook-capacity',
  'outlook-eta',
  'outlook-delivery-receipt',
  'outlook-exercise-bulletin',
] as const

const ENTRIES: readonly GlossaryEntry[] = [
  {
    id: 'outlook-channel',
    term: 'CHANNEL',
    definition:
      'The line a message travels on. The primary line is fast but goes dark under load. The backup line stays up but holds only a handful of sends.',
  },
  {
    id: 'outlook-capacity',
    term: 'CAPACITY',
    definition:
      'How many sends a channel can still carry. The backup line has a hard limit; once it is spent, nothing more goes out on it.',
  },
  {
    id: 'outlook-eta',
    term: 'ETA',
    definition:
      'Estimated time of arrival: how long until a dispatched message is acknowledged on the far end. It rises as the primary line degrades.',
  },
  {
    id: 'outlook-delivery-receipt',
    term: 'DELIVERY RECEIPT',
    definition:
      'The far end confirming it received a message. Until the receipt lands, a send is only in flight, not delivered.',
  },
  {
    id: 'outlook-exercise-bulletin',
    term: 'EXERCISE BULLETIN',
    definition:
      'A notice generated inside a drill, not a real event. It can read like the real thing, which is the whole trap of the exercise.',
  },
]

/** Register the five local terms, once. Idempotent across remounts: already
 *  present ids are skipped so the duplicate-id guard never throws. */
export function registerOutlookGlossary(): void {
  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
  if (fresh.length > 0) registerGlossaryTerms(fresh)
}
