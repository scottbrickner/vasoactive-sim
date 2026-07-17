/**
 * Third scenario — two-agent sequencing focus, fresh vignette (distinct patient/etiology
 * from the flagship neutropenic septic shock scenario, for real variety in the
 * randomized pool).
 *
 * 70F, 80 kg, septic shock from ascending cholangitis in the setting of a pancreatic
 * head mass, post-ERCP. Norepinephrine alone is deliberately insufficient (same
 * structural pattern as the flagship, different numbers) — phenylephrine (agent 2)
 * activates well before norepinephrine is maxed out. Teaching point: follow the
 * ordered parameters for BOTH pressors, and know which to titrate first to effect.
 */
import type { ScenarioConfig } from '../../state/types'

export const SEQUENTIAL_PRESSOR_ESCALATION: ScenarioConfig = {
  id: 'sequential-pressor-escalation',
  patient: {
    ageYears: 70,
    sex: 'female',
    weightKg: 80,
  },
  admissionReason: 'Septic shock from ascending cholangitis in the setting of a pancreatic head mass; post-ERCP, oncology ICU.',
  startingVitals: {
    hr: 122,
    sbp: 81,
    dbp: 42,
    map: 55,
    spo2: 95,
    rhythm: 'Sinus tachycardia',
  },
  initialInfusions: [
    {
      id: 'infusion-norepinephrine-spe',
      orderId: 'order-norepinephrine-spe',
      drugId: 'norepinephrine',
      status: 'hanging',
      rate: 0,
      initialRate: null,
      channel: 'A',
      beginBagCompleted: false,
      lastActionMinute: null,
      stoppedAtMinute: null,
      rateBeforePause: null,
    },
  ],
  orders: [
    {
      id: 'order-norepinephrine-spe',
      drugId: 'norepinephrine',
      sequence: 1,
      startDose: 0.5,
      maxDose: 30,
      increment: 0.5,
      interval: { minMinutes: 3, maxMinutes: 5 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
    },
    {
      id: 'order-phenylephrine-spe',
      drugId: 'phenylephrine',
      sequence: 2,
      startDose: 50,
      maxDose: 200,
      increment: 25,
      interval: { minMinutes: 5 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
      // 40% of norepi's ordered max — activates well before norepi is exhausted.
      activationThreshold: 0.4,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  priorVitals: [
    {
      minutesBeforeStart: 180,
      vitals: { hr: 96, sbp: 112, dbp: 72, map: 85, spo2: 98, rhythm: 'Sinus rhythm' },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 108, sbp: 98, dbp: 60, map: 73, spo2: 97, rhythm: 'Sinus tachycardia' },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 116, sbp: 88, dbp: 50, map: 63, spo2: 96, rhythm: 'Sinus tachycardia' },
    },
  ],
  // Norepinephrine alone, even at its ordered maximum, is deliberately tuned to fall
  // short of target (55 + 6 = 61 < 65) — phenylephrine closes the gap (61 + 6 = 67 >= 65).
  responseModel: {
    norepinephrine: { maxMapContribution: 6, maxHrContribution: -10, maxSpo2Contribution: 1 },
    // Pure alpha-agonism plus the baroreceptor reflex from a rising SVR means
    // phenylephrine tends to ease (not add to) HR too, not just close the MAP gap.
    phenylephrine: { maxMapContribution: 6, maxHrContribution: -8, maxSpo2Contribution: 1 },
  },
  deterioration: { ratePerMinute: 0.5, maxDrop: 15 },
  objective:
    'Follow the ordered titration parameters for both pressors, and add phenylephrine once norepinephrine alone is no longer closing the gap to target — well before it hits its ordered maximum.',
  enableBlockOfCharting: false,
}
