// The five local FREEZE BANK ACCOUNTS glossary terms. The provenance terms
// (OBSERVED, EXERCISE, DERIVED, run ancestry) are GLOBAL (registered by the
// shell from split 02) and must not be re-registered here. Definitions are
// plain language for a smart layperson; rendered labels are uppercase terminal
// diction with no em-dashes. Registration is idempotent so a screen remount
// never trips the duplicate-id guard.
import {
  hasGlossaryEntry,
  registerGlossaryTerms,
  type GlossaryEntry,
} from '../../a11y/glossary'

export const BANK_LOCAL_GLOSSARY_IDS = [
  'bank-liquidity',
  'bank-depositor-confidence',
  'bank-critical-payment',
  'bank-limited-release',
  'bank-cash-floor',
] as const

const ENTRIES: readonly GlossaryEntry[] = [
  {
    id: 'bank-liquidity',
    term: 'LIQUIDITY',
    definition:
      'The cash the bank can actually hand out right now. A held account adds nothing to it; a limited account adds only what is left of its allowance. It is never a stored number, always the sum of what the open accounts can still give up.',
  },
  {
    id: 'bank-depositor-confidence',
    term: 'DEPOSITOR CONFIDENCE',
    definition:
      'How much the depositors trust the bank, scored 0 to 100. Holding accounts and running cash below the floor erode it; clearing critical payments restores it. If it reaches zero the bank collapses.',
  },
  {
    id: 'bank-critical-payment',
    term: 'CRITICAL PAYMENT',
    definition:
      'A payment the bank owes from a specific account by a deadline, such as payroll or a municipal remittance. It cannot clear while that account is held, which is the whole tension: release or limit the account to pay.',
  },
  {
    id: 'bank-limited-release',
    term: 'LIMITED RELEASE',
    definition:
      'A cap on how much an account can pay out, instead of a full freeze. The account keeps giving up cash up to the cap, so a limited account can still fund a payment that fits inside its remaining allowance.',
  },
  {
    id: 'bank-cash-floor',
    term: 'CASH FLOOR',
    definition:
      'The level of available cash the bank is expected to hold. Falling below it costs confidence every tick and loses one of the three signals the real outcome is scored on.',
  },
]

/** Register the five local terms, once. Idempotent across remounts: already
 *  present ids are skipped so the duplicate-id guard never throws. */
export function registerBankGlossary(): void {
  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
  if (fresh.length > 0) registerGlossaryTerms(fresh)
}
