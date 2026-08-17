import { Panel } from '../design/primitives'
import { getDrug } from '../data/formulary'
import { combineOrderText } from '../engine/orderText'
import type { Order } from '../state/types'

export interface OrdersReferenceCardProps {
  orders: Order[]
  /** Extra "no standing order" lines for interventions a decision point tests without a real order behind them (e.g. a fluid bolus) — sourced from the active decision point's own data, not generic scenario metadata (see engine/decisionPoints.ts). */
  noStandingOrderNotes?: string[]
}

/**
 * Full clinical-order prose, per order — the real test this whole redesign is built
 * around: can the learner read what they're actually ordered to do, not just judge
 * whether an action is generically reasonable. Built from combineOrderText
 * (engine/orderText.ts), so every number here is derived from the same Order/
 * DrugDefinition data the engine itself enforces — it can't drift from what's real.
 */
export function OrdersReferenceCard({ orders, noStandingOrderNotes }: OrdersReferenceCardProps) {
  const sorted = [...orders].sort((a, b) => a.sequence - b.sequence)
  return (
    <Panel title="Orders" subtitle="What's actually ordered for this patient.">
      <div className="flex flex-col gap-3">
        {sorted.map((order) => {
          const drug = getDrug(order.drugId)
          return (
            <div key={order.id} className="rounded-md border border-border bg-bg p-3">
              <p className="text-sm font-semibold text-ink">
                Agent {order.sequence} — {drug.name}
              </p>
              <p className="mt-1 text-sm text-muted">{combineOrderText(order, drug, orders)}</p>
            </div>
          )
        })}
        {noStandingOrderNotes?.map((note, i) => (
          <div key={i} className="rounded-md border border-dashed border-warning/50 bg-warning/5 p-3">
            <p className="text-sm text-ink">{note}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}
