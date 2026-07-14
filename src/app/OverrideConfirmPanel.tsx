import { Button, Panel } from '../design/primitives'

export interface OverrideConfirmPanelProps {
  title: string
  reasons: string[]
  onOverride: () => void
  onCancel: () => void
}

/**
 * Training-mode override confirmation: the dose the learner entered violates the
 * written order (see engine/titrationEngine.ts) but isn't a Guardrails hard-limit or
 * needs-provider situation — those never reach here (see state/store.ts's submitDose).
 * Distinct from VerificationPanel: this isn't a BCMA/I-TRACE identity check, it's the
 * "you're about to apply something off-order" decision point.
 */
export function OverrideConfirmPanel({ title, reasons, onOverride, onCancel }: OverrideConfirmPanelProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label="Off-order dose"
        className="w-full max-w-md border-danger/40 ring-2 ring-danger/20"
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-danger text-xs font-bold text-white"
            >
              !
            </span>
            Off-order dose
          </span>
        }
        subtitle={title}
      >
        <ul className="flex flex-col gap-2">
          {reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm text-ink">
              <span aria-hidden="true" className="mt-0.5 text-danger">
                !
              </span>
              {reason}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-3">
          <Button variant="danger" onClick={onOverride}>
            Override and apply anyway
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel — I'll correct the dose
          </Button>
        </div>
      </Panel>
    </div>
  )
}
