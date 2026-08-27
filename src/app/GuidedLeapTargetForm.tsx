import { useState } from 'react'
import { computeMultiStepDoses } from '../engine/titrationEngine'
import { Button, Field } from '../design/primitives'
import type { DrugDefinition, Order } from '../state/types'

export interface GuidedLeapTargetFormProps {
  order: Order
  drug: DrugDefinition
  currentDose: number
  /** Prefilled target dose — the order's own max for the "continue titrating" decision-point option, or the nearest upcoming milestone for a pacing offer. */
  defaultTarget: number
  onRun: (targetDose: number) => void
  onBack: () => void
  backLabel?: string
}

/**
 * Target-dose entry + live multi-step titration-plan preview, shared by DecisionCard's
 * "continue titrating" option (a real clinical decision) and PacingOfferPanel (a
 * non-clinical pacing nudge) — both end in the exact same "pick a target, preview the
 * steps, run it" flow, just reached via different framing/copy in their own panel
 * chrome. (Renamed from computeGuidedLeapDoses in Phase 18 — see titrationEngine.ts.)
 */
export function GuidedLeapTargetForm({ order, drug, currentDose, defaultTarget, onRun, onBack, backLabel = 'Back' }: GuidedLeapTargetFormProps) {
  const [targetInput, setTargetInput] = useState(String(defaultTarget))
  const targetDose = Number(targetInput)
  // A weaning order's auto-down-titration floors at its own ordered starting dose
  // (matching runMultiStepTitration/priorAgentsWeaned's "cleared" definition), not all
  // the way to 0 — a non-weaning order floors at plain 0 (computeMultiStepDoses' default).
  const minAllowedDose = order.weanOrder != null ? order.startDose : 0
  const plan = computeMultiStepDoses(currentDose, order.increment, order.maxDose, targetDose, minAllowedDose)
  // True once the plan's last step lands at (or past, from snapping) the order's own
  // startDose — worth calling out separately since a titration can never reach exactly 0,
  // so "fully weaned off" always requires a separate manual Discontinue action.
  const reachesStartDose =
    order.weanOrder != null && plan.doses.length > 0 && plan.doses[plan.doses.length - 1] <= order.startDose + 1e-9

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={`Target ${drug.name} dose (${drug.unit})`}
        type="number"
        step="any"
        value={targetInput}
        onChange={(e) => setTargetInput(e.target.value)}
        help={
          order.weanOrder != null
            ? `Current dose is ${currentDose} ${drug.unit}; ordered maximum is ${order.maxDose} ${drug.unit}, ordered starting dose is ${order.startDose} ${drug.unit}.`
            : `Current dose is ${currentDose} ${drug.unit}; ordered maximum is ${order.maxDose} ${drug.unit}.`
        }
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
          {reachesStartDose && (
            <p className="mt-1 text-muted">
              This reaches the order's starting dose — discontinue the infusion separately once it's clinically
              appropriate to fully wean off (a titration can't reach exactly 0).
            </p>
          )}
          <p className="mt-1 text-muted">
            Auto-charted along the way — the timeline will show each step's dose and vitals if you look back.
          </p>
          <p className="mt-1 text-muted">
            This also creates {plan.doses.length * 2} documentation checkpoints — a pre- and post-titration chart for
            each step — which you'll see listed under Charting Status afterward.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Enter a target dose to preview the titration steps.</p>
      )}
      <div className="flex gap-3">
        <Button disabled={plan.doses.length === 0} onClick={() => onRun(targetDose)}>
          Apply these steps
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </div>
  )
}
