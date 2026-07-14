/**
 * First scenario (BUILD_BRIEF §6 / CLINICAL_SPEC.md worked example).
 *
 * 55F, 68 kg, neutropenic septic shock post-induction chemo. Norepinephrine is hanging
 * but Begin Bag is incomplete and the rate is stopped — the learner must verify (I-TRACE),
 * complete Begin Bag, and start at the ordered rate. Agent 2 (vasopressin) activates once
 * norepinephrine is at its ordered maximum with MAP still below target.
 */
import type { ScenarioConfig } from '../../state/types'

export const NEUTROPENIC_SEPTIC_SHOCK: ScenarioConfig = {
  id: 'neutropenic-septic-shock',
  patient: {
    ageYears: 55,
    sex: 'female',
    weightKg: 68,
  },
  admissionReason: 'Neutropenic septic shock following induction chemotherapy; oncology ICU',
  startingVitals: {
    hr: 118,
    sbp: 80,
    dbp: 46,
    map: 57,
    spo2: 96,
    rhythm: 'Sinus tachycardia',
  },
  initialInfusion: {
    id: 'infusion-norepinephrine',
    orderId: 'order-norepinephrine-agent1',
    drugId: 'norepinephrine',
    status: 'hanging',
    rate: 0,
    channel: 'A',
    beginBagCompleted: false,
  },
  orders: [
    {
      id: 'order-norepinephrine-agent1',
      drugId: 'norepinephrine',
      sequence: 1,
      startDose: 0.5,
      maxDose: 30,
      increment: 0.5,
      interval: { minMinutes: 3, maxMinutes: 5 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
    },
    {
      id: 'order-vasopressin-agent2',
      drugId: 'vasopressin',
      sequence: 2,
      startDose: 0.02,
      maxDose: 0.04,
      increment: 0.01,
      // Attachment B defines no interval for the shock indication; prescriber-defined here.
      interval: { minMinutes: 30 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
      activatesWhen: 'Norepinephrine at its ordered maximum (30 mcg/min) with MAP still < 65 mmHg.',
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
}
