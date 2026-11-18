# FREEZE BANK ACCOUNTS fixtures-polish (section-04) review

Reviewer: deep-implement:code-reviewer. FIX-THEN-SHIP. A strong, genuinely adversarial suite; the invariant-proving core is real and holds up under source cross-check. Defects are confined to test-strength erosion.

## VERIFIED GOOD (checked against source, not taken on faith)
- Surge pair is ONE script run twice: surgeScript() = bankSurgeFor(seed), driven with maxInboundSurge=false (base) and true (cap); only the flag differs; injection COUNT asserted identical, SIZE delta >= INBOUND_CAP*count; INBOUND_CAP 40 matches CONSEQUENCE_CAPS.flightsDisrupted.
- Broad-hold boundary constructs the TRUE tie: three non-REEVE holds leave held==broadHoldCount(3) with firstBroadHoldAt null; the fourth hold is dispatched at exactly W01's scheduledAt (BANK_T0+20000); inclusive drain (scheduledAt <= now) runs before reduceAction; asserts W01 applied, arrivedAfterHold false, firstBroadHoldAt==TIE stamped once.
- Collapse idempotence: forfeit + both collapse paths capture JSON of outcome AND state.settled, dispatch further actions+drains, assert byte-identical; cause collapsed/forfeit and terminal genuinely fired.
- Clue: INSPECT_RECORD twice -> exactly one clueFound, structural mod.clues===undefined + outcome.clueId null.
- Debrief cross-tab hand-literals genuinely hand-derived (re-derived from payloads.ts: genuine-after-hold 2510, no-hold total 4790); not read from crossTab().
- Determinism: explicit now everywhere, no Date.now/Math.random leak.

## MEDIUM
- **M1. a11y narrow-viewport smuggles a pointer click into a keyboard-only pass.** a11y.test.tsx:219-221 activates BACK with fireEvent.click(back); a pointer click does not prove keyboard operability. Fix: fireEvent.keyDown(back,{key:'Enter'}) (or form submit), matching the typeCommand discipline used elsewhere.
- **M2. assertFocusable proves focusable, not Tab-reachable.** a11y.test.tsx:83-90 does el.focus() then asserts activeElement===el, which passes for tabindex=-1 nodes NOT in the Tab order, so the "focus reachable at every step" guarantee is partly vacuous. Fix: also assert tabIndex >= 0 (not -1) and not aria-hidden.
- **M3. Derived-cash property is partially self-referential on the limited branch.** properties.test.ts:1058-1066 expectedDerivedCash calls rules.ts remainingAllowance, the SAME helper the selector folds through, so a bug in remainingAllowance passes both. Fix: inline the limited-branch arithmetic literally (cash += Math.max(0, Math.min(acct.balance, acct.limitedTo - acct.limitedSpent))).

## LOW
- L1. fixtures.test.ts:852 extended-time ratio expect(ratio).toBe(2) is a magic constant; the engine does hard-code scale=2 so it fails loudly rather than rots, but prefer deriving the expected ratio from the extended-time config.
- L2. debrief.test.ts:366-371 main cross-tab partition-sum asserts cells sum to the literal AUTHORED_REQUEST_COUNT+injected (circular); a dropped authored wave is independently caught by the no-broad-hold test (before_hold_count===18), but tighten by computing the total from the live non-pending request count.

## Bottom line
Fix-then-ship. The invariant-proving core is real; the defects weaken specific named guarantees without letting broken module logic pass silently across the matrix. Land M1-M3 before merge; L1-L2 fold in too since they are quick.
