# Prerequisites carried into split 06 (global-failsafe / finale)

Recorded while closing split 04. The finale's campaign scoring depends on two
cross-mission metrics that each mission module must stamp in its evaluate()
outcome.metrics, read by src/engine/campaign/selectors.ts and gated by
VIABILITY_THRESHOLDS in src/engine/branch/types.ts:

- `wopr_resolved` — forced-inactivity count WOPR counts as resolved (held /
  grounded flights, frozen accounts, quarantined records). Drives
  selectOpenExceptions DOWN (the on-screen deception: defensive play looks good
  to WOPR). Real-scale integer.
- `service_cost` — real damage the same orders produced. Drives
  selectServiceOutcomes UP. Real-scale integer.

Status at split 04 close:
- flights (split 04): STAMPS BOTH (added in the section-04 fix). wopr_resolved =
  held flight count; service_cost = flights that denied service.
- outlook (mission 1, split 03): DOES NOT STAMP EITHER. Must be retrofitted.
- bank (mission 3, split 05): DOES NOT STAMP EITHER as of section 01. Fold the
  stamping into a bank section (freeze count -> wopr_resolved; unpaid critical
  payments / collapse -> service_cost) before the finale.

Split 06 tasks:
1. Retrofit outlook + bank evaluate() to stamp wopr_resolved + service_cost on
   the same real-scale convention as flights.
2. Recalibrate VIABILITY_THRESHOLDS (currently wopr_resolved max 2,
   service_cost max 20 — placeholders set before any mission stamped the keys)
   against the real stamped magnitudes across all three missions, so that a
   clean campaign stays finale-viable and defensive over-play (mass holds /
   blanket grounding / blanket freezes) tips the campaign over threshold and
   loses the real tier. This is the game's thesis made mechanical.
3. Add a campaign-level test proving the divergence end to end across all three
   missions: a defensive-everywhere playthrough keeps WOPR's OPEN EXCEPTIONS
   low while SERVICE COST and viability fail, and a clean playthrough is the
   inverse.
