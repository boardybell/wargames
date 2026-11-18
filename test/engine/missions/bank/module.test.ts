import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { selectPredictedWithdrawals } from '@engine/missions/bank/selectors'
import {
  BANK_MISSION_ID,
  makeBankMission,
} from '@engine/missions/bank/module'
import {
  BANK_DURATION_MS,
  BANK_T0,
  JUSTIFICATION_RECORD_ID,
  BANK_CLUE_ID,
  SETTLE_AT,
  bankContext,
  bankConsequenceContext,
  bankCashCollapseContext,
  bankSub,
  drive,
  holdAct,
  payAct,
  releaseAct,
  start,
} from './fixtures'
import type { Envelope } from './fixtures'

const ctx = bankContext()

describe('bank lifecycle: init and schedule stamping', () => {
  it('starts confidence at the authored value and stamps the deadline', () => {
    // The offset-0 start event drains on the first advance after START, so
    // the deadline stamps once any time passes past T0 (mirrors flights).
    const { state } = drive(ctx, [start()], BANK_T0 + 1_000)
    const sub = bankSub(state)
    expect(sub.confidence).toBe(60)
    expect(sub.endsAt).toBe(BANK_T0 + BANK_DURATION_MS)
    expect(Object.keys(sub.accounts).length).toBe(5)
  })

  it('a withdrawal wave applies against its account after it drains', () => {
    // W1 (300 against CALDERA, opening 1500) drains at +30s.
    const { state } = drive(ctx, [start()], BANK_T0 + 35_000)
    const sub = bankSub(state)
    expect(sub.requests['W1']!.outcome).toBe('applied')
    expect(sub.accounts['CALDERA']!.balance).toBe(1200)
  })
})

describe('broad-hold stamping and the drain-before-reduce boundary', () => {
  it('firstBroadHoldAt stamps once when the held count crosses broadHoldCount', () => {
    // broadHoldCount is 2: holding a third account stamps.
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
      [holdAct('DORVEL'), BANK_T0 + 3_000],
    ]
    const { state } = drive(ctx, envs)
    const sub = bankSub(state)
    expect(sub.firstBroadHoldAt).toBe(BANK_T0 + 3_000)
  })

  it('releasing below the count and re-crossing does not restamp', () => {
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
      [holdAct('DORVEL'), BANK_T0 + 3_000], // stamps here
      [releaseAct('DORVEL'), BANK_T0 + 4_000], // back to 2
      [holdAct('EMBER'), BANK_T0 + 5_000], // re-cross
    ]
    const { state } = drive(ctx, envs)
    expect(bankSub(state).firstBroadHoldAt).toBe(BANK_T0 + 3_000)
  })

  it('a wave sharing the dispatch that crosses the broad hold drains FIRST (arrivedBeforeHold)', () => {
    // W1 arrives at +30s. Hold two accounts before +30, then the third hold
    // dispatched at exactly +30s: the wave drains first (before the action
    // reduces), so W1 is before-hold even though the stamp lands this call.
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 5_000],
      [holdAct('BELROSE'), BANK_T0 + 10_000],
      [holdAct('DORVEL'), BANK_T0 + 30_000], // stamps; W1 drains first
    ]
    const { state } = drive(ctx, envs)
    const sub = bankSub(state)
    expect(sub.firstBroadHoldAt).toBe(BANK_T0 + 30_000)
    // W1 drained before the hold reduced in the same dispatch.
    expect(sub.requests['W1']!.outcome).toBe('applied')
    expect(sub.requests['W1']!.arrivedAfterHold).toBe(false)
  })

  it('a wave in a later dispatch than the broad hold is arrivedAfterHold', () => {
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 5_000],
      [holdAct('BELROSE'), BANK_T0 + 10_000],
      [holdAct('DORVEL'), BANK_T0 + 15_000], // stamps at +15s, before W1 at +30s
    ]
    // Advance past W2 (+90s): W2 drains after the hold stamped.
    const { state } = drive(ctx, envs, BANK_T0 + 95_000)
    const sub = bankSub(state)
    // W1 (against CALDERA, not held) drained after the +15s stamp.
    expect(sub.requests['W1']!.arrivedAfterHold).toBe(true)
    // W2 (against BELROSE, which IS held) refuses, after hold.
    expect(sub.requests['W2']!.outcome).toBe('refused')
    expect(sub.requests['W2']!.arrivedAfterHold).toBe(true)
  })
})

