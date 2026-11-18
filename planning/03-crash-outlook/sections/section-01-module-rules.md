# Section 01: Module and Rules (engine side)

## Mission context

CRASH OUTLOOK is mission 1 of the SHALL WE PLAY A GAME? React/Vite static site: an inbox triage puzzle under a real-time deadline. The player receives twelve messages, must identify the three that genuinely require delivery (one each of kind weather, payroll, audit), route each to its correct recipient desk over degrading communication channels, and get delivery acknowledgments back before the mission clock runs out. Decoys and superseded duplicates waste scarce channel capacity. Reading the audit message surfaces a campaign clue (the D-83 clue, tied to run R04 and an export feed reference) that persists even if the mission fails.

This section builds the complete engine-side mission module in `src/engine/missions/outlook/`. It has no dependencies on other sections of this split. Sections 02 (seed content), 03 (screens), and 04 (fixtures and polish) all depend on it.

## Prerequisites (already implemented, splits 01 and 02)

The headless deterministic engine (`src/engine/`) exists and provides:

- `MissionModule` interface: pure implementations of `init`, `schedule`, `validate`, `reduce`, `evaluate`, `debrief`, `saveSchema`. Modules receive seed payloads and folded consequences, never touch wall clock or RNG directly.
- `dispatch` returns `{ state, emitted: EngineEvent[] }`.
- Timer milestones are seed-authored scheduled events; the module asks the engine to schedule events (for example delivery acknowledgments) rather than scheduling them itself.
- All simulated quantities are integers. No floats anywhere in mission state or tuning.
- The clueFound engine amendment: `MissionModule` has an optional `clues(state): ClueId[]` method. After every `reduce`, the engine merges newly reported ids into the campaign-level `cluesFound` set monotonically and emits `clueFound` events. A clue found during a failed mission survives.
- `CHECK SOURCE` is engine-owned: the action is `REQUEST_SOURCE_CHECK` on the campaign queue, authored outcomes live in the shared `SeedDefinition.deskChecks` table keyed by record id, and replies arrive as `sourceCheckResolved` emitted events (with `arrivedAfterSettlement` supported). This module does NOT implement desk-check logic and draws no randomness; it only needs its record ids to line up with that table (section 02 authors them).
- `INSPECT_RECORD` is a campaign action that marks records inspected for the finale case file. The TRACE flow (shell side, section 03) dispatches it; nothing in this module implements TRACE.
- Valibot is the schema library for `saveSchema`.
- Authored mission content arrives as `SeedDefinition.missionPayloads.outlook`. This section defines the payload TYPE and consumes a fixture payload in tests; the three real seed payloads are section 02's job.

## Files to create

    src/engine/missions/outlook/
      types.ts     message, channel, queue, send-record, mission-state types
                   plus the valibot saveSchema for the substate
      content.ts   the payload type seeds must satisfy (content validator
                   functions are section 02; the TYPE lives here so the
                   module compiles standalone)
      rules.ts     pure channel math, delivery evaluation, tiering
      module.ts    the MissionModule implementation and registration

    test/engine/missions/outlook/
      rules.test.ts       channel math, acknowledgment, supersession, tiering
      module.test.ts      lifecycle through the real engine with a fixture
                          payload defined in-test (minimal, not the authored
                          seed content)
      saveSchema.test.ts  substate round-trip and reference-only enforcement

Register the module with the engine's mission registry under mission id `outlook` wherever splits 01/02 established mission registration (follow the existing pattern from any already-registered mission; if this is the first, the registry call lives in the engine's mission index).

## Tests first

Write these before the implementation. Engine tests run in the node Vitest project (`npm test`). Stubs describe what to assert; fill in minimal fixture payloads inline.

### saveSchema.test.ts (TDD block 3, schema parts only)

- Substate saveSchema round-trip: serialize a populated `OutlookState`, parse it back through the valibot schema, deep-equal.
- Reference-only enforcement: the schema REJECTS a substate that embeds message bodies or any authored copy. Substate carries ids, marks, send records, counters only. (Byte-budget discipline: authored message bodies live exclusively in the immutable seed payload.)

The content validator and solvability invariant tests from TDD block 3 belong to section 02, not here.

### rules.test.ts (TDD block 4)

