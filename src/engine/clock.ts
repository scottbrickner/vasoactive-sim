/**
 * Sim clock (BUILD_BRIEF §7): tracks sim time and exposes whether a titration is
 * allowed yet and whether a documentation checkpoint is due. Pure — no timers or
 * side effects; the caller (Phase 5) drives the clock forward and asks these
 * functions yes/no questions.
 */
import type { DocumentationCadencePoint, TitrationInterval } from '../state/types'

/** Minutes required to elapse before each documentation checkpoint is "due". */
const CHECKPOINT_ELAPSED_MINUTES: Record<DocumentationCadencePoint, number> = {
  initiation: 0,
  plus30Start: 30,
  preTitration: 0,
  plus30PostTitration: 30,
}

export function advance(currentMinute: number, byMinutes: number): number {
  if (byMinutes < 0) {
    throw new Error('Sim clock cannot move backwards.')
  }
  return currentMinute + byMinutes
}

/** Minutes elapsed since `sinceMinute`. Throws if the clock appears to have gone backwards. */
export function minutesElapsed(currentMinute: number, sinceMinute: number): number {
  if (currentMinute < sinceMinute) {
    throw new Error('currentMinute precedes sinceMinute — sim clock cannot go backwards.')
  }
  return currentMinute - sinceMinute
}

/**
 * Whether the minimum interval for the next titration has been satisfied. `interval`'s
 * `maxMinutes` (when present) is a reassessment target, not a hard cutoff — titrating
 * later than it remains allowed.
 */
export function isTitrationIntervalSatisfied(
  currentMinute: number,
  lastActionMinute: number,
  interval: TitrationInterval,
): boolean {
  return minutesElapsed(currentMinute, lastActionMinute) >= interval.minMinutes
}

/**
 * Whether a CP 4-156 documentation checkpoint is due. `initiation` and `preTitration`
 * are event-triggered — due immediately (elapsed 0) at their associated action; the two
 * "+30 min" checkpoints require 30 elapsed minutes since their reference event.
 */
export function isDocumentationCheckpointDue(
  point: DocumentationCadencePoint,
  currentMinute: number,
  referenceMinute: number,
): boolean {
  return minutesElapsed(currentMinute, referenceMinute) >= CHECKPOINT_ELAPSED_MINUTES[point]
}