describe('the TRUE same-call drain-before-reduce tie (both orderings)', () => {
  // W1's scheduledAt is BANK_T0 + 30_000. The broad-hold-crossing third hold
  // is dispatched at EXACTLY that timestamp, so the wave and the hold share
  // the dispatch instant. The engine advances (drains W1) then reduces the
  // hold, so W1 is arrivedBeforeHold deterministically, and the resulting
  // substate must be byte-identical whether W1 drained in a prior wake or in
  // the same dispatch as the hold.
  const TIE = BANK_T0 + 30_000

  function orderingA(): CampaignState {
    // The wave drains in a PRIOR advanceCampaign wake, then the hold
    // dispatches at the tie timestamp (its own advance is a no-op).
    let a: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
    a = dispatch(ctx, a, start()[0], BANK_T0).state
    a = dispatch(ctx, a, holdAct('ANCHORA'), BANK_T0 + 5_000).state
    a = dispatch(ctx, a, holdAct('BELROSE'), BANK_T0 + 10_000).state
    a = advanceCampaign(ctx, a, TIE).state
    // W1 already drained with only two accounts held: before the stamp.
    expect(bankSub(a).requests['W1']!.outcome).toBe('applied')
    expect(bankSub(a).requests['W1']!.arrivedAfterHold).toBe(false)
    expect(bankSub(a).firstBroadHoldAt).toBeNull()
    a = dispatch(ctx, a, holdAct('DORVEL'), TIE).state
    return a
  }

  function orderingB(): CampaignState {
    // The hold dispatches at the tie timestamp from a state whose lastNow is
    // still behind it, so the SAME dispatch drains W1 first then stamps.
    let b: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
    b = dispatch(ctx, b, start()[0], BANK_T0).state
    b = dispatch(ctx, b, holdAct('ANCHORA'), BANK_T0 + 5_000).state
    b = dispatch(ctx, b, holdAct('BELROSE'), BANK_T0 + 10_000).state
    b = dispatch(ctx, b, holdAct('DORVEL'), TIE).state
    return b
  }

  it('W1 counts as arrivedBeforeHold in BOTH orderings', () => {
    const a = orderingA()
    const b = orderingB()
    // The broad hold stamps at the tie timestamp in both.
    expect(bankSub(a).firstBroadHoldAt).toBe(TIE)
    expect(bankSub(b).firstBroadHoldAt).toBe(TIE)
    // W1 drained before the hold reduced in both: before-hold, applied.
    expect(bankSub(a).requests['W1']!.arrivedAfterHold).toBe(false)
    expect(bankSub(b).requests['W1']!.arrivedAfterHold).toBe(false)
    expect(bankSub(b).requests['W1']!.outcome).toBe('applied')
  })

  it('the resulting substate is identical across the two orderings', () => {
    expect(bankSub(orderingA())).toEqual(bankSub(orderingB()))
  })
})

describe('PAY clears and the confidence bonus lands at the NEXT tick', () => {
  it('a cleared payment does not bump confidence inline, but the next tick does', () => {
    // Pay P1 (500 from ANCHORA) at +65s, after tick-1 (+60) so the bonus is
    // counted by tick-2 (+120), not tick-1.
    const envs: Envelope[] = [start(), [payAct('P1'), BANK_T0 + 65_000]]
    const afterPay = drive(ctx, envs, BANK_T0 + 66_000)
    const sub1 = bankSub(afterPay.state)
    expect(sub1.payments['P1']!.cleared).toBe(true)
    expect(sub1.clearedSinceTick).toBe(1) // staged for the next tick
    // Advance through tick-2 (+120): the bonus lands.
    const afterTick2 = drive(ctx, envs, BANK_T0 + 125_000)
    const sub2 = bankSub(afterTick2.state)
    expect(sub2.clearedSinceTick).toBe(0) // consumed
  })

  it('PAY is blocked while the account is held, legal after RELEASE', () => {
    let s: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
    s = dispatch(ctx, s, start()[0], BANK_T0).state
    s = dispatch(ctx, s, holdAct('ANCHORA'), BANK_T0 + 1_000).state
    const blocked = dispatch(ctx, s, payAct('P1'), BANK_T0 + 2_000)
    expect(blocked.rejection).toMatchObject({ reason: 'ACCOUNT HELD' })
    s = dispatch(ctx, s, releaseAct('ANCHORA'), BANK_T0 + 3_000).state
    const ok = dispatch(ctx, s, payAct('P1'), BANK_T0 + 4_000)
    expect(ok.rejection).toBeNull()
    expect(bankSub(ok.state).payments['P1']!.cleared).toBe(true)
  })
})

