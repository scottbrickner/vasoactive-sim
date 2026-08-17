import { useState } from 'react'
import { Button, Field, Panel } from '../design/primitives'

export interface IndependentCheckPanelProps {
  drugName: string
  onConfirm: (check: { secondCheckName: string; secondCheckRole: string }) => void
  onCancel: () => void
}

/**
 * Phase 19d: the independent (two-nurse) double-check gate for genuinely high-alert
 * drugs (fentanyl, per data/policy.ts's per-DrugId MEDICATION_VERIFICATION) — an
 * ADDITIONAL check layered on top of VerificationPanel's single-nurse BCMA/I-TRACE
 * check, which still runs first for every drug including this one. A third fixed
 * `role="alertdialog"` panel matching VerificationPanel/OverrideConfirmPanel's exact
 * shape. Applies at initiation only (see state/store.ts's submitDose) — titrating an
 * already-initiated high-alert infusion is never re-gated, matching every other
 * verification precedent in this sim.
 */
export function IndependentCheckPanel({ drugName, onConfirm, onCancel }: IndependentCheckPanelProps) {
  const [secondCheckName, setSecondCheckName] = useState('')
  const [secondCheckRole, setSecondCheckRole] = useState('')
  const canConfirm = secondCheckName.trim().length > 0 && secondCheckRole.trim().length > 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label="Independent double-check required"
        className="w-full max-w-md border-danger/40 ring-2 ring-danger/20"
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-danger text-xs font-bold text-white"
            >
              !
            </span>
            Independent double-check required
          </span>
        }
        subtitle={drugName}
      >
        <p className="text-sm text-muted">
          {drugName} is high-alert at this institution — a second, independent nurse must confirm the
          drug, dose, and pump programming before you proceed.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="Second nurse's name"
            value={secondCheckName}
            onChange={(e) => setSecondCheckName(e.target.value)}
            placeholder="Jane Doe"
          />
          <Field
            label="Second nurse's role"
            value={secondCheckRole}
            onChange={(e) => setSecondCheckRole(e.target.value)}
            placeholder="RN"
          />
        </div>
        <div className="mt-4 flex gap-3">
          <Button
            disabled={!canConfirm}
            onClick={() => onConfirm({ secondCheckName: secondCheckName.trim(), secondCheckRole: secondCheckRole.trim() })}
          >
            Confirm double-check
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  )
}
