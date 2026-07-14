/**
 * Derives a sequence>1 order's human-readable activation condition from its own
 * `activationThreshold` fraction, rather than hand-authoring it in scenario data —
 * see state/store.ts's `priorAgentsActivationMet`, the single source of the actual
 * comparison this text describes. Pure — no React/DOM, no store coupling.
 */
import { getDrug } from '../data/formulary'
import type { Order } from '../state/types'

export function deriveActivationText(order: Order, allOrders: Order[]): string | undefined {
  const priorOrders = allOrders.filter((o) => o.sequence < order.sequence)
  if (priorOrders.length === 0) return undefined

  const fraction = order.activationThreshold ?? 1
  const conditions = priorOrders.map((priorOrder) => {
    const drug = getDrug(priorOrder.drugId)
    if (fraction >= 1) {
      return `${drug.name} at its ordered maximum (${priorOrder.maxDose} ${drug.unit})`
    }
    const thresholdDose = priorOrder.maxDose * fraction
    const doseText = Number.isInteger(thresholdDose) ? String(thresholdDose) : thresholdDose.toFixed(2)
    return `${drug.name} at ${doseText} ${drug.unit} (${Math.round(fraction * 100)}% of its ordered maximum)`
  })

  const { target } = order
  return `${conditions.join(' and ')} with ${target.metric} still < ${target.value} ${target.unit}.`
}
