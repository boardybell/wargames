# Integration Notes: Opus review of 05-freeze-bank-accounts plan

All findings integrated; plan rewritten as revision 2. Two engine
amendments resulted (block 17 on the split 01 plan, amendment 3 on its
section files), shared with the flights mission:

- terminal(state): 'completed' | 'collapsed' | null polled after every
  reduce and drain; SettlementCause gains 'collapsed'. The bank's hard run
  (confidence 0 or negative cash) settles as collapsed; tier stays the
  success measure; cause drives ending cues and debrief framing.
- SeedDefinition.clueRecords: engine-owned inspection-gated clues. The
  bank's D-83 clue fires when the player inspects the hold-justification
  record (B04 equivalent) via TRACE's INSPECT_RECORD dispatch. b04Traced
  and the module-observes-INSPECT_RECORD claim are deleted; the module
  defines no clues().

Plan decisions from the remaining findings:

3. Before/after-hold: the marker means after the FIRST broad hold ever.
   Deterministic by construction: requests arrive only via scheduled
   events, which drain before any action reduces in the same dispatch, so
   a request sharing a timestamp with the broad-hold action is
   arrivedBeforeHold; boundary test added. The debrief cross-tabulates
   injected vs genuine after-hold requests so the circular logic can be
   challenged with numbers.
4. Injection sizing: final injected size = authored base + engine-capped
   inbound flightsDisrupted magnitude; no second cap; never below base.
   Validator invariant: the surge fixture is solvable at base and at
   base-plus-maximum-magnitude (mission order is player-chosen). Both
   variants run in CI.
5. Prediction line: a pure selector over current state (recomputed on
   every render, including HOLD and RELEASE); validator asserts the
   authored series exceeds the base observed stream during hold windows
   and tracks at or below it before any hold.
6. Reference-only substate: authored reason strings and account
   names/flavors move to the seed payload; computed reasons are typed
   reason codes rendered through a selector; substate stores codes, flags,
   balances, and markers only. Byte budget respected.
7. Semantics pinned: critical payments draw from their specific account
   and are blocked while that account is held (the teaching tension:
   release or limit to pay); LIMIT is a cumulative outflow cap for the
   account while limited; cash is a derived selector (sum of available
   unheld balances) and is not stored; the floor compares derived cash.
   Threshold re-crossing in both directions tested: one injection per
   threshold ever, and the recovery path (releases, cleared payments)
   remains reachable after a crossing.
