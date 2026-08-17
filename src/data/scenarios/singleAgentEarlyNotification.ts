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
import type { DecisionPoint, ScenarioConfig } from '../../state/types'

/**
 * Phase 19g's authored decision points for this scenario — previously relied only on
 * the synthesized earlyNotification fallback (engine/decisionPoints.ts's
 * buildAutoEarlyNotificationDecisionPoint); this replaces that default with a real
 * authored point and adds a documentation-justification and an escalation-ceiling point,
 * following the flagship's exact shape (see neutropenicSepticShock.ts).
 */
const DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'single-agent-early-notification-checkpoint',
    trapType: 'earlyNotification',
    trigger: { kind: 'earlyNotification', orderId: 'order-norepinephrine-sa' },
    situation: "You've titrated norepinephrine to its early-notification checkpoint and MAP still isn't at target. What's your next move?",
    policyHint: "CP 4-156: notify the provider proactively once you reach the early-notification checkpoint — don't wait for the ordered maximum.",
    options: [
      {
        id: 'notify',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-norepinephrine-sa' },
        feedback: { text: 'Correct — proactive notification at the checkpoint is exactly the behavior this scenario is built to reinforce.' },
      },
      {
        id: 'continue-titrating',
        label: 'Continue titrating toward the ordered maximum',
        caption: 'Keep climbing within your own order.',
        group: 'covered',
        effect: { kind: 'multiStepTitration', orderId: 'order-norepinephrine-sa', targetDose: 30 },
        feedback: {
          text: "Continuing to titrate within your own order is reasonable if the trend supports it — but the checkpoint exists precisely so the provider is looped in this early, not only once you're maxed out.",
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
          text: "A passive delay isn't unsafe on its own, but it isn't the safer habit either — proactive notification at this checkpoint beats letting a full hour pass undecided.",
        },
      },
    ],
  },
  {
    id: 'single-agent-early-notification-documentation',
    trapType: 'documentationPlacement',
    trigger: { kind: 'postTitrate', orderId: 'order-norepinephrine-sa' },
    situation: "You've just titrated norepinephrine. Time to document the assessment that justifies it.",
    policyHint: "Document citing the parameter this order actually targets — MAP — not a parameter that's simply monitored.",
    options: [
      {
        id: 'chart-map',
        label: 'Chart the assessment, citing MAP',
        caption: "MAP is this order's actual titration target.",
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: { text: "Correct — MAP is the titration target for this order; that's the parameter your documentation should justify the change against." },
      },
      {
        id: 'chart-hr',
        label: 'Chart the assessment, citing heart rate',
        caption: 'HR is trending down nicely with the pressor.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: 'HR is monitored for this drug, not the titration target — norepinephrine is dosed to MAP. Justifying the change against HR is the wrong parameter, even though HR is worth watching too.',
        },
      },
    ],
  },
  {
    id: 'single-agent-early-notification-escalation',
    trapType: 'doseCeiling',
    trigger: { kind: 'escalationAttempt', orderId: 'order-norepinephrine-sa' },
    situation: "Norepinephrine is at its ordered maximum and MAP is still below target. What's your next move?",
    policyHint: 'CP 4-156: once an infusion reaches its ordered maximum with target still unmet, notify the provider rather than exceed the order.',
    options: [
      {
        id: 'notify-provider',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-norepinephrine-sa' },
        feedback: { text: 'Correct — at the ordered ceiling with target still unmet, the provider needs to be notified.' },
      },
      {
        id: 'chart-and-reassess',
        label: 'Chart vitals and reassess',
        caption: 'Document the current assessment before deciding next steps.',
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: { text: 'Charting is reasonable and keeps the record current — pair it with notifying the provider, since the order itself is exhausted.' },
      },
      {
        id: 'discontinue-norepinephrine',
        label: 'Discontinue norepinephrine',
        caption: "It's not reaching target on its own — pull the order?",
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'critical',
        feedback: {
          text: 'Discontinuing the only pressor while hypotensive removes support entirely — escalate by notifying the provider instead of withdrawing the agent.',
        },
      },
    ],
  },
]

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
    rass: 0,
    painScore: 0,
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
      vitals: { hr: 90, sbp: 110, dbp: 70, map: 83, spo2: 98, rhythm: 'Sinus rhythm', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 100, sbp: 98, dbp: 60, map: 73, spo2: 97, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 108, sbp: 90, dbp: 54, map: 66, spo2: 96, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
  ],
  // Illustrative response ceiling — norepinephrine alone, at its ordered maximum, is
  // sufficient this time (58 + 8 = 66 >= 65), unlike the flagship scenario.
  responseModel: {
    norepinephrine: { maxMapContribution: 8, maxHrContribution: -14, maxSpo2Contribution: 2 },
  },
  deterioration: { ratePerMinute: 0.4, maxDrop: 12 },
  objective:
    "Titrate norepinephrine alone toward target, and notify the provider proactively once you're at the order's early-notification checkpoint with MAP still low — don't wait until you're at the ordered maximum.",
  enableBlockOfCharting: false,
  decisionPoints: DECISION_POINTS,
}
