// SECTION-02 SEAM. The real endingId derivation and the earned-why readback
// over settled metrics belong to section-02-projections-endings; this file is
// the minimal, inert stub section 01 composes so its own settlement tests can
// assert cause mapping without any ending content. Section 02 overwrites this
// module with the real derivation (amendment 11). Keep it typed and total; do
// not grow it here.
import type { CommitChoice } from './types'

export type EndingId = 'recovery' | 'containment' | 'failure'

/** The committed action and settlement cause this section provides; section
 *  02 derives the real endingId and the earned-why readback from settled
 *  metrics. This inert map only pins the shape so evaluate() can attach a
 *  value and the settlement tests can run: staged -> recovery, hold ->
 *  containment, every collapsed path (repeat, timeout, forfeit) -> failure. */
export function deriveEndingId(committed: CommitChoice | null): EndingId {
  if (committed === 'staged') return 'recovery'
  if (committed === 'hold') return 'containment'
  return 'failure'
}
