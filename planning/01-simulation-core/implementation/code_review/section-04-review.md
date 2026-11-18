# Code Review: section-04-time

Reviewer: deep-implement code-reviewer subagent. Findings:

- HIGH: advanceToNow accepted NaN rawNow, which became lastNow and froze
  the clock permanently while violating JSON safety. Fixed: integer
  validation matching materializeSchedule.
- MEDIUM: an end-anchored offset exceeding the mission duration
  materialized before startNow and fired instantly. Fixed: rejected at
  materialization with an attributable error.
- MEDIUM (tests): the JSON round-trip test and the clamped-timeout
  interaction (deadline beyond the 30-minute horizon reporting false on
  the clamped advance, true on the next) were missing. Added, plus the
  late-envelope shape via the repeat-advance test.
- LOW: full-tie ordering (mission before campaign) was emergent; now
  documented at the sort site. Duplicate spec ids now rejected. The
  dropped onTimeout hook decision now documented in the docstring (the
  plan permitted the drop). timedOut-stays-true-until-settled pinned by
  test. Frozen specs exercised. Milestone fixture kind renamed
  timerMilestone to exercise the section-05 vocabulary.
- Confirmed correct: clamp order (floor then cap), buzzer drain-before-
  timeout, amendment-4 anchor scaling, queue-of-origin tags, purity,
  export surface.