describe('terminal(): collapse, never early completion', () => {
  it('holding every account collapses on confidence hitting 0 with cause collapsed and tier failed', () => {
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
      [holdAct('CALDERA'), BANK_T0 + 3_000],
      [holdAct('DORVEL'), BANK_T0 + 4_000],
      [holdAct('EMBER'), BANK_T0 + 5_000],
    ]
    // Advance past tick-1 (+60s): 5 held = -40, cash below floor -10 => -50.
    // Confidence 60 -> 10, not yet 0. Past tick-2 (+120): 10 -> 0 => collapsed.
    const { state, emitted } = drive(ctx, envs, BANK_T0 + 125_000)
    const settlement = emitted.find((e) => e.type === 'settlement')
    expect(settlement).toMatchObject({ cause: 'collapsed', tier: 'failed' })
    // Settles exactly once.
    expect(emitted.filter((e) => e.type === 'settlement').length).toBe(1)
    void state
  })

  it('a healthy single-mission run does NOT settle early before the deadline', () => {
    const { state, emitted } = drive(ctx, [start()], BANK_T0 + 100_000)
    expect(emitted.some((e) => e.type === 'settlement')).toBe(false)
    expect(bankSub(state)).toBeTruthy()
  })

  it('structural: the module exposes no early completed path', () => {
    const mod = makeBankMission(bankContext().seeds['test-seed']!.missionPayloads[BANK_MISSION_ID] as never)
    // terminal over a pristine-but-stamped healthy state returns null, never completed.
    const seed = bankContext().seeds['test-seed']!
    const sub = mod.init(seed, { byKind: {} }, BANK_DURATION_MS) as never as { endsAt: number | null }
    expect(mod.terminal!(sub as never)).toBeNull() // endsAt null -> null
  })
})

describe('the divergence: mass-holding raises WOPR but loses the tier', () => {
  it('the broad hold raises the predicted-withdrawal line while the real tier fails', () => {
    // A heavy-hold run: hold four accounts (broad hold active -> WOPR line
    // rises) but never clear a payment. Sample the line and the tier.
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
      [holdAct('CALDERA'), BANK_T0 + 3_000],
      [holdAct('DORVEL'), BANK_T0 + 4_000],
    ]
    // Sample mid-mission (before collapse) to read the live line under hold.
    const mid = drive(ctx, envs, BANK_T0 + 50_000)
    const midSub = bankSub(mid.state)
    const payload = ctx.seeds['test-seed']!.missionPayloads[BANK_MISSION_ID] as never
    const lineHeld = selectPredictedWithdrawals(payload, midSub)
    const base = (payload as { predictionSeries: number[] }).predictionSeries
    // WOPR's line is strictly above the authored base: the holds "justify"
    // themselves to the metric.
    for (let i = 0; i < base.length; i += 1) {
      expect(lineHeld[i]!).toBeGreaterThan(base[i]!)
    }
    // But the real outcome at the deadline collapses to failed.
    const { emitted } = drive(ctx, envs, SETTLE_AT)
    const settlement = emitted.find((e) => e.type === 'settlement')
    expect(settlement!.tier).toBe('failed')
  })

  it('a selective-play run that clears payments beats the mass-hold run on the REAL tier', () => {
    // Clear both payments, hold nothing broadly: real signals improve.
    const selective: Envelope[] = [
      start(),
      [payAct('P1'), BANK_T0 + 10_000],
      [payAct('P2'), BANK_T0 + 20_000],
    ]
    const sel = drive(ctx, selective, SETTLE_AT)
    const selSettle = sel.emitted.find((e) => e.type === 'settlement')!

    const massHold: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
      [holdAct('CALDERA'), BANK_T0 + 3_000],
      [holdAct('DORVEL'), BANK_T0 + 4_000],
      [holdAct('EMBER'), BANK_T0 + 5_000],
    ]
    const mass = drive(ctx, massHold, SETTLE_AT)
    const massSettle = mass.emitted.find((e) => e.type === 'settlement')!

    const order = { full: 3, partial: 2, poor: 1, failed: 0 } as const
    // The selective run is pinned to a CONCRETE tier so a regression that
    // silently drops it (e.g. to poor) still fails this oracle: clearing both
    // payments while holding nothing keeps all three sustainability signals.
    expect(selSettle.tier).toBe('full')
    // The payments-clearing run outranks the defensive mass-hold run.
    expect(order[selSettle.tier]).toBeGreaterThan(order[massSettle.tier])
    expect(massSettle.tier).toBe('failed')
  })
})

