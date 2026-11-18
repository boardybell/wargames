# Code Review: section-05-campaign

Reviewer: deep-implement code-reviewer subagent. Verdict: core shape
right; four HIGH defects, two broken plan contracts, a mandated-test
shortfall. Findings and dispositions:

- HIGH 1 (wake-granularity settlement ordering): a desk reply or
  mission event past endsAt drained in the same wake saw the unsettled
  mission; a post-deadline event could even complete a timed-out
  mission. FIXED: timeout settlement interleaves into the drain at the
  deadline boundary (buzzer rule preserved); pinned by the single-wake
  late-reply and post-deadline-event tests with emitted-order
  assertions.
- HIGH 2 (corroboration farming): the duplicate-check guard keyed on an
  id derived from unrelated array lengths and could never fire. FIXED:
  one desk answer per record per campaign (pending and answered both
  reject); record-derived reply id; farming test added.
- HIGH 3 (non-total dispatch): unknown action kinds fell off the switch
  and returned undefined state. FIXED: tagged { ok } union result, a
  default UNKNOWN ACTION rejection, unknown-seed and schedule-error
  rejections instead of throws; test added.
- HIGH (test shortfall): all ten gaps closed: distinct-magnitude
  permutation and the 50-over-40 aggregate-cap case, JSON round-trip
  settlement permanence, PENDING and UNKNOWN zero corroboration,
  selector purity, canonical JSON-safety walk, unknown action, backward
  clock, three-milestone catch-up, settled-record reselection selector.
- MEDIUM: isMissionSettled exported for section 08's merge guard;
  briefing lines derived from folded consequences (BriefingLine type;
  surfaced via selector-ready data); rng documented as deferred-jitter
  replay state; NEW_CAMPAIGN gains resetPreferences; per-mission
  actionCount replaces now-derived ids; settled comparator total;
  INSPECT_RECORD validates record existence; ACKNOWLEDGE_DEBRIEF phase
  guard; schema-type parity pinned by compile-time mutual-assignability
  asserts; selectOpenExceptions now reads an openExceptionsBaseline
  carried from the seed (no more negative tally).
- LOW: mid-drain emits after settlement documented; eslint unused-vars
  override scoped to the test tree; duck-typed rejection replaced by the
  tagged union.
- Accepted: single engine.ts instead of five files (boundaries
  preserved as exports; noted for section 08's import).
