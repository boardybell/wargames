# section-04-fixtures-polish: Fixtures, Property Tests, and Acceptance Polish

## Purpose

This section closes out the CRASH OUTLOOK mission (mission 1 of SHALL WE PLAY A GAME?) by wiring the proof fixtures into CI and finishing the accessibility and debrief acceptance work. Everything built here exercises code that already exists: the engine-side mission module and rules (section-01-module-rules), the authored payloads for all three seeds plus the content validator (section-02-content-seeds), and the screen set (section-03-screen-views). This section writes no new production features except small debrief rendering fixes if the checks below expose gaps. It is the split's acceptance gate.

## Background You Need

The game is a React/Vite static site with a headless deterministic engine in `src/engine/`. Missions are pure `MissionModule` implementations (init, schedule, validate, reduce, evaluate, debrief, saveSchema, optional `clues(state): ClueId[]`) that receive seed payloads and never touch wall clock or RNG. `dispatch` returns `{ state, emitted: EngineEvent[] }`. Timer milestones are seed-authored scheduled events. All sim quantities are integers.

CRASH OUTLOOK is an inbox triage puzzle under a real-time deadline. Twelve messages per seed; three carry `requiredKind` values (`weather`, `payroll`, `audit`) and must be routed to their `correctRecipient` desk and acknowledged before `endsAt`. Mechanics that matter to the fixtures:

- Two channels. Primary: unlimited send count while not dark, with a stage-dependent ETA (`primaryStage` 0 full, 1 slowed, 2 dark; dark rejects sends with a reason). Backup: hard capacity of five sends, fixed ETA. Stage changes are seed-authored scheduled events that fire in order and emit `scheduledEventFired`.
- SEND spends capacity (backup) or nothing (primary), computes acknowledgment time from the authored ETA at the current stage, and schedules an acknowledgment event. QUEUE stores `(messageId, channel)` only and is always free; everything is evaluated at dispatch. Dispatching a queued item to a dark primary rejects at zero cost and the item stays queued.
- Delivery evaluation: an acknowledgment event with `scheduledAt <= endsAt` marks the send acknowledged. A required delivery counts only if the message is the non-superseded version, the recipient desk is correct, and the ack landed. Wrong version or wrong recipient still spends capacity and logs.
- Buzzer tie-break: acks with `scheduledAt <= endsAt` drain before the timeout settlement guard inside the same `advanceToNow`. Three acks exactly at the buzzer settle as `completed`, not `timeout`.
- Tiering: `evaluate(state, cause)` counts correct acknowledged required deliveries: 3 is tier full, 2 partial, 1 poor, 0 failed. `completed` fires early when all three acks land. Timeout and forfeit evaluate the same way. The `commsDelayed` consequence magnitude comes from an authored tier table.
- Clue: first READ of the audit message makes `clues()` report the D-83 clue id; the engine merges into `cluesFound` monotonically and emits `clueFound` exactly once. The clue survives a failed mission.
- Debrief payload: per-delivery outcomes for the three required kinds individually, capacity spent on decoys, and clue found flag.
- Substate is reference-only (ids, marks, send records); message bodies live only in the immutable seed payload.

The fixture seed embeds record C17, EXERCISE provenance, run R04, event 21:14:00, receipt 21:14:05. Seeds two and three have the same structure with different incident flavor and their own record-id equivalents.

Section 02 already ships the content validator with two solvability invariants per seed (adversarial fails, walkthrough reaches tier 3). Those invariants are declared there; this section is where the actual fixture scripts that prove them live, run in CI, and are extended to timeout, forfeit, boundary, extended-time, and property coverage.

## Files

Create or extend (all paths absolute from repo root):

    test/engine/missions/outlook/fixtures/
      walkthrough.ts       per-seed scripted action sequences reaching tier 3
      adversarial.ts       per-seed send-everything scripts
      index.ts             fixture loader keyed by seed id
    test/engine/missions/outlook/fixtures.test.ts
                           walkthrough, adversarial, timeout, forfeit per seed
    test/engine/missions/outlook/boundary.test.ts
                           buzzer tie-break fixture
    test/engine/missions/outlook/extended-time.test.ts
                           eight-minute proportional scaling
    test/engine/missions/outlook/properties.test.ts
                           fast-check mission-local property suite
    test/engine/missions/outlook/debrief.test.ts
                           debrief payload content checks
    test/app/missions/outlook/keyboard.test.tsx
                           keyboard-only full delivery flow
    test/app/missions/outlook/narrow.test.tsx
                           narrow-width single-pane pass

