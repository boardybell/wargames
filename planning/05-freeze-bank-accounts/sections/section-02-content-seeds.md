# Section 02: Content and Seeds

Authored bank mission payloads for all three curated seeds, the content validator that turns authoring mistakes into CI failures, the shared-table rows (deskChecks, clueRecords) the mission depends on, and the walkthrough and surge scripts that prove each seed is solvable. This section is content plus validation logic only. The mission module, rules, types, and selectors it validates against come from section-01-module-rules; the screens that render this content come from section-03-screen-ledger and are not needed here.

## Background

FREEZE BANK ACCOUNTS is mission 3 of SHALL WE PLAY A GAME?, a React/Vite terminal game with a headless deterministic engine (src/engine/). Missions are pure MissionModule implementations receiving seed payloads; authored content lives in SeedDefinition.missionPayloads.bank per seed, with three curated seeds in src/engine/seeds/ (seed-one.ts, seed-two.ts, seed-three.ts, registered in catalog.ts).

The mission: a bank-run ledger simulation where depositor confidence is the central pressure. Ten accounts, a deterministic request stream of about eighteen withdrawals, four critical payments due at authored offsets, and a feedback loop where WOPR's broad holds manufacture the very withdrawal demand it cites as validation. Confidence is an integer 0 to 100 (fixture start 72). Tick events apply a delta table; downward crossings of thresholds 60, 45, 30 each inject authored withdrawal surges at most once per threshold ever. Standard duration four minutes, extended eight; all offsets scale proportionally. Everything is integer math, JSON-safe, pure.

Binding contracts that shape the content:

- Reference-only substate: authored strings (account names, flavors, request reason lines, intro copy) live exclusively in the payload. The substate stores typed codes, flags, balances, and markers; selectors join codes back to authored copy at render time. Nothing you author here ever enters a save file.
- cash is never stored. It is a selector: the sum of available unheld balances (held accounts contribute zero, limited accounts contribute remaining allowance). The authored floor compares against derived cash.
- Injection sizing: final injected withdrawal size = authored base + the engine-capped inbound flightsDisrupted consequence magnitude, never below base, no second cap. Mission order is player-chosen, so every seed must be solvable at base AND at base plus the maximum capped magnitude.
- Clues are engine-owned via SeedDefinition.clueRecords (split 01 amendment 3). The bank module defines no clues(). The D-83 clue fires when the player inspects the hold-justification record (B04 in seed one) via INSPECT_RECORD. This section authors the clueRecords entry; it writes no clue code.
- Desk-check outcomes (what CHECK SOURCE returns for a record) live in the shared SeedDefinition deskChecks table keyed by record id, engine-owned, not inside missionPayloads.bank. This section authors rows in that shared table.
- The fixture anchor record already exists in seed one's bank record graph from split 01: B04, origin DERIVED, cites F06 (parentId F06), runId R04, event 21:14:21 (76461), receipt 21:14:30 (76470), body assuming a system-wide shutdown. Seeds two and three carry their own structural equivalents. This section does not re-author those records; it references them and designates them in clueRecords.

Section-01 finalizes the payload type in /Users/darkpool/wargames/src/engine/missions/bank/content.ts. If it left the type stubbed, this section declares it. The shape the content must fill:

    interface BankPayload {
      accounts: BankAccount[]        // exactly ten: id, name, flavor
                                     // (payroll | operating | vendor |
                                     // municipal | depositor), openingBalance,
                                     // limitEligible
      requests: BankRequest[]        // about eighteen: id, accountId, kind,
                                     // amount, offset, reason (authored line),
                                     // duplicateOf: string | null,
                                     // disputed: boolean,
                                     // recordId: string | null
      payments: CriticalPayment[]    // exactly four: id, accountId, amount,
                                     // dueOffset, confidenceBonus
      tuning: {
        tickInterval: number
        deltaTable: ...              // held-count penalty, cleared-payment
                                     // bonus, selective-release bonus,
                                     // below-floor penalty; integers
        thresholds: ThresholdSpec[]  // value (60, 45, 30 in seed one,
                                     // strictly descending), plus the
                                     // injected request set with base sizes
        broadHoldCount: number       // simultaneous holds that constitute
                                     // the broad hold
        floor: number                // derived-cash floor
        target: number               // confidence target
        predictionShiftFactor: number
      }
      predictionSeries: number[]     // WOPR predicted withdrawals per tick
      introLines: string[]           // skippable mechanics copy
      tierConsequence: ...           // paymentsDelayed magnitude per tier,
                                     // inversely by tier
    }

