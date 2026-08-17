/**
 * Pure "what were the live vitals at a given sim minute" lookup against
 * SimState.vitalsHistory — extracted from TitrationTimeline.tsx's inline `vitalsAt`
 * closure (Phase 8c) so a second consumer (Phase 18's ungrouped titration/vitals
 * history table) can share the exact same logic instead of re-deriving it, mirroring
 * how infusionRateHistory.ts was pulled out of a component in Phase 17. No React/DOM
 * here per CLAUDE.md's engine-purity rule; TitrationTimeline.tsx itself is unchanged —
 * it keeps its own retrospective-charting purpose and can be migrated to call this
 * later without a behavior change.
 */
import type { VitalSigns } from '../state/types'

export interface VitalsHistoryPoint {
  minute: number
  vitals: VitalSigns
}

/**
 * The latest `vitalsHistory` entry at or before `minute` — i.e. what the monitor
 * actually showed at that moment. Null when `minute` is before the first recorded
 * entry (or `vitalsHistory` is empty).
 */
export function vitalsAtMinute(vitalsHistory: VitalsHistoryPoint[], minute: number): VitalSigns | null {
  const candidate = vitalsHistory
    .filter((h) => h.minute <= minute)
    .reduce<VitalsHistoryPoint | null>((best, h) => (best == null || h.minute > best.minute ? h : best), null)
  return candidate?.vitals ?? null
}
