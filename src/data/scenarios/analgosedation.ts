/**
 * Fifth scenario — analgosedation focus, two independent simultaneous targets on one
 * mechanically-ventilated patient.
 *
 * 61M, 82 kg, post-thoracotomy (lobectomy for lung malignancy) on oncology ICU, still
 * intubated overnight. Fentanyl (agent 1) titrates to pain score; dexmedetomidine
 * (agent 2) titrates to RASS — two genuinely independent targets, not a sequential
 * MAP-only escalation like the flagship, and this scenario's engine wiring reflects
 * that independence in two places (Phase 19h correction, per direct clinical feedback):
 *
 * - **Activation** — per CP4-156.doc's own text, sedation is added only once analgesia
 *   is *established* (not maxed out): dexmedetomidine activates once fentanyl reaches
 *   roughly its own starting dose (25 of 150 mcg/hr — see `activationThreshold` below)
 *   WITH FENTANYL'S OWN PAIN-SCORE GOAL ALREADY MET (`activationRequiresPriorTargetMet:
 *   true` — the opposite condition from a same-target escalation like norepinephrine ->
 *   vasopressin, where the second agent activates because the first alone ISN'T reaching
 *   the shared goal). Getting this backwards — requiring pain score to still be unmet —
 *   would make dexmedetomidine unavailable at exactly the moment real practice calls for
 *   it: once pain is controlled and the patient is still agitated (elevated RASS), it's
 *   time to add sedation, not withhold it.
 * - **Weaning** — both orders share `weanOrder: 1` (not a 1/2 sequence): pain and
 *   sedation are independent parameters here, so there's no fixed cross-drug wean
 *   priority the way there is among pressors sharing one MAP target (e.g. the flagship's
 *   norepinephrine/vasopressin pair, where the more-recently-added adjunct always weans
 *   first). Each agent is weaned on its own timeline, once its own target is met —
 *   `priorAgentsWeaned`'s "clear every STRICTLY lower-weanOrder agent first" check is a
 *   structural no-op when nothing has a strictly lower value than anything else, which
 *   is exactly the "independently weanable" behavior wanted here.
 */
import type { DecisionPoint, ScenarioConfig } from '../../state/types'

/**
 * Phase 19g's authored decision points for this scenario — the sharpest drug/parameter
 * mix-ups in the whole bank, since fentanyl and dexmedetomidine target genuinely
 * independent parameters (pain score vs RASS) on the same patient.
 */
const DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'analgosedation-fentanyl-documentation',
    trapType: 'documentationPlacement',
    trigger: { kind: 'postTitrate', orderId: 'order-fentanyl-as' },
    situation: "You've just titrated fentanyl. Time to document the assessment that justifies it.",
    policyHint: "Document citing the parameter this order actually targets — pain score — not the parameter dexmedetomidine is titrated to.",
    options: [
      {
        id: 'chart-pain-score',
        label: 'Chart the assessment, citing pain score',
        caption: "Pain score is fentanyl's actual titration target.",
        group: 'covered',
        effect: { kind: 'chartVitals' },
        feedback: { text: "Correct — fentanyl is titrated to pain score; that's the parameter your documentation should justify the change against." },
      },
      {
        id: 'chart-rass',
        label: 'Chart the assessment, citing RASS',
        caption: 'The patient seems calmer since the last titration.',
        group: 'gap',
        effect: { kind: 'none' },
        manualTone: 'critical',
        feedback: {
          text: "RASS guides dexmedetomidine's goal, not fentanyl's dose — the two agents here have genuinely independent targets. Justifying a fentanyl change against RASS confuses which drug is titrated to which parameter, a mix-up serious enough to carry real risk, not just a documentation style slip.",
        },
      },
    ],
  },
  {
    id: 'analgosedation-dexmedetomidine-early-notification',
    trapType: 'earlyNotification',
    trigger: { kind: 'earlyNotification', orderId: 'order-dexmedetomidine-as' },
    situation: "You've titrated dexmedetomidine to its early-notification checkpoint and RASS still isn't at goal. What's your next move?",
    policyHint: "CP 4-156: notify the provider proactively once an agent reaches its early-notification checkpoint — and make sure it's the right agent for the parameter in question.",
    options: [
      {
        id: 'notify',
        label: 'Notify the provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: 'order-dexmedetomidine-as' },
        feedback: { text: "Correct — proactive notification at dexmedetomidine's own checkpoint, with RASS still outside the goal range, is the right call." },
      },
      {
        id: 'increase-fentanyl',
        label: 'Increase fentanyl instead',
        caption: "Push analgesia further — though that would exceed fentanyl's own ordered maximum.",
        group: 'gap',
        effect: { kind: 'submitDose', orderId: 'order-fentanyl-as', dose: 200 },
        feedback: {
          text: "RASS is dexmedetomidine's target, not fentanyl's — titrating fentanyl doesn't address a RASS concern at all, and 200 mcg/hr exceeds fentanyl's own ordered maximum (150) outright.",
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
          text: "A passive delay isn't unsafe on its own, but it isn't the safer habit — notify the provider at dexmedetomidine's own checkpoint rather than let time pass undecided.",
        },
      },
    ],
  },
  {
    id: 'analgosedation-weaning',
    // Not a forced sequence between the two drugs (see the module doc comment) — kept
    // as 'weanSequence' since it's still the closest of the 5 fixed trapType categories
    // and the field is purely informational (drives no branching logic). The actual
    // teaching point here is independent per-drug wean judgment, not an order.
    trapType: 'weanSequence',
    trigger: { kind: 'weanEligible' },
    situation: 'Pain score and RASS are both at goal, and both agents are infusing. What next?',
    policyHint:
      "Pain and sedation are independent targets here — once EACH agent's own goal is met, it can be weaned on its own timeline. There's no fixed cross-drug wean order between fentanyl and dexmedetomidine the way there is among pressors sharing one MAP target.",
    options: [
      {
        id: 'wean-dexmedetomidine',
        label: 'Wean dexmedetomidine one step',
        caption: 'RASS is at goal — sedation can be reduced on its own merits.',
        group: 'covered',
        effect: { kind: 'submitDoseRelative', orderId: 'order-dexmedetomidine-as', deltaSteps: -1 },
        feedback: {
          text: "Correct — dexmedetomidine's own target (RASS) is met, so it can be weaned now, independent of fentanyl's status.",
        },
      },
      {
        id: 'wean-fentanyl',
        label: 'Wean fentanyl one step',
        caption: 'Pain score is at goal — analgesia can be reduced on its own merits.',
        group: 'covered',
        effect: { kind: 'submitDoseRelative', orderId: 'order-fentanyl-as', deltaSteps: -1 },
        feedback: {
          text: "Also correct — fentanyl's own target (pain score) is met, so it can be weaned now too. Pain and sedation are independent here; either agent may come down first, based on its own status, not a fixed priority between the two.",
        },
      },
      {
        id: 'increase-dexmedetomidine',
        label: 'Increase dexmedetomidine further since sedation is working well',
        caption: 'The patient seems comfortable — push a little deeper.',
        group: 'gap',
        effect: { kind: 'submitDoseRelative', orderId: 'order-dexmedetomidine-as', deltaSteps: 1 },
        feedback: {
          text: 'RASS is already within its goal range — further up-titration is not indicated once a target is met, regardless of how well the patient looks. Reassess and consider weaning instead.',
        },
      },
    ],
  },
]

