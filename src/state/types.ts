/**
 * Shell types (Phase 1) + clinical state model (Phase 2), per docs/BUILD_BRIEF.md §8.
 *
 * The clinical engine that operates on these types (titrationEngine, guardrails,
 * physiology, clock, documentation, scoring) is Phase 4 — not implemented here.
 */

/** The three top-level phases of the learner flow. Mirrors the eventual SimState.phase. */
export type Phase = 'intro' | 'sim' | 'debrief'

/** Placeholder header readout. Real values will be driven by the physiology engine (Phase 4). */
export interface HeaderReadout {
  /** Elapsed simulation time, in minutes. */
  clockMinutes: number
  /** Current mean arterial pressure (mmHg), or null before the sim starts. */
  currentMap: number | null
  /** Target MAP for the scenario (mmHg). */
  targetMap: number
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
}

export type InfusionStatus = 'hanging' | 'infusing' | 'stopped'

export interface Infusion {
  id: string
  orderId: string
  drugId: DrugId
  status: InfusionStatus
  /** Current programmed rate/dose in the drug's own unit (0 before Begin Bag / start). */
  rate: number
  /** Alaris pump channel, e.g. 'A'. */
  channel: string
  beginBagCompleted: boolean
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

export interface LogEntry {
  id: string
  /** Sim clock minute at which this entry was recorded. */
  minute: number
  type: 'action' | 'documentation'
  summary: string
  /** Required for documentation entries (MAR vs iView placement). */
  location?: DocumentationLocation
}

export interface Patient {
  ageYears: number
  sex: 'female' | 'male'
  weightKg: number
}

/** A complete case: patient, starting state, and the titratable order(s) that govern it. */
export interface ScenarioConfig {
  id: string
  patient: Patient
  admissionReason: string
  startingVitals: VitalSigns
  initialInfusion: Infusion
  orders: Order[]
  /** Time for the monitor to reflect a correct titration. */
  responseLagMinutes: TitrationInterval
}

/**
 * The full simulation state (BUILD_BRIEF §8). Not yet wired into the Zustand store —
 * the store actions that produce it (startInfusion, titrate, document, notifyProvider,
 * advanceClock) arrive with the engine in Phase 4/5.
 */
export interface SimState {
  phase: Phase
  clockMinutes: number
  infusions: Infusion[]
  vitals: VitalSigns
  orders: Order[]
  log: LogEntry[]
  /** Independent double-check completion, keyed by the action's LogEntry id. */
  doubleCheckFlags: Record<string, boolean>
  /** Order-adherence flags, keyed by the action's LogEntry id. */
  adherenceFlags: Record<string, boolean>
}
