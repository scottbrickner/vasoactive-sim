import { useState } from 'react'
import { computeGuidedLeapDoses } from '../engine/titrationEngine'
import { Button, Field } from '../design/primitives'
import type { DrugDefinition, Order } from '../state/types'

export interface GuidedLeapTargetFormProps {
  order: Order
  drug: DrugDefinition
  currentDose: number
  /** Prefilled target dose — the order's own max for the clinical checkpoint, or the nearest upcoming milestone for a pacing offer. */
  defaultTarget: number
  onRun: (targetDose: number) => void
  onBack: () => void
  backLabel?: string
}

/**
 * Target-dose entry + live guided-leap preview, shared by TitrationCheckpointPanel (the
 * clinical early-notification decision) and PacingOfferPanel (a non-clinical pacing
 * nudge) — both end in the exact same "pick a target, preview the steps, run it" flow,
 * just reached via different framing/copy in their own panel chrome.
 */
export function GuidedLeapTargetForm({ order, drug, currentDose, defaultTarget, onRun, onBack, backLabel = 'Back' }: GuidedLeapTargetFormProps) {
  const [targetInput, setTargetInput] = useState(String(defaultTarget))
  const targetDose = Number(targetInput)
  const plan = computeGuidedLeapDoses(currentDose, order.increment, order.maxDose, targetDose)

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={`Target ${drug.name} dose (${drug.unit})`}
        type="number"
        step="any"
        value={targetInput}
        onChange={(e) => setTargetInput(e.target.value)}
        help={`Current dose is ${currentDose} ${drug.unit}; ordered maximum is ${order.maxDose} ${drug.unit}.`}
      />
      {plan.doses.length > 0 ? (
        <div className="rounded-md border border-border bg-bg p-3 text-sm text-ink">
          <p className="font-medium">
            {plan.doses.length} titration step{plan.doses.length === 1 ? '' : 's'} from {currentDose} to{' '}
            {plan.doses[plan.doses.length - 1]} {drug.unit}, {order.interval.minMinutes} min apart.
          </p>
          {plan.wasSnappedDown && (
            <p className="mt-1 text-muted">Snapped to the nearest reachable dose on the ordered increment.</p>
          )}
          <p className="mt-1 text-muted">
            Auto-charted along the way — the timeline will show each step's dose and vitals if you look back.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Enter a target above the current dose to preview the titration steps.</p>
      )}
      <div className="flex gap-3">
        <Button disabled={plan.doses.length === 0} onClick={() => onRun(targetDose)}>
          Run guided titration
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </div>
  )
}
