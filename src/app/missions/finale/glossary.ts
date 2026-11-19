// The four local GLOBAL FAILSAFE finale glossary terms. The provenance terms
// (OBSERVED, EXERCISE, DERIVED, independent corroboration) and the three commit
// terms (REPEAT D-83, HOLD AND VERIFY, STAGED RECOVERY) are GLOBAL (registered
// by the shell from split 02) and must not be re-registered here. Definitions
// are plain language for a smart layperson; rendered labels are uppercase
// terminal diction with no em-dashes. Registration is idempotent so a screen
// remount never trips the duplicate-id guard.
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
  type GlossaryEntry,
} from '../../a11y/glossary'

export const FINALE_LOCAL_GLOSSARY_IDS = [
  'finale-case',
  'finale-root-source',
  'finale-projection',
  'finale-viability-threshold',
] as const

const ENTRIES: readonly GlossaryEntry[] = [
  {
    id: 'finale-case',
    term: 'CASE',
    definition:
      'The five pieces of evidence, arranged, that together prove the drill order caused the whole crisis. Three subsystem records in the true order events happened, the root the chain traces back to, and one independent observation that corroborates the claim.',
  },
  {
    id: 'finale-root-source',
    term: 'ROOT SOURCE',
    definition:
      'The record every other record ultimately descends from, the trunk of the tree rather than a branch. Anchoring the case to the true root is what shows the whole chain started from the exercise export and not somewhere downstream.',
  },
  {
    id: 'finale-projection',
    term: 'PROJECTION',
    definition:
      'A forecast of where each service figure lands if you pick this order, computed from the settled outcomes you already earned. It is a prediction, not a measured result, which is why every projected number is labelled.',
  },
  {
    id: 'finale-viability-threshold',
    term: 'VIABILITY THRESHOLD',
    definition:
      'A limit the earned outcomes must stay under for a staged recovery to be possible at all. Each threshold is checked separately; if any one fails, recovery cannot be staged and the order is disabled.',
  },
]

/** Register the four local terms, once. Idempotent across remounts: already
 *  present ids are skipped so the duplicate-id guard never throws. */
export function registerFinaleGlossary(): void {
  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
  if (fresh.length > 0) registerGlossaryTerms(fresh)
}
