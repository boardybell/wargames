# section-03-joshua-catalog

## Purpose and scope

Build Joshua's authored line catalog for the whole SHALL WE PLAY A GAME? campaign, plus the selectors that resolve lines by event key with finale-state refinement. This is the single source of truth for every Joshua voice-over line; split 07 records audio against the stable ids produced here.

This section owns two files:

    src/engine/joshua/
      lines.ts      the authored line catalog (ids, text, event keys,
                    voiceClipId, pauseBeforeMs)
      selectors.ts  line lookup by event key and finale state

Plus tests under `test/engine/joshua/`.

This section is parallelizable with section-01-finale-module and section-02-projections-endings. It has no code dependency on them. It blocks section-04-screens-fixtures (the shell renders catalog lines through these selectors).

## Background context (self-contained)

Joshua is the campaign's AI narrator. The shell renders his lines through a `TerminalText` component with authored pauses honored, except during urgent status changes. The shell's caption line and the announcer (screen-reader / audio) consume the SAME text, so caption text must always equal display text (there is no separate caption string).

The campaign has three subsystem missions plus this finale. Each mission was implemented before this split and plays fully on its own mission-local copy. When this catalog lands, those missions gain the Joshua voice-over layer on top. This is a reverse-dependency resolution: the shell renders a Joshua line ONLY when the catalog resolves a key for it. A key the catalog does not cover renders nothing and logs nothing in production (graceful absence, no placeholders).

The finale produces validator rejections with reason codes, a recognition beat, and three endings. Those are the keys the catalog must cover for the finale, alongside the broader campaign keys (greetings, idle, per-mission discrepancy beats, deadline warnings).

### Keys the catalog must cover (required-line manifest)

The catalog must provide at least one line for every item in an EXPLICIT manifest (the manifest is defined in code in this section and asserted by test). The manifest, NOT the whole EngineEvent union, is the coverage contract. It contains:

