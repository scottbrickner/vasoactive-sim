/**
 * Shell-only types for Phase 1.
 *
 * The full clinical state model (Order, DrugDefinition, SimState, LogEntry, …) lands in
 * Phase 2 per docs/BUILD_BRIEF.md §8 — deliberately NOT defined here yet.
 */

/** The three top-level phases of the learner flow. Mirrors the eventual SimState.phase. */
export type Phase = 'intro' | 'sim' | 'debrief'

/** Placeholder header readout. Real values will be driven by the physiology engine (Phase 4). */
export interface HeaderReadout {
  /** Elapsed simulation time, in minutes. */
  clockMinutes: number
  /** Current mean arterial pressure (mmHg), or null before the sim starts. */
  currentMap: number | null
  /** Target MAP for the scenario (mmHg). */
  targetMap: number
}
