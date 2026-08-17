/**
 * Sixth scenario — diltiazem-alone rate-control focus, exercising the 'between'
 * comparator in a second, distinct context from analgosedation.ts's RASS range.
 *
 * 67F, 71 kg, new-onset rapid atrial fibrillation on post-op day 1 after a Whipple
 * procedure for pancreatic malignancy — chemo/surgical-stress-induced RVR, oncology
 * ICU. Diltiazem is the sole titratable agent; the target is a genuine rate-control
 * RANGE (60-100 bpm), not a single ceiling — real practice, since over-slowing an
 * already reduced-filling-time rhythm is its own risk, not just under-treating it.
 */
import type { DecisionPoint, ScenarioConfig } from '../../state/types'

/**
 * Phase 19g's authored decision points for this scenario. This order only has two
 * titratable steps between its start and its ceiling (5 -> 10 -> 15 mg/hr), and TWO
 * order-scoped triggers are authored on it (postTitrate, which fires unconditionally on
 * the order's very FIRST applied titrate, and earlyNotification, which fires only on the
 * specific tick that crosses its threshold) — so both the ORDER of this array and the
 * threshold value matter to keep them from racing for the same tick or, worse, silently
 * missing each other:
 * - `earlyNotificationThreshold` (0.5, below -> 7.5 mg/hr) crosses on the FIRST titrate
 *   step (5 -> 10). Listing the early-notification point BEFORE the documentation point
 *   in this array means it wins that first-step race (state/store.ts's
 *   deriveTriggeredDecisionPointId returns on the first matching point in array order),
 *   leaving the documentation point to claim the second step (10 -> 15) instead — and
 *   critically, it leaves genuine headroom (10 -> 15) for the "continue titrating"
 *   option to actually apply a step, rather than firing exactly AT the ordered maximum
 *   where there is nothing left to continue toward.
 * - The reverse ordering (documentation first) would make documentation win the first
 *   step by default (it has no threshold condition to fail), forcing early-notification
 *   to wait for the second step — but by then `priorDose` is already past any threshold
 *   below 10, so a threshold in the (0.667, 1] range set to fire there lands exactly at
 *   the ceiling, which is what originally motivated this ordering fix.
 */
const DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'diltiazem-rate-control-early-notification',
    trapType: 'earlyNotification',
    trigger: { kind: 'earlyNotification', orderId: 'order-diltiazem-rc' },
    situation: "You've titrated diltiazem to its early-notification checkpoint and heart rate still isn't in the ordered range. What's your next move?",
    policyHint: "CP 4-156: notify the provider proactively once you reach the early-notification checkpoint — there's little room left between here and the ordered maximum.",
    options: [
      {
        id: 'notify',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-diltiazem-rc' },
        feedback: { text: "Correct — with little headroom left before the ordered maximum, notifying the provider now is the right call." },
      },
      {
        id: 'continue-titrating',
        label: 'Continue titrating toward the ordered maximum',
        caption: 'Keep climbing within your own order.',
        group: 'covered',
        effect: { kind: 'multiStepTitration', orderId: 'order-diltiazem-rc', targetDose: 15 },
        feedback: {
          text: "Continuing to titrate within the order is reasonable if the trend supports it — but the checkpoint exists because there's very little order left before the ceiling.",
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
    id: 'diltiazem-rate-control-documentation',
    trapType: 'documentationPlacement',
    trigger: { kind: 'postTitrate', orderId: 'order-diltiazem-rc' },
    situation: "You've just titrated diltiazem. Time to document the assessment that justifies it.",
    policyHint: 'Document citing the parameters this order actually targets — heart rate and rhythm — not just blood pressure.',
    options: [
      {
        id: 'chart-hr-rhythm',
        label: 'Chart the assessment, citing HR and rhythm',
        caption: "Heart rate and rhythm are diltiazem's actual titration target.",
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: {
          text: "Correct — diltiazem is titrated to heart rate (with rhythm as part of the same rate-control picture); that's what your documentation should justify the change against.",
        },
      },
      {
        id: 'chart-map-only',
        label: 'Chart the assessment, citing MAP only',
        caption: 'Blood pressure looks stable since the last titration.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: "MAP isn't wrong to note, but it isn't the parameter this rate-control order is judged against — charting only MAP misses the heart rate/rhythm justification the titration actually needs.",
        },
      },
    ],
  },
  {
    id: 'diltiazem-rate-control-escalation',
    trapType: 'doseCeiling',
    trigger: { kind: 'escalationAttempt', orderId: 'order-diltiazem-rc' },
    situation: "Diltiazem is already at its ordered maximum of 15 mg/hr and heart rate is still outside the ordered range. What's your next move?",
    policyHint:
      "CP 4-156: once an infusion reaches its ordered maximum with target still unmet, notify the provider — a reasonable-sounding extra check isn't a substitute for that, and stopping the only rate-control agent isn't either.",
    options: [
      {
        id: 'notify-provider',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-diltiazem-rc' },
        feedback: { text: 'Correct — at the ordered ceiling with heart rate still out of range, the provider needs to be notified.' },
      },
      {
        id: 'check-ekg',
        label: 'Check the EKG first',
        caption: 'Confirm the rhythm before deciding anything else.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'caution',
        feedback: {
          text: "A reasonable clinical instinct — but it isn't a substitute for notifying the provider once the order is maxed out, and this simulator doesn't model a separate EKG-review action. Treat it as something to do alongside notification, not instead of it.",
        },
      },
      {
        id: 'discontinue-diltiazem',
        label: 'Discontinue diltiazem',
        caption: "It's not bringing the rate into range on its own — pull the order?",
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'critical',
        feedback: {
          text: 'Discontinuing the only rate-control agent while still in RVR removes the one thing working in your favor — escalate by notifying the provider instead of withdrawing the agent.',
        },
      },
    ],
  },
]

