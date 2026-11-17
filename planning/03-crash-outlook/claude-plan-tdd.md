# TDD Plan: 03-crash-outlook

Companion to claude-plan.md (revision 2); same section numbering. Engine
tests in the node Vitest project, screen tests in the app jsdom project with
the real engine and the outlook module. Stubs say what to test, not how.

## 3. Mission state and types

- Content validator (parameterized over all three seeds): exactly one
  non-superseded message with non-null correctRecipient per requiredKind;
  duplicates superseded; audit record id carries the R04 export reference;
  bulletin TRACE reaches C17 (or seed equivalents); supersession chains
  resolve acyclically; all tuning integers; twelve messages.
- Solvability invariants per seed: adversarial send-everything fixture ends
  below tier 3; walkthrough log reaches tier 3 with at least one spare
  backup slot.
- Substate saveSchema round-trip; substate contains ids and marks only
  (schema rejects embedded bodies).

## 4. Rules

- SEND: spends backup capacity; primary unlimited count while not dark;
  dark primary rejects with reason; ETA from current stage at dispatch.
- QUEUE: free; dispatch-time evaluation; dispatch to dark primary rejects
  at zero cost and item stays queued.
- READ/FLAG toggles; READ of the audit message makes clues() report the
  D-83 clue id (engine merges and emits clueFound exactly once).
- Acknowledgment: scheduled at send time plus stage ETA; ack before endsAt
  marks delivered; buzzer boundary fixture: third ack scheduledAt == endsAt
  settles as completed, not timeout.
- Wrong version or recipient spends capacity, logs, does not satisfy the
  item; superseded message never satisfies.
- Stage changes flip primaryStage in authored order and surface
  scheduledEventFired events; extended time scales the three stage offsets
  proportionally and the walkthrough still reaches tier 3 at eight minutes.
- evaluate per cause: tier = correct acknowledged required deliveries;
  completed fires early on the third ack; consequence commsDelayed by the
  authored tier table.
- Debrief payload reports the three deliveries individually plus decoy
  capacity spent and clue status.

## 5. Screen

- Four views reachable: INBOX, OUTBOX, LOG commands plus desktop tabs and
  mobile back affordances; router state asserts single-pane on narrow.
- Command-button identity for READ, FLAG, QUEUE, SEND, TRACE, CHECK SOURCE
  (parsed action strict-equals button action).
- TRACE dispatches INSPECT_RECORD; CHECK SOURCE dispatches
  REQUEST_SOURCE_CHECK; results render from sourceCheckResolved events;
  CONTRADICTED on the bulletin and CONFIRMED on the correction render
  distinctly.
- Invalid sends render disabled with inline reason (backup exhausted, dark
  primary).
- StatusLine shows stage, backup remaining, next ETA from selectors only.
- Stage-change announcement through the polite region; 30 and 10 second
  warnings from engine milestones only (no local timers).
- Glossary: global terms open on OBSERVED/EXERCISE/DERIVED; local terms
  registered without collision.
- Mobile keyboard-only pass through one full delivery flow.

## 6. Content

- Fixture message copy spot checks: payroll approval chain names the right
  desk; weather correction cites the field record; bulletin repeats the
  claim with EXERCISE provenance; misleading hints present on stale
  duplicates (authoring assertions, not prose review).

## 7. Testing strategy

- Mission-local property test: arbitrary valid action sequences never
  create negative capacity, never deliver a superseded message, never
  settle twice (fast-check over the module with the engine lifecycle).
- Walkthrough, adversarial, timeout, and forfeit fixtures per seed run in
  CI.