Engine tests run in the node Vitest project; the two app tests run in the jsdom project with the real engine and the real outlook module (no mocks of either).

If sections 01 through 03 already created sibling test files with overlapping names, extend rather than duplicate; the describe blocks below are the required coverage either way.

## Tests First

Write these before touching anything else. Stubs describe intent; fill in bodies against the real APIs from sections 01 through 03.

### Fixture scripts (test/engine/missions/outlook/fixtures/)

A fixture script is a deterministic list of timed actions replayed through the real engine lifecycle: start the mission with the seed payload, then interleave `advanceToNow(t)` and `dispatch(action)` calls per script entry. One walkthrough and one adversarial script per seed, keyed by seed id.

    // walkthrough.ts
    // For each seed: the intended-solution action sequence. Reads the three
    // required messages (audit first so the clue test can piggyback), uses
    // TRACE and CHECK SOURCE where the solution depends on them, queues and
    // sends the correct versions to the correct desks on channels that beat
    // the stage schedule, and leaves at least one backup slot unspent.
    export function walkthroughScript(seedId: SeedId): TimedAction[]

    // adversarial.ts
    // For each seed: spray-and-pray. Sends every message as fast as the
    // channel rules allow, exhausting backup on decoys and stale duplicates
    // before the required three can all land correctly.
    export function adversarialScript(seedId: SeedId): TimedAction[]

