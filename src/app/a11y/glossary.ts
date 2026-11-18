// The project glossary: one module, plain-language definitions for a smart
// layperson. Missions register their channel and ledger jargon through
// registerGlossaryTerms at screen-registration time. Pure data plus
// registration; the open/close presentation lives in GlossaryTerm.
export interface GlossaryEntry {
  readonly id: string
  readonly term: string
  readonly definition: string
}

const INITIAL_ENTRIES: readonly GlossaryEntry[] = [
  {
    id: 'open-exceptions',
    term: 'OPEN EXCEPTIONS',
    definition:
      'The count of reported problems nobody has resolved yet. A rising number is WOPR treating inaction as if it were an outcome.',
  },
  {
    id: 'trace',
    term: 'TRACE',
    definition:
      'A step-by-step replay of how a result was reached, so you can see the reasoning rather than just the verdict.',
  },
  {
    id: 'check-source',
    term: 'CHECK SOURCE',
    definition:
      'Verifying where a claim came from before acting on it, instead of trusting the number on the screen.',
  },
  {
    id: 'observed',
    term: 'OBSERVED',
    definition:
      'A fact confirmed by direct evidence, as opposed to one the machine inferred or assumed.',
  },
  {
    id: 'exercise',
    term: 'EXERCISE',
    definition:
      'A simulation run, not a real operation. The whole point of the film: knowing which one you are in.',
  },
  {
    id: 'derived',
    term: 'DERIVED',
    definition:
      'A value the system calculated from other numbers rather than measured directly. Useful, but only as sound as its inputs.',
  },
  {
    id: 'independent-corroboration',
    term: 'independent corroboration',
    definition:
      'A second, unrelated source agreeing with the first. Two feeds that share a cause are not independent.',
  },
  {
    id: 'repeat-d-83',
    term: 'REPEAT D-83',
    definition:
      'A command to re-run drill sequence D-83. In the story, the drill that will not stay a drill.',
  },
  {
    id: 'hold-and-verify',
    term: 'HOLD AND VERIFY',
    definition:
      'Pause before committing to an action and confirm the facts first. The discipline the game rewards.',
  },
  {
    id: 'staged-recovery',
    term: 'STAGED RECOVERY',
    definition:
      'Bringing a failed position back in planned steps, each checked for viability before the next, rather than all at once.',
  },
]

const registry = new Map<string, GlossaryEntry>()

function seed(): void {
  registry.clear()
  for (const entry of INITIAL_ENTRIES) registry.set(entry.id, entry)
}

seed()

export function hasGlossaryEntry(id: string): boolean {
  return registry.has(id)
}

export function getGlossaryEntry(id: string): GlossaryEntry {
  const entry = registry.get(id)
  if (!entry) {
    throw new Error(`glossary: no entry registered for id "${id}"`)
  }
  return entry
}

export function allGlossaryEntries(): readonly GlossaryEntry[] {
  return [...registry.values()]
}

/** Add mission terms. A colliding id is a programming error: it throws in dev
 *  and, in production, logs and skips the duplicate rather than crashing a
 *  mission registration. */
export function registerGlossaryTerms(entries: readonly GlossaryEntry[]): void {
  for (const entry of entries) {
    if (registry.has(entry.id)) {
      if (import.meta.env.DEV) {
        throw new Error(`glossary: duplicate term id "${entry.id}"`)
      }
      console.error(`glossary: duplicate term id "${entry.id}" ignored`)
      continue
    }
    registry.set(entry.id, entry)
  }
}

/** Test-only: restore the registry to the shipped entries. */
export function __resetGlossary(): void {
  seed()
}
