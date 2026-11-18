diff --git a/src/engine/branch/types.ts b/src/engine/branch/types.ts
index 0df3276..b9bbed8 100644
--- a/src/engine/branch/types.ts
+++ b/src/engine/branch/types.ts
@@ -67,10 +67,22 @@ export interface BranchResult {
 // Integer service thresholds shaped by settled outcomes: better earlier
 // outcomes keep these totals low and widen finale recovery options.
 // Summed across settled metrics and compared <= threshold.
+//
+// Calibrated empirically against all three real missions (outlook, bank,
+// flights) stamping wopr_resolved + service_cost on the flights convention.
+// Measured aggregates across a full three-mission campaign, identical on all
+// three authored seeds:
+//   CLEAN (section-02 walkthroughs):      wopr_resolved 0,  service_cost 0
+//   DEFENSIVE (hold / freeze / ground,    wopr_resolved 20, service_cost 20
+//     deliver nothing; per mission
+//     outlook 2/4, bank 10/8, flights 8/8)
+// Each max sits strictly between the clean and defensive aggregates, so a
+// clean campaign stays viable (sum <= max) with real margin and a defensive
+// over-play tips both totals over threshold and loses the real tier.
 export const VIABILITY_THRESHOLDS: readonly {
   readonly key: string
   readonly max: number
 }[] = [
-  { key: 'wopr_resolved', max: 2 },
-  { key: 'service_cost', max: 20 },
+  { key: 'wopr_resolved', max: 10 },
+  { key: 'service_cost', max: 12 },
 ]
diff --git a/src/engine/missions/bank/module.ts b/src/engine/missions/bank/module.ts
index 206a49f..4ebb807 100644
--- a/src/engine/missions/bank/module.ts
+++ b/src/engine/missions/bank/module.ts
@@ -546,7 +546,24 @@ export function makeBankMission(
       for (const p of payload.payments) {
         if (state.payments[p.id]?.cleared) cleared += 1
       }
+      const held = heldCount(state)
       const ct = crossTab(state)
+      // Campaign-divergence metrics the selectors read (campaign/selectors.ts),
+      // on the same real-scale convention the flights module uses.
+      //   wopr_resolved: forced inactivity WOPR counts as resolved = accounts
+      //     held/frozen at settlement (a frozen ledger reads as a resolved
+      //     exception). Account-scale, 0..accountCount. Clean walkthrough
+      //     releases before settling (0); freeze-everything posts the full set.
+      //   service_cost: the real damage = unpaid critical payments at
+      //     settlement (payments_total - payments_cleared), plus a collapse
+      //     surcharge equal to the payment count when the cause is a collapse
+      //     (a collapsed ledger strands every obligation, not just the unpaid
+      //     ones). Payment-scale integer, >= 0, deterministic. Clean
+      //     walkthrough clears all four (0); defensive play drives both high.
+      const unpaidCritical = payload.payments.length - cleared
+      const collapseSurcharge = cause === 'collapsed' ? payload.payments.length : 0
+      const woprResolved = held
+      const serviceCost = unpaidCritical + collapseSurcharge
       return {
         missionId: BANK_MISSION_ID,
         cause,
@@ -557,7 +574,7 @@ export function makeBankMission(
           payments_total: payload.payments.length,
           derived_cash: cash,
           confidence: state.confidence,
-          held_accounts: heldCount(state),
+          held_accounts: held,
           payments_signal: signals.paymentsCleared ? 1 : 0,
           cash_signal: signals.cashAtOrAboveFloor ? 1 : 0,
           confidence_signal: signals.confidenceAtOrAboveTarget ? 1 : 0,
@@ -567,6 +584,8 @@ export function makeBankMission(
           genuine_after_hold_amount: ct.genuineAfterHoldAmount,
           injected_after_hold_count: ct.injectedAfterHoldCount,
           injected_after_hold_amount: ct.injectedAfterHoldAmount,
+          wopr_resolved: woprResolved,
+          service_cost: serviceCost,
         },
         clueId: null,
         consequences:
diff --git a/src/engine/missions/outlook/module.ts b/src/engine/missions/outlook/module.ts
index fbe98bb..4b455cd 100644
--- a/src/engine/missions/outlook/module.ts
+++ b/src/engine/missions/outlook/module.ts
@@ -440,13 +440,26 @@ export function makeOutlookMission(
       const satisfied = satisfiedCount(state)
       const tier = tierFromSatisfied(satisfied)
       const magnitude = payload.commsDelayedTable[tier]
+      const decoy = decoyCapacitySpent(state)
+      // Campaign-divergence metrics the selectors read (campaign/selectors.ts),
+      // on the same real-scale convention the flights module uses.
+      //   wopr_resolved: forced inactivity WOPR counts as resolved = the three
+      //     required messages the player did NOT deliver, i.e. the quiet-inbox
+      //     holds WOPR rewards. 3 - required_delivered, clamped >= 0. Clean
+      //     walkthrough delivers all three (0); deliver-nothing posts 3.
+      //   service_cost: the real damage = required messages not delivered
+      //     correctly (3 - required_delivered) PLUS any backup/decoy capacity
+      //     misspent on non-required or stale traffic. Message-scale integer,
+      //     >= 0, deterministic. Clean walkthrough ~0; blanket inactivity high.
+      const woprResolved = Math.max(0, 3 - satisfied)
+      const serviceCost = woprResolved + decoy
       return {
         missionId: OUTLOOK_MISSION_ID,
         cause,
         tier,
         metrics: {
           required_delivered: satisfied,
-          decoy_capacity_spent: decoyCapacitySpent(state),
+          decoy_capacity_spent: decoy,
           weather_correct: state.deliveredRequired.weather.correct ? 1 : 0,
           payroll_correct: state.deliveredRequired.payroll.correct ? 1 : 0,
           audit_correct: state.deliveredRequired.audit.correct ? 1 : 0,
@@ -454,6 +467,8 @@ export function makeOutlookMission(
           payroll_delivered: state.deliveredRequired.payroll.delivered ? 1 : 0,
           audit_delivered: state.deliveredRequired.audit.delivered ? 1 : 0,
           audit_routed: state.auditDelivered ? 1 : 0,
+          wopr_resolved: woprResolved,
+          service_cost: serviceCost,
         },
         clueId: state.auditRead ? OUTLOOK_CLUE_ID : null,
         consequences:
diff --git a/test/engine/branch/runBranch.test.ts b/test/engine/branch/runBranch.test.ts
index 9a4082f..08fd7ba 100644
--- a/test/engine/branch/runBranch.test.ts
+++ b/test/engine/branch/runBranch.test.ts
@@ -103,13 +103,22 @@ describe('STAGED_RECOVERY viability', () => {
     const poor = runBranch(ctx, constrained, 'STAGED_RECOVERY')
     expect(good.viability.viable).toBe(true)
     expect(poor.viability.viable).toBe(false)
-    // The threshold values are visible so the shell can show why.
+    // The threshold values are visible so the shell can show why. The
+    // test-double forfeit stamps wopr_resolved 3 and service_cost 30; against
+    // the recalibrated real-mission thresholds (wopr_resolved max 10,
+    // service_cost max 12) the service_cost line is the one that breaches.
     const woprThreshold = poor.viability.thresholds.find(
       (t) => t.key === 'wopr_resolved',
     )
     expect(woprThreshold).toBeDefined()
-    expect(woprThreshold!.pass).toBe(false)
-    expect(woprThreshold!.threshold).toBe(2)
+    expect(woprThreshold!.threshold).toBe(10)
+    expect(woprThreshold!.pass).toBe(true)
+    const serviceThreshold = poor.viability.thresholds.find(
+      (t) => t.key === 'service_cost',
+    )
+    expect(serviceThreshold).toBeDefined()
+    expect(serviceThreshold!.pass).toBe(false)
+    expect(serviceThreshold!.threshold).toBe(12)
     // Viability actually gates the policy: constrained holds at one stage.
     expect(good.trace.length).toBeGreaterThan(poor.trace.length)
   })
diff --git a/test/engine/campaign/divergence.test.ts b/test/engine/campaign/divergence.test.ts
new file mode 100644
index 0000000..e449ac5
--- /dev/null
+++ b/test/engine/campaign/divergence.test.ts
@@ -0,0 +1,184 @@
+// The game's thesis, proven end to end across all THREE real missions.
+//
+// Each mission module stamps two campaign-divergence metrics in evaluate()
+// on one shared convention (first committed by flights, retrofitted here into
+// outlook and bank):
+//   wopr_resolved — forced inactivity WOPR counts as resolved (undelivered
+//     messages, frozen accounts, held flights). Drives selectOpenExceptions
+//     DOWN: defensive play looks GOOD to WOPR.
+//   service_cost — the real damage the same orders produced. Drives
+//     selectServiceOutcomes UP, and over threshold loses finale viability.
+//
+// This test drives all three REAL mission modules through the engine twice:
+// a CLEAN campaign (the section-02 walkthroughs) and a DEFENSIVE campaign
+// (hold / freeze / ground everything, deliver nothing). It assembles the
+// three real settled outcomes into one campaign state and reads them through
+// the REAL campaign selectors and the REAL finale viability gate. A clean
+// campaign keeps OPEN EXCEPTIONS high, SERVICE COST low, and viability PASSES;
+// a defensive campaign drops OPEN EXCEPTIONS sharply (WOPR looks great) while
+// SERVICE COST rises and viability FAILS.
+import { describe, expect, it } from 'vitest'
+import { createCampaign } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { SettledOutcome } from '@engine/campaign/types'
+import {
+  selectOpenExceptions,
+  selectServiceOutcomes,
+} from '@engine/campaign/selectors'
+import { computeViability } from '@engine/branch'
+import { VIABILITY_THRESHOLDS } from '@engine/branch/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { CampaignAction } from '@engine/campaign/types'
+import {
+  driveOutlook,
+  outlookContextForSeed,
+  outlookWalkthroughEnvelopes,
+  outlookAdversarialEnvelopes,
+} from '../missions/outlook/fixtures'
+import {
+  BANK_T0,
+  bankContextForSeed,
+  bankPayloadFor,
+  bankWalkthroughFor,
+  driveBankSeed,
+  holdAct,
+} from '../missions/bank/fixtures'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  groundAllAtStartFor,
+  runScript,
+  walkthroughFor,
+} from '../missions/flights/fixtures/index'
+
+/** The real settled outcome a mission produced, pulled from its single-mission
+ *  playthrough so its stamped wopr_resolved + service_cost carry through. */
+function settledOf(state: CampaignState, missionId: string): SettledOutcome {
+  const outcome = state.settled.find((s) => s.missionId === missionId)
+  if (!outcome) throw new Error(`no settled outcome for ${missionId}`)
+  return outcome
+}
+
+/** Freeze every bank account and clear no payment: the defensive bank play. */
+function bankFreezeAllEnvelopes(seedName: string): Array<[CampaignAction, number]> {
+  const payload = bankPayloadFor(seedName)
+  const o = (sec: number) => BANK_T0 + sec * 1000
+  const envelopes: Array<[CampaignAction, number]> = [
+    [{ type: 'START_MISSION', missionId: 'bank' }, BANK_T0],
+  ]
+  payload.accounts.forEach((account, index) => {
+    envelopes.push([holdAct(account.id), o(5 + index)])
+  })
+  return envelopes
+}
+
+const FLIGHTS_SETTLE_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000
+
+/** Play all three real missions on a seed and return their three settled
+ *  outcomes, either clean (section-02 walkthroughs) or defensive (hold /
+ *  freeze / ground everything). */
+function playCampaign(
+  seedName: string,
+  mode: 'clean' | 'defensive',
+): readonly SettledOutcome[] {
+  const outlookCtx = outlookContextForSeed(seedName)
+  const outlook = driveOutlook(
+    outlookCtx,
+    seedName,
+    mode === 'clean'
+      ? outlookWalkthroughEnvelopes()
+      : outlookAdversarialEnvelopes(),
+  )
+
+  const bankCtx = bankContextForSeed(seedName)
+  const bank = driveBankSeed(
+    bankCtx,
+    seedName,
+    mode === 'clean'
+      ? bankWalkthroughFor(seedName)
+      : bankFreezeAllEnvelopes(seedName),
+  )
+
+  const flightsCtx = flightsContextForSeed(seedName)
+  const flights = runScript(
+    flightsCtx,
+    seedName,
+    mode === 'clean' ? walkthroughFor(seedName) : groundAllAtStartFor(seedName),
+    { settleAt: FLIGHTS_SETTLE_AT },
+  )
+
+  return [
+    settledOf(outlook.state, 'outlook'),
+    settledOf(bank.state, 'bank'),
+    settledOf(flights.state, 'flights'),
+  ]
+}
+
+/** Assemble the three real settled outcomes into one campaign state so the
+ *  real campaign selectors and viability gate read all three at once. The
+ *  baseline is the seed's own authored openExceptionsBaseline. */
+function campaignWith(
+  seedName: string,
+  settled: readonly SettledOutcome[],
+): CampaignState {
+  const base = createCampaign(flightsContextForSeed(seedName), seedName, {
+    extendedTime: false,
+  })
+  return {
+    ...base,
+    settled: settled.map((outcome, index) => ({ ...outcome, settleSeq: index })),
+  }
+}
+
+function viabilityPasses(state: CampaignState): boolean {
+  return computeViability(state).viable
+}
+
+describe.each(SEED_NAMES)('campaign divergence across all three missions: %s', (seedName) => {
+  it('a CLEAN campaign keeps OPEN EXCEPTIONS high, SERVICE COST low, and viability PASSES', () => {
+    const settled = playCampaign(seedName, 'clean')
+    const state = campaignWith(seedName, settled)
+    const baseline = state.openExceptionsBaseline
+
+    // Clean play delivers everything and forces no inactivity, so WOPR
+    // resolves nothing: OPEN EXCEPTIONS stays at the full baseline and real
+    // SERVICE COST is zero.
+    const open = selectOpenExceptions(state)
+    const cost = selectServiceOutcomes(state)
+    expect(open).toBe(baseline)
+    expect(cost).toBe(0)
+    expect(viabilityPasses(state)).toBe(true)
+  })
+
+  it('a DEFENSIVE campaign drops OPEN EXCEPTIONS sharply while SERVICE COST rises and viability FAILS', () => {
+    const cleanState = campaignWith(seedName, playCampaign(seedName, 'clean'))
+    const defensiveState = campaignWith(seedName, playCampaign(seedName, 'defensive'))
+
+    const cleanOpen = selectOpenExceptions(cleanState)
+    const defensiveOpen = selectOpenExceptions(defensiveState)
+    const cleanCost = selectServiceOutcomes(cleanState)
+    const defensiveCost = selectServiceOutcomes(defensiveState)
+
+    // WOPR's on-screen deception: holding / freezing / grounding everything
+    // drops OPEN EXCEPTIONS strictly and sharply below the clean campaign
+    // (every held message, frozen account, and grounded flight reads as a
+    // resolved exception).
+    expect(defensiveOpen).toBeLessThan(cleanOpen)
+    // The real damage is the inverse: SERVICE COST rises strictly above the
+    // clean campaign.
+    expect(defensiveCost).toBeGreaterThan(cleanCost)
+
+    // The thesis made mechanical: the clean campaign is finale-viable and the
+    // defensive over-play tips at least one real threshold over the line and
+    // loses viability.
+    expect(viabilityPasses(cleanState)).toBe(true)
+    expect(viabilityPasses(defensiveState)).toBe(false)
+
+    // And it fails because the aggregate service_cost breaches its max: a
+    // defensive campaign's real damage exceeds the recalibrated threshold.
+    const serviceMax = VIABILITY_THRESHOLDS.find((t) => t.key === 'service_cost')!.max
+    expect(defensiveCost).toBeGreaterThan(serviceMax)
+    expect(cleanCost).toBeLessThanOrEqual(serviceMax)
+  })
+})