Request and tick offsets must land wherever split 01 routed per-mission scheduling (SeedDefinition.schedules.bank as ScheduledEventSpec entries, or derived by the module's schedule() from the payload; follow whichever wiring section-01 finalized). The seed validation suite from split 01 already asserts every mission schedule carries the 30 and 10 second warning milestones authored as offsets from mission end; keep the bank schedule compliant.

## Files

Create or modify:

- /Users/darkpool/wargames/src/engine/missions/bank/content.ts: payload type (if not finalized by section-01) and the exported pure validator.
- /Users/darkpool/wargames/src/engine/seeds/seed-one.ts, seed-two.ts, seed-three.ts: add missionPayloads.bank, the bank schedule entries, deskChecks rows for every record id the bank content references, and the clueRecords entry designating the hold-justification record.
- /Users/darkpool/wargames/test/engine/missions/bank/content.test.ts: validator and authoring tests, parameterized over the catalog.
- /Users/darkpool/wargames/test/engine/missions/bank/solvability.test.ts: walkthrough and surge invariants per seed through the real module lifecycle.
- /Users/darkpool/wargames/test/engine/missions/bank/fixtures.ts: the exported walkthrough and surge action scripts (consumed again by section-04).

## Tests first (TDD block 6)

All engine-side, node Vitest project. Write these before authoring content; they define done.

Content validator suite, test.each over all three seeds from the catalog:

- Exactly ten accounts with unique ids; about eighteen requests (pin the exact authored count per seed in a small table); exactly four critical payments.
- Exactly one payroll duplicate pair: two requests sharing an amount with differing requester chains in their authored bodies, linked via duplicateOf. Assert the shared amount and the differing chain text structurally, not by prose review.
- Exactly one disputed request whose authored body contradicts its own account's history (assert the contradiction hook structurally: the disputed flag is set, the body references the account, and the referenced claim conflicts with the authored opening balance or prior request facts).
- Thresholds strictly descending (60, 45, 30 in seed one; structural descent assertion for all seeds).
- Every authored request carries a non-empty reason string.
- All tuning values, balances, amounts, offsets, and series entries are integers; no NaN or Infinity; payload JSON round-trips strict-equal.
- Prediction-series shape: at every tick index the unshifted authored series tracks at or below the base observed stream (the authored request stream aggregated per tick, injections excluded), and the hold-shifted series (series times predictionShiftFactor, or however section-01 defined the shift) strictly exceeds the base observed stream. This makes the divergence read as circular validation, not noise.
- The hold-justification record (B04 in seed one, the seed-equivalent elsewhere) exists in the seed's bank record graph, has origin DERIVED with run ancestry reaching the seed's exerciseRunId, and is listed in that seed's clueRecords with the D-83 clue id.
- Every record id referenced anywhere in the bank payload has a deskChecks entry in the shared table.
- The bank schedule carries the 30 and 10 second warning milestones.

Solvability invariants, per seed, through the real engine and module from section-01:

- Walkthrough fixture: a scripted (action, offset) log that reads the evidence, holds selectively, limits where eligible, releases to pay, clears all four critical payments, and settles at the deadline with derived cash at or above the floor and confidence at or above the target. Assert tier full.
- Surge fixture, variant A: a script that lets confidence cross at least one threshold (triggering injection at base sizes), then recovers via releases and cleared payments to a sustainable settlement. Assert the run remains winnable at a documented tier.
- Surge fixture, variant B: the same script with the inbound flightsDisrupted consequence supplied at its engine-capped maximum through the campaign consequence channel at init. Assert the same solvability. Both variants run in CI; this is the requirements' named test (a withdrawal surge caused by lost confidence even with cash initially available).

Do not test module rules here (application tables, broad-hold stamping, terminal paths); those are section-01's suite. Do not build the timeout, forfeit, collapsed, or proportionality fixtures here; those are section-04's, which reuses the scripts exported from fixtures.ts.

## Implementation

### 1. Validator (content.ts)

    function validateBankContent(
      payload: BankPayload,
      records: EvidenceRecord[],      // the seed's bank record graph
      deskChecks: DeskCheckEntry[],
      clueRecords: ClueRecordEntry[],
      anchors: BankSeedAnchors        // per-seed expected record id, run id
    ): ContentError[]                 // empty array means valid

Return structured errors rather than throwing, so one CI run names every authoring mistake. Each validator rule maps one-to-one to a test above. The solvability invariants are NOT validator rules; they need the module lifecycle and live in solvability.test.ts. Export the validator; if split 01 established a central seed-validation registry, register it there as well so adding a seed automatically subjects it to these checks.

### 2. Authoring seed one

Ten accounts across the five flavors (payroll, operating expense, vendor, municipal, depositor) with integer opening balances; mark a sensible subset limitEligible so LIMIT has real targets. Author the request stream so the opening liquidity is adequate: demand prices confidence, not cash. Structural mix within the roughly eighteen requests:

- The payroll duplicate pair: same amount, requester chains that differ in the authored reason lines, linked by duplicateOf. Close reading is the tell.
- The disputed request: its body contradicts its account's history; CHECK SOURCE on its recordId resolves the dispute through the deskChecks table.
- Ordinary withdrawals and payments spread across offsets so the feed stays legible and the broad-hold decision arrives under pressure.
- Threshold injection sets for 60, 45, and 30: predictable authored base sizes, flagged injected when scheduled by the engine. Size them so variant B (base plus maximum capped inbound magnitude) stays survivable; the validator and surge tests are the contract, and if they fail the tuning is wrong, not the tests.

Four critical payments with due offsets, amounts, and confidence bonuses that create the designed tension: each draws from its specific account, and paying requires that account to be unheld, so the player must release or limit to pay. The delta table, floor, and target are the authoring effort flagged in plan review: tune them so the walkthrough reaches full, the surge recovers, and reckless broad holding still collapses (confidence to zero remains reachable for section-04's collapsed fixture). The prediction series is authored per tick to satisfy the shape invariants in section 5 of the plan: at or below the base stream unshifted, above it when hold-shifted.

Intro lines: brief mechanics copy rendered skippably over the first live decision. Copy rules everywhere: uppercase terminal diction, no em-dashes, invented names only, reason lines in plain English since the debrief aggregates them.

### 3. Seeds two and three

Same structural mix, different incident flavor, their own account names, record ids, and run ids standing in for B04 and R04. Define each seed's expected ids once in a BankSeedAnchors object shared by the validator call and the tests. The validator runs unchanged across all three; each seed independently passes the full suite and both surge variants.

### 4. deskChecks, clueRecords, and schedule rows

For every record id a bank request or the hold-justification record references, author a deskChecks row in that seed's shared table (outcome, delaySeconds, replyBody) consistent with the drama: the hold-justification chain reads as DERIVED exercise ancestry, the disputed request's record resolves the contradiction. Add the clueRecords entry { recordId, clueId } designating the hold-justification record with the D-83 clue id established by split 01 (grep the existing clue registry for the exact id before writing). Populate the bank schedule with request events, confidence ticks at the authored interval, payment due reminders, and the timer milestones.

### 5. Walkthrough and surge scripts (fixtures.ts)

Author the scripts as ordered action logs with advance offsets in the same envelope format the campaign log uses, one walkthrough and one surge script per seed, each exporting its expected-outcome assertion data (tier, cleared payments, clue found). Export them from /Users/darkpool/wargames/test/engine/missions/bank/fixtures.ts rather than inlining them: section-04-fixtures-polish reuses them for its CI matrix (surge runs twice there too, plus timeout, forfeit, and collapsed built on the same seeds). The walkthrough should also include the TRACE that inspects the hold-justification record so the clue-found assertion is exercised end to end.

## Dependencies

- section-01-module-rules must be complete: types, rules, module registration, terminal(), selectors, saveSchema. The solvability tests drive that module through the real engine.
- Splits 01 and 02 (engine and shell, including amendments 7 and 8) are prerequisites of the whole mission split; this section additionally touches the shared SeedDefinition files, deskChecks table, and clueRecords from split 01.
- section-04-fixtures-polish consumes the exported scripts; keep fixtures.ts clean and data-only.

## Done when

npm test passes with: the content validator green across all three seeds, the payroll duplicate and disputed request locked in structurally, prediction-series shape invariants holding, the hold-justification record designated in clueRecords per seed, deskChecks coverage complete, the walkthrough at tier full per seed, the surge fixture solvable in both sizing variants per seed, and no authored string reachable through any saveSchema round-trip.