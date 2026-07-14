import { useState } from 'react'
import { Button, Toast } from '../../design/primitives'
import { priorAgentsActivationMet, useSimStore } from '../../state/store'
import { getDrug } from '../../data/formulary'
import {
  AlarisPump,
  CernerIView,
  CernerMAR,
  InfusionsPanel,
  OrdersProfile,
  PhilipsMonitor,
  type ChartedVitalsEntry,
  type PumpChannelInfo,
} from '../../devices'
import { VerificationPanel } from '../VerificationPanel'
import { ProviderNotifyControl } from '../ProviderNotifyControl'
import type { Infusion, Order } from '../../state/types'

type PendingAction = { kind: 'beginBag'; infusionId: string } | { kind: 'dose'; orderId: string; dose: number }

interface PendingInfo {
  title: string
  checklist: string[]
}

function buildPendingInfo(pending: PendingAction, infusions: Infusion[], orders: Order[]): PendingInfo {
  if (pending.kind === 'beginBag') {
    const infusion = infusions.find((i) => i.id === pending.infusionId)
    const drug = infusion ? getDrug(infusion.drugId) : null
    return {
      title: `Begin Bag — ${drug?.name ?? ''}`,
      checklist: [
        'Bag label matches the order.',
        'Bag matches what the pump is programmed to infuse.',
        'Line traced to the patient (I-TRACE).',
      ],
    }
  }
  const order = orders.find((o) => o.id === pending.orderId)
  const drug = order ? getDrug(order.drugId) : null
  return {
    title: `${drug?.name ?? ''} — ${pending.dose} ${drug?.unit ?? ''}`,
    checklist: [
      'Medication matches the MAR/order (BCMA scan).',
      'Dose/rate matches what you intend to program.',
      'Line traced to the patient (I-TRACE).',
    ],
  }
}

const CLOCK_ADVANCE_OPTIONS = [3, 5, 30]

/**
 * Bedside workspace — Phase 5: the full wired loop. Decision -> BCMA/I-TRACE verification
 * (single-nurse — vasoactives are not high-alert here, see CLAUDE.md) -> dose entry
 * (Guardrails + order checked) -> physiologic response -> documentation at a checkpoint
 * the learner judges themselves (never labeled in the UI) -> inline, non-punitive feedback.
 */
export function Simulation() {
  const setPhase = useSimStore((s) => s.setPhase)
  const scenario = useSimStore((s) => s.scenario)
  const clockMinutes = useSimStore((s) => s.clockMinutes)
  const infusions = useSimStore((s) => s.infusions)
  const vitals = useSimStore((s) => s.vitals)
  const orders = useSimStore((s) => s.orders)
  const log = useSimStore((s) => s.log)
  const feedback = useSimStore((s) => s.feedback)
  const dismissFeedback = useSimStore((s) => s.dismissFeedback)
  const completeBeginBag = useSimStore((s) => s.completeBeginBag)
  const submitDose = useSimStore((s) => s.submitDose)
  const notifyProvider = useSimStore((s) => s.notifyProvider)
  const chartVitals = useSimStore((s) => s.chartVitals)
  const advanceClock = useSimStore((s) => s.advanceClock)

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const locked = pendingAction !== null

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

  const chartedEntries: ChartedVitalsEntry[] = log
    .filter((e) => e.type === 'documentation' && e.location === 'iView' && e.vitalsSnapshot)
    .map((e) => ({ minute: e.minute, vitals: e.vitalsSnapshot! }))

  function handleConfirm() {
    if (!pendingAction) return
    if (pendingAction.kind === 'beginBag') completeBeginBag(pendingAction.infusionId)
    else submitDose(pendingAction.orderId, pendingAction.dose)
    setPendingAction(null)
  }

  const pendingInfo = pendingAction ? buildPendingInfo(pendingAction, infusions, orders) : null

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Simulation</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Bedside workspace</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Faithful device replicas — deliberately separate from the branded shell around them.
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

      <PhilipsMonitor vitals={vitals} />

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-sm">
        <span className="text-sm font-semibold text-ink">Advance time</span>
        <span className="font-mono text-sm text-muted">clock {clockMinutes} min</span>
        <div className="ml-auto flex gap-2">
          {CLOCK_ADVANCE_OPTIONS.map((m) => (
            <Button key={m} size="sm" variant="secondary" disabled={locked} onClick={() => advanceClock(m)}>
              +{m} min
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-gutter lg:grid-cols-2">
        <div className="flex flex-col gap-gutter">
          <AlarisPump
            channels={channels}
            disabled={locked}
            onRequestProgram={(orderId, dose) => setPendingAction({ kind: 'dose', orderId, dose })}
          />
          <InfusionsPanel infusions={infusions} />
          <ProviderNotifyControl
            disabled={locked}
            onNotify={(reason) => {
              const primaryOrder = orders.find((o) => o.sequence === 1)
              if (primaryOrder) notifyProvider(primaryOrder.id, reason)
            }}
          />
        </div>
        <div className="flex flex-col gap-gutter">
          <OrdersProfile orders={orders} />
          <CernerMAR
            infusions={infusions}
            disabled={locked}
            onRequestBeginBag={(infusionId) => setPendingAction({ kind: 'beginBag', infusionId })}
          />
          <CernerIView
            priorVitals={scenario.priorVitals}
            startingVitals={scenario.startingVitals}
            chartedEntries={chartedEntries}
            canChartNow={!locked}
            onChartNow={chartVitals}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setPhase('intro')}>
          Back to intro
        </Button>
        <Button onClick={() => setPhase('debrief')}>End &amp; go to debrief</Button>
      </div>
    </div>
  )
}
