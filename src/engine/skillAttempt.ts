/**
 * Skill-attempt record building (Phase 15) — pure, no React/DOM. One completed
 * simulation run's outcome, recorded at every debrief arrival (training and
 * validation alike, so usage can be counted), even though only a validation-mode
 * `passed: true` entry counts as meeting the skill sign-off requirement (see
 * state/skillTrackingStore.ts). Shaped for an eventual Power Automate/Dataverse POST
 * (see sync/telemetry.ts) — not sent automatically unless that env var is set.
 */
import { isSkillPassed, type Scorecard, type ScoreCategory } from './scoring'
import type { SimMode } from '../state/types'

export interface LearnerIdentity {
  name: string
  email: string
}

export interface AttemptRecord {
  recordType: 'vasoactive-skill-attempt'
  attemptId: string
  scenarioId: string
  /** Human-readable label for export/display — the scenario's own admissionReason, supplied by the caller so this module stays decoupled from data/scenarios. */
  scenarioLabel: string
  mode: SimMode
  learnerName: string
  learnerEmail: string
  overallPercent: number | null
  categories: ScoreCategory[]
  passed: boolean
  recordedAt: string
}

export function buildAttemptRecord(params: {
  attemptId: string
  scenarioId: string
  scenarioLabel: string
  mode: SimMode
  identity: LearnerIdentity | null
  card: Scorecard
  recordedAt?: string
}): AttemptRecord {
  const { attemptId, scenarioId, scenarioLabel, mode, identity, card, recordedAt } = params
  return {
    recordType: 'vasoactive-skill-attempt',
    attemptId,
    scenarioId,
    scenarioLabel,
    mode,
    learnerName: identity?.name ?? '',
    learnerEmail: identity?.email ?? '',
    overallPercent: card.overallPercent,
    categories: card.categories,
    passed: mode === 'validation' && isSkillPassed(card),
    recordedAt: recordedAt ?? new Date().toISOString(),
  }
}
