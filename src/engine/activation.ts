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

export interface NextDecisionPoint {
  /** The dose (in this order's own unit) at which the next real decision point is reached. */
  dose: number
  /** Human-readable description of what happens at that dose — used by the pacing-offer UI. */
  label: string
}

/**
 * The nearest upcoming dose milestone for THIS order beyond `currentDose` — used by the
 * pacing-offer checkpoint (state/store.ts's pendingPacingOffer) to suggest a sensible
 * fast-forward target after a few manual titrations, distinct from the CLINICAL
 * early-notification checkpoint (which fires exactly at its own threshold, not before).
 * Considers: this order's own earlyNotificationThreshold, a dependent (sequence+1) order's
 * activation threshold relative to this order, and this order's own maxDose — picks
 * whichever is soonest. Returns null when currentDose is already at/past every milestone.
 */
export function deriveNextDecisionPoint(order: Order, allOrders: Order[], currentDose: number): NextDecisionPoint | null {
  const candidates: NextDecisionPoint[] = []

  if (order.earlyNotificationThreshold != null) {
    const dose = order.maxDose * order.earlyNotificationThreshold
    if (dose > currentDose) candidates.push({ dose, label: 'reaching the early-notification checkpoint' })
  }

  const dependent = allOrders.find((o) => o.sequence === order.sequence + 1)
  if (dependent) {
    const fraction = dependent.activationThreshold ?? 1
    const dose = order.maxDose * fraction
    if (dose > currentDose) {
      const dependentDrug = getDrug(dependent.drugId)
      candidates.push({ dose, label: `activating ${dependentDrug.name}` })
    }
  }

  if (order.maxDose > currentDose) {
    const drug = getDrug(order.drugId)
    candidates.push({ dose: order.maxDose, label: `${drug.name}'s ordered maximum` })
  }

  if (candidates.length === 0) return null
  return candidates.reduce((nearest, c) => (c.dose < nearest.dose ? c : nearest))
}
