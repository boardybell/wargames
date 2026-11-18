// The CRASH OUTLOOK mission screen. It frames the mission inside the terminal
// shell: a briefing art slot, four views (inbox, message detail, outbox,
// delivery log), the status readouts, a command line, and the action controls.
// It owns no state the engine owns: marks, sends, queue, stage, source checks,
// and inspected records all come from the campaign state via selectors. It
// runs NO local timers; stage warnings and the 30/10 second milestones arrive
// as engine-emitted events, and the falling-tone cue plays off the same stage
// events. Uppercase terminal diction, no em-dashes.
import { useEffect, useRef, useState } from 'react'
import {
  getContext,
  onEngineEvent,
  send,
  useCampaign,
} from '../../state'
import type {
  CampaignState,
  EngineEvent,
  RecordGraph,
  SourceCheckOutcome,
} from '@engine'
import { buildRecordGraph, getRecord } from '@engine'
import type { DeskId } from '@engine/missions/outlook/types'
import {
  registerMissionScreen,
  registerMissionTitle,
  type MissionScreenProps,
} from '../../screens/screenRegistry'
import { registerScreenUiHandler } from '../../screens/screenUiCommands'
import { ArtSlot } from '../../art/ArtSlot'
import { TerminalText, StatusLine } from '../../terminal/TerminalText'
import { announce } from '../../a11y/announce'
import { play } from '../../audio'
import { Countdown } from '../../cabinet/Countdown'
import { InboxView } from './InboxView'
import { MessageView, type SourceCheckView } from './MessageView'
import { OutboxView } from './OutboxView'
import { DeliveryLogView } from './DeliveryLogView'
import {
  OUTLOOK_DESKS,
  OUTLOOK_SCREEN_ID,
  asOutlookUiCommand,
  registerOutlookVerbs,
} from './verbs'
import { registerOutlookGlossary } from './glossary'
import {
  outlookModule,
  outlookPayload,
  outlookSubstate,
  primaryEtaSeconds,
  stageLabel,
} from './selectors'
import { useNarrowViewport } from '../../grid'

const OUTLOOK = 'outlook'
const MISSION_TITLE = 'CRASH OUTLOOK'

const BRIEFING = [
  'CRASH OUTLOOK',
  '',
  'THREE REQUIRED MESSAGES MUST REACH THEIR DESKS BEFORE THE DEADLINE.',
  'THE PRIMARY LINK DEGRADES ON A CLOCK YOU DO NOT CONTROL.',
  'READ, VERIFY, ROUTE. HOLD AND VERIFY BEFORE YOU SEND.',
].join('\n')

type View = 'inbox' | 'outbox' | 'log'

/** Format a record's seconds-of-day receiptTime as HH:MM:SS. The record clock
 *  is a whole-seconds integer in [0, 86400); this reads it verbatim, never
 *  fabricating a monotonic clock from a row ordinal. */
function formatReceiptClock(secondsOfDay: number): string {
  const s = ((secondsOfDay % 86400) + 86400) % 86400
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':')
}

/** A stable identity for a send record, independent of its position in the
 *  array. Used to dedupe the ack announcement so a reordering never re-reads a
 *  receipt or silences a new one. */
function sendIdentity(record: {
  messageId: string
  channel: string
  recipient: string | null
  sentAt: number
}): string {
  return `${record.messageId}|${record.channel}|${record.recipient ?? 'NONE'}|${record.sentAt}`
}

/** The warning-line and cue lookup, built from the active payload. The engine
 *  emits scheduledEventFired / timerMilestone with id + kind only, so the
 *  screen recovers the authored warning copy and cue id by event id, the same
 *  way audio/warnings.ts maps milestone ids to cues. */
function buildEventCopy(state: CampaignState): Map<
  string,
  { warningLine: string; cueId: string; isStage: boolean }
> {
  const payload = outlookPayload(state)
  const map = new Map<string, { warningLine: string; cueId: string; isStage: boolean }>()
  if (!payload) return map
  payload.stageChanges.forEach((change, index) => {
    map.set(`outlook-stage-${index + 1}`, {
      warningLine: change.warningLine,
      cueId: change.cueId,
      isStage: true,
    })
  })
  payload.warningOffsets.forEach((warning, index) => {
    map.set(`outlook-warn-${index}`, {
      warningLine: warning.warningLine,
      cueId: warning.cueId,
      isStage: false,
    })
  })
  return map
}

