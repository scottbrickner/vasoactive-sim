import { useState } from 'react'
import { GuidedLeapTargetForm } from './GuidedLeapTargetForm'
import { Button, Panel } from '../design/primitives'
import type { DrugDefinition, Order } from '../state/types'

export interface TitrationCheckpointPanelProps {
  order: Order
  drug: DrugDefinition
  doseAtTrigger: number
  mapAtTrigger: number
  onNotifyProvider: () => void
  onRunGuidedLeap: (targetDose: number) => void
  onCancel: () => void
}

/**
 * Fires once a titration newly crosses its order's earlyNotificationThreshold (see
 * crossedEarlyNotificationThreshold in state/store.ts) with target still unmet — the
 * dose has already been applied by this point (see PendingCheckpoint's doc comment).
 * Two-phase: summary + notify-vs-continue, then (if continuing) a target-dose entry
 * with a live preview of the guided titration leap it would run (see GuidedLeapTargetForm,
 * shared with the non-clinical PacingOfferPanel).
 */
export function TitrationCheckpointPanel({
  order,
  drug,
  doseAtTrigger,
  mapAtTrigger,
  onNotifyProvider,
  onRunGuidedLeap,
  onCancel,
}: TitrationCheckpointPanelProps) {
  const [phase, setPhase] = useState<'summary' | 'target'>('summary')

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label="Titration checkpoint"
        className="w-full max-w-md border-cardinal/40 ring-2 ring-cardinal/20"
        title="What next?"
        subtitle={`${drug.name} at ${doseAtTrigger} ${drug.unit} — ${order.target.metric} ${mapAtTrigger} ${order.target.unit}, target ${order.target.comparator} ${order.target.value} ${order.target.unit}.`}
      >
        {phase === 'summary' ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink">
              You've advanced {drug.name} per the order, but hemodynamics haven't reached the ordered parameter.
              Continue titrating as ordered, or notify the provider to consider adding another agent?
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={onNotifyProvider}>Notify provider</Button>
              <Button variant="secondary" onClick={() => setPhase('target')}>
                Continue titrating {drug.name}
              </Button>
              <Button variant="ghost" onClick={onCancel}>
                Not yet — decide later
              </Button>
            </div>
          </div>
        ) : (
          <GuidedLeapTargetForm
            order={order}
            drug={drug}
            currentDose={doseAtTrigger}
            defaultTarget={order.maxDose}
            onRun={onRunGuidedLeap}
            onBack={() => setPhase('summary')}
          />
        )}
      </Panel>
    </div>
  )
}
