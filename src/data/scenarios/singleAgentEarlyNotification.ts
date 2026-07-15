/**
 * Second scenario — single-agent focus on timely provider notification.
 *
 * 62M, 74 kg, early septic shock. Norepinephrine alone is deliberately tuned to be
 * SUFFICIENT this time (contrast with the flagship scenario, where a second agent is
 * required) — the teaching point here is behavior/timing, not multi-agent escalation:
 * notify the provider proactively once the order's early-notification checkpoint (30%
 * of max) is reached with MAP still below target, rather than waiting until the order's
 * maximum is exhausted.
 */
import type { ScenarioConfig } from '../../state/types'

export const SINGLE_AGENT_EARLY_NOTIFICATION: ScenarioConfig = {
  id: 'single-agent-early-notification',
  patient: {
    ageYears: 62,
    sex: 'male',
    weightKg: 74,
  },
  admissionReason: 'Early septic shock following recent induction chemotherapy; oncology ICU — single-pressor management anticipated.',
  startingVitals: {
    hr: 114,
    sbp: 82,
    dbp: 46,
    map: 58,
    spo2: 95,
    rhythm: 'Sinus tachycardia',
  },
  initialInfusions: [
    {
      id: 'infusion-norepinephrine-sa',
      orderId: 'order-norepinephrine-sa',
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
      id: 'order-norepinephrine-sa',
      drugId: 'norepinephrine',
      sequence: 1,
      startDose: 0.5,
      maxDose: 30,
      increment: 0.5,
      interval: { minMinutes: 3, maxMinutes: 5 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
      // Crosses at 9 of 30 mcg/min (30%) — well before the order's own maximum.
      earlyNotificationThreshold: 0.3,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  priorVitals: [
    {
      minutesBeforeStart: 180,
      vitals: { hr: 90, sbp: 110, dbp: 70, map: 83, spo2: 98, rhythm: 'Sinus rhythm' },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 100, sbp: 98, dbp: 60, map: 73, spo2: 97, rhythm: 'Sinus tachycardia' },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 108, sbp: 90, dbp: 54, map: 66, spo2: 96, rhythm: 'Sinus tachycardia' },
    },
  ],
  // Illustrative response ceiling — norepinephrine alone, at its ordered maximum, is
  // sufficient this time (58 + 8 = 66 >= 65), unlike the flagship scenario.
  responseModel: {
    norepinephrine: { maxMapContribution: 8 },
  },
  deterioration: { ratePerMinute: 0.4, maxDrop: 12 },
  objective:
    "Titrate norepinephrine alone toward target, and notify the provider proactively once you're at the order's early-notification checkpoint with MAP still low — don't wait until you're at the ordered maximum.",
  enableBlockOfCharting: false,
}
