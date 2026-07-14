/**
 * CP 4-156 "Administration and Titration of Intravenous Medications" — policy constants.
 *
 * Wording is drawn directly from `docs/references/CP4-156.doc` (rev. 03/30/2026). This is
 * data only; the engine that enforces these rules (documentation.ts, guardrails.ts, …)
 * is Phase 4.
 */
import type { DocumentationCadencePoint, DocumentationLocation } from '../state/types'

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

/**
 * Vasoactives are NOT designated high-alert at this institution — no independent
 * (two-nurse) double-check is required. BCMA verification against the order and
 * I-TRACE line-tracing still apply, performed by the administering nurse alone, at
 * initiation and every titration.
 */
export const MEDICATION_VERIFICATION = {
  independentDoubleCheckRequired: false,
  bcmaRequired: true,
  iTraceRequired: true,
  appliesTo: ['initiation', 'titration'] as const,
  description:
    'Vasoactive infusions are not high-alert here, so no independent (two-nurse) double-check ' +
    'is required. The administering nurse still verifies the medication against the order via ' +
    'BCMA and traces the line to the patient (I-TRACE) at initiation and at every titration.',
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
