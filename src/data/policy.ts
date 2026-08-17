/**
 * CP 4-156 "Administration and Titration of Intravenous Medications" — policy constants.
 *
 * Wording is drawn directly from `docs/references/CP4-156.doc` (rev. 03/30/2026). This is
 * data only; the engine that enforces these rules (documentation.ts, guardrails.ts, …)
 * is Phase 4.
 */
import type { DocumentationCadencePoint, DocumentationLocation, DrugId } from '../state/types'

export interface DocumentationCadenceEntry {
  point: DocumentationCadencePoint
  label: string
  description: string
}

/**
 * "The measurable criteria shall be documented upon initiation of the titratable
 * medication, 30 minutes after starting the infusion, prior to titration, and 30
 * minutes after titration."
 */
export const DOCUMENTATION_CADENCE: DocumentationCadenceEntry[] = [
  {
    point: 'initiation',
    label: 'At initiation',
    description: 'Measurable criteria documented when the titratable medication is first started.',
  },
  {
    point: 'plus30Start',
    label: '+30 min after start',
    description: 'Measurable criteria documented 30 minutes after starting the infusion.',
  },
  {
    point: 'preTitration',
    label: 'Before each titration',
    description: 'Measurable criteria documented immediately before any rate/dose change.',
  },
  {
    point: 'plus30PostTitration',
    label: '+30 min after titration',
    description: 'Measurable criteria documented 30 minutes after each titration.',
  },
]

/**
 * "Initial IV rate is documented in MAR. Subsequent IV rate changes are documented on
 * the electronic flowsheet (iView)... Discontinuing an IV Infusion is documented in MAR."
 */
export const DOCUMENTATION_PLACEMENT: Record<
  'beginBag' | 'initialRate' | 'titration' | 'discontinuation',
  DocumentationLocation
> = {
  beginBag: 'MAR',
  initialRate: 'MAR',
  titration: 'iView',
  discontinuation: 'MAR',
}

export interface MedicationVerificationEntry {
  independentDoubleCheckRequired: boolean
  bcmaRequired: boolean
  iTraceRequired: boolean
}

/**
 * Phase 19d: per-`DrugId` verification requirements — this used to be a single global
 * "not high-alert" flag (correct for every vasoactive at this institution, per an
 * earlier educator correction), but CP4-156.doc's own text treats sedation/analgesia
 * with extra caution, and per the user's direct, real institutional confirmation:
 * fentanyl (like propofol/midazolam/ketamine, out of scope this phase) IS high-alert
 * and requires an independent (two-nurse) double-check before programming; the existing
 * vasoactives, dexmedetomidine, and diltiazem do NOT. Modeled per-drug (not a one-off
 * boolean) precisely so the propofol/midazolam/ketamine family can be added the same
 * way later without restructuring this constant.
 *
 * BCMA verification against the order and I-TRACE line-tracing apply to every drug here
 * regardless of high-alert status, performed by the administering nurse alone, once, at
 * initiation (see state/store.ts's submitDose and CLAUDE.md's non-negotiable rules).
 * The independent double-check, where required, is an ADDITIONAL gate on top of that —
 * also initiation-only, never re-required at titration (see IndependentCheckPanel.tsx).
 */
export const MEDICATION_VERIFICATION: Record<DrugId, MedicationVerificationEntry> = {
  norepinephrine: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  epinephrine: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  phenylephrine: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  dopamine: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  dobutamine: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  milrinone: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  vasopressin: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  dexmedetomidine: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  diltiazem: { independentDoubleCheckRequired: false, bcmaRequired: true, iTraceRequired: true },
  fentanyl: { independentDoubleCheckRequired: true, bcmaRequired: true, iTraceRequired: true },
}

/**
 * "If the medication needs to be restarted based on the assessment of the patient and
 * physiological parameters of the titrated medication, the medication should be restarted
 * at the rate required immediately before pausing the infusion... If a provider places a
 * new order... this new order should supersede the standard approach."
 */
export const RESTART_AFTER_PAUSE_RULE = {
  description:
    "A paused titratable infusion restarted on the patient's assessment resumes at the rate " +
    'in effect immediately before the pause, then titrates per the order. A new provider order ' +
    'that specifies a different restart approach supersedes this default.',
}

/**
 * "Infusions that have been titrated off and remained off for 2 hours should be immediately
 * removed from the pump, disconnected from the patient and discarded, and the primary
 * provider/team should be notified."
 */
export const OFF_FOR_TWO_HOURS_RULE = {
  thresholdMinutes: 120,
  description:
    'An infusion titrated off and left off for 2 hours must be removed from the pump, ' +
    'disconnected from the patient, discarded, and the primary provider/team notified.',
}

/**
 * "If the patient is stable for 2 hours after stopping the titratable infusion, contact
 * provider to consider discontinuing the order for the infusion." A distinct rule from
 * OFF_FOR_TWO_HOURS_RULE above — this one is about the patient's stability, not removal.
 */
export const STABLE_OFF_TWO_HOURS_RULE = {
  thresholdMinutes: 120,
  description:
    'If the patient remains stable for 2 hours after a titratable infusion is stopped, ' +
    'contact the provider to consider discontinuing the order.',
}

/**
 * "If there is an immediate risk to patient safety or a life-threatening condition and rapid
 * titration of a medication is necessary, the registered nurse may titrate as needed and
 * document all the titration elements below. If the episode... exceeds four hours, a new
 * block of charting documentation should be utilized."
 */
export const BLOCK_OF_CHARTING = {
  maxDurationMinutes: 240,
  requiredElements: [
    'Time of initiation',
    'Name of medication administered',
    'Starting rate/dose',
    'Ending rate/dose',
    'Maximum rate/dose administered',
    'Time of completion',
    'Physiological parameters evaluated',
  ],
  description:
    'When an immediate risk to patient safety or a life-threatening condition requires rapid ' +
    'titration, the RN may titrate as needed and document these elements; the provider is ' +
    'notified as soon as reasonably possible; a new block starts if the episode exceeds 4 hours.',
}

/**
 * Automatic pass/fail threshold for the skill sign-off requirement (Phase 15) — see
 * engine/scoring.ts's isSkillPassed. Not a CP 4-156 clinical rule like the constants
 * above — a training-program assessment bar, kept here rather than hardcoded in a
 * component per this project's "no hard-coded clinical/assessment values in
 * components" convention. Only ever evaluated for a validation-mode debrief; training
 * runs never count toward the requirement regardless of score.
 */
export const SKILL_SIGNOFF_CRITERIA = {
  minOverallPercent: 90,
  requireNoMissedCategory: true,
  description:
    "A validation-mode run meets the skill sign-off requirement when the debrief scorecard's " +
    'overall percent is at least 90% and no category is scored "missed."',
}