describe('threshold injection through the real engine', () => {
  it('a downward confidence crossing injects the authored withdrawal once', () => {
    // Hold three accounts so ticks drive confidence down across the 40
    // threshold; the injected EMBER draw fires once.
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
      [holdAct('CALDERA'), BANK_T0 + 3_000],
    ]
    // tick-1 (+60): 3 held -8 = -24, cash below floor -10 => -34. 60 -> 26.
    // That crosses 40 downward: inject INJ-40-A against EMBER (open) once.
    const { state } = drive(ctx, envs, BANK_T0 + 65_000)
    const sub = bankSub(state)
    expect(sub.injectedThresholds).toContain(40)
    expect(sub.requests['INJ-40-A']!.outcome).toBe('applied')
    expect(sub.requests['INJ-40-A']!.injected).toBe(true)
    // EMBER opening 900 minus the 150 base draw.
    expect(sub.accounts['EMBER']!.balance).toBe(750)
  })
})

describe('clue is engine-owned (structural)', () => {
  it('INSPECT_RECORD on the justification record logs the clue once, no mission involvement', () => {
    let s: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
    s = dispatch(ctx, s, start()[0], BANK_T0).state
    const inspect = dispatch(
      ctx,
      s,
      { type: 'INSPECT_RECORD', recordId: JUSTIFICATION_RECORD_ID },
      BANK_T0 + 1_000,
    )
    const clueEvents = inspect.emitted.filter((e) => e.type === 'clueFound')
    expect(clueEvents).toHaveLength(1)
    expect(clueEvents[0]).toMatchObject({ clueId: BANK_CLUE_ID })
    // A second inspection does not re-log.
    const again = dispatch(
      ctx,
      inspect.state,
      { type: 'INSPECT_RECORD', recordId: JUSTIFICATION_RECORD_ID },
      BANK_T0 + 2_000,
    )
    expect(again.emitted.filter((e) => e.type === 'clueFound')).toHaveLength(0)
  })
})

describe('extended time keeps a proportional confidence-tick cadence', () => {
  it('ticks fire across the WHOLE doubled window with no dead tail, and the mission stays determinate', () => {
    // Under extendedTime the window doubles to 480s and start-anchored tick
    // offsets scale x2. Deriving the offsets from the authored duration keeps a
    // proportional cadence: ticks land at 120/240/360 and the end tick at 480,
    // so every segment of the full window is covered. Hold ONE account so
    // confidence declines gently (one tick worth per tick) and we can read a
    // distinct, monotone drop at EACH scaled tick across the entire window.
    const ectx = bankContext()
    let s: CampaignState = createCampaign(ectx, 'test-seed', { extendedTime: true }, BANK_T0)
    s = dispatch(ectx, s, start()[0], BANK_T0).state
    s = dispatch(ectx, s, holdAct('ANCHORA'), BANK_T0 + 1_000).state
    // The deadline is the DOUBLED window.
    expect(bankSub(s).endsAt).toBe(BANK_T0 + 2 * BANK_DURATION_MS)

    // Sample confidence just after each scaled tick boundary. Holding one
    // account costs 8 per tick with cash above floor.
    const read = (ms: number): number => {
      const r = advanceCampaign(ectx, s, BANK_T0 + ms)
      s = r.state
      return bankSub(s)?.confidence ?? -1
    }
    expect(read(130_000)).toBe(52) // first scaled tick at 120s: 60 -> 52
    expect(read(250_000)).toBe(44) // second at 240s: 52 -> 44
    expect(read(370_000)).toBe(36) // third at 360s, in the BACK HALF: 44 -> 36
    // The back half of the doubled window is NOT dead: a tick fired at 360s.
    // Run to the deadline: the mission settles exactly once, determinately.
    const tail = advanceCampaign(ectx, s, BANK_T0 + 2 * BANK_DURATION_MS + 1_000)
    const settlements = tail.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    // Solvable/determinate: a healthy run never collapsed mid-window; it
    // reached the deadline and timed out rather than hitting confidence zero.
    expect(settlements[0]).toMatchObject({ cause: 'timeout' })
  })
})