export const ANALGOSEDATION: ScenarioConfig = {
  id: 'analgosedation',
  patient: {
    ageYears: 61,
    sex: 'male',
    weightKg: 82,
  },
  admissionReason:
    'Post-op day 0, open lobectomy for lung malignancy; oncology ICU, remains mechanically ventilated overnight — analgosedation focus.',
  startingVitals: {
    hr: 116,
    sbp: 142,
    dbp: 88,
    map: 106,
    spo2: 96,
    rhythm: 'Sinus tachycardia',
    // 0-10 NRS, lower is better — still guarding the incision, grimacing with vent breaths.
    painScore: 7,
    // Standard -5 (unarousable) to +4 (combative) RASS — agitated, biting the ETT.
    rass: 2,
  },
  // Fentanyl (sequence 1) is hung, Begin Bag incomplete, rate stopped — the exact same
  // pattern every existing scenario's sequence-1 agent starts in. Necessary, not just
  // convention: `infusion` must be truthy at initiate time for the independent
  // double-check gate (data/policy.ts's MEDICATION_VERIFICATION.fentanyl) to actually
  // apply on fentanyl's very first initiate — see submitDose's hard gate in
  // state/store.ts, which is a no-op when `infusion` is null. Dexmedetomidine
  // (sequence 2) starts with no pre-seeded infusion at all, matching every other
  // sequence-2 agent in this app (e.g. vasopressin in neutropenicSepticShock.ts) — its
  // Infusion record is created fresh by submitDose once it actually activates.
  initialInfusions: [
    {
      id: 'infusion-fentanyl-as',
      orderId: 'order-fentanyl-as',
      drugId: 'fentanyl',
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
      id: 'order-fentanyl-as',
      drugId: 'fentanyl',
      sequence: 1,
      startDose: 25,
      maxDose: 150,
      increment: 10,
      interval: { minMinutes: 10 },
      target: { metric: 'painScore', comparator: '<=', value: 4, unit: 'score' },
      // Same weanOrder as dexmedetomidine below (both 1, not a 1/2 sequence) —
      // independently weanable, see the module doc comment.
      weanOrder: 1,
    },
    {
      id: 'order-dexmedetomidine-as',
      drugId: 'dexmedetomidine',
      sequence: 2,
      startDose: 0.2,
      maxDose: 0.7,
      increment: 0.1,
      interval: { minMinutes: 30 },
      target: { metric: 'RASS', comparator: 'between', value: -2, valueHigh: 0, unit: 'score' },
      // 1/6 = fentanyl's own startDose (25) / fentanyl's own maxDose (150) — activates
      // once analgesia is ESTABLISHED (fentanyl at its starting rate), not once it's
      // maxed out, per CP4-156.doc's "adequate analgesia before sedation" principle.
      // Kept as the exact fraction (matching this codebase's existing convention of
      // exact fractions, e.g. vasopressin's activationThreshold: 1 / 3 in the flagship).
      activationThreshold: 25 / 150,
      // Paired with fentanyl's OWN painScore target being MET (not unmet) — see the
      // module doc comment. Omitting this would (and, before Phase 19h, did) require
      // pain score to stay above goal for dexmedetomidine to ever unlock — backwards
      // from real practice.
      activationRequiresPriorTargetMet: true,
      // Same weanOrder as fentanyl above (both 1) — independently weanable, see the
      // module doc comment; no fixed sedation-before-analgesia priority is asserted.
      weanOrder: 1,
      // Phase 19g: 50% of dexmedetomidine's own ordered max (0.7 * 0.5 = 0.35) — crosses
      // partway through the titration range, distinct from the ordered ceiling itself.
      earlyNotificationThreshold: 0.5,
    },
  ],
  responseLagMinutes: { minMinutes: 2, maxMinutes: 5 },
  // Short pre-sim trend showing escalating pain/agitation as the block wears off —
  // never a hint about what/when to chart (see CernerIView).
  priorVitals: [
    {
      minutesBeforeStart: 60,
      vitals: { hr: 98, sbp: 128, dbp: 78, map: 95, spo2: 97, rhythm: 'Sinus rhythm', rass: 0, painScore: 3 },
    },
    {
      minutesBeforeStart: 30,
      vitals: { hr: 108, sbp: 136, dbp: 84, map: 101, spo2: 96, rhythm: 'Sinus tachycardia', rass: 1, painScore: 5 },
    },
  ],
  // Illustrative response ceilings (not sourced from Attachment B — physiology.ts is
  // scenario-tuned data, see its module doc). Fentanyl alone, at its ordered maximum,
  // closes the pain gap (7 - 5 = 2 <= 4). Dexmedetomidine's real sympatholytic effect
  // lowers both RASS (sedation) and HR (easing the pain/agitation-driven tachycardia) —
  // a clinically coherent pairing, not two unrelated numbers.
  responseModel: {
    // maxMapContribution is a required field on ResponseModelEntry (see state/types.ts)
    // even though neither drug here is titrated to MAP — 0 is the correct "no MAP
    // effect" value, matching the "omit for no effect" convention used for this
    // interface's genuinely optional per-vital fields.
    fentanyl: { maxMapContribution: 0, maxPainScoreContribution: -5 },
    // maxRassContribution: -2, not -4. projectDoseResponse's sqrt curve (Phase 8b) is
    // front-loaded, so a steeper ceiling let dexmedetomidine's own startDose (0.2, ~29%
    // of its 0.7 max — sqrt(0.2/0.7) ≈ 0.53) land RASS almost immediately inside the -2..0
    // target, undercutting the titration teaching point. At -2, startDose projects RASS to
    // 2 + sqrt(0.2/0.7)*-2 ≈ +0.93 (rounds to +1, clearly outside target), and it takes two
    // real titration steps (0.2 -> 0.3 -> 0.4) before RASS rounds into the -2..0 range —
    // and stays there out to dexmedetomidine's own ordered maximum (2 + -2 = 0, right at
    // the target's edge) — giving RASS a genuine climb to demonstrate instead of landing
    // in range at the very first dose.
    dexmedetomidine: { maxMapContribution: 0, maxRassContribution: -2, maxHrContribution: -8 },
  },
  // Not a shock/deterioration vignette — pain and agitation don't spontaneously worsen
  // on a fixed curve the way untreated septic shock does; whatever happens here is
  // purely a function of the two orders actually titrated (or not).
  deterioration: { ratePerMinute: 0, maxDrop: 0 },
  objective:
    'Titrate fentanyl to pain score and dexmedetomidine to RASS as two independent targets, adding sedation only once analgesia is established — and wean each agent on its own timeline once its own target is met.',
  enableBlockOfCharting: false,
  decisionPoints: DECISION_POINTS,
}
