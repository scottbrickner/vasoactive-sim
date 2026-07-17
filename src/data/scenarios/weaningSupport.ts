/**
 * Fourth scenario — weaning focus. All three agents are pre-seeded already infusing
 * (via `initialInfusions`) — the exercise IS the weaning, not re-escalating through
 * three agents first.
 *
 * 58F, 65 kg, day 3 of septic shock management following a recent hematologic
 * malignancy diagnosis; now stabilizing, MAP comfortably above target on norepinephrine
 * + vasopressin + phenylephrine. Teaching point: follow the ordered weaning priority —
 * clear the most recently added adjunct agent (phenylephrine) before reducing the next
 * (vasopressin), and the mainstay agent (norepinephrine) last — confirming MAP holds
 * above target at each step.
 *
 * `weanOrder` is deliberately the inverse of `sequence`: the last-escalated agent
 * (phenylephrine, sequence 3) weans first (weanOrder 1); the first-line mainstay
 * (norepinephrine, sequence 1) weans last (weanOrder 3).
 */
import type { ScenarioConfig } from '../../state/types'

export const WEANING_SUPPORT: ScenarioConfig = {
  id: 'weaning-support',
  patient: {
    ageYears: 58,
    sex: 'female',
    weightKg: 65,
  },
  admissionReason:
    'Day 3 of septic shock management following a recent hematologic malignancy diagnosis; oncology ICU — now stabilizing and weaning vasoactive support.',
  startingVitals: {
    hr: 92,
    sbp: 98,
    dbp: 62,
    map: 74,
    spo2: 97,
    rhythm: 'Sinus rhythm',
  },
  initialInfusions: [
    {
      id: 'infusion-norepinephrine-ws',
      orderId: 'order-norepinephrine-ws',
      drugId: 'norepinephrine',
      status: 'infusing',
      rate: 15,
      initialRate: 15,
      channel: 'A',
      beginBagCompleted: true,
      lastActionMinute: null,
      stoppedAtMinute: null,
      rateBeforePause: null,
    },
    {
      id: 'infusion-vasopressin-ws',
      orderId: 'order-vasopressin-ws',
      drugId: 'vasopressin',
      status: 'infusing',
      rate: 0.03,
      initialRate: 0.03,
      channel: 'B',
      beginBagCompleted: true,
      lastActionMinute: null,
      stoppedAtMinute: null,
      rateBeforePause: null,
    },
    {
      id: 'infusion-phenylephrine-ws',
      orderId: 'order-phenylephrine-ws',
      drugId: 'phenylephrine',
      status: 'infusing',
      rate: 100,
      initialRate: 100,
      channel: 'C',
      beginBagCompleted: true,
      lastActionMinute: null,
      stoppedAtMinute: null,
      rateBeforePause: null,
    },
  ],
  orders: [
    {
      id: 'order-norepinephrine-ws',
      drugId: 'norepinephrine',
      sequence: 1,
      startDose: 0.5,
      maxDose: 30,
      increment: 0.5,
      interval: { minMinutes: 3, maxMinutes: 5 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
      weanOrder: 3,
    },
    {
      id: 'order-vasopressin-ws',
      drugId: 'vasopressin',
      sequence: 2,
      startDose: 0.02,
      maxDose: 0.04,
      increment: 0.01,
      interval: { minMinutes: 30 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
      weanOrder: 2,
    },
    {
      id: 'order-phenylephrine-ws',
      drugId: 'phenylephrine',
      sequence: 3,
      startDose: 50,
      maxDose: 200,
      increment: 25,
      interval: { minMinutes: 5 },
      target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
      weanOrder: 1,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  // An improving trend over the last 3 hours, leading into the current stabilized state
  // — the opposite direction from the other scenarios, matching this patient's "day 3,
  // getting better" story.
  priorVitals: [
    {
      minutesBeforeStart: 180,
      vitals: { hr: 108, sbp: 84, dbp: 50, map: 61, spo2: 94, rhythm: 'Sinus tachycardia' },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 100, sbp: 90, dbp: 56, map: 67, spo2: 95, rhythm: 'Sinus tachycardia' },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 96, sbp: 94, dbp: 60, map: 71, spo2: 96, rhythm: 'Sinus rhythm' },
    },
  ],
  // Modest ceilings — these three agents are already largely responsible for the
  // currently-displayed MAP (74), so contributions are kept small relative to
  // `startingVitals.map` itself (see engine/physiology.ts's projectMap, which adds
  // these on TOP of startingVitals.map). Still enough that down-titrating any agent
  // measurably eases MAP toward target — the real risk this scenario is teaching.
  // HR/SpO2 ceilings kept just as modest as MAP's here (see the comment above) — the
  // point is a real, felt signal if weaned too fast (HR creeps back up as a
  // pressor's contribution shrinks), not a dramatic swing.
  responseModel: {
    norepinephrine: { maxMapContribution: 2, maxHrContribution: -1, maxSpo2Contribution: 0.5 },
    vasopressin: { maxMapContribution: 2, maxHrContribution: -1, maxSpo2Contribution: 0.5 },
    phenylephrine: { maxMapContribution: 3, maxHrContribution: -1.5, maxSpo2Contribution: 0.5 },
  },
  // Gentle but nonzero — only accrues if every agent is ever fully discontinued at
  // once, which stays a real (if edge-case) risk of weaning too aggressively.
  deterioration: { ratePerMinute: 0.3, maxDrop: 10 },
  objective:
    "Wean vasoactive support in the correct order — clear the most recently added adjunct agent before reducing the next, confirming MAP holds above target at each step.",
  enableBlockOfCharting: false,
}
