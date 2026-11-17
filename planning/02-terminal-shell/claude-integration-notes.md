# Integration Notes: Opus review of 02-terminal-shell plan

Review: reviews/iteration-1-opus.md. All 24 findings integrated; four of them are
cross-split contract changes that also amend the 01-simulation-core plan and its
section files (amendment blocks appended there, dated 2026-11-17).

## Engine-contract amendments (findings 1, 2, 4, 16, 24; applied to split 01)

1. Event emission channel: engine dispatch and advanceToNow now return
   { state, emitted: EngineEvent[] }, the ordered list of events materialized
   during that call. Exactly-once stays structural: emitted entries correspond
   to queue deletions and settlement transitions in the same drain. EngineEvent
   union: missionStarted, scheduledEventFired, timerMilestone, settlement,
   phaseChanged, consequenceApplied, sourceCheckResolved, debriefAcknowledged,
   finaleFinalPhase, branchRunCompleted, campaignReset.
2. Milestones are engine-owned: mission start materializes timer-milestone
   events (including the 30 and 10 second warnings and threshold crossings)
   into the mission queue from seed-authored offsets; they drain like any event
   and appear in emitted. The shell never derives milestones from wall clock.
3. (16) CampaignState gains startedMissionIds: string[] so campaign-begun (and
   the extended-time lock) is an explicit total derivation, not an inference.
4. BranchStep pinned where split 01 defines it: { step: number, label: string,
   detail: string } JSON-safe; the shell defines the consumption interface
   (grid animation + skip) and split 06 authors content into it.
5. (24) The test-double mission is exported through a dedicated entry
   (@engine/testing) so downstream splits' tests can import it; it stays out of
   the shipped public surface (index.ts) and out of the production bundle.

## Shell plan integrations

- (3) Debrief frame gets an explicit ACKNOWLEDGE affordance dispatching
  ACKNOWLEDGE_DEBRIEF; acceptance updated.
- (5) Self-wake guard keys on the active endsAt instance, not an app flag.
- (6) Display clock: remaining time derives from the engine's clamped lastNow
  plus a performance.now() delta captured at the last wake or dispatch,
  rendered on rAF timestamps; Date.now() is never read for display. Reconciled
  at every wake.
- (7) Multi-tab: storage event listener detects foreign writes to the save keys
  and shows a GAME OPEN IN ANOTHER TAB notice that pauses local writes until
  reload; single-active-tab named as a known limitation in the README.
- (8) Immediate-flush set extended: settlement, START_MISSION, FORFEIT_MISSION,
  ACKNOWLEDGE_DEBRIEF, NEW_CAMPAIGN; debounce covers everything else.
- (9) Tests assert ctx.resume() is called synchronously inside each of the four
  activation input handlers.
- (10) Input precedence stack defined, top wins: open native dialog; active
  diegetic prompt (consumes only its answer keys, everything else falls
  through); running type-in (any non-consumed key completes it and is then
  swallowed); menu shortcuts and screen actions; global shortcuts. Documented
  in the key-handler utility.
- (11) In-flight WAAPI animations run to completion on preference change; new
  preference governs subsequent animations.
- (12) Orientation and resize are ignored during the 700 ms push-in; geometry
  recomputes after the terminal (full-viewport) owns the screen, so no restart
  is needed.
- (13) Command grammar pinned: input is trimmed, whitespace-collapsed,
  case-folded to upper; verb-first tokens; active screen's mission verbs
  resolve before shell verbs, collisions fail fast in dev at registration;
  rejection formats UNRECOGNIZED COMMAND: <input> and INVALID: <engine
  reason>. Command-vs-button identity is tested on the parsed action value.
- (14) House rules honored explicitly: a glossary primitive joins the terminal
  package (terms render with a subtle dotted underline, hover and focus and
  tap open the plain-language definition, Escape closes, one glossary file per
  project covering OPEN EXCEPTIONS, TRACE, CHECK SOURCE, OBSERVED, EXERCISE,
  DERIVED, independent corroboration, STAGED RECOVERY, HOLD AND VERIFY, and
  friends). The web-output-cache rule maps to save-resume: a return visit
  never shows an empty state over an existing campaign; the hero-skip and
  menu-with-state behaviors are that rule's implementation here.
- (15) VT323 self-hosted beside Glass TTY; zero external font requests.
- (17) Live regions are mounted as siblings of the dialog host at the app
  root, outside screen roots, so assertive announcements fire during modals.
- (18) New Campaign dialog lists exactly the three named seeds with
  descriptions; no free seed input exists.
- (19) Grid glow applies at container level; per-cell shadows capped to one
  layer; manual perf smoke includes a full finale-scale grid figure.
- (20) CueDefinition gains preload: eager or lazy; effects eager, voice lazy
  (decode on first play, keep decoded); an audio memory note rides in the
  manifest doc for split 07.
- (21) Contrast verified at the vignette's darkest overlap, not flat
  background; vignette strength constrained by that check.
- (22) Announcer: assertive never coalesces; polite coalesces identical
  strings and queues distinct ones in order with a short gap.
- (23) One persisted master value backs both the diegetic prompt and the
  settings switch; the prompt is just a styled writer of that value.

## Not integrated

- Nothing rejected. Finding 14's option (b) was chosen (real glossary
  primitive) over recording a HELP-replaces-glossary decision, because the
  global rule is explicit and the terms are exactly its target.