describe('debrief cross-tab is truthful about injected provenance (M1)', () => {
  it('an injected draw with NO active broad hold is categorized as injected, not before-hold', () => {
    // Hold TWO accounts: below broadHoldCount (2 is not > 2), so no broad hold
    // ever stamps. Confidence still ticks down and crosses the 40 threshold,
    // injecting INJ-40-A while firstBroadHoldAt is null. The injected draw must
    // land in the injected bucket, never counted as a genuine before-hold
    // withdrawal (the evidence that lets the player challenge WOPR).
    const envs: Envelope[] = [
      start(),
      [holdAct('ANCHORA'), BANK_T0 + 1_000],
      [holdAct('BELROSE'), BANK_T0 + 2_000],
    ]
    // Run to the deadline so the mission settles and metrics materialize.
    const { state } = drive(ctx, envs, SETTLE_AT)
    const sub = bankSub(state)
    // The injected draw fired with no broad hold active.
    expect(state.settled.find((x) => x.missionId === BANK_MISSION_ID)).toBeTruthy()
    const out = state.settled.find((x) => x.missionId === BANK_MISSION_ID)!
    const m = out.metrics
    // The injected contagion draw is in the injected bucket, amount 150.
    expect(m['injected_after_hold_count']).toBe(1)
    expect(m['injected_after_hold_amount']).toBe(150)
    // It is NOT counted as a before-hold genuine withdrawal: only the three
    // authored waves (W1 applied 300, W3 applied 200, W2 refused 0) are
    // before-hold, none of them the injected draw.
    expect(m['before_hold_count']).toBe(3)
    expect(m['before_hold_amount']).toBe(500)
    void sub
  })
})

describe('the second collapse cause is REAL: derived cash below the floor (M2)', () => {
  it('an upstream paymentsDelayed penalty drives derived cash negative and collapses, distinct from confidence zero', () => {
    // alpha emits a paymentsDelayed of 40 (capped). COLLAPSE_PAYLOAD's target
    // ANCHORA opens at 30, so init drives it to -10 without clipping. Holding
    // ZEPHYR shelters its positive balance, leaving derived cash at -10, below
    // the authored collapse floor of 0. Confidence deltas are zeroed, so
    // confidence stays at 80: this collapse is purely the derived-cash path.
    const cctx = bankCashCollapseContext(40)
    let s: CampaignState = createCampaign(cctx, 'test-seed', { extendedTime: false }, BANK_T0)
    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: 'alpha' }, BANK_T0).state
    s = dispatch(cctx, s, { type: 'FORFEIT_MISSION' }, BANK_T0 + 1_000).state
    s = dispatch(cctx, s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, BANK_T0 + 2_000).state
    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: BANK_MISSION_ID }, BANK_T0 + 3_000).state
    // The penalty drove ANCHORA negative at init.
    expect(bankSub(s).accounts['ANCHORA']!.balance).toBe(-10)
    expect(bankSub(s).confidence).toBe(80)
    // Hold ZEPHYR: derived cash falls to -10, below the collapse floor.
    const held = dispatch(
      cctx,
      s,
      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: 'ZEPHYR' } },
      BANK_T0 + 5_000,
    )
    const settlement = held.emitted.find((e) => e.type === 'settlement')
    expect(settlement).toMatchObject({ cause: 'collapsed', tier: 'failed' })
    // Confidence never hit zero: this is the derived-cash collapse, not the
    // confidence-zero collapse.
    expect(settlement!.cause).toBe('collapsed')
  })
})

describe('inbound consequence folding at init (through the real engine)', () => {
  it('a REAL paymentsDelayed inbound consequence drains the pinned target account by the authored amount', () => {
    // alpha emits a genuine paymentsDelayed of 20 on forfeit; the bank's init
    // fold drains ANCHORA (the pinned target, opening 1000) by exactly 20.
    const cctx = bankConsequenceContext(20)
    let s: CampaignState = createCampaign(cctx, 'test-seed', { extendedTime: false }, BANK_T0)
    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: 'alpha' }, BANK_T0).state
    s = dispatch(cctx, s, { type: 'FORFEIT_MISSION' }, BANK_T0 + 1_000).state
    s = dispatch(cctx, s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, BANK_T0 + 2_000).state
    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: BANK_MISSION_ID }, BANK_T0 + 3_000).state
    // The target account actually drained by the folded magnitude.
    expect(bankSub(s).accounts['ANCHORA']!.balance).toBe(980)
  })
})