- Every validator rejection reason code. The finale validator (section-01) returns `{ code, slot }`. The reason codes are:
  - `receipt-order` (the three subsystem slots were ordered by receipt time, not true event time)
  - `unrelated-source` (a slot's source check passed but the record is unrelated to the root chain)
  - `derived-not-independent` (the observation slot record derives from the same run it claims to corroborate; same-run derivatives are never independent)
  - `wrong-root` (the root slot is not the actual parent-chain root)
  - `incomplete` (one or more slots unfilled)
- The three ending readbacks, keyed by endingId:
  - `recovery` (STAGED RECOVERY committed, settled completed)
  - `containment` (HOLD AND VERIFY committed, settled completed)
  - `failure` (REPEAT D-83 committed, or timeout, or forfeit; settled collapsed)
- The recognition beat (keyed on the finale `caseValid` false-to-true transition; see Finale-state refinement below).
- The named per-mission first-discrepancy beats, one per subsystem mission (outlook, flights, bank). These are the "first time Joshua notices something is wrong" lines in each mission.
- Deadline warnings (the end-anchored 30-second and 10-second warnings and the final-phase alarm line).

Beyond the manifest, the catalog also SHOULD carry: greeting lines, idle lines, and the five verbatim requirements tone-reference lines placed where they fit. These are not asserted individually by the coverage test but must still obey the content rules (no em-dash, caption equals display, integer pauses).

### The five verbatim tone-reference lines

The project requirements name five canonical Joshua lines that set his tone. They must appear VERBATIM somewhere in the catalog, each attached to the event key where it fits naturally. Treat these as fixed strings (do not paraphrase). They are the WarGames-register lines already established for this campaign; place them at: initial greeting, an idle/waiting beat, the recognition beat, the recovery ending, and the failure ending. Their exact text is authored content carried in this file; preserve whatever the campaign's established canon is for each, and do not introduce an em-dash into any of them.

## Data model

Define the line record exactly as the engine contract specifies:

    interface JoshuaLine {
      id: string          // stable, unique; split 07 records against this
      text: string        // display AND caption AND announcer text
      eventKey: string    // EngineEvent kind or finale state key
      voiceClipId: string // consumed by split 07 audio
      pauseBeforeMs: number // integer; pause honored before the line renders
    }

Notes:

- `id` is globally unique across the catalog. Audio recording keys off it, so ids are permanent once published. Use descriptive stable ids (for example `finale.reject.receipt-order`, `mission.outlook.first-discrepancy`, `ending.recovery`).
- `eventKey` is how the shell finds lines: it is either an `EngineEvent` kind string (for example the per-mission event kinds, deadline-warning event kinds) or a finale STATE key (for the recognition beat and the ending readbacks, which are driven by state transitions, not events). Multiple lines may share an `eventKey`; the selector picks among them (see below).
- `pauseBeforeMs` must be an integer (asserted by test).
- There is no separate caption field. `text` is the single string used for display, caption, and announcer.

## selectors.ts

Expose selectors that resolve catalog lines by event key, with optional finale-state refinement. Suggested signatures (stubs; implement as pure functions over the catalog array):

    // Resolve the line(s) for an event key. Returns [] when the catalog
    // does not cover the key (graceful absence: caller renders nothing).
    export function selectLinesForKey(eventKey: string): JoshuaLine[]

    // Resolve a single line for a key, refined by finale state where the
    // key is a finale state key (recognition, endings). Returns null when
    // the catalog has no line for the key (graceful absence).
    export function selectLine(
      eventKey: string,
      finale?: FinaleStateRefinement
    ): JoshuaLine | null

`FinaleStateRefinement` is the minimal slice of finale state the selector needs to disambiguate: at least the committed action / endingId for ending readbacks, and the `caseValid` transition signal for recognition. Keep it a narrow local type; do NOT import the full `FinaleState` from section-01 (avoid the dependency). A structural shape like `{ endingId?: 'recovery' | 'containment' | 'failure'; recognized?: boolean }` is sufficient.

Finale-state refinement rules:

- For the recognition key, the selector returns the recognition line. The false-to-true `caseValid` transition is detected by the caller (the shell / finale module observes the state change and calls the selector); the catalog just provides the line. No new `EngineEvent` is introduced for recognition.
- For an ending readback key, the selector refines by `endingId` (`recovery`, `containment`, `failure`) to return the matching ending line.

Graceful absence is the critical semantic: when no line matches, return `null` / `[]`. The caller renders nothing and logs nothing in production. Never return a placeholder string.

## Tests FIRST (test/engine/joshua/)

Write these before the implementation. They derive from TDD block 7.

### Required-line manifest coverage

- Define the explicit required-line manifest in code (an array of the required `eventKey` / state keys plus, for parameterized keys like endings, the required variants). Assert the catalog resolves AT LEAST ONE line for every manifest entry:
  - every validator reason code (`receipt-order`, `unrelated-source`, `derived-not-independent`, `wrong-root`, `incomplete`),
  - every ending readback (`recovery`, `containment`, `failure`),
  - the recognition beat,
  - the named per-mission first-discrepancy beats (outlook, flights, bank),
  - the deadline warnings (30s, 10s, final-phase).
- The coverage test checks the manifest, NOT the whole event union. Extra lines beyond the manifest are allowed.

### Content rules

- No line's `text` contains an em-dash (assert against the em-dash character). This is a hard global rule.
- Caption equals display text: since there is a single `text` field, assert there is no separate caption field diverging from it (the model enforces this; a test documents the invariant by confirming the field used for caption is the same `text`).
- Every `pauseBeforeMs` is an integer (`Number.isInteger`).
- Every `id` is unique across the catalog.
- The five verbatim tone-reference lines appear in the catalog exactly as authored (assert each canonical string is present verbatim).

### Graceful absence

- `selectLine` / `selectLinesForKey` for a key the catalog lacks returns `null` / `[]` and produces no console output in production (spy on console; assert no logging). The caller is responsible for rendering nothing; the selector must not throw.

### Finale-state refinement

- `selectLine('<ending-key>', { endingId: 'recovery' })` returns the recovery readback; same for `containment` and `failure`.
- The recognition key resolves to the recognition line when the refinement signals recognition.

## Implementation order (suggested TODO)

1. Write `test/engine/joshua/lines.test.ts` with the manifest-coverage, content-rule, and verbatim-line assertions (red).
2. Write `test/engine/joshua/selectors.test.ts` with graceful-absence and finale-refinement assertions (red).
3. Author `src/engine/joshua/lines.ts`: the `JoshuaLine` interface, the full catalog array, and the exported required-line manifest constant used by the coverage test.
4. Implement `src/engine/joshua/selectors.ts`: `selectLinesForKey`, `selectLine`, and the narrow `FinaleStateRefinement` type.
5. Run `npm test` until green.

## Constraints and gotchas

- One catalog, whole campaign. Do not split per mission.
- Ids are permanent (audio contract). Choose them deliberately.
- Keep the `emitted` EngineEvent union closed: recognition and endings key off finale STATE, not new events. This file introduces no engine events.
- The catalog is pure data plus pure selectors. No side effects, no engine imports beyond type-only shapes you define locally. Do not import `FinaleState` from section-01; define the minimal refinement shape locally to preserve parallelizability.
- Never emit a placeholder for a missing key. Absence is silent.

## Relevant file paths

- Create: `/Users/darkpool/wargames/src/engine/joshua/lines.ts`
- Create: `/Users/darkpool/wargames/src/engine/joshua/selectors.ts`
- Create: `/Users/darkpool/wargames/test/engine/joshua/lines.test.ts`
- Create: `/Users/darkpool/wargames/test/engine/joshua/selectors.test.ts`

(Adjust the repo root prefix if the project root differs; paths under `src/engine/joshua/` and `test/engine/joshua/` are the authoritative layout from the plan.)