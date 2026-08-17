/**
 * First scenario (BUILD_BRIEF §6 / CLINICAL_SPEC.md worked example).
 *
 * 55F, 68 kg, neutropenic septic shock post-induction chemo. Norepinephrine is hanging
 * but Begin Bag is incomplete and the rate is stopped — the learner must verify (I-TRACE),
 * complete Begin Bag, and start at the ordered rate. Agent 2 (vasopressin) activates once
 * norepinephrine reaches 1/3 of its ordered maximum with MAP still below target.
 */
import type { DecisionPoint, ScenarioConfig } from '../../state/types'

/**
 * Phase 18's authored "what's your next move" decision points for the flagship
 * scenario — covers all four order-boundary trap types from the validated mockup
 * (titration-judgment-mockup.html) using only 'postTitrate'/'weanEligible' triggers,
 * deliberately NOT 'earlyNotification' — that trigger stays reserved for the
 * synthesized default (engine/decisionPoints.ts's buildAutoEarlyNotificationDecisionPoint),
 * which several store.test.ts cases exercise directly against this scenario's norepi
 * order by setting a custom earlyNotificationThreshold at test time; an authored
 * decision point on that same trigger would silently supersede those tests' fallback
 * assertions.
 */
const DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'neutropenic-septic-shock-documentation',
    trapType: 'documentationPlacement',
    // Scoped to vasopressin specifically (not norepinephrine — the far more heavily
    // exercised order in this scenario's unit tests) so this decision point only fires
    // once a learner has genuinely progressed to titrating the second agent, never
    // incidentally mid-way through an unrelated norepinephrine-only test sequence.
    trigger: { kind: 'postTitrate', orderId: 'order-vasopressin-agent2' },
    situation: "You've just titrated vasopressin for the first time this session. Time to document the assessment that goes with it.",
    policyHint: 'CP 4-156: Begin Bag + initial rate chart in MAR; every subsequent titration charts in iView, not MAR.',
    options: [
      {
        id: 'chart-iview',
        label: 'Chart the assessment in iView',
        caption: 'Titrations and their associated vitals chart in iView, per CP 4-156.',
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: { text: 'Correct placement — titration follow-up documents in iView, not the MAR.' },
      },
      {
        id: 'chart-mar',
        label: 'Chart the rate change in the MAR',
        caption: 'The MAR holds Begin Bag and the initial rate only.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'critical',
        feedback: {
          text: 'The MAR only ever holds Begin Bag and the initial rate — a rate change after that belongs in iView, not the MAR.',
        },
      },
      {
        id: 'fluid-bolus',
        label: 'Give a 250 mL normal saline bolus',
        caption: 'No standing order exists for a bolus in this case.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'critical',
        feedback: {
          text: 'There is no standing order for a fluid bolus here — that would need a provider order first, not an independent nursing action.',
        },
      },
    ],
  },
  {
    id: 'neutropenic-septic-shock-weaning',
    trapType: 'weanSequence',
    trigger: { kind: 'weanEligible' },
    situation: 'Both pressors are infusing and MAP is holding at target. What next?',
    policyHint: 'CP 4-156 wean priority: the most recently added agent weans first — vasopressin before norepinephrine here.',
    options: [
      {
        id: 'wean-vasopressin',
        label: 'Wean vasopressin one step',
        caption: 'Vasopressin was added most recently — it weans first.',
        group: 'covered',
        effect: { kind: 'submitDoseRelative', orderId: 'order-vasopressin-agent2', deltaSteps: -1 },
        feedback: { text: 'Correct sequence — the most recently added agent weans first.' },
      },
      {
        id: 'wean-norepinephrine',
        label: 'Wean norepinephrine one step',
        caption: 'Norepinephrine was the first agent started.',
        group: 'gap',
        effect: { kind: 'submitDoseRelative', orderId: 'order-norepinephrine-agent1', deltaSteps: -1 },
        feedback: {
          text: 'Norepinephrine has a lower wean priority than vasopressin — clear vasopressin first before weaning this agent.',
        },
      },
      {
        id: 'push-norepinephrine',
        label: 'Increase norepinephrine to 35 mcg/min',
        caption: "MAP could still trend higher — worth pushing further?",
        group: 'gap',
        effect: { kind: 'submitDose', orderId: 'order-norepinephrine-agent1', dose: 35 },
        feedback: { text: 'That exceeds the ordered maximum of 30 mcg/min — the Guardrails hard limit blocks it outright.' },
      },
    ],
  },
  {
    id: 'neutropenic-septic-shock-escalation',
    trapType: 'doseCeiling',
    // Phase 19c/19g: fires when a titrate attempt on norepinephrine is refused outright
    // (Guardrails hard limit, since this order's max and the drug's own max are both 30
    // mcg/min) in place of the routine "Blocked by Guardrails" toast.
    trigger: { kind: 'escalationAttempt', orderId: 'order-norepinephrine-agent1' },
    situation: "Norepinephrine is already at its ordered maximum and MAP is still below target. What's your next move?",
    policyHint:
      "CP 4-156: once an infusion reaches its ordered maximum with target still unmet, notify the provider — don't push past the order, and don't abandon an agent that's still contributing.",
    options: [
      {
        id: 'notify-provider',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-norepinephrine-agent1' },
        feedback: {
          text: 'Correct — norepinephrine is at its ordered ceiling with MAP still below target, which is exactly when the provider needs to be notified.',
        },
      },
      {
        id: 'chart-and-reassess',
        label: 'Chart vitals and reassess',
        caption: 'Document the current assessment before deciding next steps.',
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: {
          text: 'Charting the current assessment is reasonable and keeps the record current — pair it with notifying the provider next, since the order is already maxed out.',
        },
      },
      {
        id: 'discontinue-norepinephrine',
        label: 'Discontinue norepinephrine',
        caption: "It's not closing the gap to target on its own — pull the order?",
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'critical',
        feedback: {
          text: 'Discontinuing your only pressor while hypotensive removes support entirely — the correct move is escalating (notify the provider), not withdrawing the agent that is still helping.',
        },
      },
    ],
  },
]

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
    rass: 0,
    painScore: 0,
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
      // Phase 18: the mainstay/first-added agent weans LAST — inverse of the up-titration
      // `sequence` field above, per CP 4-156's wean-priority rule (see
      // engine/orderText.ts's deriveWeanPriorityText and this file's DECISION_POINTS).
      weanOrder: 2,
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
      // Most-recently-added agent weans FIRST (see norepinephrine's weanOrder above).
      weanOrder: 1,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  // Declining trend into shock, ending at startingVitals — context a nurse coming onto
  // shift would always see. Never a hint about what/when to chart (see CernerIView).
  priorVitals: [
    {
      minutesBeforeStart: 180,
      vitals: { hr: 92, sbp: 108, dbp: 68, map: 81, spo2: 98, rhythm: 'Sinus rhythm', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 104, sbp: 96, dbp: 58, map: 71, spo2: 97, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 112, sbp: 88, dbp: 52, map: 64, spo2: 97, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
  ],
  // Illustrative response ceilings (not sourced from Attachment B — physiology.ts is
  // scenario-tuned data, see its module doc). Norepinephrine alone, even at its ordered
  // maximum, is deliberately tuned to fall short of target (57 + 6 = 63 < 65) — this is
  // what drives the need for agent 2. Adding vasopressin at its max closes the gap
  // (63 + 5 = 68 >= 65), matching CLINICAL_SPEC.md's worked example.
  // HR/SpO2 contributions (Phase 12) layer on top of the MAP response — a pressor
  // doesn't just raise MAP, it also eases the compensatory tachycardia (negative HR
  // contribution) and modestly improves oxygenation as perfusion normalizes (small
  // positive SpO2 contribution).
  responseModel: {
    norepinephrine: { maxMapContribution: 6, maxHrContribution: -12, maxSpo2Contribution: 1 },
    vasopressin: { maxMapContribution: 5, maxHrContribution: -6, maxSpo2Contribution: 1 },
  },
  // Illustrative deterioration curve: untreated septic shock doesn't hold steady at
  // 57 — MAP declines further the longer no agent is actively infusing. 0.5 mmHg/min
  // reaches the 15 mmHg cap (MAP 42) after 30 min untreated, a realistic window for a
  // training scenario where a nurse might legitimately take some minutes to intervene.
  deterioration: { ratePerMinute: 0.5, maxDrop: 15 },
  objective: 'Titrate norepinephrine as ordered, and sequence in a second pressor once it stops being enough on its own.',
  enableBlockOfCharting: true,
  decisionPoints: DECISION_POINTS,
}
