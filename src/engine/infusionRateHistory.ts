/**
 * Pure derivation of "what rate was this order's infusion running at a given sim
 * minute" from the log — used by CernerIView.tsx's Phase 17 "Continuous Infusions"
 * grid to render a real rate-change history instead of only vitals. No React/DOM here
 * per CLAUDE.md's engine-purity rule; the component consuming this stays untested per
 * this project's established "browser-verified only" convention for device UI (see
 * Waveform.tsx), matching how CernerChartingStatus.tsx already consumes
 * engine/documentation.ts's buildCadenceStatusForOrders the same way.
 *
 * Pause/restart intentionally do NOT change the rate here — a real pump's programmed
 * rate is unaffected by pausing delivery (RESTART_AFTER_PAUSE_RULE resumes at the same
 * rateBeforePause, not a new dose), so only 'initiate'/'titrate' dose entries move the
 * rate. Discontinuation removes the Infusion from state entirely (see store.ts's
 * discontinueInfusion — it filters the infusions array, there is no InfusionStatus
 * 'discontinued'), so it's detected here from the LogEntry with
 * `lifecycleAction: 'discontinue'` instead of from an Infusion field.
 *
 * `infusions` is only consulted as a fallback for a scenario-seeded already-infusing
 * order (e.g. weaningSupport.ts's ScenarioConfig.initialInfusions) that never passed
 * through submitDose's initiate path, so it has no real initiate LogEntry to anchor to
 * — mirrors the identical fallback already established in engine/documentation.ts's
 * buildCadenceStatusForOrders (anchor to minute 0 rather than reading as "nothing
 * started yet"). The fallback is only ever correct because it's consulted exactly
 * until the first REAL dose entry appears — after that the log takes over and this
 * fallback is never used again for that order. Deliberately NOT flagged as a
 * rate-change (that highlight is reserved for something the learner actually did, not
 * a scenario's starting state).
 */
import type { Infusion, LogEntry } from '../state/types'

export interface RateAtMinute {
  /** Rate in effect at/most-recently-before `minute`, or null if not yet initiated (or discontinued). */
  rate: number | null
  /** True exactly when `minute` matches a real logged initiate/titrate for this order — drives the "Rate Change" cell treatment. */
  isRateChangeAtMinute: boolean
  /** True once this order's infusion has been discontinued at/before `minute`. */
  discontinued: boolean
}

/** Given `log`, the live `infusions` (pre-seeded-infusion fallback only), and a target
 *  sim `minute`, derives `orderId`'s rate history at that minute. */
export function rateAtMinute(orderId: string, log: LogEntry[], infusions: Infusion[], minute: number): RateAtMinute {
  const doseEntries = log
    .filter(
      (e) =>
        e.type === 'action' &&
        e.orderId === orderId &&
        e.outcome === 'applied' &&
        (e.doseAction === 'initiate' || e.doseAction === 'titrate') &&
        e.dose != null &&
        e.minute <= minute,
    )
    .sort((a, b) => a.minute - b.minute)
  const lastDose = doseEntries[doseEntries.length - 1]

  const discontinueEntries = log
    .filter((e) => e.type === 'action' && e.orderId === orderId && e.lifecycleAction === 'discontinue' && e.minute <= minute)
    .sort((a, b) => a.minute - b.minute)
  const lastDiscontinue = discontinueEntries[discontinueEntries.length - 1]

  const discontinued = lastDiscontinue != null && (lastDose == null || lastDiscontinue.minute >= lastDose.minute)

  if (discontinued) {
    return { rate: null, isRateChangeAtMinute: false, discontinued: true }
  }
  if (lastDose) {
    return { rate: lastDose.dose ?? null, isRateChangeAtMinute: lastDose.minute === minute, discontinued: false }
  }
  const preSeeded = infusions.find((i) => i.orderId === orderId && i.status !== 'hanging')
  if (preSeeded) {
    return { rate: preSeeded.rate, isRateChangeAtMinute: false, discontinued: false }
  }
  return { rate: null, isRateChangeAtMinute: false, discontinued: false }
}
