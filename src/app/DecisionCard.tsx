import { getDrug } from '../data/formulary'
import { Button, Panel } from '../design/primitives'
import type { DecisionOption, DecisionPoint, Infusion, Order, SimMode } from '../state/types'

export interface DecisionCardProps {
  decisionPoint: DecisionPoint
  mode: SimMode
  orders: Order[]
  infusions: Infusion[]
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
export function DecisionCard({ decisionPoint, mode, orders, infusions, onChoose, onDecideLater, disabled }: DecisionCardProps) {
  const covered = decisionPoint.options.filter((o) => o.group === 'covered')
  const gap = decisionPoint.options.filter((o) => o.group === 'gap')

  return (
    <Panel title="What's your next move?" subtitle={decisionPoint.situation} className="border-cardinal/30">
      {mode === 'training' && (
        <p className="mb-4 rounded-md bg-gold-soft px-3 py-2 text-sm text-cardinal-dark">{decisionPoint.policyHint}</p>
      )}
      <div className="flex flex-col gap-4">
        {covered.length > 0 && (
          <OptionGroup label="Within your current orders" options={covered} orders={orders} infusions={infusions} onChoose={onChoose} disabled={disabled} />
        )}
        {gap.length > 0 && (
          <OptionGroup
            label="Not currently covered — worth a second look"
            options={gap}
            orders={orders}
            infusions={infusions}
            onChoose={onChoose}
            disabled={disabled}
          />
        )}
      </div>
      <div className="mt-4">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onDecideLater}>
          Decide later — resume titrating
        </Button>
      </div>
    </Panel>
  )
}

/**
 * Computes the exact "→ X unit" dose preview for an option, reusing the identical
 * base+delta formula store.ts's chooseDecisionOption applies at pick-time (case
 * 'submitDoseRelative') so the preview can never drift from what actually happens when
 * the option is chosen. Returns null (no preview) for effect kinds that don't resolve
 * to a single known dose, or defensively if the option's order/drug can't be found —
 * this is a display nicety, never worth crashing the panel over.
 */
function previewDose(effect: DecisionOption['effect'], orders: Order[], infusions: Infusion[]): string | null {
  if (effect.kind === 'submitDose') {
    const order = orders.find((o) => o.id === effect.orderId)
    if (!order) return null
    return `${effect.dose} ${getDrug(order.drugId).unit}`
  }
  if (effect.kind === 'submitDoseRelative') {
    const order = orders.find((o) => o.id === effect.orderId)
    if (!order) return null
    const infusion = infusions.find((i) => i.orderId === effect.orderId)
    const base = infusion?.rate ?? order.startDose
    const dose = Math.round((base + effect.deltaSteps * order.increment) * 1e6) / 1e6
    return `${dose} ${getDrug(order.drugId).unit}`
  }
  return null
}

function OptionGroup({
  label,
  options,
  orders,
  infusions,
  onChoose,
  disabled,
}: {
  label: string
  options: DecisionPoint['options']
  orders: Order[]
  infusions: Infusion[]
  onChoose: (optionId: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const preview = previewDose(option.effect, orders, infusions)
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(option.id)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-left text-sm hover:border-cardinal/50 hover:bg-cardinal/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block font-medium text-ink">{option.label}</span>
              <span className="block text-xs text-muted">{option.caption}</span>
              {preview && <span className="block text-xs text-muted">→ {preview}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