export function OutlookScreen({ missionId }: MissionScreenProps) {
  const state = useCampaign()
  const narrow = useNarrowViewport()
  const [view, setView] = useState<View>('inbox')
  const [selected, setSelected] = useState<string | null>(null)
  // The desk the player chose for the open message, and the per-queue-index
  // choices for the outbox. Both default to null: nothing auto-routes to the
  // authored answer; the player must choose a desk, right or wrong.
  const [messageDesk, setMessageDesk] = useState<DeskId | null>(null)
  const [outboxDesks, setOutboxDesks] = useState<Record<number, DeskId | null>>({})

  const payload = outlookPayload(state)
  const substate = outlookSubstate(state)
  const module = outlookModule()
  const graphRef = useRef<RecordGraph | null>(null)
  if (graphRef.current === null) {
    const seed = getContext().seeds[state.seedName]
    graphRef.current = buildRecordGraph(seed?.records ?? [])
  }
  const graph = graphRef.current

  // Clear the message desk choice when the open message changes, so a desk
  // picked for one message never leaks into the next.
  useEffect(() => {
    setMessageDesk(null)
  }, [selected])

  // Register the mission verbs, the view-command handler, and the local
  // glossary on mount; the verbs and the handler unregister on unmount. The
  // glossary registration is idempotent.
  const selectedRef = useRef<string | null>(selected)
  selectedRef.current = selected
  useEffect(() => {
    registerOutlookGlossary()
    const unregister = registerOutlookVerbs({
      selectedMessageId: () => selectedRef.current,
    })
    // The single shared command line routes a typed INBOX/OUTBOX/LOG/BACK here
    // as a mission-scoped SCREEN command, which switches the screen's own view
    // state (never an engine action).
    const unregisterUi = registerScreenUiHandler(OUTLOOK_SCREEN_ID, (detail) => {
      const ui = asOutlookUiCommand(detail)
      if (!ui) return
      if (ui.kind === 'BACK') setSelected(null)
      else setView(ui.view)
    })
    return () => {
      unregister()
      unregisterUi()
    }
  }, [])

  // Subscribe to engine events: stage changes announce + play the falling
  // tone; the 30/10 second milestones announce. Nothing here reads a clock.
  const copyRef = useRef(buildEventCopy(state))
  copyRef.current = buildEventCopy(state)
  useEffect(() => {
    return onEngineEvent((event: EngineEvent) => {
      if (event.type === 'scheduledEventFired' && event.kind === 'outlookStage') {
        const copy = copyRef.current.get(event.id)
        if (copy) {
          announce(copy.warningLine, 'polite')
          play(copy.cueId)
        }
        return
      }
      if (event.type === 'timerMilestone') {
        const copy = copyRef.current.get(event.id)
        if (copy) announce(copy.warningLine, 'polite')
      }
    })
  }, [])

  // Announce delivery acknowledgments as sends fold from pending to
  // acknowledged. The fold is driven by engine scheduled events; this diff
  // only surfaces the state transition to the polite region.
  const ackedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const sends = substate?.sends ?? []
    for (const record of sends) {
      if (record.resolution !== 'acknowledged') continue
      const id = sendIdentity(record)
      if (ackedRef.current.has(id)) continue
      ackedRef.current.add(id)
      announce(
        `DELIVERY RECEIPT: ${record.recipient ?? 'NO DESK'} ACKNOWLEDGED.`,
        'polite',
      )
    }
  }, [substate])

  const onOpen = (messageId: string): void => {
    setSelected(messageId)
    // Opening a message dispatches READ (first read of the audit message fires
    // the engine clue; the view does nothing extra).
    send({ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } })
  }

  const message = selected
    ? payload?.messages.find((m) => m.id === selected) ?? null
    : null

  // The source-check view for the open message, derived from campaign state:
  // a queued desk reply with no resolved check is pending; a resolved check
  // renders the engine-owned outcome. The screen never computes the outcome.
  const sourceCheck: SourceCheckView | null = (() => {
    if (!message || message.recordId === null) return null
    const recordId = message.recordId
    const resolved = state.sourceChecks.find((c) => c.recordId === recordId)
    if (resolved) {
      const seed = getContext().seeds[state.seedName]
      const desk = seed?.deskChecks.find((d) => d.recordId === recordId)
      return {
        pending: false,
        outcome: resolved.outcome as SourceCheckOutcome,
        arrivedAfterSettlement: resolved.arrivedAfterSettlement,
        replyLines: desk?.replyBody ?? [],
      }
    }
    const pending = state.campaignQueue.some((e) => e.id === `desk-${recordId}`)
    if (pending) {
      return {
        pending: true,
        outcome: null,
        arrivedAfterSettlement: false,
        replyLines: [],
      }
    }
    return null
  })()

  const traced =
    message?.recordId !== null &&
    message?.recordId !== undefined &&
    state.inspectedRecords.includes(message.recordId)

  const stage = substate?.primaryStage ?? 0
  const backupRemaining =
    substate?.backupRemaining ?? payload?.channelTuning.backupCapacity ?? 0
  const primaryEta = payload ? primaryEtaSeconds(payload, stage) : null

  // The record-sourced receipt clock for a message: the real receiptTime from
  // the evidence graph, formatted HH:MM:SS. A message with no record (a decoy)
  // returns null and the inbox shows a neutral placeholder.
  const receiptTimeFor = (messageId: string): string | null => {
    const m = payload?.messages.find((x) => x.id === messageId)
    if (!m || m.recordId === null) return null
    const record = getRecord(graph, m.recordId)
    return record ? formatReceiptClock(record.receiptTime) : null
  }

  const chosenDeskFor = (index: number): DeskId | null =>
    outboxDesks[index] ?? null

  const onChooseOutboxDesk = (index: number, desk: DeskId | null): void => {
    setOutboxDesks((prev) => ({ ...prev, [index]: desk }))
  }

  const deadline = state.activeMission?.endsAt ?? null

  const showDetail = message !== null
  const showList = !narrow || !showDetail
  const pane = narrow ? 'single' : 'two'

  if (!payload) {
    return (
      <div
        data-testid="outlook-screen"
        data-mission-id={missionId}
        data-view={view}
        data-pane={pane}
      >
        <TerminalText dim>CRASH OUTLOOK STANDING BY.</TerminalText>
      </div>
    )
  }

  return (
    <div
      data-testid="outlook-screen"
      data-mission-id={missionId}
      data-view={view}
      data-pane={pane}
    >
      <ArtSlot id="briefing-outlook" />
      <TerminalText dim>{BRIEFING}</TerminalText>

      <StatusLine>
        {`PRIMARY ${stageLabel(stage)}  BACKUP ${backupRemaining}  ETA ${
          primaryEta === null ? 'DARK' : `${primaryEta}S`
        }`}
      </StatusLine>

      {/* The visible deadline: a role=timer countdown driven by the display
          clock (remainingFor + subscribeTick). Milestone readouts still come
          from engine timerMilestone events, not this display. */}
      {deadline !== null ? (
        <div className="outlook-countdown" data-testid="outlook-countdown">
          <Countdown endsAt={deadline} />
        </div>
      ) : null}

      <div className="outlook-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="outlook-tab-inbox"
          aria-selected={view === 'inbox'}
          onClick={() => {
            setView('inbox')
            setSelected(null)
          }}
        >
          INBOX
        </button>
        <button
          type="button"
          role="tab"
          data-testid="outlook-tab-outbox"
          aria-selected={view === 'outbox'}
          onClick={() => setView('outbox')}
        >
          OUTBOX
        </button>
        <button
          type="button"
          role="tab"
          data-testid="outlook-tab-log"
          aria-selected={view === 'log'}
          onClick={() => setView('log')}
        >
          LOG
        </button>
      </div>

      <div className="outlook-body">
        {view === 'inbox' && showList ? (
          <InboxView
            payload={payload}
            substate={substate}
            onOpen={onOpen}
            receiptTimeFor={receiptTimeFor}
          />
        ) : null}
        {view === 'inbox' && showDetail && message ? (
          <MessageView
            message={message}
            substate={substate}
            module={module}
            graph={graph}
            traced={traced}
            sourceCheck={sourceCheck}
            onBack={() => setSelected(null)}
            desks={OUTLOOK_DESKS}
            chosenDesk={messageDesk}
            onChooseDesk={setMessageDesk}
          />
        ) : null}
        {view === 'outbox' ? (
          <OutboxView
            payload={payload}
            substate={substate}
            desks={OUTLOOK_DESKS}
            chosenDeskFor={chosenDeskFor}
            onChooseDesk={onChooseOutboxDesk}
          />
        ) : null}
        {view === 'log' ? <DeliveryLogView substate={substate} /> : null}
      </div>
    </div>
  )
}

/** Register the screen under mission id outlook, plus its title. Idempotent
 *  enough for tests: the screen registry overwrites a prior registration. */
export function registerOutlookScreen(): void {
  registerMissionScreen(OUTLOOK, OutlookScreen)
  registerMissionTitle(OUTLOOK, MISSION_TITLE)
  // The local glossary is a registration-time fact, like the screen itself,
  // so the terms resolve even before the screen first mounts. Idempotent.
  registerOutlookGlossary()
}
