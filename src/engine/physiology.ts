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
import type { TitrationInterval, VitalSigns } from '../state/types'

/**
 * MAP (mmHg) a single agent contributes once fully responded, scaled from 0 at dose 0
 * to `maxMapContribution` at `maxDose` via `sqrt(fraction)` rather than a straight
 * line — more physiologically realistic (most of a pressor's effect shows up early,
 * tapering as it approaches its ceiling) and, in practice, what makes the first
 * several ordered titration steps actually move the monitor instead of rounding to
 * zero. `f(0)=0` and `f(1)=1` for any such curve, so `dose === maxDose` still always
 * yields the full ceiling — only the trajectory between 0 and max changes. Doses are
 * clamped to [0, maxDose].
 */
export function projectDoseResponse(dose: number, maxDose: number, maxMapContribution: number): number {
  const clamped = Math.max(0, Math.min(dose, maxDose))
  const fraction = maxDose > 0 ? clamped / maxDose : 0
  return Math.sqrt(fraction) * maxMapContribution
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

/**
 * Cumulative MAP deterioration (mmHg, as a positive magnitude below baseline)
 * accrued over one clock tick while no agent is actively treating the patient —
 * septic shock doesn't hold steady on its own. Capped at `maxDrop` so it doesn't run
 * away to implausible values; the caller is responsible for freezing this (passing
 * `elapsedMinutes = 0`, or simply not calling it) once treatment resumes.
 */
export function accumulateDeterioration(
  currentOffset: number,
  elapsedMinutes: number,
  ratePerMinute: number,
  maxDrop: number,
): number {
  return Math.min(currentOffset + elapsedMinutes * ratePerMinute, maxDrop)
}

/**
 * Derives live SBP/DBP from a live MAP, holding pulse pressure at the scenario's
 * starting value (MAP ≈ DBP + PP/3, the standard clinical approximation). HR/SpO2
 * stay out of scope — full independent per-vital modeling is a later phase; this only
 * makes the blood-pressure numbers (and whatever gets charted from them) track MAP
 * instead of sitting frozen at their starting values.
 */
export function deriveBloodPressure(liveMap: number, startingVitals: VitalSigns): { sbp: number; dbp: number } {
  const pulsePressure = startingVitals.sbp - startingVitals.dbp
  const dbp = liveMap - pulsePressure / 3
  const sbp = dbp + pulsePressure
  return { sbp: Math.round(sbp), dbp: Math.round(dbp) }
}

/**
 * Deterministic, periodic natural variation (beat-to-beat/respiratory swing, not
 * random noise) — a sine wave in sim-clock minutes, deliberately NOT `Math.random()`
 * so this stays a pure, exactly-repeatable function of the clock (engine/ must stay
 * fully unit-testable). `phaseOffset` lets two different vitals ride distinct waves
 * so they don't move in lockstep. Callers are responsible for rounding and for never
 * applying this to a value clinical logic keys off (e.g. MAP) — see advanceClock's
 * doc comment on why HR/SBP/DBP are safe targets and MAP isn't.
 */
export function periodicVariability(minute: number, amplitude: number, periodMinutes: number, phaseOffset = 0): number {
  return amplitude * Math.sin((2 * Math.PI * (minute + phaseOffset)) / periodMinutes)
}
