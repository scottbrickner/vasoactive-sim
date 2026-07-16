/**
 * Shell types (Phase 1) + clinical state model (Phase 2+), per docs/BUILD_BRIEF.md §8.
 *
 * The clinical engine (titrationEngine, guardrails, physiology, clock, documentation)
 * lives in src/engine/ and operates on these types; scoring.ts (debrief) is Phase 6.
 */

/** The three top-level phases of the learner flow. Mirrors the eventual SimState.phase. */
export type Phase = 'intro' | 'sim' | 'debrief'

/**
 * Training mode coaches in real time and lets the learner override an off-order dose
 * with confirmation; validation mode applies an off-order-but-within-Guardrails dose
 * silently (matching a real Alaris pump, which doesn't know the written order) and
 * scores it only at debrief. Needs-provider and Guardrails hard-limit are hard stops
 * in both modes — never overridable (see docs/CLINICAL_SPEC.md).
 */
export type SimMode = 'training' | 'validation'

/**
 * Records who's proctoring a facilitated session and when proctoring started — a
 * single bound record (unlike zoll-r-series-simulator's two loose, unbound fields).
 * Purely a record, not a gate: a session can run with `proctor: null` for standalone
 * solo practice.
 */
export interface ProctorRecord {
  name: string
  /** ISO 8601 timestamp of when "Start proctoring" was pressed. */
  recordedAt: string
}

/** Placeholder header readout. Real values will be driven by the physiology engine (Phase 4). */
export interface HeaderReadout {
  /** Elapsed simulation time, in minutes. */
  clockMinutes: number
  /** Current mean arterial pressure (mmHg), or null before the sim starts. */
  currentMap: number | null
  /** Target MAP for the scenario (mmHg), or null before a scenario has been picked (intro phase). */
  targetMap: number | null
}

// ---------------------------------------------------------------------------
// Clinical types (Phase 2)
// ---------------------------------------------------------------------------

/** The Attachment B vasoactive/inotrope subset modeled in this simulator. */
export type DrugId =
  | 'norepinephrine'
  | 'epinephrine'
  | 'phenylephrine'
  | 'dopamine'
  | 'dobutamine'
  | 'milrinone'
  | 'vasopressin'

/** Dose units present in the modeled formulary subset. */
export type DoseUnit = 'mcg/min' | 'mcg/kg/min' | 'units/min'

export interface Concentration {
  amount: number
  amountUnit: 'mg' | 'units'
  volumeMl: number
}

/**
 * How often a rate/dose may be changed. `maxMinutes` is present only when Attachment B
 * gives a range (e.g. "every 3-5 min"); a single fixed interval omits it.
 */
export interface TitrationInterval {
  minMinutes: number
  maxMinutes?: number
}

export interface DrugDefinition {
  id: DrugId
  name: string
  genericName: string
  concentration: Concentration
  unit: DoseUnit
  /** True for mcg/kg/min drugs — the engine must multiply by patient weight. */
  weightBased: boolean
  startDose: number
  /** null when Attachment B leaves the increment to the prescriber's order (no default). */
  titrationIncrement: number | null
  /** null when Attachment B leaves the interval to the prescriber's order (no default). */
  titrationInterval: TitrationInterval | null
  maxDose: number
  /** Attachment B "Monitoring Effects" column, split into discrete parameters. */
  monitoring: string[]
}

/** The quantifiable condition that governs titration direction (CP 4-156 §Policy). */
export interface TitrationTarget {
  metric: 'MAP'
  comparator: '>='
  value: number
  unit: 'mmHg'
}

/**
 * A provider's titratable order. Per CP 4-156, an order must specify a starting
 * rate/dose, maximum rate/dose, increment, frequency, and titration target — so
 * (unlike DrugDefinition) these fields are always concrete, even for drugs where
 * Attachment B itself leaves them to the prescriber (e.g. epinephrine, vasopressin).
 */
export interface Order {
  id: string
  drugId: DrugId
  /** 1 = first-line agent, 2 = second-line, etc. — the multi-agent sequence. */
  sequence: number
  startDose: number
  maxDose: number
  increment: number
  interval: TitrationInterval
  target: TitrationTarget
  /** Human-readable activation condition for agents beyond sequence 1. */
  activatesWhen?: string
  /**
   * For sequence > 1: fraction (0,1] of the prior agent's own maxDose that activates
   * this order (target still unmet). Omitted defaults to 1 ("prior agent at its own
   * max"). See engine/activation.ts's deriveActivationText, which derives
   * `activatesWhen` from this so the display text can't drift from the real threshold.
   */
  activationThreshold?: number
  /**
   * Fraction (0,1] of **this order's own** maxDose — distinct from `activationThreshold`,
   * which is about the PRIOR order — that requires provider notification once reached
   * with target still unmet. A checkpoint earlier than the existing needs-provider-at-max
   * trigger; omit to leave this order without an early-notification requirement.
   */
  earlyNotificationThreshold?: number
  /**
   * 1-indexed position in the down-titration/discontinuation sequence — independent of
   * `sequence` (the up-titration order), though the natural case is its inverse (the
   * latest-added adjunct agent weans first, the mainstay agent weans last). Omit for
   * orders with no weaning-order requirement (see priorAgentsWeaned in state/store.ts).
   */
  weanOrder?: number
}

