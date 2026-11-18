# Section 02 triage (finale projections + endings)

No HIGH. The single-computation reference identity, real-derived golden values, and the genuine freeze test all stay. Fix the robustness + cleanliness items.

## Fix
- M1 (make repeat->failure robust, not coupled to terminal()): in resolveEnding, if committed === 'repeat' return { endingId: 'failure', cause: 'collapsed' } UNCONDITIONALLY (before the timeout/forfeit branch), so the mapping is correct even if a committed repeat ever arrived with a non-collapsed cause. Keep timeout/forfeit -> failure/collapsed for the uncommitted case. Add/keep a test asserting resolveEnding('repeat', <any cause>) is always failure.
- M2 (vacuous immutability test): the "leaves a live unfrozen campaign state untouched" test constructs `live` but never passes it into runProjections, so it proves nothing. Either pass the actual snapshot object in and deepStrictEqual it before/after runProjections, or delete the test (the frozen test already proves immutability by throwing on mutation). Prefer making it real (pass the object in).
- L1 (dead selector + triplicated lookup): selectSettledMetrics is imported and re-exported but never called; the find-by-missionId metric lookup is hand-rolled three times. The corrected snapshot model reads snapshot.settled directly (not CampaignState), so selectSettledMetrics does not fit — REMOVE the dead import + re-export and dedupe the three lookups into ONE shared helper (e.g. metricFor(snapshot, missionId, key)) used by both files.
- L2: traceFor switch needs a default/assertNever throw for an unknown BranchId.
- L3: remove the dead `.filter((label): label is string => Boolean(label))` in provedEvidence (map already yields strings).
- L4: CASE_VALID_FULL and CASE_VALID_FIELD_REPORT are byte-identical in campaigns.ts; collapse to one, or make the field-report variant actually differ (it should carry fieldReportCorroborated true if that is the intended distinction).
- L5: annotate the BANK_DONOTHING fixture comment to note it is the TIMEOUT variant (service_cost 4), distinct from the defensive-collapse variant (service_cost 8) the threshold comment describes, so the fixtures do not read as contradicting the calibration.

## Done when
resolveEnding('repeat', any cause) is failure and tested; the immutability test genuinely passes the live object in (or is removed); the dead selectSettledMetrics import/re-export is gone and the lookup deduped; traceFor is exhaustive; the dead filter removed; the duplicate CASE_VALID constant resolved; finale engine + full npm test + tsc + eslint green with no regressions.
