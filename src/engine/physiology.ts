/**
 * Physiology response model (BUILD_BRIEF §7): advances MAP toward target after a
 * correct titration, with a configurable lag; under-dosing yields an inadequate
 * response; a per-agent response ceiling is what drives the need for a second agent.
 *
 * Not a full PK/PD model — a deterministic, testable approximation appropriate for
 * training-sim feedback (docs/CLINICAL_SPEC.md #8). Operates on MAP alone (not full
 * VitalSigns), and scenario-specific response ceilings/lags are supplied by the
 * caller rather than hardcoded here, so this module stays scenario-agnostic and pure.
 */
import type { TitrationInterval } from '../state/types'

/**
 * MAP (mmHg) a single agent contributes once fully responded, linearly scaled from 0
 * at dose 0 to `maxMapContribution` at `maxDose`. Doses are clamped to [0, maxDose].
 */
export function projectDoseResponse(dose: number, maxDose: number, maxMapContribution: number): number {
  const clamped = Math.max(0, Math.min(dose, maxDose))
  const fraction = maxDose > 0 ? clamped / maxDose : 0
  return fraction * maxMapContribution
}

/** The MAP this patient would settle at, once fully responded, given all active agents' contributions. */
export function projectMap(baselineMap: number, contributions: number[]): number {
  return baselineMap + contributions.reduce((sum, c) => sum + c, 0)
}

/**
 * Fraction (0-1) of the response that has caught up by `elapsedMinutes` after a
 * titration. 0 before `lag.minMinutes`; 1 at/after `lag.maxMinutes` (or `minMinutes`
 * if the lag has no range); linear in between.
 */
export function responseFraction(elapsedMinutes: number, lag: TitrationInterval): number {
  const settleAt = lag.maxMinutes ?? lag.minMinutes
  // Check settleAt first: when the lag has no range (minMinutes === settleAt), response
  // is immediate at minMinutes, not held at 0 by the "before minMinutes" check below.
  if (elapsedMinutes >= settleAt) return 1
  if (elapsedMinutes <= lag.minMinutes) return 0
  return (elapsedMinutes - lag.minMinutes) / (settleAt - lag.minMinutes)
}

/** Interpolates MAP from `currentMap` toward `projectedMap` by `fraction` (0-1), rounded to the nearest mmHg. */
export function stepTowardTarget(currentMap: number, projectedMap: number, fraction: number): number {
  const clampedFraction = Math.max(0, Math.min(fraction, 1))
  return Math.round(currentMap + (projectedMap - currentMap) * clampedFraction)
}
