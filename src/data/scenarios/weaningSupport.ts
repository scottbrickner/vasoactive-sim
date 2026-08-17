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
import type { DecisionPoint, ScenarioConfig } from '../../state/types'

/**
 * Phase 19g's authored decision points for this scenario. The primary weanEligible
 * point is listed FIRST — `isWeanEligible`/`allTargetsMet` are both already true from
 * minute 0 (all three agents pre-seeded infusing, MAP already above target), so the very
 * first titrate a learner makes on ANY of the three orders would otherwise race against
 * that same order's own postTitrate point; listing weanEligible first in this array
 * guarantees it wins that race every time (state/store.ts's deriveTriggeredDecisionPointId
 * returns on the FIRST matching decision point in array order), matching the intended
 * "which agent weans first" as the actual first decision a learner faces here. The two
 * postTitrate points that follow are scoped to vasopressin/norepinephrine specifically
 * (not phenylephrine, whose own first wean action is already covered by the primary
 * point above) so they naturally fire later, once the learner works down the ladder.
 */
const DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'weaning-support-weaning-sequence',
    trapType: 'weanSequence',
    trigger: { kind: 'weanEligible' },
    situation: 'All three agents are infusing and MAP is comfortably above target. What next?',
    policyHint: 'CP 4-156 wean priority: clear the most recently added adjunct agent first — phenylephrine, then vasopressin, then norepinephrine last.',
    options: [
      {
        id: 'wean-phenylephrine',
        label: 'Wean phenylephrine one step',
        caption: 'Phenylephrine was added most recently — it weans first.',
        group: 'covered',
        effect: { kind: 'submitDoseRelative', orderId: 'order-phenylephrine-ws', deltaSteps: -1 },
        feedback: { text: 'Correct — the most recently added adjunct agent weans first.' },
      },
      {
        id: 'wean-vasopressin',
        label: 'Wean vasopressin one step',
        caption: 'Vasopressin is the second agent added.',
        group: 'gap',
        effect: { kind: 'submitDoseRelative', orderId: 'order-vasopressin-ws', deltaSteps: -1 },
        feedback: { text: 'Vasopressin has a lower wean priority than phenylephrine — clear phenylephrine first before weaning this agent.' },
      },
      {
        id: 'wean-norepinephrine',
        label: 'Wean norepinephrine one step',
        caption: 'Norepinephrine is the mainstay agent.',
        group: 'gap',
        effect: { kind: 'submitDoseRelative', orderId: 'order-norepinephrine-ws', deltaSteps: -1 },
        feedback: {
          text: 'Norepinephrine is the mainstay agent and weans last — both phenylephrine and vasopressin need to be cleared first.',
        },
      },
    ],
  },
  {
    id: 'weaning-support-documentation-vasopressin',
    trapType: 'documentationPlacement',
    trigger: { kind: 'postTitrate', orderId: 'order-vasopressin-ws' },
    situation: "You've just titrated vasopressin. Time to document the assessment that justifies it.",
    policyHint: "Document citing the parameter you're actually titrating toward — MAP — not a parameter that's simply monitored.",
    options: [
      {
        id: 'chart-map',
        label: 'Chart the assessment, citing MAP',
        caption: 'MAP is what every agent here is titrated toward.',
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: {
          text: "Correct — MAP is the shared titration target for all three agents in this scenario; that's the parameter your documentation should justify the change against.",
        },
      },
      {
        id: 'chart-hr',
        label: 'Chart the assessment, citing heart rate',
        caption: 'HR has settled since stabilizing.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: 'HR is monitored, not targeted, here — vasopressin (like the other two agents) is titrated to MAP. Citing HR instead is the wrong parameter for this documentation.',
        },
      },
    ],
  },
  {
    id: 'weaning-support-documentation-norepinephrine',
    trapType: 'documentationPlacement',
    trigger: { kind: 'postTitrate', orderId: 'order-norepinephrine-ws' },
    situation: "You've just titrated norepinephrine — the last agent left in the wean sequence. Time to document the assessment that justifies it.",
    policyHint: "Document citing the parameter you're actually titrating toward — MAP — not a parameter that's simply monitored.",
    options: [
      {
        id: 'chart-map',
        label: 'Chart the assessment, citing MAP',
        caption: 'MAP is what every agent here is titrated toward.',
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: {
          text: "Correct — even this far down the wean ladder, MAP is still the parameter that justifies the change, the same as it was for the first agent weaned.",
        },
      },
      {
        id: 'chart-hr',
        label: 'Chart the assessment, citing heart rate',
        caption: 'HR is a little higher since the last agent was weaned.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: 'HR is worth watching as support comes off, but it is monitored here, not the titration target — norepinephrine, like the other two agents, is titrated to MAP.',
        },
      },
    ],
  },
]

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
    rass: 0,
    painScore: 0,
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
      vitals: { hr: 108, sbp: 84, dbp: 50, map: 61, spo2: 94, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 120,
      vitals: { hr: 100, sbp: 90, dbp: 56, map: 67, spo2: 95, rhythm: 'Sinus tachycardia', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 60,
      vitals: { hr: 96, sbp: 94, dbp: 60, map: 71, spo2: 96, rhythm: 'Sinus rhythm', rass: 0, painScore: 0 },
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
  decisionPoints: DECISION_POINTS,
}
