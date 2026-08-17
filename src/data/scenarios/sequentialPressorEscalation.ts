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
import type { DecisionPoint, ScenarioConfig } from '../../state/types'

/**
 * Phase 19g's authored decision points for this scenario — same three trap shapes as
 * the other two-pressor scenarios (documentation-justification, earlyNotification,
 * weanEligible), adapted to this scenario's own orders/vignette.
 */
const DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'sequential-pressor-escalation-documentation',
    trapType: 'documentationPlacement',
    trigger: { kind: 'postTitrate', orderId: 'order-norepinephrine-spe' },
    situation: "You've just titrated norepinephrine. Time to document the assessment that justifies it.",
    policyHint: "Document citing the parameter this order actually targets — MAP — not a parameter that's simply monitored.",
    options: [
      {
        id: 'chart-map',
        label: 'Chart the assessment, citing MAP',
        caption: "MAP is this order's actual titration target.",
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: { text: "Correct — both pressors here are titrated to MAP; that's the parameter your documentation should justify the change against." },
      },
      {
        id: 'chart-hr',
        label: 'Chart the assessment, citing heart rate',
        caption: 'HR has come down since starting the infusion.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: 'HR is monitored, not targeted, for this drug — norepinephrine is dosed to MAP. Citing HR instead of MAP is the wrong parameter for this documentation.',
        },
      },
    ],
  },
  {
    id: 'sequential-pressor-escalation-early-notification',
    trapType: 'earlyNotification',
    trigger: { kind: 'earlyNotification', orderId: 'order-phenylephrine-spe' },
    situation: "You've titrated phenylephrine to its early-notification checkpoint and MAP still isn't at target. What's your next move?",
    policyHint: "CP 4-156: notify the provider proactively once an agent reaches its early-notification checkpoint — don't wait for the ordered maximum.",
    options: [
      {
        id: 'notify',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-phenylephrine-spe' },
        feedback: {
          text: 'Correct — proactive notification at the checkpoint, with two pressors already running and target still unmet, is the right call.',
        },
      },
      {
        id: 'continue-titrating',
        label: 'Continue titrating phenylephrine toward its maximum',
        caption: 'Keep climbing within your own order.',
        group: 'covered',
        effect: { kind: 'multiStepTitration', orderId: 'order-phenylephrine-spe', targetDose: 200 },
        feedback: {
          text: 'Continuing to titrate within the order is reasonable if the trend supports it — but the checkpoint exists so the provider is looped in early, especially now that a second agent is already involved.',
        },
      },
      {
        id: 'hold-an-hour',
        label: 'Hold for another hour before deciding',
        caption: 'Wait and reassess rather than act now.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: "A passive delay isn't unsafe on its own, but it isn't the safer habit — notify the provider at the checkpoint rather than let time pass undecided.",
        },
      },
    ],
  },
  {
    id: 'sequential-pressor-escalation-weaning',
    trapType: 'weanSequence',
    trigger: { kind: 'weanEligible' },
    situation: 'Both pressors are infusing and MAP is holding at target. What next?',
    policyHint: 'CP 4-156 wean priority: the most recently added agent weans first — phenylephrine before norepinephrine here.',
    options: [
      {
        id: 'wean-phenylephrine',
        label: 'Wean phenylephrine one step',
        caption: 'Phenylephrine was added most recently — it weans first.',
        group: 'covered',
        effect: { kind: 'submitDoseRelative', orderId: 'order-phenylephrine-spe', deltaSteps: -1 },
        feedback: { text: 'Correct sequence — the most recently added agent weans first.' },
      },
      {
        id: 'wean-norepinephrine',
        label: 'Wean norepinephrine one step',
        caption: 'Norepinephrine was the first agent started.',
        group: 'gap',
        effect: { kind: 'submitDoseRelative', orderId: 'order-norepinephrine-spe', deltaSteps: -1 },
        feedback: {
          text: 'Norepinephrine has a lower wean priority than phenylephrine — clear phenylephrine first before weaning this agent.',
        },
      },
    ],
  },
]

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
    rass: 0,
    painScore: 0,
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
      // Phase 19g: the mainstay/first-added agent weans LAST — same inverse-of-sequence
      // convention as the flagship's norepinephrine (see DECISION_POINTS above).
      weanOrder: 2,
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
      // Phase 19g: 30% of phenylephrine's own ordered max (200 * 0.3 = 60) — matches the
      // flagship-established convention for this fraction (see singleAgentEarlyNotification.ts).
      earlyNotificationThreshold: 0.3,
      // Phase 19g: most-recently-added agent weans FIRST (see norepinephrine's weanOrder above).
      weanOrder: 1,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  priorVitals: [
    {
      minutesBeforeStart: 180,
      vitals: { hr: 96, sbp: 112, dbp: 72, map: 85, spo2: 98, rhythm: 'Sinus rhythm', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 108, sbp: 98, dbp: 60, map: 73, spo2: 97, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 116, sbp: 88, dbp: 50, map: 63, spo2: 96, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
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
  decisionPoints: DECISION_POINTS,
}