- SEND on backup spends one of five capacity; SEND on primary spends no capacity and has unlimited send count while primaryStage is 0 or 1; SEND on dark primary (stage 2) rejects with a reason and costs nothing.
- ETA is taken from the authored tuning at the CURRENT stage at dispatch time: primary stage 0 ETA, primary stage 1 (slowed) ETA, backup ETA.
- QUEUE is free: stores `(messageId, channel)` only, spends nothing. Dispatching from the queue is a SEND evaluated at dispatch time against current stage and capacity. Dispatching a queued item to a dark primary rejects with the reason, costs nothing, and the item STAYS queued. Queueing is always safe.
- READ and FLAG toggle per-message marks.
- READ of the audit message sets the audit-read flag in substate; `clues()` then reports the D-83 clue id. Assert (through the engine lifecycle) that the engine emits `clueFound` exactly once even if the message is read twice.
- Acknowledgment timing: a SEND asks the engine to schedule an acknowledgment event at send time plus the stage ETA. An acknowledgment event arriving before `endsAt` marks the send acknowledged/delivered.
- Buzzer tie-break: acknowledgment events with `scheduledAt <= endsAt` drain before the timeout settlement guard in the same `advanceToNow`. Fixture: third required ack with `scheduledAt == endsAt` settles the mission as `completed`, not `timeout`. (Section 04 extends this into a named boundary fixture; land the core assertion here.)
- Wrong version or wrong recipient: still spends capacity, still logs a send record, does NOT satisfy the required delivery. A superseded message never satisfies its requiredKind no matter the recipient.
- Stage changes: seed-authored scheduled events flip `primaryStage` in authored order (0 to 1 to 2) and surface through emitted `scheduledEventFired` events carrying the warning line and the falling-tone cue id. Dark primary is a stage, not an end state: backup remains usable to the deadline.
- `evaluate(state, cause)` per cause (completed, timeout, forfeit): tier equals the count of correct acknowledged required deliveries. 3 is full (tier 3), 2 partial, 1 poor, 0 failed. Early completion fires when the third correct ack lands. Timeout and forfeit evaluate by the same count. Consequence `commsDelayed` magnitude comes from an authored tier table in the payload tuning.
- Debrief payload: reports each of the three required deliveries individually (delivered or not, correct or not), capacity spent on decoys, and clue-found status.

### module.test.ts (TDD block 4, lifecycle)

Drive the real engine with a minimal in-test fixture payload (a handful of messages covering one of each requiredKind plus one superseded duplicate and one decoy; full twelve-message authored content is section 02):

- `init` produces the starting state: empty queue, zero sends, primaryStage 0, backupRemaining 5, all required deliveries unsatisfied.
- `schedule` returns the stage-change milestones and warning milestones from authored offsets; they fire in order through engine time advance.
- SEND schedules acks through the engine; acks arrive as events and flip delivery state.
- Early completion on the third correct ack; timeout path; forfeit path. Each settles exactly once.
- Clue flow end to end: read audit message, engine merges the clue, clue persists across a mission that then times out.

## Implementation details

### types.ts

    interface OutlookMessage {
      id: string              // 'M01'..'M12'
      from: string            // sender authority line
      to: string | null       // visible recipient hint, may be absent
      subject: string
      body: string[]          // evidence lives here
      recordId: string | null // link into the evidence graph (C17 etc.)
      requiredKind: 'weather' | 'payroll' | 'audit' | null
      correctRecipient: DeskId | null   // authored truth for evaluation
      supersededBy: string | null       // the correction chain
    }

    interface OutlookState {
      messages: ...           // read/flag marks per message id (ids + marks
                              // only, never bodies)
      queue: QueuedSend[]     // (messageId, channel) pairs, order preserved
      sends: SendRecord[]     // spent capacity, acks, failures, timestamps
      primaryStage: 0 | 1 | 2 // full, slowed, dark
      backupRemaining: number // starts at 5
      deliveredRequired: ...  // per requiredKind: delivered + correctness
      auditRead: boolean      // feeds clues()
      auditDelivered: boolean // feeds clues() / debrief
    }

`QueuedSend` holds `(messageId, channel)` and nothing else. Stage, capacity, and ETA are never captured at queue time; they are evaluated at dispatch. `SendRecord` captures message id, message version validity at send time, channel, dispatch time, scheduled ack time, and resolution (acknowledged, rejected, pending).

The valibot `saveSchema` validates exactly this reference shape and must structurally exclude any field that could carry authored copy (no body arrays, no subject strings in substate).

### content.ts

Define `OutlookPayload`: the twelve messages, channel tuning (backup capacity five, primary ETA per stage 0 and stage 1, backup ETA, all integers), stage-change offsets (three, as integer offsets from mission start so extended-time scaling is proportional), warning milestone offsets (30 and 10 seconds before `endsAt`), and the consequence tier table mapping tier to `commsDelayed` magnitude. Desk-check outcomes deliberately do NOT live here; they stay in the shared `SeedDefinition.deskChecks` table keyed by record id. Export the type; section 02 writes the validator functions and the authored payloads against it.

### rules.ts (pure functions, no engine imports beyond types)

- Channel math: validate a SEND against stage and capacity, return either a rejection reason (dark primary, backup exhausted) or the spend plus the computed acknowledgment time (dispatch time plus authored ETA for the channel at the current stage).
- Delivery evaluation: given a send record and the message table, a satisfied required delivery needs all three of: message not superseded (current version), recipient equals authored `correctRecipient`, acknowledgment arrived with `scheduledAt <= endsAt`. Wrong anything still spends and logs.
- Tiering: count of satisfied required deliveries maps to tier; same function for every settlement cause.
- Keep every function pure and integer-only; the module calls them from `validate` and `reduce`.

