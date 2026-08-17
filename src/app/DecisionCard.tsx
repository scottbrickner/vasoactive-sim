import { Button, Panel } from '../design/primitives'
import type { DecisionPoint, SimMode } from '../state/types'

export interface DecisionCardProps {
  decisionPoint: DecisionPoint
  mode: SimMode
  onChoose: (optionId: string) => void
  onDecideLater: () => void
  disabled?: boolean
}

/**
 * Phase 18's generalized "what's your next move" decision panel — subsumes the
 * retired TitrationCheckpointPanel's single notify-vs-continue choice into N authored
 * options, tested against the mockup's order-boundary trap types. Renders IN-FLOW in
 * the page (not a `fixed inset-0` modal, unlike every prior pendingX panel) — matching
 * the mockup validated across 6 feedback rounds, which shows the decision card
 * alongside the workspace, not blocking it. The real dose-entry control
 * (DoseEntryControl.tsx) stays mounted and usable regardless of whether this card is
 * showing — this is a contextual overlay on top of free titration, not a replacement.
 *
 * Options are grouped exactly as the mockup does — "within your current orders" vs.
 * "not currently covered" — reinforcing the core teaching point structurally, not just
 * in copy: the real test is whether the learner checks their orders before acting.
 */
export function DecisionCard({ decisionPoint, mode, onChoose, onDecideLater, disabled }: DecisionCardProps) {
  const covered = decisionPoint.options.filter((o) => o.group === 'covered')
  const gap = decisionPoint.options.filter((o) => o.group === 'gap')

  return (
    <Panel title="What's your next move?" subtitle={decisionPoint.situation} className="border-cardinal/30">
      {mode === 'training' && (
        <p className="mb-4 rounded-md bg-gold-soft px-3 py-2 text-sm text-cardinal-dark">{decisionPoint.policyHint}</p>
      )}
      <div className="flex flex-col gap-4">
        {covered.length > 0 && <OptionGroup label="Within your current orders" options={covered} onChoose={onChoose} disabled={disabled} />}
        {gap.length > 0 && <OptionGroup label="Not currently covered — worth a second look" options={gap} onChoose={onChoose} disabled={disabled} />}
      </div>
      <div className="mt-4">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onDecideLater}>
          Decide later — resume titrating
        </Button>
      </div>
    </Panel>
  )
}

function OptionGroup({
  label,
  options,
  onChoose,
  disabled,
}: {
  label: string
  options: DecisionPoint['options']
  onChoose: (optionId: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option.id)}
            className="rounded-md border border-border bg-bg px-3 py-2 text-left text-sm hover:border-cardinal/50 hover:bg-cardinal/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block font-medium text-ink">{option.label}</span>
            <span className="block text-xs text-muted">{option.caption}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
