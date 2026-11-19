# Reviews: critique rounds per asset

Each art slot and voice clip runs a bounded critique loop (Stage C). This file
records every round: the asset names reviewed, the round number (capped at
three per loop), the findings, and the final disposition. The link check in
`test/media/reviews.test.ts` reads this file and verifies that every asset name
mentioned in a round record exists on disk, that no loop exceeds three rounds,
and that any loop locked with known findings carries a non-empty findings list.

Seeded empty: sections 02 and 03 append round records as assets land.

## Rounds

(No review rounds recorded yet.)
