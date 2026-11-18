diff --git a/src/app/missions/outlook/DeliveryLogView.tsx b/src/app/missions/outlook/DeliveryLogView.tsx
new file mode 100644
index 0000000..934c83a
--- /dev/null
+++ b/src/app/missions/outlook/DeliveryLogView.tsx
@@ -0,0 +1,47 @@
+// The delivery log: a chronological render over the send records in mission
+// state. Each row shows the dispatch time, channel, recipient, and the
+// acknowledgment state (receipt time, PENDING, or REJECTED with reason). Pure
+// render, no engine calls. DELIVERY RECEIPT carries its glossary term.
+// Uppercase terminal diction, no em-dashes.
+import type { OutlookState } from '@engine/missions/outlook/types'
+import { TerminalText } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+
+export interface DeliveryLogViewProps {
+  readonly substate: OutlookState | null
+}
+
+function ackLabel(resolution: string, scheduledAckAt: number): string {
+  if (resolution === 'acknowledged') return `RECEIPT ${scheduledAckAt}`
+  if (resolution === 'rejected') return 'REJECTED'
+  return 'PENDING'
+}
+
+export function DeliveryLogView({ substate }: DeliveryLogViewProps) {
+  const sends = substate?.sends ?? []
+
+  return (
+    <div data-testid="delivery-log">
+      <div className="delivery-log-head">
+        <GlossaryTerm id="outlook-delivery-receipt" /> LOG
+      </div>
+      {sends.length === 0 ? (
+        <TerminalText dim>NO SENDS DISPATCHED.</TerminalText>
+      ) : (
+        sends.map((record, index) => (
+          <div key={index} data-testid={`log-row-${index}`}>
+            <TerminalText>
+              {[
+                `${index}.`,
+                `SENT ${record.sentAt}`,
+                record.channel.toUpperCase(),
+                record.recipient ?? 'NO DESK',
+                ackLabel(record.resolution, record.scheduledAckAt),
+              ].join('  ')}
+            </TerminalText>
+          </div>
+        ))
+      )}
+    </div>
+  )
+}
diff --git a/src/app/missions/outlook/InboxView.tsx b/src/app/missions/outlook/InboxView.tsx
new file mode 100644
index 0000000..bc61a5a
--- /dev/null
+++ b/src/app/missions/outlook/InboxView.tsx
@@ -0,0 +1,57 @@
+// The inbox list: one row per authored message, showing the sender authority
+// line, subject, receipt time, and the flag mark. Selection opens the message
+// detail. Bodies are never shown here; read/flag marks come from the mission
+// substate, authored subject/from come from the seed payload. Uppercase
+// terminal diction, no em-dashes.
+import type { OutlookState } from '@engine/missions/outlook/types'
+import type { OutlookPayload } from '@engine/missions/outlook/content'
+import { MenuRows, type MenuRowItem } from '../../terminal/MenuRows'
+
+export interface InboxViewProps {
+  readonly payload: OutlookPayload
+  readonly substate: OutlookState | null
+  readonly onOpen: (messageId: string) => void
+}
+
+/** A stable per-message receipt-time string. The payload carries no receipt
+ *  clock of its own; the row index stands in as the arrival order so the list
+ *  reads as a timestamped manifest. */
+function receiptLabel(index: number): string {
+  const minute = 14 + index
+  return `21:${String(minute).padStart(2, '0')}:05`
+}
+
+export function InboxView({ payload, substate, onOpen }: InboxViewProps) {
+  const rows: MenuRowItem[] = payload.messages.map((message) => {
+    const mark = substate?.messages[message.id]
+    const flag = mark?.flagged ? '[F] ' : '    '
+    const read = mark?.read ? ' ' : '*'
+    return {
+      id: message.id,
+      label: `${read}${flag}${message.from}  ${message.subject}`,
+    }
+  })
+
+  return (
+    <div data-testid="inbox-view">
+      <MenuRows rows={rows} onSelect={onOpen} />
+      <div className="inbox-manifest">
+        {payload.messages.map((message, index) => {
+          const mark = substate?.messages[message.id]
+          return (
+            <div
+              key={message.id}
+              data-testid={`inbox-row-${message.id}`}
+              data-flagged={mark?.flagged ? 'true' : 'false'}
+              data-read={mark?.read ? 'true' : 'false'}
+            >
+              {`${receiptLabel(index)}  ${message.from}  ${message.subject}${
+                mark?.flagged ? '  FLAGGED' : ''
+              }`}
+            </div>
+          )
+        })}
+      </div>
+    </div>
+  )
+}
diff --git a/src/app/missions/outlook/MessageView.tsx b/src/app/missions/outlook/MessageView.tsx
new file mode 100644
index 0000000..526d8a3
--- /dev/null
+++ b/src/app/missions/outlook/MessageView.tsx
@@ -0,0 +1,198 @@
+// The message detail pane: authored body lines, then the action controls.
+// Opening a message dispatches READ (the engine emits the audit clue on the
+// first read of the audit message; the view does nothing extra). Actions go
+// through the shared ActionBar with inline disabled reasons pulled from the
+// engine validator, so an illegal SEND reads as unavailable with cause stated
+// before any attempt. TRACE renders the record through the shared record
+// detail with OBSERVED/EXERCISE/DERIVED glossary terms; CHECK SOURCE renders a
+// pending line then the resolved reply from the emitted event. Uppercase
+// terminal diction, no em-dashes.
+import type { OutlookMessage, OutlookState } from '@engine/missions/outlook/types'
+import type { MissionModule, RecordGraph, SourceCheckOutcome } from '@engine'
+import { trace } from '@engine'
+import { TerminalText, DetailPane } from '../../terminal/TerminalText'
+import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import {
+  makeReadAction,
+  makeFlagAction,
+  makeQueueAction,
+  makeSendAction,
+  makeTraceAction,
+  makeCheckSourceAction,
+} from './verbs'
+
+export interface SourceCheckView {
+  readonly pending: boolean
+  readonly outcome: SourceCheckOutcome | null
+  readonly arrivedAfterSettlement: boolean
+  readonly replyLines: readonly string[]
+}
+
+export interface MessageViewProps {
+  readonly message: OutlookMessage
+  readonly substate: OutlookState | null
+  readonly module: MissionModule<OutlookState>
+  readonly graph: RecordGraph
+  /** True once the player TRACEd this record and the detail is open. */
+  readonly traced: boolean
+  readonly sourceCheck: SourceCheckView | null
+  readonly onBack: () => void
+}
+
+function disabledFor(
+  module: MissionModule<OutlookState>,
+  substate: OutlookState | null,
+  action: { readonly payload: unknown },
+): { disabled: boolean; reason?: string } {
+  if (!substate) return { disabled: false }
+  const verdict = module.validate(substate, action.payload)
+  return verdict.valid
+    ? { disabled: false }
+    : { disabled: true, reason: verdict.reason }
+}
+
+function originGlossary(origin: 'OBSERVED' | 'EXERCISE' | 'DERIVED') {
+  const id = origin.toLowerCase()
+  return <GlossaryTerm id={id} />
+}
+
+export function MessageView({
+  message,
+  substate,
+  module,
+  graph,
+  traced,
+  sourceCheck,
+  onBack,
+}: MessageViewProps) {
+  const recipient = message.correctRecipient
+  const readAction = makeReadAction(message.id)
+  const flagAction = makeFlagAction(message.id)
+  const queuePrimary = makeQueueAction(message.id, 'primary')
+  const queueBackup = makeQueueAction(message.id, 'backup')
+  const sendPrimary = makeSendAction(message.id, 'primary', recipient)
+  const sendBackup = makeSendAction(message.id, 'backup', recipient)
+
+  const sendPrimaryState = disabledFor(module, substate, sendPrimary)
+  const sendBackupState = disabledFor(module, substate, sendBackup)
+
+  const actions: ActionBarItem[] = [
+    { label: 'READ', action: readAction },
+    { label: 'FLAG', action: flagAction },
+    { label: 'QUEUE PRIMARY', action: queuePrimary, testId: 'action-QUEUE PRIMARY' },
+    { label: 'QUEUE BACKUP', action: queueBackup, testId: 'action-QUEUE BACKUP' },
+    {
+      label: 'SEND',
+      action: sendPrimary,
+      testId: 'action-SEND',
+      disabled: sendPrimaryState.disabled,
+      disabledReason: sendPrimaryState.reason,
+    },
+    {
+      label: 'SEND BACKUP',
+      action: sendBackup,
+      testId: 'action-SEND-backup',
+      disabled: sendBackupState.disabled,
+      disabledReason: sendBackupState.reason,
+    },
+  ]
+  if (message.recordId !== null) {
+    actions.push({
+      label: 'TRACE',
+      action: makeTraceAction(message.recordId),
+      testId: 'action-TRACE',
+    })
+    actions.push({
+      label: 'CHECK SOURCE',
+      action: makeCheckSourceAction(message.recordId),
+      testId: 'action-CHECK SOURCE',
+    })
+  }
+
+  const traceResult =
+    traced && message.recordId !== null ? trace(graph, message.recordId) : null
+
+  return (
+    <DetailPane>
+      <div data-testid="message-view" data-message-id={message.id}>
+        <TerminalText>
+          {[
+            `FROM: ${message.from}`,
+            `TO: ${message.to ?? 'UNROUTED'}`,
+            `SUBJECT: ${message.subject}`,
+            '',
+            ...message.body,
+          ].join('\n')}
+        </TerminalText>
+        {message.requiredKind === 'audit' ? (
+          <div className="message-note">
+            THIS CARRIES AN <GlossaryTerm id="outlook-exercise-bulletin" />.
+          </div>
+        ) : null}
+
+        <ActionBar actions={actions} />
+
+        {traceResult && traceResult.found ? (
+          <div
+            data-testid="record-detail"
+            data-record-id={traceResult.recordId}
+          >
+            <TerminalText dim>
+              {[
+                `RECORD ${traceResult.recordId}`,
+                `ORIGIN ${traceResult.origin}`,
+                `RUN ${traceResult.runId ?? 'NONE'}`,
+                `EVENT ${traceResult.eventTime}`,
+                `RECEIPT ${traceResult.receiptTime}`,
+              ].join('\n')}
+            </TerminalText>
+            <div className="record-origin">
+              ORIGIN: {originGlossary(traceResult.origin)}
+            </div>
+            {traceResult.parent ? (
+              <div className="record-parent">
+                PARENT {traceResult.parent.id} ORIGIN{' '}
+                {originGlossary(traceResult.parent.origin)}
+              </div>
+            ) : null}
+          </div>
+        ) : null}
+
+        {sourceCheck ? (
+          sourceCheck.pending ? (
+            <div data-testid="source-check-pending">
+              <TerminalText dim>SOURCE CHECK PENDING. DESK NOTIFIED.</TerminalText>
+            </div>
+          ) : sourceCheck.outcome ? (
+            <div
+              data-testid="source-check-result"
+              data-outcome={sourceCheck.outcome}
+            >
+              <TerminalText>
+                {[
+                  `SOURCE CHECK: ${sourceCheck.outcome}`,
+                  sourceCheck.outcome === 'CONTRADICTED'
+                    ? 'MARKER: >> CONTRADICTED BY DESK <<'
+                    : sourceCheck.outcome === 'CONFIRMED'
+                      ? 'MARKER: ++ CONFIRMED BY DESK ++'
+                      : `MARKER: .. ${sourceCheck.outcome} ..`,
+                  ...sourceCheck.replyLines,
+                  sourceCheck.arrivedAfterSettlement
+                    ? 'NOTE: REPLY ARRIVED AFTER SETTLEMENT.'
+                    : '',
+                ]
+                  .filter((l) => l.length > 0)
+                  .join('\n')}
+              </TerminalText>
+            </div>
+          ) : null
+        ) : null}
+
+        <button type="button" data-testid="message-back" onClick={onBack}>
+          BACK
+        </button>
+      </div>
+    </DetailPane>
+  )
+}
diff --git a/src/app/missions/outlook/OutboxView.tsx b/src/app/missions/outlook/OutboxView.tsx
new file mode 100644
index 0000000..103d160
--- /dev/null
+++ b/src/app/missions/outlook/OutboxView.tsx
@@ -0,0 +1,79 @@
+// The outbox: queue contents and the channel readouts. Each queued item shows
+// its message, target channel, and position; a SEND dispatches the engine
+// SEND_QUEUED action. A rejection (dark primary) renders its reason and the
+// item stays queued, matching the engine contract. ETA figures come from the
+// authored tuning through selectors, never computed locally. CHANNEL,
+// CAPACITY, and ETA carry their glossary terms. Uppercase terminal diction, no
+// em-dashes.
+import type { OutlookState } from '@engine/missions/outlook/types'
+import type { OutlookPayload } from '@engine/missions/outlook/content'
+import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
+import { TerminalText } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import { makeSendQueuedAction } from './verbs'
+import {
+  backupEtaSeconds,
+  primaryEtaSeconds,
+  stageLabel,
+} from './selectors'
+
+export interface OutboxViewProps {
+  readonly payload: OutlookPayload
+  readonly substate: OutlookState | null
+  /** The recipient the player picked for a queued item, by position. The
+   *  screen records it at queue time; defaulted to the message's correct
+   *  recipient so a keyboard SEND still routes somewhere sane. */
+  readonly recipientFor: (index: number) => OutlookState['sends'][number]['recipient']
+}
+
+export function OutboxView({ payload, substate, recipientFor }: OutboxViewProps) {
+  const stage = substate?.primaryStage ?? 0
+  const primaryEta = primaryEtaSeconds(payload, stage)
+  const backupEta = backupEtaSeconds(payload)
+  const backupRemaining = substate?.backupRemaining ?? payload.channelTuning.backupCapacity
+  const queue = substate?.queue ?? []
+
+  return (
+    <div data-testid="outbox-view">
+      <div className="outbox-readouts" data-testid="outbox-readouts">
+        <div data-testid="outbox-primary-stage">
+          PRIMARY <GlossaryTerm id="outlook-channel" />: {stageLabel(stage)}{' '}
+          <GlossaryTerm id="outlook-eta" />{' '}
+          {primaryEta === null ? 'DARK' : `${primaryEta}S`}
+        </div>
+        <div data-testid="outbox-backup-remaining">
+          BACKUP <GlossaryTerm id="outlook-capacity" />: {backupRemaining}{' '}
+          <GlossaryTerm id="outlook-eta" /> {backupEta}S
+        </div>
+      </div>
+
+      {queue.length === 0 ? (
+        <TerminalText dim>QUEUE EMPTY.</TerminalText>
+      ) : (
+        <div className="outbox-queue">
+          {queue.map((item, index) => {
+            const recipient = recipientFor(index)
+            const sendAction = makeSendQueuedAction(index, recipient)
+            const actions: ActionBarItem[] = [
+              {
+                label: `SEND ${index}`,
+                action: sendAction,
+                testId: `outbox-send-${index}`,
+              },
+            ]
+            return (
+              <div key={index} data-testid={`outbox-row-${index}`}>
+                <TerminalText>
+                  {`${index}. ${item.messageId}  ${item.channel.toUpperCase()}  ${
+                    recipient ?? 'NO DESK'
+                  }`}
+                </TerminalText>
+                <ActionBar actions={actions} />
+              </div>
+            )
+          })}
+        </div>
+      )}
+    </div>
+  )
+}
diff --git a/src/app/missions/outlook/OutlookScreen.tsx b/src/app/missions/outlook/OutlookScreen.tsx
new file mode 100644
index 0000000..8632ec0
--- /dev/null
+++ b/src/app/missions/outlook/OutlookScreen.tsx
@@ -0,0 +1,368 @@
+// The CRASH OUTLOOK mission screen. It frames the mission inside the terminal
+// shell: a briefing art slot, four views (inbox, message detail, outbox,
+// delivery log), the status readouts, a command line, and the action controls.
+// It owns no state the engine owns: marks, sends, queue, stage, source checks,
+// and inspected records all come from the campaign state via selectors. It
+// runs NO local timers; stage warnings and the 30/10 second milestones arrive
+// as engine-emitted events, and the falling-tone cue plays off the same stage
+// events. Uppercase terminal diction, no em-dashes.
+import { useEffect, useRef, useState } from 'react'
+import {
+  getContext,
+  onEngineEvent,
+  send,
+  useCampaign,
+} from '../../state'
+import type { CampaignState, EngineEvent, RecordGraph, SourceCheckOutcome } from '@engine'
+import { buildRecordGraph } from '@engine'
+import {
+  registerMissionScreen,
+  registerMissionTitle,
+  type MissionScreenProps,
+} from '../../screens/screenRegistry'
+import { parseCommand, normalizeCommand } from '../../terminal/commandGrammar'
+import { ArtSlot } from '../../art/ArtSlot'
+import { TerminalText, StatusLine } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import { announce } from '../../a11y/announce'
+import { play } from '../../audio'
+import { InboxView } from './InboxView'
+import { MessageView, type SourceCheckView } from './MessageView'
+import { OutboxView } from './OutboxView'
+import { DeliveryLogView } from './DeliveryLogView'
+import {
+  OUTLOOK_SCREEN_ID,
+  registerOutlookVerbs,
+  resolveOutlookUiCommand,
+} from './verbs'
+import { registerOutlookGlossary } from './glossary'
+import {
+  outlookModule,
+  outlookPayload,
+  outlookSubstate,
+  primaryEtaSeconds,
+  stageLabel,
+} from './selectors'
+import { useNarrowViewport } from '../../grid'
+
+const OUTLOOK = 'outlook'
+const MISSION_TITLE = 'CRASH OUTLOOK'
+
+const BRIEFING = [
+  'CRASH OUTLOOK',
+  '',
+  'THREE REQUIRED MESSAGES MUST REACH THEIR DESKS BEFORE THE DEADLINE.',
+  'THE PRIMARY LINK DEGRADES ON A CLOCK YOU DO NOT CONTROL.',
+  'READ, VERIFY, ROUTE. HOLD AND VERIFY BEFORE YOU SEND.',
+].join('\n')
+
+type View = 'inbox' | 'outbox' | 'log'
+
+/** The warning-line and cue lookup, built from the active payload. The engine
+ *  emits scheduledEventFired / timerMilestone with id + kind only, so the
+ *  screen recovers the authored warning copy and cue id by event id, the same
+ *  way audio/warnings.ts maps milestone ids to cues. */
+function buildEventCopy(state: CampaignState): Map<
+  string,
+  { warningLine: string; cueId: string; isStage: boolean }
+> {
+  const payload = outlookPayload(state)
+  const map = new Map<string, { warningLine: string; cueId: string; isStage: boolean }>()
+  if (!payload) return map
+  payload.stageChanges.forEach((change, index) => {
+    map.set(`outlook-stage-${index + 1}`, {
+      warningLine: change.warningLine,
+      cueId: change.cueId,
+      isStage: true,
+    })
+  })
+  payload.warningOffsets.forEach((warning, index) => {
+    map.set(`outlook-warn-${index}`, {
+      warningLine: warning.warningLine,
+      cueId: warning.cueId,
+      isStage: false,
+    })
+  })
+  return map
+}
+
+export function OutlookScreen({ missionId }: MissionScreenProps) {
+  const state = useCampaign()
+  const narrow = useNarrowViewport()
+  const [view, setView] = useState<View>('inbox')
+  const [selected, setSelected] = useState<string | null>(null)
+  const [commandLines, setCommandLines] = useState<readonly string[]>([])
+
+  const payload = outlookPayload(state)
+  const substate = outlookSubstate(state)
+  const module = outlookModule()
+  const graphRef = useRef<RecordGraph | null>(null)
+  if (graphRef.current === null) {
+    const seed = getContext().seeds[state.seedName]
+    graphRef.current = buildRecordGraph(seed?.records ?? [])
+  }
+  const graph = graphRef.current
+
+  // Register the mission verbs and the local glossary on mount; the verbs
+  // unregister on unmount. The glossary registration is idempotent.
+  const selectedRef = useRef<string | null>(selected)
+  selectedRef.current = selected
+  useEffect(() => {
+    registerOutlookGlossary()
+    const unregister = registerOutlookVerbs({
+      selectedMessageId: () => selectedRef.current,
+    })
+    return unregister
+  }, [])
+
+  // Subscribe to engine events: stage changes announce + play the falling
+  // tone; the 30/10 second milestones announce. Nothing here reads a clock.
+  const copyRef = useRef(buildEventCopy(state))
+  copyRef.current = buildEventCopy(state)
+  useEffect(() => {
+    return onEngineEvent((event: EngineEvent) => {
+      if (event.type === 'scheduledEventFired' && event.kind === 'outlookStage') {
+        const copy = copyRef.current.get(event.id)
+        if (copy) {
+          announce(copy.warningLine, 'polite')
+          play(copy.cueId)
+        }
+        return
+      }
+      if (event.type === 'timerMilestone') {
+        const copy = copyRef.current.get(event.id)
+        if (copy) announce(copy.warningLine, 'polite')
+      }
+    })
+  }, [])
+
+  // Announce delivery acknowledgments as sends fold from pending to
+  // acknowledged. The fold is driven by engine scheduled events; this diff
+  // only surfaces the state transition to the polite region.
+  const ackedRef = useRef<Set<number>>(new Set())
+  useEffect(() => {
+    const sends = substate?.sends ?? []
+    sends.forEach((record, index) => {
+      if (record.resolution === 'acknowledged' && !ackedRef.current.has(index)) {
+        ackedRef.current.add(index)
+        announce(
+          `DELIVERY RECEIPT: ${record.recipient ?? 'NO DESK'} ACKNOWLEDGED.`,
+          'polite',
+        )
+      }
+    })
+  }, [substate])
+
+  const onOpen = (messageId: string): void => {
+    setSelected(messageId)
+    // Opening a message dispatches READ (first read of the audit message fires
+    // the engine clue; the view does nothing extra).
+    send({ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } })
+  }
+
+  const onCommand = (raw: string): void => {
+    const tokens = normalizeCommand(raw)
+    const ui = resolveOutlookUiCommand(tokens)
+    if (ui) {
+      if (ui.kind === 'BACK') setSelected(null)
+      else setView(ui.view)
+      return
+    }
+    const result = parseCommand(raw, OUTLOOK_SCREEN_ID)
+    if (result.kind === 'error') {
+      setCommandLines((prev) => [...prev, result.message])
+      return
+    }
+    if (result.kind === 'action') {
+      const sent = send(result.action)
+      if (sent.rejected) {
+        setCommandLines((prev) => [...prev, `INVALID: ${sent.reason}`])
+      }
+    }
+  }
+
+  const message = selected
+    ? payload?.messages.find((m) => m.id === selected) ?? null
+    : null
+
+  // The source-check view for the open message, derived from campaign state:
+  // a queued desk reply with no resolved check is pending; a resolved check
+  // renders the engine-owned outcome. The screen never computes the outcome.
+  const sourceCheck: SourceCheckView | null = (() => {
+    if (!message || message.recordId === null) return null
+    const recordId = message.recordId
+    const resolved = state.sourceChecks.find((c) => c.recordId === recordId)
+    if (resolved) {
+      const seed = getContext().seeds[state.seedName]
+      const desk = seed?.deskChecks.find((d) => d.recordId === recordId)
+      return {
+        pending: false,
+        outcome: resolved.outcome as SourceCheckOutcome,
+        arrivedAfterSettlement: resolved.arrivedAfterSettlement,
+        replyLines: desk?.replyBody ?? [],
+      }
+    }
+    const pending = state.campaignQueue.some((e) => e.id === `desk-${recordId}`)
+    if (pending) {
+      return {
+        pending: true,
+        outcome: null,
+        arrivedAfterSettlement: false,
+        replyLines: [],
+      }
+    }
+    return null
+  })()
+
+  const traced =
+    message?.recordId !== null &&
+    message?.recordId !== undefined &&
+    state.inspectedRecords.includes(message.recordId)
+
+  const stage = substate?.primaryStage ?? 0
+  const backupRemaining =
+    substate?.backupRemaining ?? payload?.channelTuning.backupCapacity ?? 0
+  const primaryEta = payload ? primaryEtaSeconds(payload, stage) : null
+
+  const recipientFor = (index: number) => {
+    const queued = substate?.queue[index]
+    if (!queued) return null
+    const queuedMessage = payload?.messages.find((m) => m.id === queued.messageId)
+    return queuedMessage?.correctRecipient ?? null
+  }
+
+  const showDetail = message !== null
+  const showList = !narrow || !showDetail
+  const pane = narrow ? 'single' : 'two'
+
+  if (!payload) {
+    return (
+      <div
+        data-testid="outlook-screen"
+        data-mission-id={missionId}
+        data-view={view}
+        data-pane={pane}
+      >
+        <TerminalText dim>CRASH OUTLOOK STANDING BY.</TerminalText>
+      </div>
+    )
+  }
+
+  return (
+    <div
+      data-testid="outlook-screen"
+      data-mission-id={missionId}
+      data-view={view}
+      data-pane={pane}
+    >
+      <ArtSlot id="briefing-outlook" />
+      <TerminalText dim>{BRIEFING}</TerminalText>
+
+      <StatusLine>
+        {`PRIMARY ${stageLabel(stage)}  BACKUP ${backupRemaining}  ETA ${
+          primaryEta === null ? 'DARK' : `${primaryEta}S`
+        }`}
+      </StatusLine>
+
+      <div className="outlook-tabs" role="tablist">
+        <button
+          type="button"
+          role="tab"
+          data-testid="outlook-tab-inbox"
+          aria-selected={view === 'inbox'}
+          onClick={() => {
+            setView('inbox')
+            setSelected(null)
+          }}
+        >
+          INBOX
+        </button>
+        <button
+          type="button"
+          role="tab"
+          data-testid="outlook-tab-outbox"
+          aria-selected={view === 'outbox'}
+          onClick={() => setView('outbox')}
+        >
+          OUTBOX
+        </button>
+        <button
+          type="button"
+          role="tab"
+          data-testid="outlook-tab-log"
+          aria-selected={view === 'log'}
+          onClick={() => setView('log')}
+        >
+          LOG
+        </button>
+      </div>
+
+      <div className="outlook-body">
+        {view === 'inbox' && showList ? (
+          <InboxView payload={payload} substate={substate} onOpen={onOpen} />
+        ) : null}
+        {view === 'inbox' && showDetail && message ? (
+          <MessageView
+            message={message}
+            substate={substate}
+            module={module}
+            graph={graph}
+            traced={traced}
+            sourceCheck={sourceCheck}
+            onBack={() => setSelected(null)}
+          />
+        ) : null}
+        {view === 'outbox' ? (
+          <OutboxView
+            payload={payload}
+            substate={substate}
+            recipientFor={recipientFor}
+          />
+        ) : null}
+        {view === 'log' ? <DeliveryLogView substate={substate} /> : null}
+      </div>
+
+      <form
+        data-testid="command-form"
+        className="outlook-command"
+        onSubmit={(e) => {
+          e.preventDefault()
+          const input = e.currentTarget.elements.namedItem(
+            'outlook-command',
+          ) as HTMLInputElement | null
+          if (input) {
+            onCommand(input.value)
+            input.value = ''
+          }
+        }}
+      >
+        <label className="outlook-command-label">
+          <GlossaryTerm id="check-source" />
+          <input
+            type="text"
+            name="outlook-command"
+            data-testid="command-input"
+            aria-label="command input"
+            autoComplete="off"
+            spellCheck={false}
+          />
+        </label>
+        <div data-testid="command-output" className="command-output">
+          {commandLines.map((line, index) => (
+            <div key={index}>{line}</div>
+          ))}
+        </div>
+      </form>
+    </div>
+  )
+}
+
+/** Register the screen under mission id outlook, plus its title. Idempotent
+ *  enough for tests: the screen registry overwrites a prior registration. */
+export function registerOutlookScreen(): void {
+  registerMissionScreen(OUTLOOK, OutlookScreen)
+  registerMissionTitle(OUTLOOK, MISSION_TITLE)
+  // The local glossary is a registration-time fact, like the screen itself,
+  // so the terms resolve even before the screen first mounts. Idempotent.
+  registerOutlookGlossary()
+}
diff --git a/src/app/missions/outlook/glossary.ts b/src/app/missions/outlook/glossary.ts
new file mode 100644
index 0000000..5273e4f
--- /dev/null
+++ b/src/app/missions/outlook/glossary.ts
@@ -0,0 +1,58 @@
+// The five local CRASH OUTLOOK glossary terms. OBSERVED, EXERCISE, and
+// DERIVED are GLOBAL (registered by the shell) and must not be re-registered
+// here. Definitions are plain language for a smart layperson; rendered labels
+// are uppercase terminal diction with no em-dashes. Registration is idempotent
+// so a screen remount never trips the duplicate-id guard.
+import {
+  hasGlossaryEntry,
+  registerGlossaryTerms,
+  type GlossaryEntry,
+} from '../../a11y/glossary'
+
+export const OUTLOOK_LOCAL_GLOSSARY_IDS = [
+  'outlook-channel',
+  'outlook-capacity',
+  'outlook-eta',
+  'outlook-delivery-receipt',
+  'outlook-exercise-bulletin',
+] as const
+
+const ENTRIES: readonly GlossaryEntry[] = [
+  {
+    id: 'outlook-channel',
+    term: 'CHANNEL',
+    definition:
+      'The line a message travels on. The primary line is fast but goes dark under load. The backup line stays up but holds only a handful of sends.',
+  },
+  {
+    id: 'outlook-capacity',
+    term: 'CAPACITY',
+    definition:
+      'How many sends a channel can still carry. The backup line has a hard limit; once it is spent, nothing more goes out on it.',
+  },
+  {
+    id: 'outlook-eta',
+    term: 'ETA',
+    definition:
+      'Estimated time of arrival: how long until a dispatched message is acknowledged on the far end. It rises as the primary line degrades.',
+  },
+  {
+    id: 'outlook-delivery-receipt',
+    term: 'DELIVERY RECEIPT',
+    definition:
+      'The far end confirming it received a message. Until the receipt lands, a send is only in flight, not delivered.',
+  },
+  {
+    id: 'outlook-exercise-bulletin',
+    term: 'EXERCISE BULLETIN',
+    definition:
+      'A notice generated inside a drill, not a real event. It can read like the real thing, which is the whole trap of the exercise.',
+  },
+]
+
+/** Register the five local terms, once. Idempotent across remounts: already
+ *  present ids are skipped so the duplicate-id guard never throws. */
+export function registerOutlookGlossary(): void {
+  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
+  if (fresh.length > 0) registerGlossaryTerms(fresh)
+}
diff --git a/src/app/missions/outlook/selectors.ts b/src/app/missions/outlook/selectors.ts
new file mode 100644
index 0000000..24381e2
--- /dev/null
+++ b/src/app/missions/outlook/selectors.ts
@@ -0,0 +1,53 @@
+// Read-only selectors over the active campaign for the CRASH OUTLOOK screen.
+// Authored message truth (bodies, subjects, sender lines) lives in the
+// immutable seed payload; marks and send records live in the mission
+// substate. These pull both from the running context and state so the views
+// render whatever payload is active, never a hardcoded one.
+import type { CampaignState } from '@engine'
+import { getContext } from '../../state'
+import type { OutlookPayload } from '@engine/missions/outlook/content'
+import type { OutlookState } from '@engine/missions/outlook/types'
+import type { MissionModule } from '@engine'
+
+const OUTLOOK = 'outlook'
+
+/** The immutable authored payload for the active outlook mission. */
+export function outlookPayload(state: CampaignState): OutlookPayload {
+  const seed = getContext().seeds[state.seedName]
+  return seed?.missionPayloads[OUTLOOK] as OutlookPayload
+}
+
+/** The live outlook substate, or null before the mission starts. */
+export function outlookSubstate(state: CampaignState): OutlookState | null {
+  if (state.activeMission?.missionId !== OUTLOOK) return null
+  return (state.activeMission.substate as OutlookState) ?? null
+}
+
+/** The outlook mission module from the context: its validate() is the single
+ *  source of truth for whether an action is currently legal. */
+export function outlookModule(): MissionModule<OutlookState> {
+  return getContext().missions[OUTLOOK] as MissionModule<OutlookState>
+}
+
+export type StageLabel = 'FULL' | 'SLOWED' | 'DARK'
+
+export function stageLabel(stage: number): StageLabel {
+  if (stage === 2) return 'DARK'
+  if (stage === 1) return 'SLOWED'
+  return 'FULL'
+}
+
+/** The current primary ETA in whole seconds, or null when the primary is
+ *  dark. Read from the authored tuning, never computed locally. */
+export function primaryEtaSeconds(
+  payload: OutlookPayload,
+  stage: number,
+): number | null {
+  if (stage === 2) return null
+  const index = stage === 1 ? 1 : 0
+  return payload.channelTuning.primaryEtaSeconds[index]
+}
+
+export function backupEtaSeconds(payload: OutlookPayload): number {
+  return payload.channelTuning.backupEtaSeconds
+}
diff --git a/src/app/missions/outlook/verbs.ts b/src/app/missions/outlook/verbs.ts
new file mode 100644
index 0000000..571b0e2
--- /dev/null
+++ b/src/app/missions/outlook/verbs.ts
@@ -0,0 +1,216 @@
+// The CRASH OUTLOOK verb grammar and the shared action builders. Every
+// ActionBar button and every typed command routes through the SAME builder,
+// so the command-button identity tests hold by construction: a parsed READ
+// strict-equals the action the READ button dispatches, and so on for FLAG,
+// QUEUE, SEND, TRACE, CHECK SOURCE. Diction is uppercase terminal; no
+// em-dashes. The engine validator is the single source of truth for what is
+// currently legal; these builders only shape actions, never judge them.
+import type { CampaignAction } from '@engine'
+import {
+  registerScreenVerbs,
+  unregisterScreenVerbs,
+  type ParseResult,
+  type VerbRegistration,
+} from '../../terminal'
+import type { Channel, DeskId } from '@engine/missions/outlook/types'
+
+export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>
+
+/** The six view and list commands the screen also registers, so a typed
+ *  INBOX / OUTBOX / LOG switches the view and BACK returns to the list. */
+export type OutlookUiCommand =
+  | { readonly kind: 'VIEW'; readonly view: 'inbox' | 'outbox' | 'log' }
+  | { readonly kind: 'BACK' }
+
+export function makeReadAction(messageId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
+}
+
+export function makeFlagAction(messageId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'FLAG', messageId } }
+}
+
+export function makeQueueAction(
+  messageId: string,
+  channel: Channel,
+): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'QUEUE', messageId, channel } }
+}
+
+export function makeSendAction(
+  messageId: string,
+  channel: Channel,
+  recipient: DeskId | null,
+): MissionAction {
+  return {
+    type: 'MISSION_ACTION',
+    payload: { kind: 'SEND', messageId, channel, recipient },
+  }
+}
+
+export function makeSendQueuedAction(
+  index: number,
+  recipient: DeskId | null,
+): MissionAction {
+  return {
+    type: 'MISSION_ACTION',
+    payload: { kind: 'SEND_QUEUED', index, recipient },
+  }
+}
+
+export function makeTraceAction(recordId: string): CampaignAction {
+  return { type: 'INSPECT_RECORD', recordId }
+}
+
+export function makeCheckSourceAction(recordId: string): CampaignAction {
+  return { type: 'REQUEST_SOURCE_CHECK', recordId }
+}
+
+function parseChannel(token: string | undefined): Channel | null {
+  if (token === 'PRIMARY') return 'primary'
+  if (token === 'BACKUP') return 'backup'
+  return null
+}
+
+const DESKS: readonly DeskId[] = ['WEATHER_DESK', 'PAYROLL_DESK', 'AUDIT_DESK']
+
+function parseDesk(token: string | undefined): DeskId | null {
+  return token && (DESKS as readonly string[]).includes(token)
+    ? (token as DeskId)
+    : null
+}
+
+function err(message: string): ParseResult {
+  return { kind: 'error', message }
+}
+
+function action(a: CampaignAction): ParseResult {
+  return { kind: 'action', action: a }
+}
+
+/** The side channel a parsed outlook UI command rides on. parseCommand only
+ *  yields engine actions or shell ui commands, so the screen reparses view
+ *  commands itself via resolveOutlookUiCommand before handing to the grammar. */
+export function resolveOutlookUiCommand(
+  tokens: readonly string[],
+): OutlookUiCommand | null {
+  const verb = tokens[0]
+  if (verb === 'INBOX') return { kind: 'VIEW', view: 'inbox' }
+  if (verb === 'OUTBOX') return { kind: 'VIEW', view: 'outbox' }
+  if (verb === 'LOG') return { kind: 'VIEW', view: 'log' }
+  if (verb === 'BACK') return { kind: 'BACK' }
+  return null
+}
+
+export interface OutlookVerbContext {
+  /** The currently selected message id, for commands that omit it. */
+  readonly selectedMessageId: () => string | null
+}
+
+/** The verbs that dispatch engine actions. View commands (INBOX/OUTBOX/LOG/
+ *  BACK) are handled by the screen directly so they can mutate view state,
+ *  not the engine; they still register as verbs so HELP lists them and the
+ *  parser recognizes them (yielding a harmless CLOSE_OVERLAY-free ui). */
+export function buildOutlookVerbs(
+  ctx: OutlookVerbContext,
+): readonly VerbRegistration[] {
+  const requireMessage = (explicit: string | undefined): string | null =>
+    explicit ?? ctx.selectedMessageId()
+
+  return [
+    {
+      verb: 'READ',
+      helpText: 'READ <ID>      mark a message read and open it',
+      parse: (tokens) => {
+        const id = requireMessage(tokens[0])
+        return id ? action(makeReadAction(id)) : err('NO MESSAGE SELECTED')
+      },
+    },
+    {
+      verb: 'FLAG',
+      helpText: 'FLAG <ID>      toggle the flag mark on a message',
+      parse: (tokens) => {
+        const id = requireMessage(tokens[0])
+        return id ? action(makeFlagAction(id)) : err('NO MESSAGE SELECTED')
+      },
+    },
+    {
+      verb: 'QUEUE',
+      helpText: 'QUEUE <ID> <PRIMARY|BACKUP>   park a message for a channel',
+      parse: (tokens) => {
+        const id = requireMessage(tokens[0])
+        const channel = parseChannel(tokens[1])
+        if (!id) return err('NO MESSAGE SELECTED')
+        if (!channel) return err('NO CHANNEL SELECTED')
+        return action(makeQueueAction(id, channel))
+      },
+    },
+    {
+      verb: 'SEND',
+      helpText:
+        'SEND <ID> <PRIMARY|BACKUP> <DESK>  or  SEND <INDEX> <DESK>  dispatch',
+      parse: (tokens) => {
+        // Queued send form: SEND <index> <desk>.
+        const asIndex = Number(tokens[0])
+        if (tokens[0] !== undefined && Number.isInteger(asIndex)) {
+          const recipient = parseDesk(tokens[1])
+          return action(makeSendQueuedAction(asIndex, recipient))
+        }
+        // Direct send form: SEND <id> <channel> <desk>.
+        const id = requireMessage(tokens[0])
+        const channel = parseChannel(tokens[1])
+        if (!id) return err('NO MESSAGE SELECTED')
+        if (!channel) return err('NO CHANNEL SELECTED')
+        const recipient = parseDesk(tokens[2])
+        return action(makeSendAction(id, channel, recipient))
+      },
+    },
+    {
+      verb: 'TRACE',
+      helpText: 'TRACE <RECORD> inspect the record behind a message',
+      parse: (tokens) => {
+        const recordId = tokens[0]
+        return recordId ? action(makeTraceAction(recordId)) : err('NO RECORD')
+      },
+    },
+    {
+      verb: 'CHECK',
+      helpText: 'CHECK SOURCE <RECORD>  ask the desk to verify a record',
+      parse: (tokens) => {
+        if (tokens[0] !== 'SOURCE') return err('UNRECOGNIZED COMMAND')
+        const recordId = tokens[1]
+        return recordId
+          ? action(makeCheckSourceAction(recordId))
+          : err('NO RECORD')
+      },
+    },
+    {
+      verb: 'INBOX',
+      helpText: 'INBOX          show the inbox list',
+      parse: () => ({ kind: 'ui', command: { kind: 'CLOSE_OVERLAY' } }),
+    },
+    {
+      verb: 'OUTBOX',
+      helpText: 'OUTBOX         show the outbox queue',
+      parse: () => ({ kind: 'ui', command: { kind: 'CLOSE_OVERLAY' } }),
+    },
+    {
+      verb: 'LOG',
+      helpText: 'LOG            show the delivery log',
+      parse: () => ({ kind: 'ui', command: { kind: 'CLOSE_OVERLAY' } }),
+    },
+    {
+      verb: 'BACK',
+      helpText: 'BACK           return to the inbox list',
+      parse: () => ({ kind: 'ui', command: { kind: 'CLOSE_OVERLAY' } }),
+    },
+  ]
+}
+
+export const OUTLOOK_SCREEN_ID = 'mission:outlook'
+
+/** Register the outlook verbs for the screen scope; returns an unregister. */
+export function registerOutlookVerbs(ctx: OutlookVerbContext): () => void {
+  registerScreenVerbs(OUTLOOK_SCREEN_ID, buildOutlookVerbs(ctx))
+  return () => unregisterScreenVerbs(OUTLOOK_SCREEN_ID)
+}
diff --git a/src/app/state/index.ts b/src/app/state/index.ts
index 4294b29..f750652 100644
--- a/src/app/state/index.ts
+++ b/src/app/state/index.ts
@@ -13,7 +13,7 @@ import {
 import { registerMultiTab } from './multiTab'
 import { mountAudio } from '../audio/mount'
 
-export { useCampaign, getMissionOrder, getState } from './store'
+export { useCampaign, getMissionOrder, getState, getContext } from './store'
 export { send, type SendResult } from './send'
 export { wake } from './wake'
 export { onEngineEvent, type EngineEventConsumer, type Unsubscribe } from './events'
diff --git a/src/app/terminal/ActionBar.tsx b/src/app/terminal/ActionBar.tsx
index 0e141e3..25dc2b9 100644
--- a/src/app/terminal/ActionBar.tsx
+++ b/src/app/terminal/ActionBar.tsx
@@ -1,5 +1,8 @@
 // Buttons that dispatch engine actions through send(), rendering the engine's
-// rejection reason inline next to the control (never a toast or dialog).
+// rejection reason inline next to the control (never a toast or dialog). An
+// item may also arrive already disabled with a reason the caller computed from
+// the engine validator: that reason renders inline BEFORE any attempt, next to
+// the control, so an invalid move reads as unavailable with cause stated.
 import { useState } from 'react'
 import { send } from '../state'
 import type { CampaignAction } from '@engine'
@@ -9,6 +12,10 @@ export interface ActionBarItem {
   readonly label: string
   readonly action: CampaignAction
   readonly testId?: string
+  /** When true the button is disabled and its reason renders inline. The
+   *  reason comes from the engine validator, never duplicated client logic. */
+  readonly disabled?: boolean
+  readonly disabledReason?: string
 }
 
 export function ActionBar({ actions }: { readonly actions: readonly ActionBarItem[] }) {
@@ -21,16 +28,30 @@ export function ActionBar({ actions }: { readonly actions: readonly ActionBarIte
 
   return (
     <div className="action-bar" data-testid="action-bar">
-      {actions.map((item) => (
-        <button
-          key={item.label}
-          type="button"
-          data-testid={item.testId ?? `action-${item.label}`}
-          onClick={() => run(item.action)}
-        >
-          {item.label}
-        </button>
-      ))}
+      {actions.map((item) => {
+        const testId = item.testId ?? `action-${item.label}`
+        return (
+          <span key={item.label} className="action-bar-item">
+            <button
+              type="button"
+              data-testid={testId}
+              data-action={JSON.stringify(item.action)}
+              disabled={item.disabled === true}
+              onClick={() => run(item.action)}
+            >
+              {item.label}
+            </button>
+            {item.disabled === true && item.disabledReason ? (
+              <span
+                className="action-disabled-reason"
+                data-testid={`${testId}-reason`}
+              >
+                {item.disabledReason}
+              </span>
+            ) : null}
+          </span>
+        )
+      })}
       {rejection !== null && (
         <span
           className="action-rejection"
diff --git a/src/app/terminal/commandGrammar.ts b/src/app/terminal/commandGrammar.ts
index d544c35..4a83467 100644
--- a/src/app/terminal/commandGrammar.ts
+++ b/src/app/terminal/commandGrammar.ts
@@ -59,6 +59,13 @@ export function registerScreenVerbs(
   screenVerbs.set(screenId, scope)
 }
 
+/** Drop a screen's verb scope. A screen calls this on unmount so a later
+ *  remount can re-register the same verbs without a duplicate-registration
+ *  throw. Unknown screen ids are a no-op. */
+export function unregisterScreenVerbs(screenId: string): void {
+  screenVerbs.delete(screenId)
+}
+
 /** Active-screen verbs shadow shell verbs. */
 export function resolveVerb(
   verb: string,
diff --git a/src/app/terminal/index.ts b/src/app/terminal/index.ts
index bc88996..c405f55 100644
--- a/src/app/terminal/index.ts
+++ b/src/app/terminal/index.ts
@@ -7,6 +7,7 @@ export {
   normalizeCommand,
   registerShellVerb,
   registerScreenVerbs,
+  unregisterScreenVerbs,
   resolveVerb,
   verbsForScreen,
   type VerbRegistration,
diff --git a/test/app/missions/outlook/actions.test.tsx b/test/app/missions/outlook/actions.test.tsx
new file mode 100644
index 0000000..aece9f2
--- /dev/null
+++ b/test/app/missions/outlook/actions.test.tsx
@@ -0,0 +1,148 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { parseCommand } from '@app/terminal'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import {
+  makeReadAction,
+  makeFlagAction,
+  makeQueueAction,
+  makeSendAction,
+  makeTraceAction,
+  makeCheckSourceAction,
+} from '@app/missions/outlook/verbs'
+import { makeOutlookCtx } from './fixture'
+import { getContext } from '@app/state'
+
+let teardown: () => void
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+beforeEach(() => {
+  resetAll()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+const SCREEN = 'mission:outlook'
+
+function parsedAction(command: string): unknown {
+  const result = parseCommand(command, SCREEN)
+  expect(result.kind).toBe('action')
+  return result.kind === 'action' ? result.action : null
+}
+
+describe('OutlookScreen command-button identity', () => {
+  it('each verb parses to the exact same action object the ActionBar button dispatches', () => {
+    // Mounting the screen registers the mission verbs into the grammar.
+    render(<OutlookScreen missionId="outlook" />)
+    expect(parsedAction('READ M01')).toEqual(makeReadAction('M01'))
+    expect(parsedAction('FLAG M01')).toEqual(makeFlagAction('M01'))
+    expect(parsedAction('QUEUE M01 PRIMARY')).toEqual(makeQueueAction('M01', 'primary'))
+    expect(parsedAction('QUEUE M01 BACKUP')).toEqual(makeQueueAction('M01', 'backup'))
+    expect(parsedAction('SEND M01 PRIMARY WEATHER_DESK')).toEqual(
+      makeSendAction('M01', 'primary', 'WEATHER_DESK'),
+    )
+    expect(parsedAction('TRACE W02')).toEqual(makeTraceAction('W02'))
+    expect(parsedAction('CHECK SOURCE W02')).toEqual(makeCheckSourceAction('W02'))
+  })
+
+  it('the MessageView READ/FLAG/QUEUE/SEND/TRACE/CHECK SOURCE buttons carry the same action identity as their verbs', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    // Pull the module to verify validity-driven enablement below.
+    const module = getContext().missions['outlook']!
+    const substate = getState().activeMission?.substate
+
+    // Each button exposes its action via a data attribute so the identity is
+    // inspectable without firing it.
+    const read = screen.getByTestId('action-READ')
+    expect(JSON.parse(read.getAttribute('data-action')!)).toEqual(makeReadAction('M01'))
+    const flag = screen.getByTestId('action-FLAG')
+    expect(JSON.parse(flag.getAttribute('data-action')!)).toEqual(makeFlagAction('M01'))
+    const send1 = screen.getByTestId('action-SEND')
+    expect(JSON.parse(send1.getAttribute('data-action')!)).toEqual(
+      makeSendAction('M01', 'primary', 'WEATHER_DESK'),
+    )
+    // A valid send is enabled (module validates it on the live substate).
+    expect(module.validate(substate, makeSendAction('M01', 'primary', 'WEATHER_DESK').payload).valid).toBe(true)
+    expect(send1).not.toBeDisabled()
+  })
+
+  it('FLAG toggles the flag mark shown in the inbox list row', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // No flag mark initially.
+    expect(screen.getByTestId('inbox-row-M01')).toHaveAttribute('data-flagged', 'false')
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    fireEvent.click(screen.getByTestId('action-FLAG'))
+    expect(screen.getByTestId('inbox-row-M01')).toHaveAttribute('data-flagged', 'true')
+    // Toggle off.
+    fireEvent.click(screen.getByTestId('action-FLAG'))
+    expect(screen.getByTestId('inbox-row-M01')).toHaveAttribute('data-flagged', 'false')
+  })
+
+  it('an invalid send on a dark primary renders disabled with the engine reason inline, visible before any attempt', () => {
+    // Advance the engine clock past the stage-2 (dark) milestone at 120s by
+    // mocking the wall clock send() samples, then dispatching a harmless READ
+    // (always valid) which advances the campaign and fires the stage events.
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 130_000)
+    act(() => {
+      send(makeReadAction('M04'))
+    })
+    const sub = getState().activeMission?.substate as { primaryStage: number }
+    expect(sub.primaryStage).toBe(2)
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    const sendBtn = screen.getByTestId('action-SEND')
+    expect(sendBtn).toBeDisabled()
+    // The engine rejection reason is rendered inline, verbatim, next to the control.
+    expect(screen.getByTestId('action-SEND-reason')).toHaveTextContent(
+      'PRIMARY LINK DARK. ROUTE OVER BACKUP.',
+    )
+  })
+
+  it('an invalid backup send renders disabled with the exhausted-capacity reason once backupRemaining hits zero', () => {
+    // Drive backupRemaining to zero through five real backup SENDs.
+    act(() => {
+      send(makeSendAction('M05', 'backup', null))
+      send(makeSendAction('M05', 'backup', null))
+      send(makeSendAction('M05', 'backup', null))
+      send(makeSendAction('M05', 'backup', null))
+      send(makeSendAction('M05', 'backup', null))
+    })
+    const sub = getState().activeMission?.substate as { backupRemaining: number }
+    expect(sub.backupRemaining).toBe(0)
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    const backupBtn = screen.getByTestId('action-SEND-backup')
+    expect(backupBtn).toBeDisabled()
+    expect(screen.getByTestId('action-SEND-backup-reason')).toHaveTextContent(
+      'BACKUP CAPACITY EXHAUSTED.',
+    )
+  })
+})
diff --git a/test/app/missions/outlook/fixture.ts b/test/app/missions/outlook/fixture.ts
new file mode 100644
index 0000000..41469fa
--- /dev/null
+++ b/test/app/missions/outlook/fixture.ts
@@ -0,0 +1,195 @@
+// A minimal in-test CRASH OUTLOOK fixture: one message of each
+// requiredKind, one superseded weather duplicate, and one decoy. Not the
+// authored twelve (section 02 writes those); the screens render whatever
+// payload is active, so a handful proves the views. The record graph and
+// desk-check table mirror the engine fixtures (C17 is the EXERCISE
+// bulletin, W02 the OBSERVED weather correction) so TRACE and CHECK
+// SOURCE have real records and real desk answers to resolve against.
+import type { EngineContext } from '@engine'
+import type { EvidenceRecord } from '@engine'
+import type { SeedDefinition } from '@engine'
+import type { DeskCheckEntry } from '@engine/missions/types'
+import { buildTestContext } from '@engine/testing'
+import {
+  makeOutlookMission,
+  outlookSchedule,
+} from '@engine/missions/outlook/module'
+import type { OutlookPayload } from '@engine/missions/outlook/content'
+
+export const OUTLOOK_DURATION_MS = 240_000
+
+/** The evidence records the fixture messages point at. C17 is the EXERCISE
+ *  bulletin (run R04) the audit message carries; W02 is the OBSERVED
+ *  weather correction; B04 is the DERIVED payroll record. */
+export const OUTLOOK_FIXTURE_RECORDS: EvidenceRecord[] = [
+  {
+    id: 'C17',
+    origin: 'EXERCISE',
+    sourceId: 'D83-EXPORT',
+    parentId: null,
+    runId: 'R04',
+    eventTime: 76440,
+    receiptTime: 76445,
+    subsystem: 'outlook',
+    body: ['PREVIEW GROUNDING ADVISORY PUBLISHED TO ACTIVE FEED'],
+  },
+  {
+    id: 'W02',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-NW',
+    parentId: null,
+    runId: null,
+    eventTime: 76455,
+    receiptTime: 76460,
+    subsystem: 'outlook',
+    body: ['LOCAL WEATHER WARNING: NORTHWEST CORRIDOR ONLY'],
+  },
+  {
+    id: 'B04',
+    origin: 'DERIVED',
+    sourceId: 'BANK-OPS',
+    parentId: 'C17',
+    runId: 'R04',
+    eventTime: 76461,
+    receiptTime: 76470,
+    subsystem: 'outlook',
+    body: ['PAYROLL RUN TOTALS PER FEED'],
+  },
+]
+
+/** The desk-check answers. C17 (the EXERCISE bulletin) comes back
+ *  CONTRADICTED; W02 (the OBSERVED weather correction) comes back
+ *  CONFIRMED. delaySeconds is small so a single advance resolves them. */
+export const OUTLOOK_DESK_CHECKS: DeskCheckEntry[] = [
+  {
+    recordId: 'C17',
+    outcome: 'CONTRADICTED',
+    delaySeconds: 5,
+    replyBody: ['NO INDEPENDENT SOURCE. EXERCISE PROVENANCE ONLY.'],
+  },
+  {
+    recordId: 'W02',
+    outcome: 'CONFIRMED',
+    delaySeconds: 5,
+    replyBody: ['FIELD STATION CORROBORATES. OBSERVED AND INDEPENDENT.'],
+  },
+]
+
+export const OUTLOOK_FIXTURE_PAYLOAD: OutlookPayload = {
+  messages: [
+    {
+      id: 'M01',
+      from: 'NODE 7 WEATHER AUTHORITY',
+      to: 'WEATHER DESK',
+      subject: 'STORM OUTLOOK CORRECTION',
+      body: ['NORTHWEST CORRIDOR ONLY.', 'PRIOR ADVISORY SUPERSEDED.'],
+      recordId: 'W02',
+      requiredKind: 'weather',
+      correctRecipient: 'WEATHER_DESK',
+      supersededBy: null,
+    },
+    {
+      id: 'M02',
+      from: 'NODE 7 WEATHER AUTHORITY',
+      to: 'PAYROLL DESK',
+      subject: 'STORM OUTLOOK REV A',
+      // Authored recipient hint is deliberately misleading on the stale
+      // duplicate; the view renders it verbatim with no correction.
+      body: ['ROUTE THIS COPY TO PAYROLL DESK.', 'STALE REVISION.'],
+      recordId: 'W02',
+      requiredKind: 'weather',
+      correctRecipient: 'WEATHER_DESK',
+      supersededBy: 'M01',
+    },
+    {
+      id: 'M03',
+      from: 'PAY NODE',
+      to: 'PAYROLL DESK',
+      subject: 'PAYROLL RUN',
+      body: ['PAYROLL RUN TOTALS ATTACHED.'],
+      recordId: 'B04',
+      requiredKind: 'payroll',
+      correctRecipient: 'PAYROLL_DESK',
+      supersededBy: null,
+    },
+    {
+      id: 'M04',
+      from: 'AUDIT NODE',
+      to: 'AUDIT DESK',
+      subject: 'AUDIT EXPORT BULLETIN',
+      body: ['EXERCISE BULLETIN PUBLISHED TO ACTIVE FEED.', 'EXPORT FEED R04.'],
+      recordId: 'C17',
+      requiredKind: 'audit',
+      correctRecipient: 'AUDIT_DESK',
+      supersededBy: null,
+    },
+    {
+      id: 'M05',
+      from: 'UNKNOWN',
+      to: null,
+      subject: 'CHAIN LETTER',
+      body: ['DECOY NOISE.', 'NO RECORD ATTACHED.'],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+  ],
+  channelTuning: {
+    backupCapacity: 5,
+    primaryEtaSeconds: [30, 90],
+    backupEtaSeconds: 120,
+  },
+  stageChanges: [
+    {
+      offsetSeconds: 60,
+      warningLine: 'PRIMARY LINK DEGRADING. ACK TIMES RISING.',
+      cueId: 'tone-fall-1',
+    },
+    {
+      offsetSeconds: 120,
+      warningLine: 'PRIMARY LINK DARK. BACKUP REMAINS USABLE TO THE DEADLINE.',
+      cueId: 'tone-fall-2',
+    },
+    {
+      offsetSeconds: 180,
+      warningLine: 'STAGE THREE RESERVED.',
+      cueId: 'tone-fall-3',
+    },
+  ],
+  warningOffsets: [
+    {
+      secondsBeforeEnd: 30,
+      warningLine: 'THIRTY SECONDS TO DEADLINE.',
+      cueId: 'tone-warn-30',
+    },
+    {
+      secondsBeforeEnd: 10,
+      warningLine: 'TEN SECONDS TO DEADLINE.',
+      cueId: 'tone-warn-10',
+    },
+  ],
+  commsDelayedTable: {
+    full: 0,
+    partial: 10,
+    poor: 20,
+    failed: 30,
+  },
+}
+
+/** Build an EngineContext over the fixture payload, records, and desk
+ *  checks, registering only the outlook mission. Mirrors the engine
+ *  module test's buildTestContext usage. */
+export function makeOutlookCtx(): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    records: OUTLOOK_FIXTURE_RECORDS,
+    deskChecks: OUTLOOK_DESK_CHECKS,
+    missionPayloads: { outlook: OUTLOOK_FIXTURE_PAYLOAD },
+    schedules: { outlook: [...outlookSchedule(OUTLOOK_FIXTURE_PAYLOAD)] },
+    missionDurationsMs: { outlook: OUTLOOK_DURATION_MS },
+  }
+  return buildTestContext(OUTLOOK_FIXTURE_RECORDS, overrides, {
+    missions: { outlook: makeOutlookMission(OUTLOOK_FIXTURE_PAYLOAD) },
+    missionOrder: ['outlook'],
+  })
+}
diff --git a/test/app/missions/outlook/glossary.test.tsx b/test/app/missions/outlook/glossary.test.tsx
new file mode 100644
index 0000000..c86b552
--- /dev/null
+++ b/test/app/missions/outlook/glossary.test.tsx
@@ -0,0 +1,102 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { registerDefaultVerbs } from '@app/terminal'
+import { hasGlossaryEntry } from '@app/a11y/glossary'
+import { resetAll } from '../../screens/harness'
+import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import { OUTLOOK_LOCAL_GLOSSARY_IDS } from '@app/missions/outlook/glossary'
+import { makeOutlookCtx } from './fixture'
+
+let teardown: () => void
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+beforeEach(() => {
+  resetAll()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('OutlookScreen glossary', () => {
+  it('registers only the five local terms without collision and does not re-register the global OBSERVED/EXERCISE/DERIVED', () => {
+    // Local terms registered.
+    for (const id of OUTLOOK_LOCAL_GLOSSARY_IDS) {
+      expect(hasGlossaryEntry(id)).toBe(true)
+    }
+    // The global terms are present (registered by the shell, not the mission).
+    expect(hasGlossaryEntry('observed')).toBe(true)
+    expect(hasGlossaryEntry('exercise')).toBe(true)
+    expect(hasGlossaryEntry('derived')).toBe(true)
+    // The local ids must not shadow the global ids.
+    expect(OUTLOOK_LOCAL_GLOSSARY_IDS).not.toContain('observed')
+    expect(OUTLOOK_LOCAL_GLOSSARY_IDS).not.toContain('exercise')
+    expect(OUTLOOK_LOCAL_GLOSSARY_IDS).not.toContain('derived')
+  })
+
+  it('local terms CHANNEL, CAPACITY, ETA open from StatusLine/OutboxView copy', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // The outbox copy carries the CHANNEL / CAPACITY / ETA glossary terms.
+    fireEvent.click(screen.getByTestId('outlook-tab-outbox'))
+    const outbox = screen.getByTestId('outbox-view')
+    const terms = within(outbox).getAllByTestId('glossary-term')
+    const labels = terms.map((t) => t.textContent)
+    expect(labels).toContain('CHANNEL')
+    expect(labels).toContain('CAPACITY')
+    expect(labels).toContain('ETA')
+    // Opening a term reveals its definition popup.
+    const channel = terms.find((t) => t.textContent === 'CHANNEL')!
+    fireEvent.focus(channel)
+    expect(within(outbox).getByTestId('glossary-popup')).toBeInTheDocument()
+  })
+
+  it('DELIVERY RECEIPT opens from the delivery log copy', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('outlook-tab-log'))
+    const log = screen.getByTestId('delivery-log')
+    const labels = within(log).getAllByTestId('glossary-term').map((t) => t.textContent)
+    expect(labels).toContain('DELIVERY RECEIPT')
+  })
+
+  it('EXERCISE BULLETIN opens from the message copy', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M04'))
+    const detail = screen.getByTestId('message-view')
+    const labels = within(detail).getAllByTestId('glossary-term').map((t) => t.textContent)
+    expect(labels).toContain('EXERCISE BULLETIN')
+  })
+
+  it('OBSERVED, EXERCISE, DERIVED open the global entries from within the TRACE result rendering', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // M04 -> C17 is an EXERCISE record; its TRACE detail surfaces the global
+    // EXERCISE term.
+    fireEvent.click(screen.getByTestId('menu-row-M04'))
+    fireEvent.click(screen.getByTestId('action-TRACE'))
+    const detail = screen.getByTestId('record-detail')
+    const labels = within(detail).getAllByTestId('glossary-term').map((t) => t.textContent)
+    expect(labels).toContain('EXERCISE')
+  })
+})
diff --git a/test/app/missions/outlook/navigation.test.tsx b/test/app/missions/outlook/navigation.test.tsx
new file mode 100644
index 0000000..d3a4ec3
--- /dev/null
+++ b/test/app/missions/outlook/navigation.test.tsx
@@ -0,0 +1,126 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, getState, send } from '@app/state'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import { makeOutlookCtx } from './fixture'
+
+let teardown: () => void
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+beforeEach(() => {
+  resetAll()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function typeCommand(text: string): void {
+  const input = screen.getByTestId('command-input') as HTMLInputElement
+  act(() => {
+    fireEvent.change(input, { target: { value: text } })
+    fireEvent.submit(screen.getByTestId('command-form'))
+  })
+}
+
+describe('OutlookScreen navigation', () => {
+  it('registers under mission id outlook', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    expect(screen.getByTestId('outlook-screen')).toBeInTheDocument()
+  })
+
+  it('all four views are reachable: INBOX, OUTBOX, LOG commands switch the view, and detail opens from a list selection', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // Default view is inbox.
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'outbox')
+    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
+
+    typeCommand('LOG')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'log')
+    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
+
+    typeCommand('INBOX')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
+
+    // Message detail opens from inbox list selection.
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    expect(screen.getByTestId('message-view')).toHaveAttribute('data-message-id', 'M01')
+  })
+
+  it('desktop shows persistent tabs for the three list views and renders inbox beside detail (two panes)', () => {
+    setNarrow(false)
+    render(<OutlookScreen missionId="outlook" />)
+    expect(screen.getByTestId('outlook-tab-inbox')).toBeInTheDocument()
+    expect(screen.getByTestId('outlook-tab-outbox')).toBeInTheDocument()
+    expect(screen.getByTestId('outlook-tab-log')).toBeInTheDocument()
+
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    // Desktop: both the inbox list and the detail are present (two panes).
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'two')
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+    expect(screen.getByTestId('message-view')).toBeInTheDocument()
+  })
+
+  it('narrow viewport: single-pane router state, opening a message replaces the list, and a back affordance returns to the list', () => {
+    setNarrow(true)
+    render(<OutlookScreen missionId="outlook" />)
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'single')
+
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    // Single-pane: the detail replaces the list.
+    expect(screen.getByTestId('message-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('inbox-view')).toBeNull()
+
+    fireEvent.click(screen.getByTestId('message-back'))
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('message-view')).toBeNull()
+  })
+
+  it('mobile keyboard-only pass: a full delivery flow via keyboard completes and lands a log entry', () => {
+    setNarrow(true)
+    render(<OutlookScreen missionId="outlook" />)
+    // Navigate the inbox, open a message, QUEUE it, switch to OUTBOX, SEND,
+    // confirm the log entry. All through typed commands (the keyboard path).
+    typeCommand('READ M03')
+    typeCommand('QUEUE M03 PRIMARY')
+    expect(getState().activeMission?.missionId).toBe('outlook')
+
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
+    // The queued item is present.
+    expect(screen.getByTestId('outbox-row-0')).toBeInTheDocument()
+
+    typeCommand('SEND 0 PAYROLL_DESK')
+    typeCommand('LOG')
+    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
+    expect(screen.getByTestId('log-row-0')).toBeInTheDocument()
+  })
+})
diff --git a/test/app/missions/outlook/status-announce.test.tsx b/test/app/missions/outlook/status-announce.test.tsx
new file mode 100644
index 0000000..ea485be
--- /dev/null
+++ b/test/app/missions/outlook/status-announce.test.tsx
@@ -0,0 +1,147 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, render, screen } from '@testing-library/react'
+import { init, send, getState, wake } from '@app/state'
+import { registerDefaultVerbs } from '@app/terminal'
+import { onAnnounce } from '@app/a11y/announce'
+import * as audio from '@app/audio'
+import { resetAll } from '../../screens/harness'
+import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import { makeOutlookCtx } from './fixture'
+import { makeSendAction } from '@app/missions/outlook/verbs'
+
+let teardown: () => void
+let announced: Array<{ text: string; channel: string }>
+let unAnnounce: () => void
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+beforeEach(() => {
+  resetAll()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  announced = []
+  unAnnounce = onAnnounce((text, channel) => announced.push({ text, channel }))
+  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  unAnnounce()
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('OutlookScreen StatusLine', () => {
+  it('shows primary stage, backup remaining, and next ETA from engine-state selectors', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    const status = screen.getByTestId('status-line')
+    expect(status.textContent).toContain('FULL')
+    expect(status.textContent).toContain('5')
+    // Stage-0 primary ETA is 30 seconds.
+    expect(status.textContent).toContain('30')
+  })
+
+  it('backup remaining decrements in the readout after a real SEND', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    act(() => {
+      send(makeSendAction('M05', 'backup', null))
+    })
+    expect(screen.getByTestId('status-line').textContent).toContain('4')
+  })
+
+  it('after a stage milestone fires, the stage readout and primary ETA update', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // Advance past the stage-1 milestone at 60s.
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000)
+    act(() => {
+      wake()
+    })
+    const status = screen.getByTestId('status-line')
+    expect(status.textContent).toContain('SLOWED')
+    // Stage-1 primary ETA is 90 seconds.
+    expect(status.textContent).toContain('90')
+    expect(getState().activeMission?.substate).toBeTruthy()
+  })
+})
+
+describe('OutlookScreen announcements', () => {
+  it('stage-change warning lines surface through the polite live region when the engine emits them', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 130_000)
+    act(() => {
+      wake()
+    })
+    const politeStage1 = announced.find(
+      (a) => a.channel === 'polite' && a.text.includes('ACK TIMES RISING'),
+    )
+    expect(politeStage1).toBeTruthy()
+    // The stage-2 (dark) warning states backup remains usable to the deadline.
+    const politeDark = announced.find(
+      (a) => a.channel === 'polite' && a.text.includes('BACKUP REMAINS USABLE TO THE DEADLINE'),
+    )
+    expect(politeDark).toBeTruthy()
+  })
+
+  it('30 and 10 second warnings announce when the engine milestones fire and ONLY then', () => {
+    vi.useFakeTimers()
+    render(<OutlookScreen missionId="outlook" />)
+    // Advancing jsdom fake timers WITHOUT advancing the engine clock must
+    // produce no warning announcement (no shell timer drives this).
+    act(() => {
+      vi.advanceTimersByTime(60_000)
+    })
+    expect(announced.some((a) => a.text.includes('SECONDS TO DEADLINE'))).toBe(false)
+    vi.useRealTimers()
+
+    // Advancing the engine clock to the warning window fires the milestones.
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 235_000)
+    act(() => {
+      wake()
+    })
+    expect(announced.some((a) => a.text.includes('THIRTY SECONDS TO DEADLINE'))).toBe(true)
+  })
+
+  it('delivery acknowledgments announce through the polite region from emitted events', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // A correct primary send; its ack folds at the stage-1 wake at 60s.
+    act(() => {
+      send(makeSendAction('M03', 'primary', 'PAYROLL_DESK'))
+    })
+    announced.length = 0
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000)
+    act(() => {
+      wake()
+    })
+    expect(
+      announced.some(
+        (a) => a.channel === 'polite' && /ACK|ACKNOWLEDG|DELIVER/.test(a.text),
+      ),
+    ).toBe(true)
+  })
+
+  it('the falling-tone cue hook fires on stage-change events', () => {
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<OutlookScreen missionId="outlook" />)
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 70_000)
+    act(() => {
+      wake()
+    })
+    expect(playSpy).toHaveBeenCalledWith('tone-fall-1')
+  })
+})
diff --git a/test/app/missions/outlook/trace-checksource.test.tsx b/test/app/missions/outlook/trace-checksource.test.tsx
new file mode 100644
index 0000000..91e5c4d
--- /dev/null
+++ b/test/app/missions/outlook/trace-checksource.test.tsx
@@ -0,0 +1,135 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState, wake } from '@app/state'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { OutlookScreen, registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import { makeOutlookCtx } from './fixture'
+
+let teardown: () => void
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+beforeEach(() => {
+  resetAll()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  teardown = init({ ctx: makeOutlookCtx(), seedName: 'test-seed', port: { read: () => null, write: () => {}, remove: () => {} } })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('OutlookScreen TRACE', () => {
+  it('TRACE on a message with a recordId dispatches INSPECT_RECORD and renders the record detail', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // M04 (audit) carries record C17.
+    fireEvent.click(screen.getByTestId('menu-row-M04'))
+    fireEvent.click(screen.getByTestId('action-TRACE'))
+    // The engine recorded the inspection.
+    expect(getState().inspectedRecords).toContain('C17')
+    // The record detail renders through the shared record affordances.
+    const detail = screen.getByTestId('record-detail')
+    expect(detail).toHaveAttribute('data-record-id', 'C17')
+    expect(detail.textContent).toContain('EXERCISE')
+    expect(detail.textContent).toContain('R04')
+  })
+
+  it('a message with no recordId exposes no TRACE control', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M05'))
+    expect(screen.queryByTestId('action-TRACE')).toBeNull()
+  })
+})
+
+describe('OutlookScreen CHECK SOURCE', () => {
+  it('dispatches REQUEST_SOURCE_CHECK, shows a pending state, then renders the resolved result from the emitted event', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M04'))
+    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
+    // Pending until the engine reply fires.
+    expect(screen.getByTestId('source-check-pending')).toBeInTheDocument()
+    expect(screen.queryByTestId('source-check-result')).toBeNull()
+
+    // Advance the clock past the desk delay (5s) and wake so the reply fires.
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10_000)
+    act(() => {
+      wake()
+    })
+    const result = screen.getByTestId('source-check-result')
+    expect(result).toHaveAttribute('data-outcome', 'CONTRADICTED')
+  })
+
+  it('CONTRADICTED on the bulletin and CONFIRMED on the weather correction render distinctly (text or marker, not color alone)', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    // Bulletin (M04 -> C17) resolves CONTRADICTED.
+    fireEvent.click(screen.getByTestId('menu-row-M04'))
+    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10_000)
+    act(() => {
+      wake()
+    })
+    const contradicted = screen.getByTestId('source-check-result')
+    expect(contradicted).toHaveAttribute('data-outcome', 'CONTRADICTED')
+    const contradictedText = contradicted.textContent ?? ''
+    expect(contradictedText).toContain('CONTRADICTED')
+
+    // Weather correction (M01 -> W02) resolves CONFIRMED.
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 20_000)
+    act(() => {
+      wake()
+    })
+    const confirmed = screen.getByTestId('source-check-result')
+    expect(confirmed).toHaveAttribute('data-outcome', 'CONFIRMED')
+    const confirmedText = confirmed.textContent ?? ''
+    expect(confirmedText).toContain('CONFIRMED')
+    // Distinct text, not color alone.
+    expect(confirmedText).not.toEqual(contradictedText)
+  })
+
+  it('a sourceCheckResolved event with arrivedAfterSettlement set still renders without crashing', () => {
+    // Request the check during the mission, forfeit so the mission settles
+    // BEFORE the desk reply lands, then resolve the reply. The engine stamps
+    // arrivedAfterSettlement true.
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M04'))
+    fireEvent.click(screen.getByTestId('action-CHECK SOURCE'))
+    act(() => {
+      send({ type: 'FORFEIT_MISSION' })
+    })
+    // Advance past the desk delay (5s) so the reply resolves after settlement.
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10_000)
+    act(() => {
+      wake()
+    })
+    const check = getState().sourceChecks.find((c) => c.recordId === 'C17')
+    expect(check?.arrivedAfterSettlement).toBe(true)
+  })
+
+  it('a message with no recordId exposes no CHECK SOURCE control', () => {
+    render(<OutlookScreen missionId="outlook" />)
+    fireEvent.click(screen.getByTestId('menu-row-M05'))
+    expect(screen.queryByTestId('action-CHECK SOURCE')).toBeNull()
+  })
+})
