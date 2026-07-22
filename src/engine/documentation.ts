/**
 * Documentation validation (BUILD_BRIEF §7): MAR-vs-iView placement, and CP 4-156's
 * 4-point documentation cadence. Pure — no store coupling.
 *
 * Placement: in this simulator the UI itself makes the wrong placement unreachable
 * (the MAR screen only ever writes 'MAR' entries, iView only ever writes 'iView'
 * entries — mirroring how the real systems are literally separate applications).
 * These functions exist so that mapping is asserted and unit-tested rather than
 * implied, and so the store has a single source of truth to construct entries from.
 *
 * Cadence: checkCadence and buildCadenceStatusForOrders are consumed both by scoring.ts
 * (debrief scorecard) and the live devices/CernerChartingStatus view (Phase 12d) — the
 * per-entry iView flowsheet itself still never labels an entry with which checkpoint it
 * satisfies (see devices/CernerIView's doc comment); Charting Status is a separate,
 * explicit self-check surface, not a change to how individual entries are labeled.
 */
import { DOCUMENTATION_PLACEMENT } from '../data/policy'
import { getDrug } from '../data/formulary'
import type { DocumentationCadencePoint, DocumentationLocation, Infusion, LogEntry, Order } from '../state/types'

export type DocumentationKind = keyof typeof DOCUMENTATION_PLACEMENT

export function correctLocationFor(kind: DocumentationKind): DocumentationLocation {
  return DOCUMENTATION_PLACEMENT[kind]
}

export function isCorrectlyPlaced(kind: DocumentationKind, location: DocumentationLocation): boolean {
  return location === correctLocationFor(kind)
}

export interface CadenceCheck {
  point: DocumentationCadencePoint
  /** Which titration this pre/+30-post check belongs to (1-indexed); absent for the once-per-infusion checkpoints. */
  titrationIndex?: number
  dueAtMinute: number
  met: boolean
}

/**
 * Checks the 4-point documentation cadence for ONE infusion's lifecycle: `initiation`
 * and `plus30Start` occur once, at/after the infusion's start; `preTitration` and
 * `plus30PostTitration` recur for each titration. `chartedMinutes` is the sim minutes
 * at which iView vitals were actually charted (shared across all infusions — one
 * charting event can satisfy every infusion's pending checkpoint at that moment).
 *
 * Because this sim's clock only advances on explicit learner action (never
 * automatically), "prior to titration" is satisfied by any charting since the last
 * titration (or initiation) up to and including the current minute — not just an
 * exact-minute match — since a nurse may reasonably chart once and titrate shortly
 * after without re-clicking "Chart now" at the very same instant.
 */
export function checkCadence(
  initiationMinute: number,
  titrationMinutes: number[],
  chartedMinutes: number[],
): CadenceCheck[] {
  const checks: CadenceCheck[] = []

  checks.push({
    point: 'initiation',
    dueAtMinute: initiationMinute,
    met: chartedMinutes.includes(initiationMinute),
  })
  checks.push({
    point: 'plus30Start',
    dueAtMinute: initiationMinute + 30,
    met: chartedMinutes.some((m) => m >= initiationMinute + 30),
  })

  let windowStart = initiationMinute
  for (let i = 0; i < titrationMinutes.length; i++) {
    const t = titrationMinutes[i]
    checks.push({
      point: 'preTitration',
      titrationIndex: i + 1,
      dueAtMinute: t,
      met: chartedMinutes.some((m) => m > windowStart && m <= t),
    })
    checks.push({
      point: 'plus30PostTitration',
      titrationIndex: i + 1,
      dueAtMinute: t + 30,
      met: chartedMinutes.some((m) => m >= t + 30),
    })
    windowStart = t
  }

  return checks
}

export interface OrderCadenceStatus {
  orderId: string
  drugId: Order['drugId']
  checks: CadenceCheck[]
}

/**
 * Per-order cadence status for every order with a started (or pre-seeded-infusing) order
 * — the single source `checkCadence` results both debrief scoring (scoring.ts category 5)
 * and the live Charting Status view (devices/CernerChartingStatus) build on, so what's
 * shown mid-session can never drift from what debrief actually scores. `doseEntries` is
 * `log` filtered to `type === 'action' && doseAction != null`; `chartedMinutes` is `log`
 * filtered to `type === 'documentation' && location === 'iView'`, mapped to `minute`.
 */
export function buildCadenceStatusForOrders(
  orders: Order[],
  infusions: Infusion[],
  doseEntries: LogEntry[],
  chartedMinutes: number[],
): OrderCadenceStatus[] {
  return orders.flatMap((order) => {
    const initiation = doseEntries.find(
      (e) => e.orderId === order.id && e.doseAction === 'initiate' && e.outcome === 'applied',
    )
    // A scenario can pre-seed an order's infusion already infusing (e.g. a weaning
    // scenario's ScenarioConfig.initialInfusions) — it never passes through submitDose's
    // initiate path, so there's no real initiation LogEntry to anchor cadence checks to.
    // Anchor to minute 0 instead of silently treating the whole order as "nothing started
    // yet" (which would read as n/a regardless of the learner's own charting).
    const preSeededInfusion = infusions.find((i) => i.orderId === order.id && i.status !== 'hanging')
    const initiationMinute = initiation?.minute ?? (preSeededInfusion ? 0 : null)
    if (initiationMinute == null) return []
    const titrationMinutes = doseEntries
      .filter((e) => e.orderId === order.id && e.doseAction === 'titrate' && e.outcome === 'applied')
      .map((e) => e.minute)
      .sort((a, b) => a - b)
    return [
      {
        orderId: order.id,
        drugId: order.drugId,
        checks: checkCadence(initiationMinute, titrationMinutes, chartedMinutes),
      },
    ]
  })
}

function cadenceLabel(check: CadenceCheck): string {
  switch (check.point) {
    case 'initiation':
      return 'initiation charting'
    case 'plus30Start':
      return '+30 min after start'
    case 'preTitration':
      return `pre-titration #${check.titrationIndex}`
    case 'plus30PostTitration':
      return `+30 min after titration #${check.titrationIndex}`
  }
}

/**
 * Short, human-readable list of what's still outstanding before ending a session — every
 * unmet cadence checkpoint, plus (defensively) any started order whose initiate entry
 * somehow lacks verification. Under the current design verification is set the same tick
 * an initiate entry is created, so that second case rarely if ever fires in practice — kept
 * for correctness rather than as the primary signal. Used both by the live Charting Status
 * view and the soft pre-end warning (Simulation.tsx) — empty means nothing outstanding.
 */
export function buildOutstandingChartingItems(
  orders: Order[],
  infusions: Infusion[],
  log: LogEntry[],
  verificationFlags: Record<string, boolean>,
): string[] {
  const doseEntries = log.filter((e) => e.type === 'action' && e.doseAction != null)
  const chartedMinutes = log.filter((e) => e.type === 'documentation' && e.location === 'iView').map((e) => e.minute)
  const statuses = buildCadenceStatusForOrders(orders, infusions, doseEntries, chartedMinutes)

  const items: string[] = []
  for (const status of statuses) {
    const drug = getDrug(status.drugId)
    for (const check of status.checks) {
      if (!check.met) items.push(`${drug.name}: ${cadenceLabel(check)} not yet charted.`)
    }
    const initiateEntry = doseEntries.find((e) => e.orderId === status.orderId && e.doseAction === 'initiate')
    if (initiateEntry && !verificationFlags[initiateEntry.id]) {
      items.push(`${drug.name}: starting dose not yet verified (BCMA/I-TRACE).`)
    }
  }
  return items
}