export type InfusionStatus = 'hanging' | 'infusing' | 'stopped'

export interface Infusion {
  id: string
  orderId: string
  drugId: DrugId
  status: InfusionStatus
  /** Current programmed rate/dose in the drug's own unit (0 before Begin Bag / start). */
  rate: number
  /**
   * The rate charted in the MAR at initiation — fixed once set, never updated by later
   * titrations (those chart in iView instead; see data/policy.ts DOCUMENTATION_PLACEMENT).
   * Null until the infusion has actually been initiated.
   */
  initialRate: number | null
  /** Alaris pump channel, e.g. 'A'. */
  channel: string
  beginBagCompleted: boolean
  /** Sim minute of the last dose-changing action for this infusion (initiation counts); null before initiation. */
  lastActionMinute: number | null
  /** Sim minute this infusion was paused; null unless status is 'stopped'. Derived-timer anchor for the 2-hour rules. */
  stoppedAtMinute: number | null
  /** The rate in effect immediately before pausing — RESTART_AFTER_PAUSE_RULE requires resuming here, not at order.startDose. Null unless status is 'stopped'. */
  rateBeforePause: number | null
}

export interface VitalSigns {
  hr: number
  sbp: number
  dbp: number
  map: number
  spo2: number
  rhythm: string
}

export type DocumentationLocation = 'MAR' | 'iView'

/** The four CP 4-156 documentation checkpoints for a titratable medication. */
export type DocumentationCadencePoint =
  | 'initiation'
  | 'plus30Start'
  | 'preTitration'
  | 'plus30PostTitration'

/**
 * Structured reasons a titration/initiation was off-order or needs-provider (see
 * engine/titrationEngine.ts). Kept alongside the human-readable `reasons` there so
 * scoring.ts can check specific rules without parsing prose.
 */
export interface TitrationViolations {
  invalidDose?: boolean
  sequenceNotActivated?: boolean
  wrongStartDose?: boolean
  exceedsOrderMax?: boolean
  targetAlreadyMet?: boolean
  intervalTooSoon?: boolean
  wrongIncrement?: boolean
  /** Down-titrated (or discontinued) an agent before every lower-`weanOrder` agent was cleared (see priorAgentsWeaned). */
  wrongWeanOrder?: boolean
}

/** Alaris Guardrails dose evaluation outcome (see engine/guardrails.ts). */
export type GuardrailStatus = 'withinLimits' | 'softLimitOverride' | 'hardLimitBlocked'

export interface LogEntry {
  id: string
  /** Sim clock minute at which this entry was recorded. */
  minute: number
  type: 'action' | 'documentation'
  summary: string
  /** Required for documentation entries (MAR vs iView placement). */
  location?: DocumentationLocation
  /** Vitals captured at the time of a documentation entry. */
  vitalsSnapshot?: VitalSigns
  /** Present on dose-entry (and Begin Bag) action entries: which order/drug this concerns. */
  orderId?: string
  drugId?: DrugId
  /** Present on dose-entry action entries: initiate vs titrate. */
  doseAction?: 'initiate' | 'titrate'
  /** Present on dose-entry action entries: what actually happened to the request. */
  outcome?: 'applied' | 'off-order' | 'needs-provider' | 'hardLimitBlocked'
  /** Present on off-order/needs-provider dose-entry entries: which specific rule(s) were violated. */
  violations?: TitrationViolations
  /** Present on dose-entry action entries: the Guardrails pump evaluation. */
  guardrailStatus?: GuardrailStatus
  /** True on the entry logged by notifyProvider — distinguishes it from Begin Bag/dose entries. */
  isProviderNotification?: boolean
  /** The numeric dose value for a dose-entry action entry (mirrors what's embedded in `summary`, structured). */
  dose?: number
  /** Present on pause/restart/discontinue/Block-of-Charting action entries — distinguishes them from dose entries. */
  lifecycleAction?: 'pause' | 'restart' | 'discontinue' | 'blockDeclared' | 'blockClosed'
  /** True when this dose-entry action was taken under an active Block of Charting for the same order (CP 4-156's emergent free-titration pathway) — order-compliance checks are bypassed, so scoring must not count it as off-order. */
  underBlockOfCharting?: boolean
  /**
   * True when an 'applied' dose reached the infusion despite an off-order violation,
   * via training-mode override or validation-mode silent apply. Never true for
   * needs-provider/hardLimitBlocked entries — those never apply in either mode.
   */
  overridden?: boolean
  /** True when this documentation entry was backdated to a past minute via chartRetrospective, rather than charted live. */
  retrospective?: boolean
  /** For a retrospective entry: the real clock minute it was actually CREATED at, distinct from `minute` (the minute it documents). Absent for live entries, where the two are always equal. */
  enteredAtMinute?: number
  /** True on a dose-entry action entry that newly crossed its order's `earlyNotificationThreshold` this tick, with target still unmet — a second provider-notification trigger alongside `outcome === 'needs-provider'` (see scoring.ts category 6). */
  earlyNotificationDue?: boolean
}