### fixtures.test.ts, parameterized over all three seeds

    describe.each(seeds)('outlook fixtures: %s', (seed) => {
      it('walkthrough reaches tier 3 with at least one spare backup slot')
      // settles completed, tier full, backupRemaining >= 1

      it('walkthrough clue: audit READ emits clueFound exactly once and
          cluesFound contains the D-83 clue id')

      it('adversarial send-everything ends below tier 3')
      // settles at timeout or completed-with-wrong-deliveries; tier < full

      it('timeout: no actions after start settles as timeout, tier failed,
          commsDelayed magnitude matches the authored tier table row for 0')

      it('forfeit mid-mission evaluates deliveries achieved so far')
      // run the walkthrough prefix through one correct delivery, forfeit,
      // assert tier poor and the one delivery marked correct in debrief

      it('clue survives failure: READ audit then forfeit; cluesFound still
          contains the clue id in post-mission campaign state')
    })

### boundary.test.ts

    describe('buzzer tie-break', () => {
      it('third ack with scheduledAt == endsAt settles as completed, not
          timeout')
      // Construct sends whose authored ETA lands the final ack exactly at
      // endsAt; single advanceToNow past the deadline; assert settlement
      // cause and tier full.

      it('ack with scheduledAt == endsAt + 1 does not count')
      // Same construction shifted one tick late; settles timeout, tier
      // partial.
    })

### extended-time.test.ts

    describe('extended time (accessibility time scaling)', () => {
      it('at eight minutes the three stage-change offsets scale
          proportionally')
      // Start with the extended-time option; assert the three
      // scheduledEventFired stage events fire at offsets scaled by the
      // ratio of eight minutes to the standard duration, in order.

      it('walkthrough still reaches tier 3 at eight minutes')
      // Replay the walkthrough script with times scaled by the same ratio.
    })

### properties.test.ts (fast-check over the module with the engine lifecycle)

    describe('outlook rules properties', () => {
      // Arbitrary: sequences of valid-shaped actions (READ, FLAG, QUEUE,
      // SEND, dispatch-from-queue, TRACE, CHECK SOURCE) at nondecreasing
      // integer times within the mission window, over fixture-seed message
      // ids and both channels.

      it('never creates negative backup capacity')
      it('never marks a superseded message as a satisfied required delivery')
      it('never settles twice')
      // one settlement event total per run, regardless of action tail

      it('queueing is always free')
      // backupRemaining and send log unchanged by QUEUE alone
    })

Invalid actions in generated sequences must be rejected by the module validator, not crash; the properties hold over whatever subset the engine accepts. Keep the run count modest (around 200) so CI stays fast; pin a fast-check seed via the deterministic harness convention from split 01.

### debrief.test.ts

    describe('debrief payload', () => {
      it('reports the three required deliveries individually with outcome
          per kind (correct / wrong recipient / wrong version / undelivered)')
      it('reports capacity spent on decoys as an integer')
      it('reports clue found flag matching cluesFound')
      it('walkthrough debrief and adversarial debrief differ in all three
          fields')
    })

### keyboard.test.tsx (jsdom, real engine)

    describe('keyboard-only delivery flow', () => {
      it('completes one full delivery with keys only')
      // Tab/arrow to the weather correction in INBOX, Enter to open,
      // activate READ, QUEUE to backup, navigate to OUTBOX, dispatch SEND,
      // advance engine time past the ack, confirm the LOG view shows the
      // acknowledgment. No pointer events anywhere in the test.

      it('focus lands sensibly after view switches')
      // after INBOX -> message -> back, focus returns to the list row
    })

### narrow.test.tsx (jsdom, real engine)

    describe('narrow-width single-pane', () => {
      it('renders single-pane at narrow width with back affordances on
          message detail, OUTBOX, and LOG')
      it('back affordance returns to the prior view and router state agrees')
      it('StatusLine (stage, backup remaining, next ETA) remains visible in
          every view at narrow width')
    })

Narrow width is driven however split 02 standardized it (matchMedia mock or container width prop); reuse that helper, do not invent a second mechanism.

## Implementation Notes

1. Fixture scripts are data plus a thin replay helper. If split 01 already ships a scripted-replay harness for mission tests, use it; only write a local `replay(seed, script)` helper if none exists, and keep it in the fixtures directory.
2. The walkthrough scripts are the mechanical solvability proof the plan promises. Author them against the section 02 payloads: the payroll approval chain names the right desk, the weather correction cites the field observation record, the audit message carries the R04 export reference. If a script cannot reach tier 3 with a spare backup slot, that is a content bug; fix the seed payload in the section 02 files and note it, do not loosen the assertion.
3. The adversarial script must be genuinely greedy, not strawman-weak: send duplicates and decoys on backup first (burning the five slots), use primary freely until dark, and still assert the run lands below tier full. If it accidentally wins, the difficulty contract is broken; tighten tuning in the seed payload (stage offsets or backup ETA), rerun the walkthrough proof, and keep both invariants green.
4. The boundary test must construct ack timing from authored ETAs, not by poking the event queue. Pick send times so arithmetic lands the ack exactly on `endsAt`; if the fixture seed tuning makes that impossible, use a minimal synthetic payload that passes the section 02 content validator.
5. Extended time: the scaling ratio and the option flag come from the engine's accessibility time option (split 01). The test asserts proportionality of the three stage offsets, not absolute values, so retuning seeds later does not break it.
6. The property suite is mission-local by design. Do not wire the outlook module into the campaign-level fc.commands suite unless that harness already accepts additional mission modules; if it does, registration is a one-line follow-up, and if it does not, leave a comment in properties.test.ts saying the campaign suite declined extra modules, nothing more.
7. CI wiring: these files live under the existing Vitest project globs, so `npm test` picks them up with no config change. Verify that assumption; if the node/jsdom project split uses explicit include lists, add the new paths.
8. Acceptance anchors this section closes: all four settlement causes proven per seed, both solvability invariants proven by replay, buzzer tie-break proven at the boundary, extended time proven proportional and solvable, no negative capacity or double settlement under random play, debrief payload complete, keyboard-only and narrow-width passes green. When all of the above pass under `npm test`, split 03 is done.

## Dependencies

- section-01-module-rules: the outlook module, rules, saveSchema, clues(), evaluate, debrief (engine side).
- section-02-content-seeds: the three authored payloads, channel tuning, stage offsets, content validator.
- section-03-screen-views: OutlookScreen, the four views, verbs, StatusLine, back affordances (needed by the two jsdom tests only).

Nothing downstream depends on this section.