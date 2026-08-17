import { useState } from 'react'
import { Button, InlineConfirm, Toast } from '../../design/primitives'
import { priorAgentsActivationMet, useSimStore, type PendingOverride } from '../../state/store'
import { useSkillTrackingStore } from '../../state/skillTrackingStore'
import { getDrug } from '../../data/formulary'
import { buildOutstandingChartingItems } from '../../engine/documentation'
import { resolveDecisionPoint } from '../../engine/decisionPoints'
import { scoreSession } from '../../engine/scoring'
import { CernerChartingStatus, CernerMAR, InfusionsPanel, type PumpChannelInfo } from '../../devices'
import { DecisionCard } from '../DecisionCard'
import { DoseEntryControl } from '../DoseEntryControl'
import { OrdersReferenceCard } from '../OrdersReferenceCard'
import { StatusStrip } from '../StatusStrip'
import { TitrationVitalsHistory } from '../TitrationVitalsHistory'
import { VerificationPanel } from '../VerificationPanel'
import { OverrideConfirmPanel } from '../OverrideConfirmPanel'
import { PacingOfferPanel } from '../PacingOfferPanel'
import { SubmitConfirmPanel } from '../SubmitConfirmPanel'
import { ProviderNotifyControl } from '../ProviderNotifyControl'
import { BlockOfChartingControl } from '../BlockOfChartingControl'
import { TitrationTimeline } from '../TitrationTimeline'
import type { LogEntry, Order } from '../../state/types'

/**
 * BCMA/I-TRACE verification is a single comprehensive check performed once, when the
 * starting dose is programmed — covering both the bag and the dose together (Begin Bag
 * itself is ungated; see CernerMAR.tsx / store.ts's completeBeginBag). Not required for
 * subsequent titration/restart/discontinue on an infusion that's already hanging and
 * verified (see CLAUDE.md's narrowed verification scope).
 */
type PendingAction = { kind: 'initiate'; orderId: string; dose: number }

interface PendingInfo {
  title: string
  checklist: string[]
}

function buildPendingInfo(pending: PendingAction, orders: Order[]): PendingInfo {
  const order = orders.find((o) => o.id === pending.orderId)
  const drug = order ? getDrug(order.drugId) : null
  return {
    title: `${drug?.name ?? ''} — ${pending.dose} ${drug?.unit ?? ''}`,
    checklist: [
      'Bag label matches the order.',
      'Bag matches what the pump is programmed to infuse.',
      'Dose/rate matches what you intend to program.',
      'Line traced to the patient (I-TRACE).',
    ],
  }
}

function buildOverrideTitle(pending: PendingOverride, orders: Order[]): string {
  const order = orders.find((o) => o.id === pending.orderId)
  const drug = order ? getDrug(order.drugId) : null
  return `${drug?.name ?? ''} — ${pending.dose} ${drug?.unit ?? ''}`
}

/**
 * Which order "Notify provider" should target — whichever order has an outstanding
 * needs-provider or early-notification event (mirrors scoring.ts category 6's
 * satisfied-by-later-notification check, so the button and the scorecard agree on what
 * counts as satisfied), falling back to sequence 1 when nothing is outstanding.
 */
function findOutstandingNotificationOrderId(log: LogEntry[], orders: Order[]): string | undefined {
  const neededEvents = log.filter((e) => e.type === 'action' && (e.outcome === 'needs-provider' || e.earlyNotificationDue))
  const notifications = log.filter((e) => e.isProviderNotification)
  const outstanding = neededEvents.filter(
    (e) => !notifications.some((n) => n.orderId === e.orderId && n.minute >= e.minute),
  )
  const mostRecent = outstanding[outstanding.length - 1]
  return mostRecent?.orderId ?? orders.find((o) => o.sequence === 1)?.id
}

const CLOCK_ADVANCE_OPTIONS = [3, 5, 30]

/**
 * Bedside workspace — Phase 18's "clean workspace" redesign. Real hands-on dose entry
 * (DoseEntryControl) stays the primary, always-available interaction; a contextual
 * "what's your next move" decision card (DecisionCard) is layered on top, triggered by
 * real scenario progress (see state/store.ts's deriveTriggeredDecisionPointId) — not a
 * replacement for free titration. Replaces Phase 17's photorealistic device replicas
 * (PhilipsMonitor/AlarisPump/CernerIView) for THIS screen; those components stay in the
 * codebase, unrouted here, still importable. CernerMAR/InfusionsPanel/
 * CernerChartingStatus/TitrationTimeline are reused as-is — see each file's own doc
 * comment for why they still fit this screen unchanged.
 */
