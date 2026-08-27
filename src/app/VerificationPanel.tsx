import { useId, useState } from 'react'
import { Button, Panel } from '../design/primitives'

export interface VerificationPanelProps {
  title: string
  checklist: string[]
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The CP 4-156 verification gate: a BCMA + I-TRACE self-check the administering nurse
 * performs once, at initiation (see CLAUDE.md's non-negotiable rules) — for EVERY drug
 * in the formulary, including genuinely high-alert ones. This is always a single-nurse
 * check; a separate, ADDITIONAL independent (two-nurse) double-check gate
 * (IndependentCheckPanel.tsx) layers on top of this one for drugs where
 * `data/policy.ts`'s per-`DrugId` MEDICATION_VERIFICATION marks
 * `independentDoubleCheckRequired: true` (fentanyl, as of Phase 19d — vasoactives,
 * dexmedetomidine, and diltiazem don't need it). Shell-register (branded, coaching),
 * not a device replica — this workflow happens around the pump, not on it. Still
 * blocking by design, unlike the softer, flagged-not-blocked handling of documentation
 * cadence elsewhere in this sim.
 */
export function VerificationPanel({ title, checklist, onConfirm, onCancel }: VerificationPanelProps) {
  // Indexed by position, not item text — two checklist items could share the same
  // wording in principle, and position is stable for the life of this mount. Fresh
  // every mount (Simulation.tsx renders this panel as `{pendingAction && <VerificationPanel .../>}`,
  // so a new verification always gets a newly-mounted panel, never a re-used one with
  // stale checked state carried over).
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const idPrefix = useId()
  const allChecked = checked.size === checklist.length

  function toggle(index: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label="Verify before programming"
        className="w-full max-w-md border-cardinal/40 ring-2 ring-cardinal/20"
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cardinal text-xs font-bold text-white"
            >
              !
            </span>
            Verify before programming
          </span>
        }
        subtitle={title}
      >
        <p className="text-sm text-muted">
          Confirm each item against the MAR/order (BCMA) and trace the line to the patient
          (I-TRACE) before proceeding.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {checklist.map((item, index) => {
            const itemId = `${idPrefix}-item-${index}`
            return (
              <li key={item} className="flex items-start gap-2 text-sm text-ink">
                <input
                  id={itemId}
                  type="checkbox"
                  checked={checked.has(index)}
                  onChange={() => toggle(index)}
                  className="mt-0.5 size-4 shrink-0 accent-cardinal"
                />
                <label htmlFor={itemId}>{item}</label>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex gap-3">
          <Button disabled={!allChecked} onClick={onConfirm}>
            Confirm verification
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  )
}
