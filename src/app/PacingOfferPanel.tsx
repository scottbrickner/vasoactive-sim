import { GuidedLeapTargetForm } from './GuidedLeapTargetForm'
import { Panel } from '../design/primitives'
import type { DrugDefinition, Order } from '../state/types'

export interface PacingOfferPanelProps {
  order: Order
  drug: DrugDefinition
  currentDose: number
  nextDecisionDose: number
  nextDecisionLabel: string
  onRunMultiStepTitration: (targetDose: number) => void
  onCancel: () => void
}

/**
 * A non-clinical "want to speed through this climb?" offer — fires every few manual
 * titrations on the same order (see PACING_OFFER_THRESHOLD in state/store.ts), purely
 * to cut down on repetitive clicking toward whatever the next real decision point is
 * (see engine/activation.ts's deriveNextDecisionPoint). Unlike DecisionCard (Phase 18's
 * generalized "what's your next move" panel, which subsumed the retired
 * TitrationCheckpointPanel), this is never a clinical decision — no notify-provider
 * branch — so it goes straight to the shared target-dose entry (GuidedLeapTargetForm),
 * prefilled at the next milestone.
 */
export function PacingOfferPanel({
  order,
  drug,
  currentDose,
  nextDecisionDose,
  nextDecisionLabel,
  onRunMultiStepTitration,
  onCancel,
}: PacingOfferPanelProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label="Speed through this climb?"
        className="w-full max-w-md"
        title="Keep going faster?"
        subtitle={`You've made a few titrations on ${drug.name}, now at ${currentDose} ${drug.unit}. Want to fast-forward toward ${nextDecisionLabel}?`}
      >
        <GuidedLeapTargetForm
          order={order}
          drug={drug}
          currentDose={currentDose}
          defaultTarget={nextDecisionDose}
          onRun={onRunMultiStepTitration}
          onBack={onCancel}
          backLabel="Keep titrating manually"
        />
      </Panel>
    </div>
  )
}