export const DILTIAZEM_RATE_CONTROL: ScenarioConfig = {
  id: 'diltiazem-rate-control',
  patient: {
    ageYears: 67,
    sex: 'female',
    weightKg: 71,
  },
  admissionReason:
    'Post-op day 1, pancreaticoduodenectomy (Whipple) for pancreatic malignancy; oncology ICU — new-onset rapid atrial fibrillation, rate-control focus.',
  startingVitals: {
    hr: 142,
    // Borderline/low-normal BP — reduced diastolic filling time from the rapid
    // ventricular response, not a separate shock process.
    sbp: 112,
    dbp: 58,
    map: 76,
    spo2: 95,
    rhythm: 'Atrial fibrillation with rapid ventricular response',
    rass: 0,
    painScore: 0,
  },
  // Diltiazem (sequence 1) hung, Begin Bag incomplete, rate stopped — the ordinary
  // sequence-1 pattern every existing scenario's first agent starts in. Not high-alert
  // per data/policy.ts's MEDICATION_VERIFICATION (independentDoubleCheckRequired: false
  // for diltiazem), so no independent-check concern here.
  initialInfusions: [
    {
      id: 'infusion-diltiazem-rc',
      orderId: 'order-diltiazem-rc',
      drugId: 'diltiazem',
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
      id: 'order-diltiazem-rc',
      drugId: 'diltiazem',
      sequence: 1,
      startDose: 5,
      maxDose: 15,
      increment: 5,
      interval: { minMinutes: 15 },
      target: { metric: 'HR', comparator: 'between', value: 60, valueHigh: 100, unit: 'bpm' },
      // Phase 19g: 50% of diltiazem's own ordered max (15 * 0.5 = 7.5) — this drug's own
      // therapeutic ceiling is close to its max with less titration room than the
      // vasoactive scenarios, so the checkpoint sits partway through the (only) two
      // available titrate steps; crosses on the FIRST step (5 -> 10 mg/hr), leaving
      // genuine headroom to the ceiling — see DECISION_POINTS above for why the array
      // order and this exact threshold both matter here.
      earlyNotificationThreshold: 0.5,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  // Short pre-sim trend into RVR — never a hint about what/when to chart (see CernerIView).
  priorVitals: [
    {
      minutesBeforeStart: 60,
      vitals: { hr: 96, sbp: 122, dbp: 74, map: 90, spo2: 97, rhythm: 'Sinus rhythm', rass: 0, painScore: 0 },
    },
    {
      minutesBeforeStart: 30,
      vitals: {
        hr: 124,
        sbp: 116,
        dbp: 64,
        map: 81,
        spo2: 96,
        rhythm: 'Atrial fibrillation with rapid ventricular response',
        rass: 0,
        painScore: 0,
      },
    },
  ],
  // Illustrative CCB effect (not sourced from Attachment B — physiology.ts is
  // scenario-tuned data, see its module doc). At its ordered maximum, diltiazem alone
  // brings HR from 142 into the 60-100 target range (142 - 50 = 92). A calcium-channel
  // blocker's real combination of rate-slowing plus a small negative-inotrope/
  // vasodilatory effect is modeled as a modest MAP contribution alongside the HR one —
  // not free of hemodynamic cost, just not the primary teaching point here.
  responseModel: {
    diltiazem: { maxHrContribution: -50, maxMapContribution: -3 },
  },
  // Modest but nonzero: sustained, untreated RVR has a real (if slower) hemodynamic
  // cost of its own, matching this app's existing "waiting has a cost" deterioration
  // pattern — see physiology.ts's accumulateDeterioration, which only ever models a MAP
  // decline, not a direct HR effect, so this still surfaces as MAP drift while diltiazem
  // sits unstarted or paused.
  deterioration: { ratePerMinute: 0.2, maxDrop: 8 },
  objective: 'Titrate diltiazem to bring heart rate into the ordered 60-100 bpm rate-control range — not just below a single ceiling.',
  enableBlockOfCharting: false,
  decisionPoints: DECISION_POINTS,
}
