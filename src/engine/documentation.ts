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
 * Cadence: checkCadence is retrospective (used by scoring.ts at debrief time) — the
 * live UI deliberately never labels a chart entry with which checkpoint it satisfies
 * (see devices/CernerIView's doc comment); only the debrief reveals compliance.
 */
import { DOCUMENTATION_PLACEMENT } from '../data/policy'
import type { DocumentationCadencePoint, DocumentationLocation } from '../state/types'

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