export function Simulation() {
  const setPhase = useSimStore((s) => s.setPhase)
  const scenario = useSimStore((s) => s.scenario)
  const mode = useSimStore((s) => s.mode)
  const clockMinutes = useSimStore((s) => s.clockMinutes)
  const infusions = useSimStore((s) => s.infusions)
  const vitals = useSimStore((s) => s.vitals)
  const orders = useSimStore((s) => s.orders)
  const log = useSimStore((s) => s.log)
  const verificationFlags = useSimStore((s) => s.verificationFlags)
  const adherenceFlags = useSimStore((s) => s.adherenceFlags)
  const blockOfChartingHistory = useSimStore((s) => s.blockOfChartingHistory)
  const vitalsHistory = useSimStore((s) => s.vitalsHistory)
  const feedback = useSimStore((s) => s.feedback)
  const dismissFeedback = useSimStore((s) => s.dismissFeedback)
  const completeBeginBag = useSimStore((s) => s.completeBeginBag)
  const submitDose = useSimStore((s) => s.submitDose)
  const notifyProvider = useSimStore((s) => s.notifyProvider)
  const chartVitals = useSimStore((s) => s.chartVitals)
  const chartRetrospective = useSimStore((s) => s.chartRetrospective)
  const advanceClock = useSimStore((s) => s.advanceClock)
  const pauseInfusion = useSimStore((s) => s.pauseInfusion)
  const restartInfusion = useSimStore((s) => s.restartInfusion)
  const discontinueInfusion = useSimStore((s) => s.discontinueInfusion)
  const activeBlockOfCharting = useSimStore((s) => s.activeBlockOfCharting)
  const declareBlockOfCharting = useSimStore((s) => s.declareBlockOfCharting)
  const closeBlockOfCharting = useSimStore((s) => s.closeBlockOfCharting)
  const pendingOverride = useSimStore((s) => s.pendingOverride)
  const confirmDoseOverride = useSimStore((s) => s.confirmDoseOverride)
  const cancelDoseOverride = useSimStore((s) => s.cancelDoseOverride)
  const pendingDecisionPoint = useSimStore((s) => s.pendingDecisionPoint)
  const chooseDecisionOption = useSimStore((s) => s.chooseDecisionOption)
  const dismissDecisionPoint = useSimStore((s) => s.dismissDecisionPoint)
  const pendingPacingOffer = useSimStore((s) => s.pendingPacingOffer)
  const dismissPacingOffer = useSimStore((s) => s.dismissPacingOffer)
  const runMultiStepTitration = useSimStore((s) => s.runMultiStepTitration)
  const recordAttempt = useSkillTrackingStore((s) => s.recordAttempt)

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [advanceConfirm, setAdvanceConfirm] = useState<{ tick: number; message: string } | null>(null)
  const [chartConfirm, setChartConfirm] = useState<number | null>(null)
  const locked =
    pendingAction !== null || pendingOverride !== null || pendingDecisionPoint !== null || pendingPacingOffer !== null

  function handleAdvanceClock(byMinutes: number) {
    advanceClock(byMinutes)
    setAdvanceConfirm((prev) => ({ tick: (prev?.tick ?? 0) + 1, message: `Advanced to ${clockMinutes + byMinutes} min` }))
  }

  const channels: PumpChannelInfo[] = [...orders]
    .sort((a, b) => a.sequence - b.sequence)
    .map((order) => {
      const infusion = infusions.find((i) => i.orderId === order.id) ?? null
      return {
        channel: infusion?.channel ?? (order.sequence === 1 ? 'A' : 'B'),
        order,
        drug: getDrug(order.drugId),
        infusion,
        isActivated: order.sequence === 1 || priorAgentsActivationMet(infusions, orders, vitals.map, order),
      }
    })

  function handleConfirm() {
    if (!pendingAction) return
    submitDose(pendingAction.orderId, pendingAction.dose)
    setPendingAction(null)
  }

  const outstandingItems = buildOutstandingChartingItems(orders, infusions, log, verificationFlags)
  const decisionPoint = pendingDecisionPoint
    ? resolveDecisionPoint(scenario.decisionPoints ?? [], orders, pendingDecisionPoint.decisionPointId)
    : null
  const primaryOrder = orders.find((o) => o.sequence === 1)

  // Records this run (training or validation) into the skill-tracking store (Phase 15)
  // right before every debrief arrival — a separate store from useSimStore, so a
  // facilitated session's cross-window state broadcast (Phase 10) never overwrites it.
  function recordThisAttempt() {
    const card = scoreSession({ orders, infusions, log, verificationFlags, adherenceFlags, blockOfChartingHistory })
    recordAttempt({ card, scenarioId: scenario.id, scenarioLabel: scenario.admissionReason, mode })
  }

  function handleEndClick() {
    // Soft warning only — never a hard block (documentation cadence is flagged, not
    // blocked, everywhere else in this sim). Fires in validation mode (a graded
    // submission) or whenever something's still outstanding, in either mode.
    if (mode === 'validation' || outstandingItems.length > 0) setShowSubmitConfirm(true)
    else {
      recordThisAttempt()
      setPhase('debrief')
    }
  }

  const pendingInfo = pendingAction ? buildPendingInfo(pendingAction, orders) : null

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Simulation</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Bedside workspace</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Program and titrate exactly as ordered, document per policy, and think through your next move as the case
          advances.
        </p>
      </div>

      {feedback && (
        <Toast tone={feedback.tone} title={feedback.title} onDismiss={dismissFeedback}>
          {feedback.message}
        </Toast>
      )}

      {pendingAction && pendingInfo && (
        <VerificationPanel
          title={pendingInfo.title}
          checklist={pendingInfo.checklist}
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingOverride && (
        <OverrideConfirmPanel
          title={buildOverrideTitle(pendingOverride, orders)}
          reasons={pendingOverride.reasons}
          onOverride={confirmDoseOverride}
          onCancel={cancelDoseOverride}
        />
      )}

      {pendingPacingOffer &&
        (() => {
          const order = orders.find((o) => o.id === pendingPacingOffer.orderId)
          if (!order) return null
          return (
            <PacingOfferPanel
              order={order}
              drug={getDrug(order.drugId)}
              currentDose={pendingPacingOffer.currentDose}
              nextDecisionDose={pendingPacingOffer.nextDecisionDose}
              nextDecisionLabel={pendingPacingOffer.nextDecisionLabel}
              onRunMultiStepTitration={(targetDose) => runMultiStepTitration(order.id, targetDose)}
              onCancel={dismissPacingOffer}
            />
          )
        })()}

      {showSubmitConfirm && (
        <SubmitConfirmPanel
          isGraded={mode === 'validation'}
          outstandingItems={outstandingItems}
          onConfirm={() => {
            setShowSubmitConfirm(false)
            recordThisAttempt()
            setPhase('debrief')
          }}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}

      <StatusStrip clockMinutes={clockMinutes} vitals={vitals} targetLabel={primaryOrder ? `${primaryOrder.target.metric} ≥ ${primaryOrder.target.value} ${primaryOrder.target.unit}` : undefined} />

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-sm">
        <span className="text-sm font-semibold text-ink">Advance time</span>
        <span className="font-mono text-sm text-muted">clock {clockMinutes} min</span>
        <InlineConfirm trigger={advanceConfirm?.tick ?? null} message={advanceConfirm?.message ?? ''} />
        <div className="ml-auto flex gap-2">
          {CLOCK_ADVANCE_OPTIONS.map((m) => (
            <Button key={m} size="sm" variant="secondary" disabled={locked} onClick={() => handleAdvanceClock(m)}>
              +{m} min
            </Button>
          ))}
        </div>
        <p className="basis-full text-xs text-muted">
          Time advances automatically after you start or titrate a dose, by the order's own interval. Use these
          buttons only to wait longer or catch up on documentation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {channels.map((info) => (
          <DoseEntryControl
            key={info.order.id}
            info={info}
            onRequestProgram={(orderId, dose) => setPendingAction({ kind: 'initiate', orderId, dose })}
            onTitrate={(orderId, dose) => submitDose(orderId, dose)}
            onPause={pauseInfusion}
            onRestart={restartInfusion}
            onDiscontinue={discontinueInfusion}
            disabled={locked}
          />
        ))}
      </div>

      {decisionPoint && (
        <DecisionCard
          decisionPoint={decisionPoint}
          mode={mode}
          onChoose={chooseDecisionOption}
          onDecideLater={dismissDecisionPoint}
        />
      )}

      <TitrationVitalsHistory log={log} vitalsHistory={vitalsHistory} />

      <div className="grid gap-gutter md:grid-cols-2">
        <div className="flex flex-col gap-gutter">
          <OrdersReferenceCard orders={orders} />
          <InfusionsPanel infusions={infusions} />
          {scenario.enableBlockOfCharting && (
            <BlockOfChartingControl
              orders={orders}
              infusions={infusions}
              activeBlock={activeBlockOfCharting}
              clockMinutes={clockMinutes}
              disabled={locked}
              onDeclare={declareBlockOfCharting}
              onClose={closeBlockOfCharting}
            />
          )}
          <ProviderNotifyControl
            disabled={locked}
            onNotify={(reason) => {
              const targetOrderId = findOutstandingNotificationOrderId(log, orders)
              if (targetOrderId) notifyProvider(targetOrderId, reason)
            }}
          />
        </div>
        <div className="flex flex-col gap-gutter">
          <CernerMAR infusions={infusions} disabled={locked} onCompleteBeginBag={completeBeginBag} />
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-3 shadow-sm">
            <span className="text-sm font-medium text-ink">Documentation</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={locked}
              onClick={() => {
                chartVitals()
                setChartConfirm((t) => (t ?? 0) + 1)
              }}
            >
              Chart vitals now
            </Button>
            <InlineConfirm trigger={chartConfirm} message="Charted" />
          </div>
          <TitrationTimeline
            log={log}
            vitalsHistory={vitalsHistory}
            orders={orders}
            infusions={infusions}
            disabled={locked}
            onChartRetrospective={chartRetrospective}
          />
          <CernerChartingStatus orders={orders} infusions={infusions} log={log} verificationFlags={verificationFlags} />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setPhase('intro')}>
          Back to intro
        </Button>
        <Button onClick={handleEndClick}>End &amp; go to debrief</Button>
      </div>
    </div>
  )
}
