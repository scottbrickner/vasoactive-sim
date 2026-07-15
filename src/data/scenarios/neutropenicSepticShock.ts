/**
 * First scenario (BUILD_BRIEF §6 / CLINICAL_SPEC.md worked example).
 *
 * 55F, 68 kg, neutropenic septic shock post-induction chemo. Norepinephrine is hanging
 * but Begin Bag is incomplete and the rate is stopped — the learner must verify (I-TRACE),
 * complete Begin Bag, and start at the ordered rate. Agent 2 (vasopressin) activates once
 * norepinephrine reaches 1/3 of its ordered maximum with MAP still below target.
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
  initialInfusions: [
    {
      id: 'infusion-norepinephrine',
      orderId: 'order-norepinephrine-agent1',
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
      // 1/3 of norepi's ordered max — real practice adds a second agent well before the
      // first is maxed out, not only once it's exhausted (see engine/activation.ts for
      // the derived display text this drives, and store.ts's priorAgentsActivationMet
      // for the actual comparison).
      activationThreshold: 1 / 3,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  // Declining trend into shock, ending at startingVitals — context a nurse coming onto
  // shift would always see. Never a hint about what/when to chart (see CernerIView).
  priorVitals: [
    {
      minutesBeforeStart: 180,
      vitals: { hr: 92, sbp: 108, dbp: 68, map: 81, spo2: 98, rhythm: 'Sinus rhythm' },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 104, sbp: 96, dbp: 58, map: 71, spo2: 97, rhythm: 'Sinus tachycardia' },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 112, sbp: 88, dbp: 52, map: 64, spo2: 97, rhythm: 'Sinus tachycardia' },
    },
  ],
  // Illustrative response ceilings (not sourced from Attachment B — physiology.ts is
  // scenario-tuned data, see its module doc). Norepinephrine alone, even at its ordered
  // maximum, is deliberately tuned to fall short of target (57 + 6 = 63 < 65) — this is
  // what drives the need for agent 2. Adding vasopressin at its max closes the gap
  // (63 + 5 = 68 >= 65), matching CLINICAL_SPEC.md's worked example.
  responseModel: {
    norepinephrine: { maxMapContribution: 6 },
    vasopressin: { maxMapContribution: 5 },
  },
  // Illustrative deterioration curve: untreated septic shock doesn't hold steady at
  // 57 — MAP declines further the longer no agent is actively infusing. 0.5 mmHg/min
  // reaches the 15 mmHg cap (MAP 42) after 30 min untreated, a realistic window for a
  // training scenario where a nurse might legitimately take some minutes to intervene.
  deterioration: { ratePerMinute: 0.5, maxDrop: 15 },
  objective: 'Titrate norepinephrine as ordered, and sequence in a second pressor once it stops being enough on its own.',
  enableBlockOfCharting: true,
}