/**
 * An emergent "Block of Charting" episode (CP 4-156): the RN may titrate as needed
 * without the usual order/interval/increment constraints. `startMinute`/`endMinute`
 * plus the `log[]` are enough to derive all 7 required elements at scoring time
 * (starting/ending/max rate come from the dose-entry log entries in this window) —
 * deliberately minimal state, nothing duplicated that the log already carries.
 */
export interface BlockOfChartingRecord {
  id: string
  orderId: string
  drugId: DrugId
  startMinute: number
  /** Null while the block is still active. */
  endMinute: number | null
}

export interface Patient {
  ageYears: number
  sex: 'female' | 'male'
  weightKg: number
}

/** A single historical vitals reading shown in iView before sim start — context only. */
export interface PriorVitalsPoint {
  /** How long before sim start (minute 0) this reading was taken. */
  minutesBeforeStart: number
  vitals: VitalSigns
}

/**
 * Physiology tuning for one drug in this scenario: the MAP (mmHg) it contributes once
 * fully responded, at its own ordered maximum dose. Deliberately scenario data, not
 * hardcoded in engine/physiology.ts (see that module's doc comment) — different
 * scenarios/patients respond differently to the same drug.
 */
export interface ResponseModelEntry {
  maxMapContribution: number
}

/** A complete case: patient, starting state, and the titratable order(s) that govern it. */
export interface ScenarioConfig {
  id: string
  patient: Patient
  admissionReason: string
  startingVitals: VitalSigns
  initialInfusions: Infusion[]
  orders: Order[]
  /** Time for the monitor to reflect a correct titration. */
  responseLagMinutes: TitrationInterval
  /** Historical readings shown in iView before sim start (oldest first). Never a hint about what to chart next. */
  priorVitals: PriorVitalsPoint[]
  /** Per-drug MAP response ceilings, keyed by DrugId. */
  responseModel: Partial<Record<DrugId, ResponseModelEntry>>
  /**
   * How fast MAP declines while no agent is actively infusing — septic shock doesn't
   * hold steady untreated. `ratePerMinute` (mmHg/min) accrues every clock tick with
   * zero infusing infusions; `maxDrop` caps the total so it doesn't run away to
   * implausible values. Freezes (stops accruing further) the moment any infusion is
   * infusing again — see engine/physiology.ts's accumulateDeterioration.
   */
  deterioration: { ratePerMinute: number; maxDrop: number }
  /** One-line learning objective shown on the intro screen — what the learner is being asked to demonstrate. */
  objective: string
  /** Whether this scenario's emergent Block of Charting pathway (CP 4-156) is in scope — false for scenarios with a narrower teaching focus. */
  enableBlockOfCharting: boolean
}

/** The full simulation state (BUILD_BRIEF §8), driven by the Zustand store in state/store.ts. */
export interface SimState {
  phase: Phase
  mode: SimMode
  clockMinutes: number
  infusions: Infusion[]
  vitals: VitalSigns
  orders: Order[]
  log: LogEntry[]
  /** BCMA/I-TRACE verification completion, keyed by the action's LogEntry id. */
  verificationFlags: Record<string, boolean>
  /** Order-adherence flags, keyed by the action's LogEntry id. */
  adherenceFlags: Record<string, boolean>
  /**
   * Physiology interpolation anchor: the MAP value and sim minute at the most recent
   * dose-changing action, from which advanceClock interpolates toward the newly
   * projected MAP. Null before the first titration.
   */
  lastPhysiologyUpdate: { minute: number; map: number } | null
  /** Cumulative mmHg MAP has dropped below baseline from untreated time — see ScenarioConfig.deterioration. Monotonically grows toward `maxDrop` while untreated, frozen otherwise. */
  deteriorationOffset: number
  /** The in-progress Block of Charting episode, if any (CP 4-156's emergent pathway). */
  activeBlockOfCharting: BlockOfChartingRecord | null
  /** Closed Block of Charting episodes this session, for debrief scoring. */
  blockOfChartingHistory: BlockOfChartingRecord[]
  /**
   * Snapshot of live vitals at each sim minute reached (start + every advanceClock),
   * kept so a nurse can backdate a chart entry to what genuinely happened at that
   * moment (see chartRetrospective) — auto-filled, never freely entered or graded on
   * recall.
   */
  vitalsHistory: { minute: number; vitals: VitalSigns }[]
}
