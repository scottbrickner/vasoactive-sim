/**
 * CP 4-156 Attachment B — vasoactive/inotrope subset, typed, plus Phase 19e's
 * non-vasoactive additions (fentanyl, dexmedetomidine, diltiazem) — Attachment B is a
 * full ~30-drug institutional IV-titration table, not vasoactive-specific, and CP 4-156
 * itself governs "Intravenous Medications" generally (see docs/CLINICAL_SPEC.md).
 *
 * Values are cross-checked against `docs/references/CP4-156 Attachment B.pdf` (reviewed
 * 6/23/2022) and apply "unless defined by prescriber" (see CLAUDE.md source-of-truth order).
 * Where Attachment B leaves an increment or interval undefined, `titrationIncrement` /
 * `titrationInterval` are `null` here — the prescriber's Order must supply it.
 *
 * Vasopressin models the SHOCK indication only (the scenario this simulator targets).
 * Attachment B also has a GI-hemorrhage row (0.2 units/min, titrate 0.2 unit/min q1h,
 * max 0.8 unit/min) — out of scope and intentionally not modeled. Fentanyl and
 * diltiazem's bolus doses are likewise omitted, matching this same convention already
 * used for vasopressin's shock row.
 */
import type { DrugDefinition, DrugId } from '../state/types'

export const FORMULARY: Record<DrugId, DrugDefinition> = {
  norepinephrine: {
    id: 'norepinephrine',
    name: 'Norepinephrine',
    genericName: 'Levophed',
    concentration: { amount: 8, amountUnit: 'mg', volumeMl: 250 },
    unit: 'mcg/min',
    weightBased: false,
    startDose: 0.5,
    titrationIncrement: 0.5,
    titrationInterval: { minMinutes: 3, maxMinutes: 5 },
    maxDose: 30,
    monitoring: ['BP', 'HR'],
  },
  epinephrine: {
    id: 'epinephrine',
    name: 'Epinephrine',
    genericName: 'Adrenalin',
    concentration: { amount: 8, amountUnit: 'mg', volumeMl: 250 },
    unit: 'mcg/min',
    weightBased: false,
    startDose: 1,
    titrationIncrement: 1,
    titrationInterval: null,
    maxDose: 20,
    monitoring: ['HR', 'BP', 'Extravasation'],
  },
  phenylephrine: {
    id: 'phenylephrine',
    name: 'Phenylephrine',
    genericName: 'Neo-Synephrine',
    concentration: { amount: 40, amountUnit: 'mg', volumeMl: 250 },
    unit: 'mcg/min',
    weightBased: false,
    startDose: 50,
    titrationIncrement: 25,
    titrationInterval: { minMinutes: 5 },
    maxDose: 200,
    monitoring: ['BP'],
  },
  dopamine: {
    id: 'dopamine',
    name: 'Dopamine',
    genericName: 'Intropin',
    concentration: { amount: 800, amountUnit: 'mg', volumeMl: 250 },
    unit: 'mcg/kg/min',
    weightBased: true,
    startDose: 2,
    titrationIncrement: 1,
    titrationInterval: { minMinutes: 10 },
    maxDose: 20,
    monitoring: ['EKG', 'HR', 'BP', 'Urine output'],
  },
  dobutamine: {
    id: 'dobutamine',
    name: 'Dobutamine',
    genericName: 'Dobutrex',
    concentration: { amount: 1000, amountUnit: 'mg', volumeMl: 250 },
    unit: 'mcg/kg/min',
    weightBased: true,
    startDose: 2.5,
    titrationIncrement: 2.5,
    titrationInterval: { minMinutes: 3 },
    maxDose: 40,
    monitoring: ['BP', 'EKG', 'HR'],
  },
  milrinone: {
    id: 'milrinone',
    name: 'Milrinone',
    genericName: 'Primacor',
    concentration: { amount: 20, amountUnit: 'mg', volumeMl: 100 },
    unit: 'mcg/kg/min',
    weightBased: true,
    startDose: 0.25,
    titrationIncrement: null,
    titrationInterval: null,
    maxDose: 1,
    monitoring: ['BP', 'Hemodynamic responses (PCWP, RAP, CI)'],
  },
  vasopressin: {
    id: 'vasopressin',
    name: 'Vasopressin (shock)',
    genericName: 'Pitressin',
    concentration: { amount: 40, amountUnit: 'units', volumeMl: 100 },
    unit: 'units/min',
    weightBased: false,
    startDose: 0.02,
    titrationIncrement: 0.01,
    titrationInterval: null,
    maxDose: 0.04,
    monitoring: [
      'BP',
      'Serum and urine sodium',
      'Fluid input and output',
      'Urine specific gravity',
      'Urine and serum osmolality',
    ],
  },
  fentanyl: {
    id: 'fentanyl',
    name: 'Fentanyl',
    genericName: 'Sublimaze',
    concentration: { amount: 1000, amountUnit: 'mcg', volumeMl: 100 },
    unit: 'mcg/hr',
    weightBased: false,
    startDose: 25,
    titrationIncrement: 10,
    titrationInterval: { minMinutes: 10 },
    maxDose: 150,
    monitoring: ['Respiratory status', 'Cardiovascular status', 'BP', 'HR', 'Pain score'],
  },
  dexmedetomidine: {
    id: 'dexmedetomidine',
    name: 'Dexmedetomidine',
    genericName: 'Precedex',
    concentration: { amount: 200, amountUnit: 'mcg', volumeMl: 250 },
    unit: 'mcg/kg/hr',
    weightBased: true,
    startDose: 0.2,
    titrationIncrement: 0.1,
    titrationInterval: { minMinutes: 30 },
    maxDose: 0.7,
    monitoring: ['RASS', 'HR', 'Respiration', 'Rhythm'],
  },
  diltiazem: {
    id: 'diltiazem',
    name: 'Diltiazem',
    genericName: 'Cardizem',
    concentration: { amount: 125, amountUnit: 'mg', volumeMl: 125 },
    unit: 'mg/hr',
    weightBased: false,
    startDose: 5,
    titrationIncrement: 5,
    titrationInterval: { minMinutes: 15 },
    maxDose: 15,
    monitoring: ['BP', 'HR', 'EKG'],
  },
}

export const FORMULARY_LIST: DrugDefinition[] = Object.values(FORMULARY)

export function getDrug(id: DrugId): DrugDefinition {
  return FORMULARY[id]
}

/**
 * Resolves an ordered dose to its absolute per-minute infusion rate. Weight-based
 * drugs (mcg/kg/min) require the patient's weight; fixed-rate drugs (mcg/min,
 * units/min) are returned unchanged.
 */
export function resolveInfusionRate(drug: DrugDefinition, doseValue: number, weightKg?: number): number {
  if (!drug.weightBased) return doseValue
  if (weightKg == null) {
    throw new Error(`${drug.name} is weight-based; a patient weight is required to resolve its rate.`)
  }
  return doseValue * weightKg
}