### module.ts

The `MissionModule` implementation:

- `init(payload, consequences)`: starting `OutlookState` as above.
- `schedule(payload)`: stage-change and warning milestones from authored offsets. The stage-2 warning line text notes that backup remains usable to the deadline. The 30 and 10 second warnings are engine milestones here, never shell timers.
- `validate(state, action)`: the single source of truth for action legality; the shell renders disabled buttons with inline reasons straight from these rejections. Actions: READ, FLAG, QUEUE, SEND (direct or from queue), plus dequeue if the queue supports removal.
- `reduce(state, action | event)`: applies rules.ts outcomes; SEND emits a request for the engine to schedule the ack event; acknowledgment events mark sends; stage events flip `primaryStage` and pass through as `scheduledEventFired` with warning line and falling-tone cue id; READ of the audit message sets `auditRead`.
- `clues(state)`: derives from `auditRead` (and `auditDelivered` if the clue design distinguishes them); returns the D-83 clue id when set. The engine owns merge-once semantics.
- `evaluate(state, cause)`: tier from the satisfied-delivery count; `completed` fires early when all three are acknowledged; consequence `commsDelayed` from the authored tier table.
- `debrief(state)`: per-delivery outcomes, decoy capacity spent, clue-found flag.
- `saveSchema`: the valibot schema from types.ts.

Settlement ordering: the engine's `advanceToNow` must drain acknowledgment events with `scheduledAt <= endsAt` before the timeout settlement guard runs. If the split 01 engine already guarantees event-before-settlement ordering at equal timestamps, rely on it and pin the behavior with the buzzer test; if it does not, the module's timeout evaluation must tolerate same-tick acks having already been reduced. Do not settle twice.

## Constraints and conventions

- No em-dashes anywhere, including comments and strings. All player-facing copy in uppercase terminal diction (warning lines authored here are the only copy this section owns).
- Integers only for all times, ETAs, capacities, offsets, magnitudes.
- The module never touches `Date`, `Math.random`, or timers. Determinism comes free if it stays pure.
- Substate is reference-only. If a test can smuggle a message body into a save and the schema accepts it, the schema is wrong.

## Handoffs to later sections

- Section 02 authors the three seed payloads against `OutlookPayload` and writes the content validator plus solvability invariants.
- Section 03 builds the screens; it consumes `validate` rejection reasons for inline disabled states and the emitted events for announcements and cues.
- Section 04 adds the walkthrough, adversarial, timeout, forfeit, extended-time, and property-test fixtures on top of this module; design `rules.ts` exports so a fast-check suite can drive arbitrary action sequences without reaching into module internals.

## Implementation notes (as built)

Files created: `src/engine/missions/outlook/{types,content,rules,module}.ts` and
`test/engine/missions/outlook/{saveSchema,rules,module}.test.ts`. Final suite
543 passing (+47 over the 496 baseline), tsc and eslint clean, pure and
integer-only, reference-only saveSchema, no em-dashes.

Deviations forced by the real engine interface (vetted in code review):

- The engine has no mission `schedule()` and `reduce` cannot ask the engine to
  schedule events; the mission queue is populated only from
  `seed.schedules[missionId]`. So acknowledgments are modeled deterministically:
  a SEND stamps `scheduledAckAt = now + stageETA` on its SendRecord, and an
  ack-fold (run on every reduce, i.e. every action and every scheduled/start/
  warning/endsAt-tick event) flips a pending send to `acknowledged` when
  `now >= scheduledAckAt AND scheduledAckAt <= endsAt`. A required delivery is
  satisfied only when ACKNOWLEDGED and routed to the correct desk; completion
  fires when the third correct ack folds (at the next wake at/after its ack
  time, or at the endsAt settle-tick which drains on-time acks before the
  timeout guard). This preserves the authored ack-before-deadline race.
- Registration is a factory `makeOutlookMission(payload)` closing over the
  immutable payload plus a `messageById` map, mirroring `makeTestDoubleMission`,
  because the engine threads neither seed nor payload into
  reduce/evaluate/terminal/debrief. Pure and per-mission (no aliasing).
- The deadline is stamped into substate (`durationMs`, nullable `endsAt`
  integers, reference-only) via an authored offset-0 `outlookStart` event,
  because the module is not handed the absolute deadline. A settle-tick at
  endsAt folds boundary acks before the timeout guard (the buzzer).
- Debrief distinguishes DELIVERED CORRECT / DELIVERED TO WRONG DESK / NOT
  DELIVERED per required kind, and reports AUDIT ROUTED and clue-found status.
- Code-review fixes applied before commit: satisfaction requires an acknowledged
  (folded) ack not a pending one; the early-completion and buzzer tests now
  drive the engine clock rather than asserting the SEND dispatch; `evaluate`
  treats a null endsAt as zero satisfiable; per-kind correct/delivered split is
  real; channel ETA indexes the stage directly (no silent stage-2 fallback);
  SEND_QUEUED removes by the captured target index.