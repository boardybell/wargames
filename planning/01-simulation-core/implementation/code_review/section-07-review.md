# Code Review: section-07-seeds

Reviewer: deep-implement code-reviewer subagent. Findings and
dispositions:

- MEDIUM (lastNow fix incomplete, two conventions): NEW_CAMPAIGN now
  passes now through the createCampaign arg and drops the spread
  override, so there is ONE convention. The default now=0 stays for
  bootless fixtures and is documented; the shell boot path (split 02)
  passes a real clock. Confirmed the time-module clamp is the root
  cause.
- MEDIUM (six-permutation proof was a tautology): the walkthrough
  hashed static seed input. REWRITTEN to hash the RESULTING campaign
  case facts (cluesFound, settled tiers and clues by mission,
  acknowledged debriefs) across all six orders; these derive from
  dispatch, so an order-dependent engine diverges. Real property now.
- LOW/MEDIUM (requirements-table deviation, R21): the deliberate fifth
  record (R21, the post-incident finale field report, distinct from the
  W02 decoy) is now documented and pinned by the fixture-exactness test;
  the role-structure test asserts two OBSERVED records with the decoy
  distinguished by event time.
- MEDIUM (inversion never asserted literally): the receipt-vs-event
  test now pins the specific swap (bank received before flights, flights
  happened before bank).
- MEDIUM (independence not proven discriminating): a new test asserts
  OBSERVED pass and EXERCISE/DERIVED fail, with exactly two independent
  records per seed.
- MEDIUM (finale wait-bound standard-only): the bound is now asserted
  for both standard and extended duration, with a comment that absolute-
  second desk delays make standard the tight case (extended only adds
  room).
- MEDIUM (outlook clue source on the honor system): the clue test now
  asserts clueRecords cover exactly flights and bank and names outlook's
  module-driven exemption, so a dropped source fails.
- MEDIUM (SeedTuning/StormTrack dropped): intentional and now documented.
  Per the rev-2 mission-split plans, mission-specific tuning and storm
  tracks live inside the opaque missionPayloads.<mission>, authored and
  typed by splits 03 to 05, not as top-level SeedDefinition fields.
- OK confirmed: JSON-safety, integer discipline, fixture times verbatim,
  solvability genuine for the test double (real-mission re-authoring is
  the expected mission-split work, flagged in the plan).
