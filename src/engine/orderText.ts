/**
 * Derives full clinical-order prose for a titratable order — Phase 18's "Orders"
 * reference card shows this paragraph form instead of (only) OrdersProfile.tsx's grid
 * table. Pure — no React/DOM, no store coupling. Follows activation.ts's established
 * convention: never hand-authored numbers, always derived from Order/DrugDefinition
 * fields, so the display text can't drift from what the engine actually enforces.
 */
import { deriveActivationText } from './activation'
import type { DrugDefinition, Order, TitrationTarget } from '../state/types'

/**
 * "q3-5 min" or "q30 min" — moved here from OrdersProfile.tsx (Phase 18) so the grid
 * table and this module's prose share one formatter instead of two that could drift.
 */
export function formatInterval(interval: Order['interval']): string {
  return interval.maxMinutes ? `q${interval.minMinutes}-${interval.maxMinutes} min` : `q${interval.minMinutes} min`
}

/**
 * "MAP >= 65 mmHg" / "HR between 60-100 bpm" — the one shared target-clause renderer for
 * every comparator (Phase 19b consolidation of what were previously 3+ separate ad hoc
 * hand-rolled interpolations across orderText/activation/decisionPoints/titrationEngine,
 * a real drift risk once 'between'/'<=' targets existed). '>='/'<=' render the comparator
 * symbol as-is; 'between' spells out the range instead (there's no single symbol for it).
 */
export function formatTargetClause(target: TitrationTarget): string {
  if (target.comparator === 'between') {
    return `${target.metric} between ${target.value}-${target.valueHigh} ${target.unit}`
  }
  return `${target.metric} ${target.comparator} ${target.value} ${target.unit}`
}

/**
 * "MAP still < 65 mmHg" / "HR still outside 60-100 bpm" — the "target not yet met" gap-
 * text counterpart to formatTargetClause, shared by activation.ts's deriveActivationText,
 * decisionPoints.ts's buildAutoEarlyNotificationDecisionPoint, and titrationEngine.ts's
 * needs-provider reason string.
 */
export function formatTargetGapText(target: TitrationTarget): string {
  switch (target.comparator) {
    case '>=':
      return `${target.metric} still < ${target.value} ${target.unit}`
    case '<=':
      return `${target.metric} still > ${target.value} ${target.unit}`
    case 'between':
      return `${target.metric} still outside ${target.value}-${target.valueHigh} ${target.unit}`
  }
}

/**
 * "MAP at or above 65 mmHg" / "RASS within -2-0 score" — the "target IS met" counterpart
 * to formatTargetGapText (Phase 19h), used when an activation condition is phrased
 * against the prior agent's own target being ACHIEVED rather than still unmet (see
 * activation.ts's deriveActivationText / Order.activationRequiresPriorTargetMet) — e.g.
 * sedation activating once analgesia's own goal is established, not still short of it.
 */
export function formatTargetMetText(target: TitrationTarget): string {
  switch (target.comparator) {
    case '>=':
      return `${target.metric} at or above ${target.value} ${target.unit}`
    case '<=':
      return `${target.metric} at or below ${target.value} ${target.unit}`
    case 'between':
      return `${target.metric} within ${target.value}-${target.valueHigh} ${target.unit}`
  }
}

/** e.g. "Start at 0.5 mcg/min IV, titrate 0.5 mcg/min q3-5 min up to 30 mcg/min. Target MAP >= 65 mmHg." */
export function deriveFullOrderText(order: Order, drug: DrugDefinition): string {
  return `Start at ${order.startDose} ${drug.unit} IV, titrate ${order.increment} ${drug.unit} ${formatInterval(order.interval)} up to ${order.maxDose} ${drug.unit}. Target ${formatTargetClause(order.target)}.`
}

/**
 * Fixed CP 4-156 wean-priority policy sentence, shown whenever `allOrders` carries a
 * REAL wean ordering — at least two distinct `weanOrder` values, meaning some agent
 * genuinely must clear before another (see priorAgentsWeaned in state/store.ts). The
 * RULE itself (most-recently-added agent weans first) is fixed institutional policy,
 * not scenario-specific data; only whether it applies is derived. Deliberately does
 * NOT fire when every wean-tagged order shares the SAME `weanOrder` value (Phase 19h) —
 * that shape marks a set of agents as independently weanable, each on its own target's
 * merits, with no cross-drug priority to assert (e.g. fentanyl/dexmedetomidine's
 * genuinely independent pain-score/RASS targets — asserting a fixed priority between
 * them would misstate real practice, per direct clinical correction). `order` isn't
 * itself consulted (the sentence is the same for every order in a real wean-ordered
 * set) but stays a parameter for symmetry with `deriveFullOrderText`/`deriveActivationText`.
 */
export function deriveWeanPriorityText(_order: Order, allOrders: Order[]): string | undefined {
  const distinctWeanOrders = new Set(allOrders.map((o) => o.weanOrder).filter((w): w is number => w != null))
  if (distinctWeanOrders.size < 2) return undefined
  return 'Wean priority: most recently added agent comes off first.'
}

/**
 * Joins full-order-text + activation condition + wean-priority into the one paragraph
 * the Orders reference card shows per order (see titration-judgment-mockup.html).
 */
export function combineOrderText(order: Order, drug: DrugDefinition, allOrders: Order[]): string {
  const parts = [deriveFullOrderText(order, drug)]
  const activation = deriveActivationText(order, allOrders)
  if (activation) parts.push(`Activates when ${activation}`)
  const weanText = deriveWeanPriorityText(order, allOrders)
  if (weanText) parts.push(weanText)
  return parts.join(' ')
}
