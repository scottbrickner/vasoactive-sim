/**
 * Infusion pause/restart/discontinue and Block of Charting rules (BUILD_BRIEF extension,
 * Phase 7): pure derived checks over CP 4-156's pause/restart/2-hour/Block-of-Charting
 * policy (data/policy.ts). No store coupling.
 *
 * All checks here are DERIVED comparisons against a stored minute, never live timers —
 * this sim's clock only ever advances on explicit learner action (see engine/clock.ts),
 * so "how long has this been stopped" is always `clockMinutes - stoppedAtMinute`, computed
 * on demand. This also sidesteps a "who owns the timer" problem before facilitator mode
 * introduces a second window.
 */
import { BLOCK_OF_CHARTING, OFF_FOR_TWO_HOURS_RULE, STABLE_OFF_TWO_HOURS_RULE } from '../data/policy'

export function minutesStopped(currentMinute: number, stoppedAtMinute: number): number {
  return currentMinute - stoppedAtMinute
}

/** OFF_FOR_TWO_HOURS_RULE: past this, the infusion must be removed from the pump and the provider notified. */
export function isPastRemovalThreshold(currentMinute: number, stoppedAtMinute: number): boolean {
  return minutesStopped(currentMinute, stoppedAtMinute) >= OFF_FOR_TWO_HOURS_RULE.thresholdMinutes
}

/** STABLE_OFF_TWO_HOURS_RULE: past this, contact the provider to consider discontinuing the order. */
export function isPastStableReviewThreshold(currentMinute: number, stoppedAtMinute: number): boolean {
  return minutesStopped(currentMinute, stoppedAtMinute) >= STABLE_OFF_TWO_HOURS_RULE.thresholdMinutes
}

/** BLOCK_OF_CHARTING: an episode running this long should be closed and a new block started. */
export function isBlockOverMaxDuration(startMinute: number, currentMinute: number): boolean {
  return currentMinute - startMinute >= BLOCK_OF_CHARTING.maxDurationMinutes
}
